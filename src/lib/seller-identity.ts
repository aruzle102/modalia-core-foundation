/**
 * MODALIA — Seller identity model (Spec Section 8).
 *
 * Username-based seller login with real-email transition:
 *
 *   1. Admin provisions a seller -> the system generates a globally-unique
 *      username (`seller_` + 5 unambiguous chars, e.g. `seller_8K29Q`) and a
 *      temporary password. The admin is NOT required to enter the seller's
 *      real email.
 *   2. A Supabase Auth user is created with the SYNTHETIC email
 *      `{username}@seller.modalia.internal`. This address is an internal
 *      implementation detail — it is never shown to the seller.
 *   3. The seller logs in with USERNAME + temp password. The login page maps
 *      the username to the synthetic auth email deterministically
 *      (resolveUsernameToEmail) — no server round-trip, no enumeration
 *      beyond what the login form already reveals.
 *   4. First login forces a password change (existing must_change_password
 *      flow), then onboarding. The seller provides a real email, verifies
 *      it through the Supabase Auth email-change flow
 *      (transitionToEmailLogin), and `seller_accounts.login_method` flips
 *      to 'email'. The username stays reserved forever (UNIQUE, never
 *      reused).
 *
 * Backward compatibility: sellers provisioned before this model keep their
 * real-email Auth users. Their seller_accounts rows (backfilled by migration
 * 20261007030000) use login_method='email', so resolveUsernameToEmail keeps
 * working for them unchanged.
 *
 * SECURITY:
 * - The temporary password is generated server-side, returned ONCE, never
 *   logged, never stored in plaintext.
 * - The synthetic domain is internal; the login UI only ever shows the
 *   username. (A determined observer can derive the pattern, but it grants
 *   nothing without the password, and brute-force is rate-limited.)
 * - sellers.email is NEVER written here; email <-> Auth synchronization is
 *   owned by the Section 9 changeSellerEmail() helper.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import { assertAdminPermission } from "@/lib/admin-permissions";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";

const adminOnly = [requireSupabaseAuth] as const;

type SupabaseAdminClient = typeof supabaseAdmin;

/* ------------------------------------------------------------------ */
/* Pure helpers (client-safe)                                          */
/* ------------------------------------------------------------------ */

/** Internal auth domain for synthetic seller emails. Never shown to users. */
export const SELLER_AUTH_DOMAIN = "seller.modalia.internal";

export const SELLER_USERNAME_PREFIX = "seller_";

/**
 * Unambiguous alphabet: no 0/O, no 1/I/l — safe to read over the phone.
 * 32 chars -> 5 chars = ~33 bits of entropy per username.
 */
const USERNAME_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const USERNAME_RANDOM_LEN = 5;

/**
 * Case-insensitive (`i` flag): helpers normalize input with toUpperCase()
 * first, so `SELLER_8K29Q` must match. The suffix class stays explicit —
 * no 0/O, 1/I/l.
 */
