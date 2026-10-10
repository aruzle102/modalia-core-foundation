import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";
import { SUPPORT_READ_PERMISSIONS, type SellerContext } from "@/lib/seller-auth";

/**
 * V8 Section 47 — server-authorized admin support mode ("Open Seller Dashboard").
 *
 * Threat model: a super_admin needs to SEE a seller's workspace to help them,
 * without ever learning the seller's credentials and without gaining silent
 * write access. The design:
 *
 * 1. `createSupportSession` (super_admin only): resolves the target seller
 *    SERVER-SIDE from a sellerId lookup key, mints a 30-minute bearer grant
 *    bound to the CREATING admin, stores only the token hash, audit-logs.
 * 2. The admin browser exchanges the token once via `resolveSupportSession`
 *    (super_admin + creator binding + not expired + target seller exists),
 *    which returns a SCOPED SellerContext — never any credentials.
 * 3. The seller shell keeps the raw token in a short-lived cookie; every
 *    seller server function re-validates the grant through
 *    `resolveSeller`'s support branch (`src/lib/seller-auth.ts`), which
 *    returns the context with SUPPORT_READ_PERMISSIONS only — read-only,
 *    default deny for everything else.
 * 4. `revokeSupportSession` kills the grant (exit action + expiry).
 *
 * Nothing here ever reads or returns auth credentials.
 */

const adminOnly = [requireSupabaseAuth] as const;

/** Grants live 30 minutes. */
const GRANT_TTL_MS = 30 * 60 * 1000;

export const SUPPORT_GRANT_COOKIE = "modalia_support";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 256-bit bearer token as 64 hex chars (Web Crypto only — no node imports). */
function mintToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

const createSupportSessionInput = z.object({
  sellerId: z.string().uuid(),
});

export interface CreateSupportSessionResult {
  token: string;
  expiresAt: string;
  sellerId: string;
  legalName: string;
}

/**
 * Open a support session for a seller. Super_admin only. The sellerId is a
 * lookup key only — the seller row is resolved server-side and the grant is
 * bound to the calling admin. Audit-logged (who, target seller, timestamp).
 */
export const createSupportSession = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => createSupportSessionInput.parse(data))
  .handler(async ({ data, context }): Promise<CreateSupportSessionResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminId = context.userId;

    // Target resolved SERVER-SIDE from the lookup key. Never trust client
    // identity claims: only the sellers row we fetch here is used.
    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("sellers")
      .select("id,legal_name,account_status")
      .eq("id", data.sellerId)
      .maybeSingle();
    if (sellerError || !seller) throw new Error("Seller not found.");

    // One live grant per admin: revoke any previous ones first so a stale
    // tab can never resurrect an older session.
    const now = new Date();
    await supabaseAdmin
      .from("seller_support_grants")
      .update({ revoked_at: now.toISOString() })
      .eq("admin_id", adminId)
      .is("revoked_at", null);

    const token = mintToken();
    const expiresAt = new Date(now.getTime() + GRANT_TTL_MS).toISOString();
    const { data: grant, error: grantError } = await supabaseAdmin
      .from("seller_support_grants")
      .insert({
        token_hash: await sha256Hex(token),
        admin_id: adminId,
        seller_id: seller.id,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (grantError || !grant) throw new Error("Could not open the support session.");

    // Audit: who opened support on which seller, and when.
    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: adminId,
        action: "support_session_created",
        resource: "seller",
        resource_id: seller.id,
        metadata: { grant_id: grant.id, expires_at: expiresAt },
      });
    } catch {
      /* audit is best-effort */
    }

    return { token, expiresAt, sellerId: seller.id, legalName: seller.legal_name };
  });

const resolveSupportSessionInput = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
});

export interface SupportSellerContext extends SellerContext {
  supportMode: true;
  supportAdminId: string;
  supportExpiresAt: string;
}

/**
 * Redeem a support grant. Validates: live super_admin session + grant not
 * expired + not revoked + creator binding (only the admin who opened it) +
 * target seller still exists. Returns a scoped seller context — read-only
 * permissions only, isOwner false — and NEVER any credentials.
 */
