import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rateLimitEndpoint } from "@/lib/rate-limit";
import { v8Admin, type SellerOfficePublic } from "@/lib/seller-offices.functions";

/**
 * Checkout quote (MODALIA V8, Sections 29–32).
 *
 * Public read-only price engine for the 5-step checkout. The client NEVER
 * computes money: this function resolves variants server-side (price, seller,
 * store, stock — same visibility rules as the checkout_cart RPC), groups by
 * seller, matches shipping rules with the exact RPC precedence
 * (seller rule > platform, commune-specific > wilaya-only, weight band), and
 * applies coupons read-only.
 *
 * NOTE (coordinator, 2026-10-06): `@/lib/coupon.functions` (Worker A) has now
 * landed with `computeCouponDiscount` and the same reason-code contract.
 * Coupon validation below is replicated read-only from the coupons table;
 * swapping in the shared import is optional tech debt — the checkout_cart RPC
 * remains the single authoritative applier at submit time.
 */

const quoteItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

const quoteSchema = z.object({
  items: z.array(quoteItemSchema).min(1).max(100),
  wilayaId: z.string().uuid(),
  communeId: z.string().uuid().nullable(),
  methods: z.record(z.string().uuid(), z.enum(["home", "office"])),
  officeIds: z.record(z.string().uuid(), z.string().uuid()),
  couponCode: z.string().trim().min(1).max(64).optional(),
  // Optional buyer identity for coupon checks that need it. Same strict
  // Algerian phone format as the checkout submit path; when present it is
  // normalized exactly like p_phone at submit time and used for the coupon's
  // per_customer_limit check (mirrors the checkout_cart RPC). Absent → the
  // check is skipped and the RPC remains authoritative at submit.
  buyerPhone: z
    .string()
    .regex(/^(0[5-7][0-9]{8}|\+213[5-7][0-9]{8})$/)
    .optional(),
});

export type QuoteDeliveryMethod = "home" | "office";

export interface QuoteOfficeOption {
  price: number;
  offices: SellerOfficePublic[];
}

export interface QuoteSeller {
  sellerId: string;
  storeName: string;
  itemCount: number;
  subtotal: number;
  shipping: {
    home: number | null;
    office: QuoteOfficeOption | null;
  };
}

export interface QuoteCoupon {
  code: string;
  discountAmount: number;
}

export type CouponReason =
  | "not_found"
  | "inactive"
  | "expired"
  | "usage_limit"
  | "min_not_met"
  | "not_applicable";

export interface CheckoutQuote {
  sellers: QuoteSeller[];
  totals: {
    subtotal: number;
    shipping: number | null;
    discount: number;
    total: number | null;
  };
  coupon: QuoteCoupon | null;
  couponError: { reason: CouponReason } | null;
}

type AdminDb = Awaited<ReturnType<typeof v8Admin>>;

interface ShippingRuleRow {
  seller_id: string | null;
  wilaya_id: string | null;
  commune_id: string | null;
  delivery_method: string;
  price: number;
  enabled: boolean;
  status: string;
  min_weight_grams: number;
  max_weight_grams: number | null;
}

/** RPC precedence, read-only: seller > platform, commune > wilaya, weight band. */
function matchShippingRule(
  rules: ShippingRuleRow[],
  sellerId: string,
  method: QuoteDeliveryMethod,
  weight: number,
  communeId: string | null,
): ShippingRuleRow | null {
  const candidates = rules.filter(
    (r) =>
      r.enabled &&
      r.status === "active" &&
      r.delivery_method === method &&
      (r.seller_id === sellerId || r.seller_id === null) &&
      (communeId ? r.commune_id === communeId || r.commune_id === null : r.commune_id === null) &&
      r.min_weight_grams <= weight &&
      (r.max_weight_grams === null || weight < r.max_weight_grams),
  );
  candidates.sort(
    (a, b) =>
      Number(b.seller_id !== null) - Number(a.seller_id !== null) ||
      Number(b.commune_id !== null) - Number(a.commune_id !== null) ||
      b.min_weight_grams - a.min_weight_grams,
  );
  return candidates[0] ?? null;
}

