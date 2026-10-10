/**
 * Admin permission system (V8 — user-approved roles design).
 *
 * Roles:
 * - super_admin: structural (user_roles.is_super_admin). All permissions,
 *   immutable — can NEVER be managed via admin_members (DB trigger enforces).
 * - admin: everything except super-admin-only areas (team, commissions,
 *   settings, audit, security).
 * - supervisor (مشرف): daily operations.
 * - viewer (معاين): read-only.
 *
 * Server enforcement is the authority. Client nav filtering is UX only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-auth";

export type AdminRole = "admin" | "supervisor" | "viewer";

export type AdminPermission =
  | "dashboard.view"
  | "analytics.view"
  | "orders.view"
  | "orders.manage"
  | "products.view"
  | "products.manage"
  | "reviews.manage"
  | "categories.manage"
  | "sellers.view"
  | "sellers.manage"
  | "applications.decide"
  | "stores.view"
  | "stores.manage"
  | "customers.view"
  | "content.manage"
  | "coupons.manage"
  | "shipping.manage"
  | "settlements.manage"
  | "intelligence.manage"
  | "notifications.view"
  | "notifications.manage";

export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "dashboard.view",
  "analytics.view",
  "orders.view",
  "orders.manage",
  "products.view",
  "products.manage",
  "reviews.manage",
  "categories.manage",
  "sellers.view",
  "sellers.manage",
  "applications.decide",
  "stores.view",
  "stores.manage",
  "customers.view",
  "content.manage",
  "coupons.manage",
  "shipping.manage",
  "settlements.manage",
  "intelligence.manage",
  "notifications.view",
  "notifications.manage",
];

/** Role presets — the starting permission set when a member is created. */
export const ADMIN_ROLE_PRESETS: Record<AdminRole, readonly AdminPermission[]> = {
  admin: ALL_ADMIN_PERMISSIONS,
  supervisor: [
    "dashboard.view",
    "analytics.view",
    "orders.view",
    "orders.manage",
    "products.view",
    "products.manage",
    "reviews.manage",
    "categories.manage",
    "sellers.view",
    "sellers.manage",
    "applications.decide",
    "stores.view",
    "customers.view",
    "notifications.view",
  ],
  viewer: [
    "dashboard.view",
    "analytics.view",
    "orders.view",
    "products.view",
    "sellers.view",
    "stores.view",
    "customers.view",
  ],
};

export const ADMIN_ROLES: readonly AdminRole[] = ["admin", "supervisor", "viewer"];

/** Areas only super_admin may touch — enforced by assertAdmin, never granted. */
export const SUPER_ADMIN_ONLY_AREAS = [
  "team",
  "commissions",
  "settings",
  "audit",
  "security",
] as const;

/**
 * Admin nav → required permission. "super_admin" means the item (and route)
 * is hidden from everyone except super_admin.
 */
export const ADMIN_NAV_PERMISSIONS: Record<string, AdminPermission | "super_admin"> = {
  "/admin": "dashboard.view",
  "/admin/analytics": "analytics.view",
  "/admin/orders": "orders.view",
  "/admin/products": "products.view",
  "/admin/categories": "categories.manage",
  "/admin/official-store": "content.manage",
  "/admin/reviews": "reviews.manage",
  "/admin/applications": "applications.decide",
  "/admin/sellers": "sellers.view",
  "/admin/stores": "stores.view",
  "/admin/customers": "customers.view",
  "/admin/shipping": "shipping.manage",
  "/admin/wilayas": "shipping.manage",
  "/admin/communes": "shipping.manage",
  "/admin/coupons": "coupons.manage",
  "/admin/settlements": "settlements.manage",
  "/admin/notifications": "notifications.view",
  "/admin/homepage": "content.manage",
  "/admin/homepage/builder": "content.manage",
  "/admin/media": "content.manage",
  "/admin/banners": "content.manage",
  "/admin/collections": "content.manage",
  "/admin/buttons": "content.manage",
  "/admin/ai": "intelligence.manage",
  "/admin/seo": "content.manage",
  "/admin/team": "super_admin",
  "/admin/commissions": "super_admin",
  "/admin/settings": "super_admin",
  "/admin/maintenance": "super_admin",
  "/admin/system-health": "super_admin",
  "/admin/audit": "super_admin",
  "/admin/security": "super_admin",
};

