import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSupportSeller } from "@/lib/seller-support-auth.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SellerPermission =
  | "products.view"
  | "products.edit"
  | "products.publish"
  | "orders.view"
  | "orders.update"
  | "inventory.manage"
  | "coupons.manage"
  | "promotions.manage"
  | "bundles.manage"
  | "analytics.view"
  | "store.manage"
  | "customers.view"
  | "reviews.manage"
  | "staff.manage"
  | "finance.view"
  | "settings.manage"
  | "support.manage";

export interface SellerContext {
  sellerId: string;
  storeId: string | null;
  /** Store slug for "View store" links. Null when the seller has no store yet. */
  storeSlug: string | null;
  isOwner: boolean;
  permissions: SellerPermission[];
  legalName: string;
  /**
   * True while the owner must rotate their password (temporary password
   * provisioned by the admin). Checked by the login page and the SellerShell
   * gate so first-time sellers are routed to the password-change page.
   */
  mustResetPassword: boolean;
  /**
   * True once the owner has completed (or explicitly skipped) the guided
   * onboarding wizard (Section 21). Read from `sellers.onboarded_at`.
   * Drives the post-login / post-password-change redirect chain.
   */
  onboarded: boolean;
  /**
   * V8 Section 47 — admin support mode. True only when this context was
   * resolved from a validated support grant (see resolveSupportSeller):
   * the caller is a super_admin viewing the workspace read-only, never the
   * seller. Permissions are limited to SUPPORT_READ_PERMISSIONS.
   */
  supportMode?: boolean;
  /** The super_admin who opened the support session (creator binding). */
  supportAdminId?: string;
  /** ISO expiry of the underlying support grant. */
  supportExpiresAt?: string;
}

/**
 * V8 Section 47 — the narrow read-only scope for admin support mode.
 * A support context carries ONLY these permissions: every seller server
 * function that requires any other permission denies by default. This is
 * the explicitly-scoped exception to read-only; everything else stays
 * denied.
 */
export const SUPPORT_READ_PERMISSIONS: SellerPermission[] = [
  "products.view",
  "orders.view",
  "analytics.view",
  "finance.view",
  "customers.view",
];

/**
 * The complete, authoritative list of seller permission keys. The admin
 * onboarding wizard binds its permission list to this array (imported from
 * `@/lib/seller-auth`) so wizard checkboxes can never drift from the real
 * union the Seller OS enforces.
 */
export const ALL_SELLER_PERMISSIONS: SellerPermission[] = [
  "products.view",
  "products.edit",
  "products.publish",
  "orders.view",
  "orders.update",
  "inventory.manage",
  "coupons.manage",
  "promotions.manage",
  "bundles.manage",
  "analytics.view",
  "store.manage",
  "customers.view",
  "reviews.manage",
  "staff.manage",
  "finance.view",
  "settings.manage",
  "support.manage",
];

const DENIED = "Seller access denied.";

/**
 * Seller staff roles (V8 — user-approved). The owner is structural
 * (sellers.owner_id): full permissions, immutable, never a staff row.
 * Staff rows carry one of these roles as a preset over the 17 granular
 * permissions; the permissions jsonb stays the enforcement source of truth.
 */
export type SellerStaffRole = "manager" | "staff" | "viewer";

export const SELLER_STAFF_ROLES: readonly SellerStaffRole[] = ["manager", "staff", "viewer"];

export const SELLER_ROLE_PRESETS: Record<SellerStaffRole, readonly SellerPermission[]> = {
  // Manager: everything except managing the team itself.
  manager: ALL_SELLER_PERMISSIONS.filter((p) => p !== "staff.manage"),
  // Staff: day-to-day operations.
  staff: [
    "products.view",
    "products.edit",
    "products.publish",
    "orders.view",
    "orders.update",
    "inventory.manage",
    "customers.view",
    "reviews.manage",
    "support.manage",
    "analytics.view",
  ],
  // Viewer: read-only.
  viewer: ["products.view", "orders.view", "customers.view", "analytics.view", "finance.view"],
};

