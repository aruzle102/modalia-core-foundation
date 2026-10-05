import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, type SellerPermission } from "@/lib/seller-auth";
import type { Database, Json } from "@/integrations/supabase/types";

/**
 * Seller marketing operations (Phase 2/4, Worker 6).
 *
 * Coupons, product promotions (discounts), bundles and shipping rules for the
 * seller's own workspace. Every function:
 *   - runs `.middleware([requireSupabaseAuth])`,
 *   - resolves the seller through `requireSeller` (session only — NEVER trusts
 *     a client-supplied seller_id) with the permission named on each section,
 *   - scopes every read/write to `seller.sellerId` (anti-IDOR),
 *   - validates all math server-side with zod + explicit guards,
 *   - writes important mutations to `public.audit_logs` via the service-role
 *     client (audit failures never block the mutation).
 *
 * Reads and writes use the service-role client (`supabaseAdmin`) because RLS
 * policies on these tables only cover owner accounts; staff members with the
 * right `seller_staff` permissions must be able to work here too. The
 * session-derived `seller.sellerId` from `requireSeller` is the authority.
 */

const sellerOnly = [requireSupabaseAuth] as const;

type ResolvedSeller = Awaited<ReturnType<typeof requireSeller>>;

async function sellerSession(
  context: { supabase: unknown; userId: string },
  ...permissions: SellerPermission[]
): Promise<ResolvedSeller> {
  return requireSeller({ supabase: context.supabase as never, userId: context.userId }, ...permissions);
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function auditLog(
  actorId: string | null,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const db = await adminClient();
    await db.from("audit_logs").insert({
      actor_id: actorId,
      action,
      resource,
      resource_id: resourceId,
      metadata,
    });
  } catch {
    // Audit logging must never block the underlying mutation.
  }
}

const id = z.string().uuid();
const money = z.number().finite().min(0).max(100_000_000);