/**
 * Read-only coupon validation, mirroring Worker A's validateCoupon contract.
 * Returns the same reason codes; no usage counters are touched.
 *
 * Also mirrors the checkout_cart RPC's per_customer_limit check
 * (supabase/migrations/20261006180000_checkout_coupons_tracking_v8.sql):
 * when `buyerPhone` is provided it is normalized exactly like the submit
 * path's p_phone and prior coupon_usages rows for this coupon + phone are
 * counted; reaching the limit rejects the coupon read-only. Without a buyer
 * phone there is no customer identity on a public quote, so the check is
 * skipped — the RPC stays authoritative at submit time.
 */
async function validateCouponReadonly(
  db: AdminDb,
  code: string,
  sellerSubtotals: Record<string, number>,
  subtotal: number,
  buyerPhone: string | null,
): Promise<
  | { valid: true; code: string; discountType: string; discountValue: number; discountAmount: number; eligibleSubtotal: number }
  | { valid: false; reason: CouponReason }
> {
  // Escape LIKE wildcards: the code is user input and must match literally —
  // otherwise "%" would match any coupon in the table.
  const escapedCode = code.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data: coupon } = await db
    .from("coupons")
    .select(
      "id,code,status,discount_type,discount_value,starts_at,ends_at,usage_limit,usage_count,per_customer_limit,min_order_amount,max_discount_amount,seller_id",
    )
    .ilike("code", escapedCode)
    .maybeSingle();
  if (!coupon) return { valid: false, reason: "not_found" };
  if (coupon.status !== "active") return { valid: false, reason: "inactive" };
  const now = Date.now();
  if (
    (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) ||
    (coupon.ends_at && new Date(coupon.ends_at).getTime() < now)
  ) {
    return { valid: false, reason: "expired" };
  }
  if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) {
    return { valid: false, reason: "usage_limit" };
  }
  // Per-customer limit — same logic as the checkout_cart RPC:
  //   SELECT count(*) FROM public.coupon_usages
  //     WHERE coupon_id = v_coupon.id
  //       AND ((p_customer_id IS NOT NULL AND customer_id = p_customer_id)
  //         OR (guest_phone IS NOT NULL AND guest_phone = p_phone));
  //   IF v_usage_used >= v_coupon.per_customer_limit THEN RAISE EXCEPTION ...; END IF;
  // The customer_id branch never applies on this public quote path (the
  // submit wrapper never passes p_customer_id); the guest-phone branch is
  // the operative one, with the phone normalized exactly as at submit time
  // (checkout.functions.ts: `0…` → `+213…`).
  if (coupon.per_customer_limit != null && buyerPhone) {
    const normalizedPhone = buyerPhone.startsWith("0") ? "+213" + buyerPhone.slice(1) : buyerPhone;
    // coupon_usages is not yet in the generated Database types (same
    // `as any` precedent as system-health.functions.ts "pg_tables"); the
    // query only reads `count`, never row fields.
    const { count: priorUses } = await db
      .from("coupon_usages" as any)
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("guest_phone", normalizedPhone);
    // Rejection uses the existing couponError shape. The reason stays inside
    // the CouponReason union (checkout.tsx maps it exhaustively with
    // Record<CouponReason, string> — a new reason would break tsc there);
    // the client shows its usage-limit message, same rejection family the
    // RPC raises ("…maximum number of times").
    if ((priorUses ?? 0) >= coupon.per_customer_limit) {
      return { valid: false, reason: "usage_limit" };
    }
  }
  const eligibleSubtotal = coupon.seller_id ? (sellerSubtotals[coupon.seller_id] ?? 0) : subtotal;
  if (eligibleSubtotal <= 0) return { valid: false, reason: "not_applicable" };
  if (coupon.min_order_amount != null && eligibleSubtotal < Number(coupon.min_order_amount)) {
    return { valid: false, reason: "min_not_met" };
  }
  let discount =
    coupon.discount_type === "percentage"
      ? (eligibleSubtotal * Number(coupon.discount_value)) / 100
      : Math.min(Number(coupon.discount_value), eligibleSubtotal);
  if (coupon.max_discount_amount != null) discount = Math.min(discount, Number(coupon.max_discount_amount));
  discount = Math.max(0, Math.round(discount * 100) / 100);
  return {
    valid: true,
    code: coupon.code,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value),
    discountAmount: discount,
    eligibleSubtotal,
  };
}