export type AdminIdentity =
  | { kind: "super_admin" }
  | { kind: "member"; role: AdminRole; permissions: AdminPermission[]; active: boolean }
  | { kind: "none" };

function sanitizePermissions(raw: unknown): AdminPermission[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ALL_ADMIN_PERMISSIONS);
  return raw.filter((p): p is AdminPermission => typeof p === "string" && allowed.has(p));
}

/**
 * Resolve the caller's admin identity. super_admin short-circuits (no table
 * read). Members must have an active admin_members row. Anything else → none.
 */
export async function getAdminIdentity(context: unknown): Promise<AdminIdentity> {
  const ctx = context as {
    supabase?: {
      rpc?: (fn: string) => Promise<{ data: unknown; error: unknown }>;
      auth?: { getUser?: () => Promise<{ data?: { user?: { id?: string } | null } }> };
    };
  } | null | undefined;
  const supabase = ctx?.supabase;
  if (!supabase?.rpc) return { kind: "none" };

  // 1. super_admin check (existing RPC, untouched semantics).
  try {
    const { data, error } = await supabase.rpc("is_super_admin");
    if (!error && data === true) return { kind: "super_admin" };
  } catch {
    return { kind: "none" };
  }

  // 2. Delegated member lookup.
  try {
    const userRes = await supabase.auth?.getUser?.();
    const userId = userRes?.data?.user?.id;
    if (!userId) return { kind: "none" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("admin_members")
      .select("role, permissions, active")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !row || row.active !== true) return { kind: "none" };
    const role = (row.role as string) as AdminRole;
    if (!ADMIN_ROLES.includes(role)) return { kind: "none" };
    return { kind: "member", role, permissions: sanitizePermissions(row.permissions), active: true };
  } catch {
    return { kind: "none" };
  }
}

export function identityHasPermission(identity: AdminIdentity, perm: AdminPermission): boolean {
  if (identity.kind === "super_admin") return true;
  if (identity.kind !== "member" || identity.active !== true) return false;
  return identity.permissions.includes(perm);
}

/**
 * Drop-in replacement for assertAdmin on non-sensitive admin functions.
 * super_admin bypasses; members need the permission AND an active row.
 * Throws "Forbidden" otherwise (same contract AdminGate relies on).
 */
export async function assertAdminPermission(
  context: unknown,
  perm: AdminPermission,
): Promise<AdminIdentity> {
  const identity = await getAdminIdentity(context);
  if (!identityHasPermission(identity, perm)) throw new Error("Forbidden");
  return identity;
}

/** Alias kept for sensitive areas — super_admin only, unchanged semantics. */
export const assertSuperAdmin = assertAdmin;

/** Client-safe identity for nav filtering (UX only — server re-checks). */
export const getMyAdminIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const identity = await getAdminIdentity(context);
    if (identity.kind === "super_admin") {
      return { kind: "super_admin" as const, permissions: [...ALL_ADMIN_PERMISSIONS] as AdminPermission[] };
    }
    if (identity.kind === "member") {
      return { kind: "member" as const, role: identity.role, permissions: identity.permissions };
    }
    return { kind: "none" as const, permissions: [] as AdminPermission[] };
  });

/** True when the nav item may render for the given permission set. */
export function canSeeNavItem(
  required: AdminPermission | "super_admin" | undefined,
  identity: { kind: string; permissions: string[] },
): boolean {
  if (!required) return true;
  if (required === "super_admin") return identity.kind === "super_admin";
  return identity.permissions.includes(required);
}
