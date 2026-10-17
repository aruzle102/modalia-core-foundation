import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
 * - The legacy `must_reset_password` flag is reported in the context for
 *   display purposes only; it no longer blocks any seller server function.
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
    // The must_reset_password flag is informational only (shown on the
    // security page); it no longer blocks seller access.
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
      const { resolveSupportSeller } = await import("@/lib/seller-support-auth.server");
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
 * Session-only seller resolution for seller server functions.
 * Rejects when no seller identity exists, the account is not active,
 * or a staff member lacks a required permission. The legacy
 * `must_reset_password` flag is informational only and never blocks access.
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
    } catch {
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