export const getCheckoutQuote = createServerFn({ method: "POST" })
  .inputValidator((data) => quoteSchema.parse(data))
  .handler(async ({ data }): Promise<CheckoutQuote> => {
    // Public quote: priced per IP so it cannot be scraped for catalog data.
    rateLimitEndpoint("getCheckoutQuote", 60);
    const db = await v8Admin();

    // Destination sanity — same as the RPC, without inventing places.
    const { data: wilaya } = await db.from("wilayas").select("id").eq("id", data.wilayaId).eq("active", true).maybeSingle();
    if (!wilaya) throw new Error("Choose a valid wilaya.");
    if (data.communeId) {
      const { data: commune } = await db
        .from("communes")
        .select("id,wilaya_id")
        .eq("id", data.communeId)
        .eq("active", true)
        .maybeSingle();
      if (!commune || commune.wilaya_id !== data.wilayaId) throw new Error("Choose a valid commune.");
    }

    // Merge duplicate variant lines, then resolve everything in bulk.
    const quantities = new Map<string, number>();
    for (const item of data.items) {
      quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
    }
    const variantIds = [...quantities.keys()];

    const { data: variants, error: variantError } = await db
      .from("product_variants")
      .select(
        "id,price,available,weight_grams,product_id,products!inner(id,base_price,weight_grams,status,publication_status,moderation_status,visibility,seller_id,store_id,stores!inner(id,name,status))",
      )
      .in("id", variantIds);
    if (variantError) throw new Error("Items are unavailable.");
    if (!variants || variants.length !== variantIds.length) {
      throw new Error("One or more items are no longer available.");
    }

    const { data: inventoryRows } = await db
      .from("inventory")
      .select("variant_id,quantity,reserved_quantity,max_purchase_quantity")
      .in("variant_id", variantIds);
    const inventoryByVariant = new Map((inventoryRows ?? []).map((r) => [r.variant_id, r]));

    // Same visibility rules as the checkout_cart RPC — never trust the client.
    type SellerBucket = { sellerId: string; storeName: string; subtotal: number; weight: number; itemCount: number };
    const buckets = new Map<string, SellerBucket>();
    for (const variant of variants) {
      const product = variant.products as unknown as {
        base_price: number | null;
        weight_grams: number | null;
        status: string;
        publication_status: string;
        moderation_status: string;
        visibility: string;
        seller_id: string;
        store_id: string;
        stores: { id: string; name: unknown; status: string } | null;
      };
      const store = product.stores;
      if (
        product.status !== "active" ||
        product.publication_status !== "published" ||
        product.moderation_status !== "approved" ||
        product.visibility !== "public" ||
        !variant.available ||
        !store ||
        store.status !== "active"
      ) {
        throw new Error("One or more items are no longer available.");
      }
      const qty = quantities.get(variant.id) ?? 0;
      const inv = inventoryByVariant.get(variant.id);
      const availableStock = (inv?.quantity ?? 0) - (inv?.reserved_quantity ?? 0);
      if (!inv || availableStock < qty || (inv.max_purchase_quantity != null && qty > inv.max_purchase_quantity)) {
        throw new Error("One or more items no longer have enough stock.");
      }
      const unitPrice = Number(variant.price ?? product.base_price ?? 0);
      const weight = Number(variant.weight_grams ?? product.weight_grams ?? 0);
      const sellerId = product.seller_id;
      const bucket = buckets.get(sellerId) ?? {
        sellerId,
        storeName: "",
        subtotal: 0,
        weight: 0,
        itemCount: 0,
      };
      bucket.subtotal += unitPrice * qty;
      bucket.weight += weight * qty;
      bucket.itemCount += qty;
      buckets.set(sellerId, bucket);
    }
    const sellerIds = [...buckets.keys()];

    // Store names (server-side fallback is the storeFallback i18n key on the client).
    if (sellerIds.length > 0) {
      const { data: stores } = await db.from("stores").select("id,seller_id,name").in("seller_id", sellerIds);
      const nameBySeller = new Map((stores ?? []).map((s) => [s.seller_id as string, s.name as unknown]));
      for (const bucket of buckets.values()) {
        const raw = nameBySeller.get(bucket.sellerId);
        bucket.storeName = typeof raw === "string" ? raw : "";
      }
    }

    // Shipping rules for this wilaya (both methods); matched in JS with RPC precedence.
    const { data: ruleRows } = await db
      .from("shipping_rules")
      .select("seller_id,wilaya_id,commune_id,delivery_method,price,enabled,status,min_weight_grams,max_weight_grams")
      .eq("wilaya_id", data.wilayaId)
      .eq("enabled", true)
      .eq("status", "active");
    const rules = ((ruleRows ?? []) as unknown as ShippingRuleRow[]).map((r) => ({ ...r, price: Number(r.price) }));

    // Office availability: office_enabled flag + active offices in this wilaya.
    const { data: settingsRows } = await db
      .from("seller_shipping_settings")
      .select("seller_id,office_enabled")
      .in("seller_id", sellerIds);
    const officeEnabled = new Map((settingsRows ?? []).map((s) => [s.seller_id as string, Boolean(s.office_enabled)]));
    const { data: officeRows } = await db
      .from("seller_offices")
      .select("id,name,commune_id,address,phone,opening_hours,seller_id")
      .in("seller_id", sellerIds)
      .eq("wilaya_id", data.wilayaId)
      .eq("active", true)
      .order("name", { ascending: true });
    const officesBySeller = new Map<string, SellerOfficePublic[]>();
    for (const row of (officeRows ?? []) as Array<SellerOfficePublic & { seller_id: string }>) {
      const list = officesBySeller.get(row.seller_id) ?? [];
      const { seller_id: _sid, ...pub } = row;
      void _sid;
      list.push(pub);
      officesBySeller.set(row.seller_id, list);
    }

    const sellers: QuoteSeller[] = [];
    const sellerSubtotals: Record<string, number> = {};
    for (const bucket of buckets.values()) {
      sellerSubtotals[bucket.sellerId] = Math.round(bucket.subtotal * 100) / 100;
      const homeRule = matchShippingRule(rules, bucket.sellerId, "home", bucket.weight, data.communeId);
      const officeRule = matchShippingRule(rules, bucket.sellerId, "office", bucket.weight, data.communeId);
      const offices = officesBySeller.get(bucket.sellerId) ?? [];
      const office: QuoteOfficeOption | null =
        officeEnabled.get(bucket.sellerId) === true && offices.length > 0 && officeRule
          ? { price: officeRule.price, offices }
          : null;
      sellers.push({
        sellerId: bucket.sellerId,
        storeName: bucket.storeName,
        itemCount: bucket.itemCount,
        subtotal: Math.round(bucket.subtotal * 100) / 100,
        shipping: {
          home: homeRule ? homeRule.price : null,
          office,
        },
      });
    }
    sellers.sort((a, b) => a.storeName.localeCompare(b.storeName));

    // Coupon — read-only. Invalid codes surface as couponError; never a fake discount.
    let coupon: QuoteCoupon | null = null;
    let couponError: { reason: CouponReason } | null = null;
    if (data.couponCode) {
      const validation = await validateCouponReadonly(
        db,
        data.couponCode,
        sellerSubtotals,
        sellers.reduce((s, x) => s + x.subtotal, 0),
        data.buyerPhone ?? null,
      );
      if (validation.valid) {
        coupon = { code: validation.code, discountAmount: validation.discountAmount };
      } else {
        couponError = { reason: validation.reason };
      }
    }

    // Totals use the caller-chosen method per seller (default home).
    let shippingTotal: number | null = 0;
    for (const seller of sellers) {
      const method: QuoteDeliveryMethod = data.methods[seller.sellerId] ?? "home";
      const price = method === "office" ? (seller.shipping.office?.price ?? null) : seller.shipping.home;
      if (price === null) {
        shippingTotal = null;
        break;
      }
      shippingTotal += price;
    }
    const subtotal = sellers.reduce((s, x) => s + x.subtotal, 0);
    const discount = coupon?.discountAmount ?? 0;
    const total = shippingTotal === null ? null : Math.max(0, Math.round((subtotal + shippingTotal - discount) * 100) / 100);

    return {
      sellers,
      totals: {
        subtotal: Math.round(subtotal * 100) / 100,
        shipping: shippingTotal === null ? null : Math.round(shippingTotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        total,
      },
      coupon,
      couponError,
    };
  });
