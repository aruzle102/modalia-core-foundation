import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { rateLimitEndpoint } from "@/lib/rate-limit";

// ============================================================================
// Coupon engine (V8 §29, Track 1)
// ----------------------------------------------------------------------------
// Server-side coupon validation + discount math. Client prices are never
// trusted: every variant is resolved from the database with the same
// availability rules the checkout_cart RPC enforces (active / published /
// approved / public product, active store, available variant, enough stock).
//
// NOTE: the public validateCoupon endpoint cannot enforce per_customer_limit —
// there is no customer identity on a public quote. The checkout_cart RPC
// enforces it at order time (customer_id for signed-in buyers, normalized
// guest phone otherwise). usage_limit (global) IS enforced here.
// ============================================================================

/** Minimal coupon shape needed by the discount math. */
export interface CouponRow {
  id: string;
  code: string;
  seller_id: string | null;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  max_discount_amount: number | null;
}

export type CouponInvalidReason =
  | "not_found"
  | "inactive"
  | "expired"
  | "usage_limit"
  | "min_not_met"
  | "not_applicable";

/** Thrown by computeCouponDiscount / validateCoupon on invalid coupons. */
export class CouponError extends Error {
  readonly reason: CouponInvalidReason;
  constructor(reason: CouponInvalidReason, message: string) {
    super(message);
    this.name = "CouponError";
    this.reason = reason;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * computeCouponDiscount — pure per-seller coupon discount math.
 *
 * - Platform coupon (seller_id NULL): applies to every seller's subtotal.
 * - Seller coupon: applies only to that seller; throws "not_applicable" when
 *   the seller has no items in the cart.
 * - min_order_amount is checked per applicable seller against that seller's
 *   eligible subtotal (matches the checkout_cart RPC).
 * - percentage: LEAST(value/100 * eligible, max_discount_amount ?? eligible).
 * - fixed: LEAST(value, eligible).
 *
 * The first parameter is the service-role client (kept in the signature for
 * the checkout quote fn, which passes its own client; currently unused —
 * per-customer usage checks need identity the quote path does not have).
 */
export function computeCouponDiscount(
  _supabaseAdmin: SupabaseClient<Database>,
  coupon: CouponRow,
  sellerSubtotals: Array<{ sellerId: string; subtotal: number }>,
): { totalDiscount: number; perSeller: Map<string, number> } {
  const perSeller = new Map<string, number>();
  const applies = (sellerId: string) => coupon.seller_id === null || coupon.seller_id === sellerId;
  if (coupon.seller_id !== null && !sellerSubtotals.some((s) => s.sellerId === coupon.seller_id)) {
    throw new CouponError("not_applicable", "This coupon is not applicable to your cart.");
  }
  let totalDiscount = 0;
  for (const { sellerId, subtotal } of sellerSubtotals) {
    let share = 0;
    if (applies(sellerId) && subtotal > 0) {
      if (coupon.min_order_amount != null && subtotal < coupon.min_order_amount) {
        throw new CouponError("min_not_met", "Coupon minimum not met.");
      }
      share =
        coupon.discount_type === "percentage"
          ? Math.min((coupon.discount_value / 100) * subtotal, coupon.max_discount_amount ?? subtotal)
          : Math.min(coupon.discount_value, subtotal);
      share = Math.max(0, round2(share));
    }
    perSeller.set(sellerId, share);
    totalDiscount += share;
  }
  return { totalDiscount: round2(totalDiscount), perSeller };
}

// ---------------------------------------------------------------------------
// Public quote endpoint: validateCoupon({ code, items }) — rate-limited.
// ---------------------------------------------------------------------------
const validateCouponSchema = z.object({
  code: z.string().trim().min(1).max(64),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(100),
});

type ValidateCouponOk = {
  valid: true;
  code: string;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  eligibleSubtotal: number;
};

type ValidateCouponBad = {
  valid: false;
  reason: CouponInvalidReason;
  message: string;
};

export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((data) => validateCouponSchema.parse(data))
  .handler(async ({ data }): Promise<ValidateCouponOk | ValidateCouponBad> => {
    // Public endpoint: cap coupon probing per IP (code enumeration / scraping).
    rateLimitEndpoint("validateCoupon", 30);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const code = data.code.trim().toUpperCase();
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from("coupons")
      .select("id,code,seller_id,discount_type,discount_value,min_order_amount,max_discount_amount,status,starts_at,ends_at,usage_count,usage_limit")
      .eq("code", code)
      .maybeSingle();
    if (couponError) throw new Error("Coupon validation is unavailable.");
    const fail = (reason: CouponInvalidReason, message: string): ValidateCouponBad => ({ valid: false, reason, message });
    if (!coupon) return fail("not_found", "This coupon code is not valid.");
    if (coupon.status !== "active") return fail("inactive", "This coupon is not active.");
    const now = Date.now();
    if ((coupon.starts_at && new Date(coupon.starts_at).getTime() > now) || (coupon.ends_at && new Date(coupon.ends_at).getTime() < now)) {
      return fail("expired", "This coupon has expired.");
    }
    if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) {
      return fail("usage_limit", "This coupon has reached its usage limit.");
    }

    // Resolve variants from the DB — never trust client prices.
    const variantIds = [...new Set(data.items.map((i) => i.variantId))];
    const { data: variants, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .select(
        "id,price,available,products(id,base_price,seller_id,status,publication_status,moderation_status,visibility,stores(status))",
      )
      .in("id", variantIds);
    if (variantError || !variants) throw new Error("Coupon validation is unavailable.");

    const qtyByVariant = new Map<string, number>();
    for (const item of data.items) {
      qtyByVariant.set(item.variantId, (qtyByVariant.get(item.variantId) ?? 0) + item.quantity);
    }
    const { data: stock, error: stockError } = await supabaseAdmin
      .from("inventory")
      .select("variant_id,quantity,reserved_quantity,max_purchase_quantity")
      .in("variant_id", variantIds);
    if (stockError || !stock) throw new Error("Coupon validation is unavailable.");
    const stockByVariant = new Map(stock.map((s) => [s.variant_id, s]));

    // Same availability rules the checkout_cart RPC enforces.
    const subtotalBySeller = new Map<string, number>();
    for (const v of variants) {
      const p = v.products;
      const store = Array.isArray(p?.stores) ? p.stores[0] : p?.stores;
      const product = Array.isArray(p) ? p[0] : p;
      const qty = qtyByVariant.get(v.id) ?? 0;
      const s = stockByVariant.get(v.id);
      const availableStock = (s?.quantity ?? 0) - (s?.reserved_quantity ?? 0);
      const unavailable =
        !product ||
        product.status !== "active" ||
        product.publication_status !== "published" ||
        product.moderation_status !== "approved" ||
        product.visibility !== "public" ||
        !store ||
        store.status !== "active" ||
        !v.available ||
        !s ||
        qty > availableStock ||
        (s.max_purchase_quantity != null && qty > s.max_purchase_quantity);
      if (unavailable) {
        return fail("not_applicable", "One or more items are no longer available.");
      }
      const unitPrice = v.price ?? product.base_price ?? 0;
      subtotalBySeller.set(product.seller_id, round2((subtotalBySeller.get(product.seller_id) ?? 0) + unitPrice * qty));
    }
    if (subtotalBySeller.size === 0) {
      return fail("not_applicable", "One or more items are no longer available.");
    }

    const sellerSubtotals = [...subtotalBySeller.entries()].map(([sellerId, subtotal]) => ({ sellerId, subtotal }));
    const couponRow: CouponRow = {
      id: coupon.id,
      code: coupon.code,
      seller_id: coupon.seller_id,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      min_order_amount: coupon.min_order_amount,
      max_discount_amount: coupon.max_discount_amount,
    };
    try {
      const { totalDiscount } = computeCouponDiscount(supabaseAdmin, couponRow, sellerSubtotals);
      const eligibleSubtotal = round2(
        sellerSubtotals
          .filter((s) => coupon.seller_id === null || coupon.seller_id === s.sellerId)
          .reduce((sum, s) => sum + s.subtotal, 0),
      );
      return {
        valid: true,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        discountAmount: totalDiscount,
        eligibleSubtotal,
      };
    } catch (err) {
      if (err instanceof CouponError) return fail(err.reason, err.message);
      throw err;
    }
  });