export const SELLER_USERNAME_RE = /^seller_[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/i;

/** Generate a candidate username. Uniqueness is enforced by the DB + retry. */
export function generateUsername(): string {
  const bytes = new Uint32Array(USERNAME_RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (let i = 0; i < USERNAME_RANDOM_LEN; i++) {
    suffix += USERNAME_ALPHABET[bytes[i]! % USERNAME_ALPHABET.length];
  }
  return SELLER_USERNAME_PREFIX + suffix;
}

export function isSellerUsername(value: string): boolean {
  // Usernames are always generated uppercase; accept any case on input.
  return SELLER_USERNAME_RE.test(value.trim().toUpperCase());
}

/** Deterministic synthetic Auth email for a username. Throws on invalid input. */
export function syntheticEmailForUsername(username: string): string {
  const u = username.trim().toUpperCase();
  if (!SELLER_USERNAME_RE.test(u)) throw new Error("Invalid seller username.");
  return `${u}@${SELLER_AUTH_DOMAIN}`;
}

/**
 * Resolve a login identifier to the Supabase Auth email.
 * - Contains "@"  -> treated as a real email (normalized to lowercase).
 * - Otherwise     -> treated as a seller username -> synthetic auth email.
 *
 * Works for both identity generations:
 * - new sellers: username -> synthetic email; real email after transition.
 * - legacy sellers: real email (unchanged behavior).
 */
export function resolveUsernameToEmail(identifier: string): string {
  const v = identifier.trim();
  if (!v) throw new Error("Enter your username or email.");
  if (v.includes("@")) return v.toLowerCase();
  return syntheticEmailForUsername(v);
}

/* ------------------------------------------------------------------ */
/* Server-side provisioning (service role)                             */
/* ------------------------------------------------------------------ */

export type SellerIdentity = {
  username: string;
  authUserId: string;
  authEmail: string;
};

const MAX_USERNAME_ATTEMPTS = 8;

/**
 * Generate a username that is not taken in seller_accounts (DB-backed retry).
 * Server-only: must be called with the service-role client.
 */
export async function generateUniqueUsername(admin: SupabaseAdminClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
    const username = generateUsername();
    const { data: clash } = await admin
      .from("seller_accounts")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (!clash) return username;
  }
  throw new Error("Could not generate a unique username. Please try again.");
}

/**
 * Create the Auth user + seller_accounts row for an EXISTING sellers row.
 *
 * Server-only: must be called with the service-role client. Generates a
 * unique username, creates the Auth user with the synthetic email + the
 * given temporary password, and inserts the seller_accounts mapping. The
 * caller owns compensation (delete the row/user on failure).
 */
export async function createSellerIdentityRecord(
  admin: SupabaseAdminClient,
  args: { sellerId: string; tempPassword: string },
): Promise<SellerIdentity> {
  const { sellerId, tempPassword } = args;

  // The seller must exist and not already have an identity row.
  const { data: existing, error: existingError } = await admin
    .from("seller_accounts")
    .select("id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) throw new Error("This seller already has a login identity.");

  const username = await generateUniqueUsername(admin);
  const authEmail = syntheticEmailForUsername(username);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      seller_username: username,
      force_password_reset: true,
      provisioned_by: "modalia-admin",
    },
  });
  if (createError) throw new Error(`Could not create login: ${createError.message}`);
  const authUserId = created?.user?.id;
  if (!authUserId) throw new Error("Could not create login.");

  try {
    const { error: rowError } = await admin.from("seller_accounts").insert({
      seller_id: sellerId,
      username,
      auth_user_id: authUserId,
      login_method: "username",
      email: null,
      email_verified_at: null,
      must_change_password: true,
      status: "active",
    });
    if (rowError) throw new Error(rowError.message);
  } catch (err) {
    // Never leave an orphaned Auth user behind.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    throw err;
  }

  return { username, authUserId, authEmail };
}

/**
 * Standalone admin provisioning of a login identity for an existing seller
 * that has none (e.g. legacy rows created outside the wizard). Generates the
 * temporary password server-side and returns it ONCE.
 */
export const createSellerAccount = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ sellerId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<SellerIdentity & { tempPassword: string }> => {
    await assertAdminPermission(context, "sellers.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("sellers")
      .select("id,account_status")
      .eq("id", data.sellerId)
      .single();
    if (sellerError || !seller) throw new Error("Seller not found.");
    if (seller.account_status !== "active") {
      throw new Error("Login identities can only be created for active sellers.");
    }

    const tempPassword = (crypto.randomUUID() + crypto.randomUUID()).slice(0, 20);
    const identity = await createSellerIdentityRecord(supabaseAdmin, {
      sellerId: seller.id,
      tempPassword,
    });

    // Keep the legacy must-reset flag in sync for the existing auth gates.
    await supabaseAdmin.from("sellers").update({ must_reset_password: true }).eq("id", seller.id);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_login_identity_created",
      resource: "seller",
      resource_id: seller.id,
      metadata: { username: identity.username, user_id: identity.authUserId },
    });

    return { ...identity, tempPassword };
  });

/* ------------------------------------------------------------------ */
/* Email transition (seller-initiated)                                 */
/* ------------------------------------------------------------------ */

const transitionInput = z.object({
  email: z.string().trim().email().max(255),
});

type SellerAccountsRow = {
  id: string;
  seller_id: string;
  username: string;
  auth_user_id: string;
  login_method: string;
  email: string | null;
  email_verified_at: string | null;
  status: string;
};