type SellerDb = SupabaseClient<Database>;

/**
 * THE security contract for the Seller OS. Resolves the seller from the
 * SESSION ONLY (context.userId) — never accepts a seller_id from the client.
 *
 * - Owner: `sellers` row where owner_id = userId → gets all permissions.
 * - Staff: `seller_staff` row where user_id = userId → gets only the
 *   permissions stored in that row's jsonb array.
 * - Rejects when neither row exists, when the seller's account_status is not
 *   'active', or when a staff member lacks any of the required permissions.
 * - Unless `opts.allowMustReset` is set, an owner whose
 *   `must_reset_password` flag is set is rejected with
 *   `Error("MUST_RESET_PASSWORD")`. This makes every existing seller server
 *   function deny flagged owners server-side — the enforcement is not just
 *   the client redirect in SellerShell (which stays as a fast-path).
 */
async function resolveSeller(
  ctx: { supabase: SellerDb; userId: string },
  opts: { allowMustReset?: boolean },
  ...permissions: SellerPermission[]
): Promise<SellerContext> {
  const { supabase, userId } = ctx;

  let sellerId: string;
  let legalName: string;
  let isOwner = false;
  let mustResetPassword = false;
  let onboarded = false;
  let perms: SellerPermission[];

  const { data: owned, error: ownerError } = await supabase
    .from("sellers")
    .select("id,legal_name,account_status,must_reset_password,onboarded_at")
    .eq("owner_id", userId)
    .maybeSingle();
  // Fallback: if RLS blocks the user-scoped query (e.g. server context
  // without auth.uid), retry with the service-role client.
  let ownedSeller = owned;
  if (!ownedSeller) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: adminOwned } = await supabaseAdmin
        .from("sellers")
        .select("id,legal_name,account_status,must_reset_password,onboarded_at")
        .eq("owner_id", userId)
        .maybeSingle();
      if (adminOwned) ownedSeller = adminOwned;
    } catch {
      // ignore, fall through to DENIED
    }
  }
  if (ownerError && !ownedSeller) throw new Error(DENIED);

  if (ownedSeller) {
    if (ownedSeller.account_status !== "active") throw new Error(DENIED);
    sellerId = ownedSeller.id;
    legalName = ownedSeller.legal_name;
    isOwner = true;
    mustResetPassword = ownedSeller.must_reset_password ?? false;
    onboarded = ownedSeller.onboarded_at != null;
    perms = [...ALL_SELLER_PERMISSIONS];
    // Server-side first-login enforcement: a flagged owner may not touch
    // ANY seller server function until the password is rotated. The
    // password-change flow itself uses requireSellerAllowMustReset.
    if (mustResetPassword && !opts.allowMustReset) throw new Error("MUST_RESET_PASSWORD");
  } else {
    const { data: staff, error: staffError } = await supabase
      .from("seller_staff")
      .select("seller_id,permissions,active")
      .eq("user_id", userId)
      .maybeSingle();
    if (staffError || !staff) {
      // No seller identity from the session: check for a validated admin
      // support grant (Section 47). A valid grant returns a scoped,
      // read-only support context; otherwise the normal DENIED path stands.
      const support = await resolveSupportSeller({ supabase, userId });
      if (support) return support;
      throw new Error(DENIED);
    }
    // Deactivated staff lose access immediately (fail closed).
    if (staff.active === false) throw new Error(DENIED);
    const { data: sellerRow, error: sellerError } = await supabase
      .from("sellers")
      .select("id,legal_name,account_status,onboarded_at")
      .eq("id", staff.seller_id)
      .maybeSingle();
    if (sellerError || !sellerRow || sellerRow.account_status !== "active") throw new Error(DENIED);
    sellerId = sellerRow.id;
    legalName = sellerRow.legal_name;
    onboarded = sellerRow.onboarded_at != null;
    // The forced-rotation flag belongs to the owner account (provisioned by
    // the admin); staff are invited with their own credentials and never
    // inherit it.
    mustResetPassword = false;
    const raw = staff.permissions;
    const staffPerms = Array.isArray(raw) ? (raw as string[]) : [];
    perms = staffPerms.filter((p): p is SellerPermission =>
      (ALL_SELLER_PERMISSIONS as string[]).includes(p),
    );
    for (const p of permissions) {
      if (!perms.includes(p)) throw new Error(DENIED);
    }
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id,slug")
    .eq("seller_id", sellerId)
    .maybeSingle();

  return {
    sellerId,
    storeId: store?.id ?? null,
    storeSlug: store?.slug ?? null,
    isOwner,
    permissions: perms,
    legalName,
    mustResetPassword,
    onboarded,
  };
}