export function couponDisplayValue(discountType: string, discountValue: number): string {
  if (discountType === "percentage") return `${discountValue}%`;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(discountValue)} DZD`;
}

// ---------------------------------------------------------------------------
// Coupons (permission: coupons.manage)
// ---------------------------------------------------------------------------

/** Row shape including the guardrail columns added by migration
 *  20261005140000_modalia_coupon_columns.sql (generated types lag behind). */
export type SellerCouponRow = Database["public"]["Tables"]["coupons"]["Row"] & {
  min_order_amount: number | null;
  max_discount_amount: number | null;
  usage_count: number;
  per_customer_limit: number | null;
};

const couponDates = z
  .object({
    starts_at: z.string().datetime().nullable().optional(),
    ends_at: z.string().datetime().nullable().optional(),
  })
  .refine((d) => !d.starts_at || !d.ends_at || new Date(d.starts_at) < new Date(d.ends_at), {
    message: "Start date must be before the end date.",
  });

const couponFields = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, "Code must be at least 3 characters.")
    .max(40, "Code must be at most 40 characters.")
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Code may only contain letters, numbers, dashes and underscores."),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.number().positive("Discount must be greater than zero.").max(1_000_000),
  min_order_amount: money.nullable().optional(),
  max_discount_amount: money.nullable().optional(),
  usage_limit: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
  per_customer_limit: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const percentageCap = (d: { discount_type: string; discount_value: number }) =>
  d.discount_type !== "percentage" || d.discount_value <= 100;

const couponInput = couponFields
  .and(couponDates)
  .refine(percentageCap, {
    message: "A percentage discount cannot exceed 100%.",
    path: ["discount_value"],
  });

const couponUpdateInput = couponFields
  .extend({ id })
  .and(couponDates)
  .refine(percentageCap, {
    message: "A percentage discount cannot exceed 100%.",
    path: ["discount_value"],
  });

const COUPON_COLUMNS =
  "id, code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, ends_at, status, created_at";

export const listCoupons = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    const seller = await sellerSession(context, "coupons.manage");
    const db = await adminClient();
    const { data: rows, error } = await db
      .from("coupons")
      .select(COUPON_COLUMNS)
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { coupons: (rows ?? []) as unknown as SellerCouponRow[] };
  });

export const createCoupon = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => couponInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "coupons.manage");
    const db = await adminClient();

    // Code must be unique per seller.
    const { data: clash } = await db
      .from("coupons")
      .select("id")
      .eq("seller_id", seller.sellerId)
      .eq("code", data.code)
      .maybeSingle();
    if (clash) throw new Error("You already have a coupon with this code.");

    // NOTE: the guardrail columns were added by migration
    // 20261005140000_modalia_coupon_columns.sql and are not yet in the
    // generated types — the payload is cast for that reason only.
    const payload: Record<string, unknown> = {
      seller_id: seller.sellerId,
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_order_amount: data.min_order_amount ?? null,
      max_discount_amount: data.max_discount_amount ?? null,
      usage_limit: data.usage_limit ?? null,
      per_customer_limit: data.per_customer_limit ?? null,
      starts_at: data.starts_at ?? null,
      ends_at: data.ends_at ?? null,
      status: data.status,
    };
    const { data: created, error } = await db.from("coupons").insert(payload as any).select("id").single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error("This coupon code is already in use on the platform. Pick another one.");
      }
      throw new Error(error.message);
    }
    if (!created) throw new Error("Could not create coupon.");
    await auditLog(context.userId ?? null, "coupon_created", "coupon", created.id, {
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
    });
    return { id: created.id as string };
  });

export const updateCoupon = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => couponUpdateInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "coupons.manage");
    const db = await adminClient();

    const { data: existing } = await db
      .from("coupons")
      .select("id,code")
      .eq("id", data.id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!existing) throw new Error("Coupon not found.");

    if (data.code !== existing.code) {
      const { data: clash } = await db
        .from("coupons")
        .select("id")
        .eq("seller_id", seller.sellerId)
        .eq("code", data.code)
        .neq("id", data.id)
        .maybeSingle();
      if (clash) throw new Error("You already have a coupon with this code.");
    }

    const payload: Record<string, unknown> = {
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_order_amount: data.min_order_amount ?? null,
      max_discount_amount: data.max_discount_amount ?? null,
      usage_limit: data.usage_limit ?? null,
      per_customer_limit: data.per_customer_limit ?? null,
      starts_at: data.starts_at ?? null,
      ends_at: data.ends_at ?? null,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("coupons").update(payload as any).eq("id", data.id);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error("This coupon code is already in use on the platform. Pick another one.");
      }
      throw new Error(error.message);
    }
    await auditLog(context.userId ?? null, "coupon_updated", "coupon", data.id, { code: data.code });
    return { id: data.id };
  });

export const toggleCoupon = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ id, status: z.enum(["active", "inactive"]) }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "coupons.manage");
    const db = await adminClient();

    const { data: existing } = await db
      .from("coupons")
      .select("id")
      .eq("id", data.id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!existing) throw new Error("Coupon not found.");

    const { error } = await db
      .from("coupons")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `coupon_${data.status}`, "coupon", data.id, { status: data.status });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Promotions / discounts (permission: promotions.manage)
// ---------------------------------------------------------------------------

export type SellerPromotionRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  sale_price: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
  created_at: string;
  product: { id: string; name: Json; slug: string; base_price: number } | null;
  variant: { id: string; sku: string | null; price: number } | null;
};

const promotionInput = z
  .object({
    product_id: id,
    variant_id: id.nullable().optional(),
    sale_price: z.number().positive("Sale price must be greater than zero.").max(100_000_000),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    active: z.boolean().default(true),
  })
  .refine((d) => new Date(d.starts_at) < new Date(d.ends_at), {
    message: "End date must be after the start date.",
  });

export const listPromotions = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    const seller = await sellerSession(context, "promotions.manage");
    const db = await adminClient();
    const { data: rows, error } = await db
      .from("product_promotions")
      .select(
        "id,product_id,variant_id,sale_price,starts_at,ends_at,active,created_at," +
          "products!inner(id,name,slug,base_price),product_variants(id,sku,price)",
      )
      .eq("products.seller_id", seller.sellerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { promotions: (rows ?? []) as unknown as SellerPromotionRow[] };
  });

export const createPromotion = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => promotionInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "promotions.manage");
    const db = await adminClient();

    // The product must belong to the seller; its current price is fetched
    // server-side so the sale price can be validated against reality.
    const { data: product } = await db
      .from("products")
      .select("id,base_price")
      .eq("id", data.product_id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!product) throw new Error("Product not found.");

    let basePrice = Number(product.base_price);
    if (data.variant_id) {
      const { data: variant } = await db
        .from("product_variants")
        .select("id,price")
        .eq("id", data.variant_id)
        .eq("product_id", data.product_id)
        .maybeSingle();
      if (!variant) throw new Error("Variant does not belong to this product.");
      basePrice = Number(variant.price);
    }

    if (!(data.sale_price < basePrice)) {
      throw new Error(
        `Sale price must be below the current price (${couponDisplayValue("fixed", basePrice)}).`,
      );
    }

    const { data: created, error } = await db
      .from("product_promotions")
      .insert({
        product_id: data.product_id,
        variant_id: data.variant_id ?? null,
        sale_price: data.sale_price,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        active: data.active,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create promotion.");
    await auditLog(context.userId ?? null, "promotion_created", "promotion", created.id, {
      product_id: data.product_id,
      variant_id: data.variant_id ?? null,
      sale_price: data.sale_price,
    });
    return { id: created.id as string };
  });

async function ownPromotion(db: Awaited<ReturnType<typeof adminClient>>, sellerId: string, promotionId: string) {
  const { data } = await db
    .from("product_promotions")
    .select("id,products!inner(seller_id)")
    .eq("id", promotionId)
    .maybeSingle();
  const owner = (data?.products as unknown as { seller_id?: string } | null)?.seller_id;
  if (!data || owner !== sellerId) throw new Error("Promotion not found.");
  return data;
}

export const togglePromotion = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ id, active: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "promotions.manage");
    const db = await adminClient();
    await ownPromotion(db, seller.sellerId, data.id);
    const { error } = await db
      .from("product_promotions")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, data.active ? "promotion_activated" : "promotion_paused", "promotion", data.id, {});
    return { ok: true as const };
  });

export const deletePromotion = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ id }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "promotions.manage");
    const db = await adminClient();
    await ownPromotion(db, seller.sellerId, data.id);
    const { error } = await db.from("product_promotions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "promotion_deleted", "promotion", data.id, {});
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Shared seller catalog snapshot (feeds the promotion/bundle pickers)
// ---------------------------------------------------------------------------

export type MarketingCatalogVariant = {
  id: string;
  sku: string | null;
  price: number;
  available: number;
};

export type MarketingCatalogProduct = {
  id: string;
  name: Json;
  slug: string;
  base_price: number;
  variants: MarketingCatalogVariant[];
};

type VariantStock = { id: string; product_id: string; price: number; sku: string | null; available: number };

async function variantStocks(db: Awaited<ReturnType<typeof adminClient>>, productIds: string[]): Promise<VariantStock[]> {
  if (!productIds.length) return [];
  const { data, error } = await db
    .from("product_variants")
    .select("id,product_id,price,sku,inventory(quantity,reserved_quantity)")
    .in("product_id", productIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((v) => {
    const raw = v['inventory'] as unknown;
    const inv = (Array.isArray(raw) ? raw[0] : raw) as { quantity?: unknown; reserved_quantity?: unknown } | null;
    const available = Math.max(0, Number(inv?.quantity ?? 0) - Number(inv?.reserved_quantity ?? 0));
    return {
      id: v['id'] as string,
      product_id: v['product_id'] as string,
      price: Number(v['price']),
      sku: (v['sku'] as string | null) ?? null,
      available,
    };
  });
}

function displayName(name: unknown, fallback = "Untitled product"): string {
  if (name && typeof name === "object") {
    const n = name as Record<string, unknown>;
    for (const locale of ["en", "fr", "ar"]) {
      if (typeof n[locale] === "string" && (n[locale] as string).trim()) return n[locale] as string;
    }
    const first = Object.values(n).find((v) => typeof v === "string" && (v as string).trim());
    if (typeof first === "string") return first;
  }
  return fallback;
}

/** Seller's own products with variant prices and available stock, for the
 *  promotion and bundle pickers. No marketing permission required on its own —
 *  the calling page already enforces its permission. */
export const listMarketingCatalog = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<{ products: MarketingCatalogProduct[] }> => {
    const seller = await sellerSession(context);
    const db = await adminClient();
    const { data: products, error } = await db
      .from("products")
      .select("id,name,slug,base_price")
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const ids = (products ?? []).map((p) => p.id);
    const stocks = await variantStocks(db, ids);
    const byProduct = new Map<string, MarketingCatalogVariant[]>();
    for (const s of stocks) {
      const arr = byProduct.get(s.product_id) ?? [];
      arr.push({ id: s.id, sku: s.sku, price: s.price, available: s.available });
      byProduct.set(s.product_id, arr);
    }
    return {
      products: (products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        base_price: Number(p.base_price),
        variants: byProduct.get(p.id) ?? [],
      })),
    };
  });

// ---------------------------------------------------------------------------
// Bundles (permission: bundles.manage)
//
// A bundle is stored on a "container" product via
//   products.metadata = { ..., bundle: { items: [{ product_id, variant_id, qty }], updated_at } }
//
// Checkout integration is Phase 3: bundles are merchandised as a group, each
// item keeps its own price and stock. The bundle record is the merchandising +
// validation layer (every item is verified to belong to the seller and to have
// available stock at save time). No checkout pricing is implied anywhere.
// ---------------------------------------------------------------------------

export type BundleItem = { product_id: string; variant_id: string | null; qty: number };

export type ResolvedBundleItem = BundleItem & {
  name: string;
  unit_price: number;
  available: number;
};

export type SellerBundleRow = {
  id: string;
  name: Json;
  slug: string;
  base_price: number;
  items: ResolvedBundleItem[];
  /** Min over items of floor(available / qty): how many full bundles can ship. */
  bundle_available: number;
};

const bundleItemInput = z.object({
  product_id: id,
  variant_id: id.nullable().optional(),
  qty: z.number().int().min(1).max(100_000),
});

export const listBundles = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<{ bundles: SellerBundleRow[] }> => {
    const seller = await sellerSession(context, "bundles.manage");
    const db = await adminClient();

    const { data: products, error } = await db
      .from("products")
      .select("id,name,slug,base_price,metadata")
      .eq("seller_id", seller.sellerId)
      .not("metadata->>bundle", "is", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const itemProductIds = new Set<string>();
    const parsed: Array<{ product: Record<string, unknown>; items: BundleItem[] }> = [];
    for (const p of (products ?? []) as Array<Record<string, unknown>>) {
      const bundle = (p['metadata'] as Record<string, unknown> | null)?.['bundle'] as
        | { items?: unknown }
        | undefined;
      const items: BundleItem[] = Array.isArray(bundle?.items)
        ? (bundle.items as Array<Record<string, unknown>>)
            .filter((i) => typeof i?.['product_id'] === "string")
            .map((i) => ({
              product_id: i['product_id'] as string,
              variant_id: typeof i['variant_id'] === "string" ? (i['variant_id'] as string) : null,
              qty: Math.max(1, Math.floor(Number(i['qty']) || 1)),
            }))
        : [];
      items.forEach((i) => itemProductIds.add(i.product_id));
      parsed.push({ product: p, items });
    }

    const ids = [...itemProductIds];
    const [itemProductsRes, stocks] = await Promise.all([
      ids.length
        ? db.from("products").select("id,name,base_price").in("id", ids)
        : Promise.resolve({ data: [] as Array<{ id: string; name: Json; base_price: number }>, error: null }),
      variantStocks(db, ids),
    ]);
    if (itemProductsRes.error) throw new Error(itemProductsRes.error.message);
    const itemProductById = new Map((itemProductsRes.data ?? []).map((p) => [p.id, p]));
    const stocksByProduct = new Map<string, VariantStock[]>();
    for (const s of stocks) {
      const arr = stocksByProduct.get(s.product_id) ?? [];
      arr.push(s);
      stocksByProduct.set(s.product_id, arr);
    }

    const bundles: SellerBundleRow[] = parsed.map(({ product, items }) => {
      const resolved: ResolvedBundleItem[] = items.map((item) => {
        const ip = itemProductById.get(item.product_id);
        const variants = stocksByProduct.get(item.product_id) ?? [];
        const chosen = item.variant_id ? variants.filter((v) => v.id === item.variant_id) : variants;
        const available = chosen.reduce((sum, v) => sum + v.available, 0);
        const unitPrice = chosen.length ? chosen[0]!.price : Number(ip?.base_price ?? 0);
        return {
          ...item,
          name: ip ? displayName(ip.name) : "Removed product",
          unit_price: unitPrice,
          available,
        };
      });
      const bundle_available = resolved.length
        ? Math.min(...resolved.map((r) => Math.floor(r.available / Math.max(1, r.qty))))
        : 0;
      return {
        id: product['id'] as string,
        name: product['name'] as Json,
        slug: product['slug'] as string,
        base_price: Number(product['base_price']),
        items: resolved,
        bundle_available,
      };
    });

    return { bundles };
  });

export const saveBundle = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) =>
    z
      .object({
        product_id: id,
        items: z.array(bundleItemInput).min(1, "A bundle needs at least one item.").max(30),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "bundles.manage");
    const db = await adminClient();

    const { data: container } = await db
      .from("products")
      .select("id,metadata")
      .eq("id", data.product_id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!container) throw new Error("Bundle product not found.");

    if (data.items.some((i) => i.product_id === data.product_id)) {
      throw new Error("A bundle cannot contain itself.");
    }

    // Aggregate duplicate (product, variant) lines so stock is checked on totals.
    const aggregated = new Map<string, BundleItem>();
    for (const item of data.items) {
      const key = `${item.product_id}:${item.variant_id ?? ""}`;
      const prev = aggregated.get(key);
      aggregated.set(key, {
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        qty: Math.min(1_000_000, (prev?.qty ?? 0) + item.qty),
      });
    }
    const lines = [...aggregated.values()];
    const itemIds = [...new Set(lines.map((l) => l.product_id))];

    // Every item product must belong to the seller.
    const { data: itemProducts, error: itemError } = await db
      .from("products")
      .select("id,name")
      .eq("seller_id", seller.sellerId)
      .in("id", itemIds);
    if (itemError) throw new Error(itemError.message);
    if (!itemProducts || itemProducts.length !== itemIds.length) {
      throw new Error("One or more bundle items were not found in your catalog.");
    }
    const nameById = new Map(itemProducts.map((p) => [p.id, displayName(p.name)]));

    // Every item/variant must belong to the seller AND have available stock
    // (quantity - reserved_quantity) >= qty, checked server-side.
    const stocks = await variantStocks(db, itemIds);
    const stocksByProduct = new Map<string, VariantStock[]>();
    for (const s of stocks) {
      const arr = stocksByProduct.get(s.product_id) ?? [];
      arr.push(s);
      stocksByProduct.set(s.product_id, arr);
    }
    const availability = new Map<string, number>();
    for (const line of lines) {
      const variants = stocksByProduct.get(line.product_id) ?? [];
      if (line.variant_id && !variants.some((v) => v.id === line.variant_id)) {
        throw new Error(`A selected variant does not belong to "${nameById.get(line.product_id)}".`);
      }
      const chosen = line.variant_id ? variants.filter((v) => v.id === line.variant_id) : variants;
      const available = chosen.reduce((sum, v) => sum + v.available, 0);
      if (available < line.qty) {
        throw new Error(
          `Not enough stock for "${nameById.get(line.product_id)}" — need ${line.qty}, available ${available}.`,
        );
      }
      availability.set(`${line.product_id}:${line.variant_id ?? ""}`, available);
    }

    const meta =
      container.metadata && typeof container.metadata === "object"
        ? (container.metadata as Record<string, unknown>)
        : {};
    const bundlePayload = { items: lines, updated_at: new Date().toISOString() };
    const { error } = await db
      .from("products")
      .update({
        metadata: { ...meta, bundle: bundlePayload } as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.product_id);
    if (error) throw new Error(error.message);

    const bundle_available = Math.min(
      ...lines.map((l) => Math.floor((availability.get(`${l.product_id}:${l.variant_id ?? ""}`) ?? 0) / Math.max(1, l.qty))),
    );
    await auditLog(context.userId ?? null, "bundle_saved", "product", data.product_id, {
      item_count: lines.length,
    });
    return { id: data.product_id, bundle_available };
  });

export const deleteBundle = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ product_id: id }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "bundles.manage");
    const db = await adminClient();

    const { data: container } = await db
      .from("products")
      .select("id,metadata")
      .eq("id", data.product_id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!container) throw new Error("Bundle product not found.");

    const meta =
      container.metadata && typeof container.metadata === "object"
        ? (container.metadata as Record<string, unknown>)
        : null;
    if (meta && "bundle" in meta) {
      const { bundle: _removed, ...rest } = meta;
      const { error } = await db
        .from("products")
        .update({ metadata: rest as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", data.product_id);
      if (error) throw new Error(error.message);
      await auditLog(context.userId ?? null, "bundle_deleted", "product", data.product_id, {});
    }
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Shipping rules (permission: store.manage)
//
// Weight bands are free-form [min_weight_grams, max_weight_grams) in grams,
// e.g. 0–5000 g then 5001 g and up; max_weight_grams = null means no upper
// limit. Bands for the same (wilaya, commune, delivery method) may not
// overlap, enforced server-side.
// ---------------------------------------------------------------------------

export type SellerShippingRuleRow = Pick<
  Database["public"]["Tables"]["shipping_rules"]["Row"],
  | "id"
  | "seller_id"
  | "wilaya_id"
  | "commune_id"
  | "delivery_method"
  | "price"
  | "min_weight_grams"
  | "max_weight_grams"
  | "enabled"
  | "status"
> & {
  wilayas: { id: string; code: string; name: Json } | null;
  communes: { id: string; code: string; name: Json } | null;
};

const SHIPPING_RULE_COLUMNS =
  "id,seller_id,wilaya_id,commune_id,delivery_method,price,min_weight_grams,max_weight_grams,enabled,status,wilayas(id,code,name),communes(id,code,name)";

export const getShippingRules = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();
    const { data: rows, error } = await db
      .from("shipping_rules")
      .select(SHIPPING_RULE_COLUMNS)
      .eq("seller_id", seller.sellerId)
      .order("min_weight_grams", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { rules: (rows ?? []) as unknown as SellerShippingRuleRow[] };
  });

/** Active wilayas for the rule form. */
export const listShippingWilayas = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    await sellerSession(context, "store.manage");
    const db = await adminClient();
    const { data: rows, error } = await db
      .from("wilayas")
      .select("id,code,name")
      .eq("active", true)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return { wilayas: (rows ?? []) as Array<{ id: string; code: string; name: Json }> };
  });

/** Active communes of one wilaya for the rule form. */
export const listShippingCommunes = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ wilayaId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await sellerSession(context, "store.manage");
    const db = await adminClient();
    const { data: rows, error } = await db
      .from("communes")
      .select("id,code,name")
      .eq("wilaya_id", data.wilayaId)
      .eq("active", true)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return { communes: (rows ?? []) as Array<{ id: string; code: string; name: Json }> };
  });

const shippingRuleInput = z
  .object({
    id: id.optional(),
    wilaya_id: id,
    commune_id: id.nullable().optional(),
    delivery_method: z.enum(["home", "office"]),
    price: z.number().min(0, "Price cannot be negative.").max(10_000_000),
    min_weight_grams: z.number().int().min(0).max(10_000_000).default(0),
    max_weight_grams: z.number().int().positive().max(10_000_000).nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .refine((d) => d.max_weight_grams == null || d.max_weight_grams > d.min_weight_grams, {
    message: "Max weight must be greater than min weight (or left empty for no upper limit).",
  });

function bandLabel(min: number, max: number | null): string {
  return max == null ? `${min.toLocaleString()} g and up` : `${min.toLocaleString()}–${max.toLocaleString()} g`;
}

export const upsertShippingRule = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => shippingRuleInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();

    const { data: wilaya } = await db
      .from("wilayas")
      .select("id")
      .eq("id", data.wilaya_id)
      .eq("active", true)
      .maybeSingle();
    if (!wilaya) throw new Error("Wilaya not found.");

    if (data.commune_id) {
      const { data: commune } = await db
        .from("communes")
        .select("id,wilaya_id")
        .eq("id", data.commune_id)
        .eq("active", true)
        .maybeSingle();
      if (!commune) throw new Error("Commune not found.");
      if (commune.wilaya_id !== data.wilaya_id) {
        throw new Error("Commune does not belong to the selected wilaya.");
      }
    }

    // Upsert key is (seller_id, wilaya_id, commune_id, delivery_method). There
    // is no unique constraint for it, so the upsert is delete-free:
    // - explicit id → ownership-checked update,
    // - otherwise → update the existing same-scope rule, else insert.
    let ruleId: string | null = null;
    if (data.id) {
      const { data: existing } = await db
        .from("shipping_rules")
        .select("id")
        .eq("id", data.id)
        .eq("seller_id", seller.sellerId)
        .maybeSingle();
      if (!existing) throw new Error("Shipping rule not found.");
      ruleId = existing.id;
    } else {
      let scopeQuery = db
        .from("shipping_rules")
        .select("id")
        .eq("seller_id", seller.sellerId)
        .eq("wilaya_id", data.wilaya_id)
        .eq("delivery_method", data.delivery_method);
      scopeQuery = data.commune_id ? scopeQuery.eq("commune_id", data.commune_id) : scopeQuery.is("commune_id", null);
      const { data: existing } = await scopeQuery.maybeSingle();
      if (existing) ruleId = existing.id;
    }

    // Bands for the same destination + method must not overlap.
    {
      let overlapQuery = db
        .from("shipping_rules")
        .select("id,min_weight_grams,max_weight_grams")
        .eq("seller_id", seller.sellerId)
        .eq("wilaya_id", data.wilaya_id)
        .eq("delivery_method", data.delivery_method);
      overlapQuery = data.commune_id
        ? overlapQuery.eq("commune_id", data.commune_id)
        : overlapQuery.is("commune_id", null);
      if (ruleId) overlapQuery = overlapQuery.neq("id", ruleId);
      const { data: others, error } = await overlapQuery;
      if (error) throw new Error(error.message);
      const lo = data.min_weight_grams;
      const hi = data.max_weight_grams ?? Number.POSITIVE_INFINITY;
      for (const o of others ?? []) {
        const oLo = Number(o.min_weight_grams);
        const oHi = o.max_weight_grams == null ? Number.POSITIVE_INFINITY : Number(o.max_weight_grams);
        if (lo < oHi && oLo < hi) {
          throw new Error("This weight band overlaps another rule for the same destination and delivery method.");
        }
      }
    }

    const payload = {
      seller_id: seller.sellerId,
      wilaya_id: data.wilaya_id,
      commune_id: data.commune_id ?? null,
      delivery_method: data.delivery_method,
      price: data.price,
      min_weight_grams: data.min_weight_grams,
      max_weight_grams: data.max_weight_grams ?? null,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    };

    if (ruleId) {
      const { error } = await db.from("shipping_rules").update(payload).eq("id", ruleId);
      if (error) throw new Error(error.message);
      await auditLog(context.userId ?? null, "shipping_rule_updated", "shipping_rule", ruleId, {
        wilaya_id: data.wilaya_id,
        delivery_method: data.delivery_method,
        price: data.price,
        band: bandLabel(data.min_weight_grams, data.max_weight_grams ?? null),
      });
      return { id: ruleId, created: false as const };
    }
    const { data: created, error } = await db
      .from("shipping_rules")
      .insert({ ...payload, status: "active" })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not save shipping rule.");
    await auditLog(context.userId ?? null, "shipping_rule_created", "shipping_rule", created.id, {
      wilaya_id: data.wilaya_id,
      delivery_method: data.delivery_method,
      price: data.price,
      band: bandLabel(data.min_weight_grams, data.max_weight_grams ?? null),
    });
    return { id: created.id as string, created: true as const };
  });

export const toggleShippingRule = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ id, enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();

    const { data: existing } = await db
      .from("shipping_rules")
      .select("id")
      .eq("id", data.id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!existing) throw new Error("Shipping rule not found.");

    const { error } = await db
      .from("shipping_rules")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(
      context.userId ?? null,
      data.enabled ? "shipping_rule_enabled" : "shipping_rule_disabled",
      "shipping_rule",
      data.id,
      {},
    );
    return { ok: true as const };
  });

export const deleteShippingRule = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ id }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerSession(context, "store.manage");
    const db = await adminClient();

    const { data: existing } = await db
      .from("shipping_rules")
      .select("id,wilaya_id,delivery_method")
      .eq("id", data.id)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (!existing) throw new Error("Shipping rule not found.");

    const { error } = await db.from("shipping_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "shipping_rule_deleted", "shipping_rule", data.id, {
      wilaya_id: existing.wilaya_id ?? null,
      delivery_method: existing.delivery_method,
    });
    return { ok: true as const };
  });