async function loadOwnIdentityRow(
  admin: SupabaseAdminClient,
  sellerId: string,
): Promise<SellerAccountsRow> {
  const { data, error } = await admin
    .from("seller_accounts")
    .select("id,seller_id,username,auth_user_id,login_method,email,email_verified_at,status")
    .eq("seller_id", sellerId)
    .single();
  if (error || !data) throw new Error("No login identity found for this seller.");
  return data as SellerAccountsRow;
}

/**
 * Seller provides a real email -> verified via the Supabase Auth email-change
 * flow -> login_method flips to 'email'. The username stays reserved forever.
 *
 * Uses the Admin API so the change is server-authoritative; Supabase sends
 * the confirmation email when "Secure email change" is enabled. Until the
 * seller confirms, login_method stays 'username' and the seller keeps signing
 * in with their username (password unchanged).
 */
export const transitionToEmailLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => transitionInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller({
      supabase: context.supabase as unknown as Parameters<typeof requireSeller>[0]["supabase"],
      userId: context.userId,
    });
    if (!seller.isOwner) throw new Error("Only the store owner can change the login email.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadOwnIdentityRow(supabaseAdmin, seller.sellerId);
    if (row.status !== "active") throw new Error("This login identity is not active.");
    if (row.login_method === "email") {
      return { alreadyTransitioned: true as const, verificationPending: false, email: row.email };
    }

    const email = data.email.toLowerCase();

    // Friendly duplicate check against other seller identities. The Auth
    // layer is the final arbiter (its error is mapped below).
    const { data: dupe } = await supabaseAdmin
      .from("seller_accounts")
      .select("id")
      .ilike("email", email)
      .neq("id", row.id)
      .maybeSingle();
    if (dupe) throw new Error("This email is already used by another seller account.");

    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      row.auth_user_id,
      { email },
    );
    if (updateError) {
      if (/already been registered|already exists|duplicate/i.test(updateError.message ?? "")) {
        throw new Error("This email is already used by another account.");
      }
      throw new Error(`Could not change login email: ${updateError.message}`);
    }

    // Did Supabase confirm immediately, or is verification pending?
    // (With "Secure email change" on, a confirmation email is sent and the
    //  address stays unconfirmed until the seller clicks it.)
    const confirmed =
      !!updated?.user?.email_confirmed_at &&
      (updated.user.email ?? "").toLowerCase() === email;
    const now = new Date().toISOString();

    const { error: rowError } = await supabaseAdmin
      .from("seller_accounts")
      .update({
        email,
        email_verified_at: confirmed ? now : null,
        login_method: confirmed ? "email" : "username",
        updated_at: now,
      })
      .eq("id", row.id);
    if (rowError) throw new Error(rowError.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_login_email_changed",
      resource: "seller",
      resource_id: seller.sellerId,
      metadata: { username: row.username, email, verification_pending: !confirmed },
    });

    return { alreadyTransitioned: false as const, verificationPending: !confirmed, email };
  });

/**
 * Finalize a pending email transition after the seller clicks the Supabase
 * confirmation link. Re-reads the Auth user: when the email matches and is
 * confirmed, login_method flips to 'email'.
 */
export const refreshSellerEmailVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    const seller = await requireSeller({
      supabase: context.supabase as unknown as Parameters<typeof requireSeller>[0]["supabase"],
      userId: context.userId,
    });
    if (!seller.isOwner) throw new Error("Only the store owner can verify the login email.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadOwnIdentityRow(supabaseAdmin, seller.sellerId);
    if (row.login_method === "email") return { done: true as const, verificationPending: false };
    if (!row.email) throw new Error("No email change is pending.");

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      row.auth_user_id,
    );
    if (authError || !authUser?.user) throw new Error("Could not verify the email status.");

    const matches = (authUser.user.email ?? "").toLowerCase() === row.email.toLowerCase();
    const confirmed = matches && !!authUser.user.email_confirmed_at;
    if (!confirmed) return { done: false as const, verificationPending: true };

    const now = new Date().toISOString();
    const { error: rowError } = await supabaseAdmin
      .from("seller_accounts")
      .update({ login_method: "email", email_verified_at: now, updated_at: now })
      .eq("id", row.id);
    if (rowError) throw new Error(rowError.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "seller_login_email_verified",
      resource: "seller",
      resource_id: seller.sellerId,
      metadata: { username: row.username, email: row.email },
    });

    return { done: true as const, verificationPending: false };
  });