/**
 * Session-only seller resolution that DENIES flagged owners server-side.
 * This is the default gate for every seller server function: an owner with
 * `must_reset_password = true` gets `Error("MUST_RESET_PASSWORD")` instead
 * of a context, so no seller data or mutation is reachable before the
 * forced password rotation.
 */
export async function requireSeller(
  ctx: { supabase: SellerDb; userId: string },
  ...permissions: SellerPermission[]
): Promise<SellerContext> {
  return resolveSeller(ctx, {}, ...permissions);
}

/**
 * Session-only seller resolution that ALLOWS flagged owners through.
 * Used ONLY by the password-change flow (the one operation a flagged owner
 * must be able to perform). Every other seller server function goes through
 * requireSeller and stays denied until the flag is cleared.
 */
export async function requireSellerAllowMustReset(
  ctx: { supabase: SellerDb; userId: string },
  ...permissions: SellerPermission[]
): Promise<SellerContext> {
  return resolveSeller(ctx, { allowMustReset: true }, ...permissions);
}

/**
 * Server-side UI gate for the Seller OS. Returns { seller: SellerContext | null }.
 * Signed-out users never reach the handler (requireSupabaseAuth throws first);
 * signed-in non-sellers resolve to null instead of an error.
 *
 * A flagged owner (MUST_RESET_PASSWORD) still resolves — with the
 * allow-variant — so the shell client-redirects to the change-password page
 * instead of showing a confusing "not-seller" state.
 */
export const getSellerContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const seller = await requireSeller({
        supabase: context.supabase as SellerDb,
        userId: context.userId,
      });
      return { seller };
    } catch (err) {
      if (err instanceof Error && err.message === "MUST_RESET_PASSWORD") {
        try {
          const seller = await requireSellerAllowMustReset({
            supabase: context.supabase as SellerDb,
            userId: context.userId,
          });
          return { seller };
        } catch {
          return { seller: null };
        }
      }
      return { seller: null };
    }
  });

/** Discriminated seller access state, resolved server-side from the session only. */
export type SellerAccessState =
  | "active"
  | "pending"
  | "suspended"
  | "disabled"
  | "staff-deactivated"
  | "no-account";

/**
 * Server-side access check for the seller login / route gates. Unlike
 * getSellerContext (which swallows everything to null), this tells the UI
 * WHY access is denied so suspended / disabled / pending sellers and
 * deactivated staff get a clear message instead of a confusing
 * "not a seller" state. Resolves identity from the session only.
 */
