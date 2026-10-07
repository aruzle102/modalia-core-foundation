/**
 * MODALIA — Verified seller email change flow (Section 9).
 *
 * SERVER-SIDE ONLY. Never import from client components — this module uses
 * the service-role admin client and must never reach the browser.
 *
 * The critical invariant: sellers.email must ALWAYS equal auth.users.email
 * for the seller's owner. Direct writes to sellers.email are forbidden;
 * every email change goes through changeSellerEmail(), which:
 *
 *   1. Validates the new email (zod).
 *   2. Verifies authorization is already established by the caller
 *      (seller owner for own account, or admin with sellers.manage).
 *   3. Rejects duplicates (another seller row, or an existing auth user).
 *   4. Calls supabaseAdmin.auth.admin.updateUserById() — the proper Supabase
 *      Auth email-change flow, which sends the verification email.
 *   5. Reads the authoritative email back from Auth and writes THAT value
 *      into sellers.email (Auth is the source of truth).
 *   6. Resets sellers.email_verified_at to NULL until re-verified, then
 *      syncs it from auth.users.email_confirmed_at when verified.
 *   7. Audits the change.
 */

import { z } from "zod";

const emailSchema = z.string().trim().email().max(255);

export interface ChangeSellerEmailParams {
  /** Service-role admin client (server-side only). */
  supabaseAdmin: any;
  /** sellers.id */
  sellerId: string;
  /** sellers.owner_id — the Supabase Auth user id. Never changes. */
  authUserId: string;
  /** The requested new email (raw, will be normalized). */
  newEmail: string;
  /** Actor performing the change (seller user id or admin user id). */
  actorId: string;
  /** Who is performing the change, for audit clarity. */
  actorType: "seller" | "admin";
}

export interface ChangeSellerEmailResult {
  changed: boolean;
  /** The authoritative email now stored in both auth.users and sellers. */
  email: string;
  /** True when Supabase reports the email as already confirmed. */
  verified: boolean;
}

/**
 * Execute a verified seller email change. Throws on validation, duplicate,
 * or Auth errors. Never stores or logs the password (no password involved).
 */
export async function changeSellerEmail(
  params: ChangeSellerEmailParams,
): Promise<ChangeSellerEmailResult> {
  const { supabaseAdmin, sellerId, authUserId, actorId, actorType } = params;
  const normalized = emailSchema.parse(params.newEmail).toLowerCase();

  // Current seller row (authoritative for owner link + current email).
  const { data: seller, error: sellerError } = await supabaseAdmin
    .from("sellers")
    .select("id, owner_id, email")
    .eq("id", sellerId)
    .single();
  if (sellerError || !seller) throw new Error("Seller not found.");
  if (seller.owner_id !== authUserId) {
    throw new Error("Seller identity mismatch: owner_id does not match the auth user.");
  }

  const currentEmail = (seller.email as string | null)?.toLowerCase() ?? null;
  if (currentEmail === normalized) {
    return { changed: false, email: seller.email as string, verified: false };
  }

  // Duplicate guard 1: another seller row already uses this email.
  const { data: clash } = await supabaseAdmin
    .from("sellers")
    .select("id")
    .ilike("email", normalized)
    .neq("id", sellerId)
    .limit(1);
  if (clash && clash.length > 0) {
    throw new Error("This email address is already used by another seller.");
  }

  // The proper Supabase Auth email-change flow. Supabase sends the
  // verification email to the new address (when email confirmation is
  // enabled) and keeps auth.users as the source of truth.
  const { data: updated, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    authUserId,
    { email: normalized },
  );
  if (authError) {
    const msg = (authError.message ?? "").toLowerCase();
    if (msg.includes("already") && (msg.includes("exists") || msg.includes("registered") || msg.includes("taken"))) {
      throw new Error("This email address is already registered.");
    }
    throw new Error(`Email change failed: ${authError.message}`);
  }
  const authUser = (updated as any)?.user;
  if (!authUser?.id) throw new Error("Email change failed: no user returned.");

  // Auth is the source of truth: sync sellers.email to exactly what Auth
  // now holds (never the raw input), and mirror the verification state.
  const authEmail = String(authUser.email ?? normalized).toLowerCase();
  const confirmedAt = (authUser.email_confirmed_at as string | null) ?? null;

  const { error: syncError } = await supabaseAdmin
    .from("sellers")
    .update({
      email: authEmail,
      email_verified_at: confirmedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sellerId);
  if (syncError) throw new Error(`Failed to synchronize seller email: ${syncError.message}`);

  // Audit (never log secrets; email addresses are business identifiers).
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    action: actorType === "admin" ? "admin_seller_email_changed" : "seller_email_changed",
    resource: "seller",
    resource_id: sellerId,
    metadata: {
      from: seller.email ?? null,
      to: authEmail,
      verified: confirmedAt !== null,
      verification_pending: confirmedAt === null,
    },
  });

  return { changed: true, email: authEmail, verified: confirmedAt !== null };
}

/**
 * Best-effort verification sync: if Supabase Auth now reports the seller's
 * email as confirmed, mirror that into sellers.email_verified_at.
 * Safe to call on profile reads; never throws.
 */
export async function syncEmailVerificationState(
  supabaseAdmin: any,
  sellerId: string,
  authUserId: string,
): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    if (error || !data?.user) return;
    const authUser = data.user as any;
    const confirmedAt = (authUser.email_confirmed_at as string | null) ?? null;
    const authEmail = String(authUser.email ?? "").toLowerCase();
    if (!authEmail) return;

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, email, email_verified_at")
      .eq("id", sellerId)
      .maybeSingle();
    if (!seller) return;

    const sellerEmail = String((seller as any).email ?? "").toLowerCase();
    // Keep the invariant: sellers.email must equal auth.users.email.
    // If they drifted (legacy data), heal sellers.email toward Auth.
    const needsEmailFix = sellerEmail !== authEmail;
    const needsVerifiedSync =
      confirmedAt !== null && (seller as any).email_verified_at !== confirmedAt;

    if (needsEmailFix || needsVerifiedSync) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (needsEmailFix) {
        patch["email"] = authEmail;
        patch["email_verified_at"] = confirmedAt;
      } else if (needsVerifiedSync) {
        patch["email_verified_at"] = confirmedAt;
      }
      await supabaseAdmin.from("sellers").update(patch).eq("id", sellerId);
    }
  } catch {
    /* verification sync is best-effort */
  }
}