export const resolveSupportSession = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => resolveSupportSessionInput.parse(data))
  .handler(async ({ data, context }): Promise<SupportSellerContext> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminId = context.userId;
    const nowIso = new Date().toISOString();

    const { data: grant } = await supabaseAdmin
      .from("seller_support_grants")
      .select("id,admin_id,seller_id,expires_at")
      .eq("token_hash", await sha256Hex(data.token))
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();

    // Creator binding: the grant is usable only by the admin who opened it.
    // A token alone is worthless without that admin's live session.
    if (!grant || grant.admin_id !== adminId) {
      throw new Error("This support link is invalid or has expired.");
    }

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("sellers")
      .select("id,legal_name,onboarded_at")
      .eq("id", grant.seller_id)
      .maybeSingle();
    if (sellerError || !seller) throw new Error("The seller for this support session no longer exists.");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id,slug")
      .eq("seller_id", seller.id)
      .maybeSingle();

    // Best-effort touch + audit of the actual open.
    try {
      await supabaseAdmin
        .from("seller_support_grants")
        .update({ last_used_at: nowIso })
        .eq("id", grant.id);
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: adminId,
        action: "support_session_opened",
        resource: "seller",
        resource_id: seller.id,
        metadata: { grant_id: grant.id },
      });
    } catch {
      /* audit is best-effort */
    }

    // The grant cookie is bearer material: set it HttpOnly server-side so page
    // JS can never read it. (The HttpOnly attribute is silently ignored on
    // document.cookie writes, so a client-side write would be theater — the
    // client no longer writes this cookie at all.) Dynamic import:
    // "@tanstack/react-start/server" is denied in the client bundle by the
    // import-protection plugin (same pattern as src/lib/seller-auth.ts); this
    // only ever runs inside the server-fn handler.
    const { setCookie, getRequest } = await import("@tanstack/react-start/server");
    const isHttps = (getRequest()?.url ?? "").startsWith("https://");
    setCookie(SUPPORT_GRANT_COOKIE, data.token, {
      path: "/",
      maxAge: Math.floor(GRANT_TTL_MS / 1000),
      sameSite: "lax",
      httpOnly: true,
      // Secure only on https — an unconditional Secure would drop the cookie
      // on plain-http dev origins.
      secure: isHttps,
    });

    return {
      sellerId: seller.id,
      storeId: store?.id ?? null,
      storeSlug: store?.slug ?? null,
      isOwner: false,
      permissions: [...SUPPORT_READ_PERMISSIONS],
      legalName: seller.legal_name,
      mustResetPassword: false,
      onboarded: seller.onboarded_at != null,
      supportMode: true,
      supportAdminId: adminId,
      supportExpiresAt: grant.expires_at,
    };
  });

/**
 * Revoke the calling admin's live support grant(s). Used by the
 * "Exit support mode" action. Audit-logged.
 */
export const revokeSupportSession = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminId = context.userId;
    const nowIso = new Date().toISOString();

    const { data: grants } = await supabaseAdmin
      .from("seller_support_grants")
      .select("id,seller_id")
      .eq("admin_id", adminId)
      .is("revoked_at", null);

    await supabaseAdmin
      .from("seller_support_grants")
      .update({ revoked_at: nowIso })
      .eq("admin_id", adminId)
      .is("revoked_at", null);

    try {
      for (const g of grants ?? []) {
        await supabaseAdmin.from("audit_logs").insert({
          actor_id: adminId,
          action: "support_session_revoked",
          resource: "seller",
          resource_id: g.seller_id,
          metadata: { grant_id: g.id },
        });
      }
    } catch {
      /* audit is best-effort */
    }

    // Clear the HttpOnly grant cookie server-side: a document.cookie write
    // cannot clear an HttpOnly cookie (it would only shadow it with a
    // same-named readable twin), so the client no longer clears it either.
    const { deleteCookie } = await import("@tanstack/react-start/server");
    deleteCookie(SUPPORT_GRANT_COOKIE, { path: "/" });

    return { ok: true as const };
  });