export const getSellerAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ access: SellerAccessState; mustResetPassword: boolean; onboarded: boolean; isOwner: boolean }> => {
    const supabase = context.supabase as SellerDb;
    const userId = context.userId;

    const { data: owned, error: ownerError } = await supabase
      .from("sellers")
      .select("id,account_status,must_reset_password,onboarded_at")
      .eq("owner_id", userId)
      .maybeSingle();
    if (!ownerError && owned) {
      const status = owned.account_status;
      return {
        access: status === "active" ? "active" : status,
        mustResetPassword: owned.must_reset_password ?? false,
        onboarded: owned.onboarded_at != null,
        isOwner: true,
      };
    }

    const { data: staff, error: staffError } = await supabase
      .from("seller_staff")
      .select("seller_id,active")
      .eq("user_id", userId)
      .maybeSingle();
    if (!staffError && staff) {
      // Deactivated staff lose access immediately (fail closed).
      if (staff.active === false) return { access: "staff-deactivated", mustResetPassword: false, onboarded: false, isOwner: false };
      const { data: sellerRow, error: sellerError } = await supabase
        .from("sellers")
        .select("account_status,onboarded_at")
        .eq("id", staff.seller_id)
        .maybeSingle();
      if (sellerError || !sellerRow) return { access: "no-account", mustResetPassword: false, onboarded: false, isOwner: false };
      const status = sellerRow.account_status;
      // Forced rotation is owner-only: staff are invited with their own
      // credentials via Supabase invite emails.
      return {
        access: status === "active" ? "active" : status,
        mustResetPassword: false,
        onboarded: sellerRow.onboarded_at != null,
        isOwner: false,
      };
    }

    return { access: "no-account", mustResetPassword: false, onboarded: false, isOwner: false };
  });

/**
 * Session-less auth client used ONLY to verify the caller's current
 * (temporary) password. Never persists a session, never touches cookies.
 */
function authVerifierClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Password change is temporarily unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Forced password rotation for sellers provisioned by the admin.
 *
 * Flow: admin creates the auth user with a one-time temporary password
 * (shown once in the admin UI) and sets `sellers.must_reset_password = true`.
 * On first sign-in the login page routes the owner to
 * `/seller/change-password`, which calls this function: the caller proves
 * knowledge of the temporary password, a new password is applied through the
 * admin API, and the flag is cleared.
 *
 * Errors are thrown as short English codes; the page maps them to i18n.
 */
const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(72),
});

export const changeSellerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => changePasswordInput.parse(data))
  .handler(async ({ data, context }) => {
    const { rateLimitEndpoint } = await import("@/lib/rate-limit");
    // Blunt password-guessing against the temporary password.
    rateLimitEndpoint("changeSellerPassword", 10, 10 * 60 * 1000);

    const supabase = context.supabase as SellerDb;
    const userId = context.userId;

    // The allow-variant: this is the one operation a flagged owner must be
    // able to perform while MUST_RESET_PASSWORD is set (requireSeller would
    // throw here). Staff never rotate the seller's credentials — fail closed.
    const access = await requireSellerAllowMustReset({ supabase, userId });
    if (!access.isOwner) throw new Error("NOT_SELLER_OWNER");
    const { data: seller, error: sellerError } = await supabase
      .from("sellers")
      .select("id,email")
      .eq("id", access.sellerId)
      .maybeSingle();
    if (sellerError || !seller) throw new Error("NOT_SELLER_OWNER");
    if (data.newPassword === data.currentPassword) throw new Error("PASSWORD_SAME_AS_CURRENT");

    if (!seller.email) throw new Error("NOT_SELLER_OWNER");

    // Prove knowledge of the current (temporary) password with a throwaway
    // session-less sign-in. Nothing from the browser session is reused.
    const { error: signInError } = await authVerifierClient().auth.signInWithPassword({
      email: seller.email,
      password: data.currentPassword,
    });
    if (signInError) throw new Error("CURRENT_PASSWORD_INCORRECT");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
      user_metadata: { force_password_reset: false },
    });
    if (updateError) throw new Error("UPDATE_FAILED");

    const { error: flagError } = await supabaseAdmin
      .from("sellers")
      .update({ must_reset_password: false })
      .eq("id", seller.id);
    if (flagError) throw new Error("UPDATE_FAILED");

    // Best-effort audit; the password itself is never logged or stored.
    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "seller_password_changed",
        resource: "seller",
        resource_id: seller.id,
        metadata: {},
      });
    } catch {
      /* audit is best-effort */
    }

    return { ok: true as const };
  });
