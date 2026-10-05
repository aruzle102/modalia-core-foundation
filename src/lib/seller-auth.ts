import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
}

const ALL_SELLER_PERMISSIONS: SellerPermission[] = [
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
 */
export async function requireSeller(
  ctx: { supabase: SellerDb; userId: string },
  ...permissions: SellerPermission[]
): Promise<SellerContext> {
  const { supabase, userId } = ctx;

  let sellerId: string;
  let legalName: string;
  let isOwner = false;
  let perms: SellerPermission[];

  const { data: owned, error: ownerError } = await supabase
    .from("sellers")
    .select("id,legal_name,account_status")
    .eq("owner_id", userId)
    .maybeSingle();
  if (ownerError) throw new Error(DENIED);

  if (owned) {
    if (owned.account_status !== "active") throw new Error(DENIED);
    sellerId = owned.id;
    legalName = owned.legal_name;
    isOwner = true;
    perms = [...ALL_SELLER_PERMISSIONS];
  } else {
    const { data: staff, error: staffError } = await supabase
      .from("seller_staff")
      .select("seller_id,permissions,active")
      .eq("user_id", userId)
      .maybeSingle();
    if (staffError || !staff) throw new Error(DENIED);
    // Deactivated staff lose access immediately (fail closed).
    if (staff.active === false) throw new Error(DENIED);
    const { data: sellerRow, error: sellerError } = await supabase
      .from("sellers")
      .select("id,legal_name,account_status")
      .eq("id", staff.seller_id)
      .maybeSingle();
    if (sellerError || !sellerRow || sellerRow.account_status !== "active") throw new Error(DENIED);
    sellerId = sellerRow.id;
    legalName = sellerRow.legal_name;
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
  };
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
