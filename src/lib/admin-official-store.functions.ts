import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { assertAdminPermission } from "@/lib/admin-permissions";
import {
  normalizeStoreSettings,
  STORE_ACCENT_IDS,
  STORE_SECTION_KINDS,
  storeCollectionSchema,
  type StoreSettings,
  type StoreCollectionConfig,
} from "@/lib/store-settings";

/**
 * Official store administration (phase 4/8).
 *
 * Product operations intentionally reuse the shared product engine from
 * `@/lib/admin-catalog.functions` (listAdminProducts, moderateAdminProduct,
 * setProductStatus, updateAdminProduct, createAdminProduct, bulk helpers,
 * coupons and reviews moderation). This file only adds the official-store
 * scoped helpers that the shared engine does not provide: stats, inventory
 * (admin-side mirror of the seller inventory flow), storefront appearance
 * (accent / announcement / sections / featured ids — sanitized text only,
 * never HTML/JS), and curated collections stored in `stores.settings`
 * so no schema change is needed.
 *
 * Every function is admin-only and writes important mutations to
 * public.audit_logs.
 */

const adminOnly = [requireSupabaseAuth] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AdminSb = Awaited<ReturnType<typeof adminClient>>;

async function auditLog(
  actorId: string | null,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const sb = await adminClient();
    await sb.from("audit_logs").insert({
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

const PAGE_SIZE = 25;
const pageInput = z.object({ page: z.number().int().min(1).default(1) });
const uuid = z.string().uuid();

/** Plain text only: strip HTML tags and collapse whitespace. */
function cleanText(value: string): string {
  return (
    value
      .replace(/<[^>]*>/g, "")
      // eslint-disable-next-line no-control-regex -- intentional: strip control chars for sanitization
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const trilingualText = z.object({
  ar: z.string().max(120).transform(cleanText).default(""),
  fr: z.string().max(120).transform(cleanText).default(""),
  en: z.string().max(120).transform(cleanText).default(""),
});

/** The store row flagged as official, plus its seller. Throws when none exists. */
async function officialStoreRef(sb: AdminSb) {
  const { data: store, error } = await sb
    .from("stores")
    .select("id, seller_id, slug, name")
    .contains("settings", { official: true })
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!store || !store.seller_id) throw new Error("No official store designated.");
  return store as { id: string; seller_id: string; slug: string | null; name: string | null };
}

// ---------------------------------------------------------------------------
// Lightweight product list for admin pickers (featured / collections)
// ---------------------------------------------------------------------------

export const listOfficialStoreProductsLite = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);
    const { data: rows, error } = await sb
      .from("products")
      .select("id, slug, name, status, moderation_status")
      .eq("seller_id", ref.seller_id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return { products: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export type OfficialStoreStats = {
  products: { total: number; published: number; draft: number; archived: number };
  variants: { total: number };
  inventory: { ok: number; low: number; out: number };
  orders: { total: number };
  reviews: { total: number; pending: number; avgRating: number | null };
  coupons: { active: number };
};

export const getOfficialStoreStats = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }): Promise<{ stats: OfficialStoreStats }> => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);

    const [
      { data: products, error: prodErr },
      { data: variants, error: varErr },
      { data: inventory, error: invErr },
      { count: orderCount, error: orderErr },
      { data: reviews, error: revErr },
      { count: couponCount, error: couponErr },
    ] = await Promise.all([
      sb.from("products").select("id,status").eq("seller_id", ref.seller_id).limit(5000),
      sb
        .from("product_variants")
        .select("id, products!inner(seller_id)")
        .eq("products.seller_id", ref.seller_id)
        .neq("status", "archived")
        .limit(5000),
      sb
        .from("inventory")
        .select(
          "quantity, reserved_quantity, low_stock_threshold, product_variants!inner(products!inner(seller_id))",
        )
        .eq("product_variants.products.seller_id", ref.seller_id)
        .limit(5000),
      sb
        .from("seller_orders")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", ref.seller_id),
      sb
        .from("reviews")
        .select("rating, moderation_status, products!inner(seller_id)")
        .eq("products.seller_id", ref.seller_id)
        .limit(5000),
      sb
        .from("coupons")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", ref.seller_id)
        .eq("status", "active"),
    ]);
    for (const e of [prodErr, varErr, invErr, orderErr, revErr, couponErr]) {
      if (e) throw new Error(e.message);
    }

    const productRows = products ?? [];
    const invRows = (inventory ?? []) as {
      quantity: number;
      reserved_quantity: number;
      low_stock_threshold: number | null;
    }[];
    const invStatus = { ok: 0, low: 0, out: 0 };
    for (const row of invRows) {
      const available = (row.quantity ?? 0) - (row.reserved_quantity ?? 0);
      const threshold = row.low_stock_threshold ?? 0;
      if (available <= 0) invStatus.out += 1;
      else if (threshold > 0 && available <= threshold) invStatus.low += 1;
      else invStatus.ok += 1;
    }
    const approvedReviews = (reviews ?? []).filter((r) => r.moderation_status === "approved");

    return {
      stats: {
        products: {
          total: productRows.length,
          published: productRows.filter((p) => p.status === "active").length,
          draft: productRows.filter((p) => p.status === "draft").length,
          archived: productRows.filter((p) => p.status === "archived").length,
        },
        variants: { total: (variants ?? []).length },
        inventory: invStatus,
        orders: { total: orderCount ?? 0 },
        reviews: {
          total: (reviews ?? []).length,
          pending: (reviews ?? []).filter((r) => r.moderation_status === "pending").length,
          avgRating:
            approvedReviews.length === 0
              ? null
              : Math.round(
                  (approvedReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) /
                    approvedReviews.length) *
                    10,
                ) / 10,
        },
        coupons: { active: couponCount ?? 0 },
      },
    };
  });

// ---------------------------------------------------------------------------
// Inventory (admin-side mirror of the seller inventory flow)
// ---------------------------------------------------------------------------

export type OfficialInventoryRow = {
  variantId: string;
  sku: string | null;
  price: number | null;
  productId: string;
  productName: string;
  productSlug: string | null;
  quantity: number;
  reserved: number;
  available: number;
  threshold: number;
  status: "ok" | "low" | "out";
};

export const listOfficialStoreInventory = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        status: z.enum(["all", "ok", "low", "out"]).default("all"),
        page: z.number().int().min(1).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);

    const { data: rows, error } = await sb
      .from("product_variants")
      .select(
        "id, sku, price, inventory(quantity, reserved_quantity, low_stock_threshold), products!inner(id, name, slug, seller_id)",
        { count: "exact" },
      )
      .eq("products.seller_id", ref.seller_id)
      .neq("status", "archived")
      .order("sku");
    if (error) throw new Error(error.message);

    const pickName = (name: unknown): string => {
      if (name && typeof name === "object" && !Array.isArray(name)) {
        const n = name as Record<string, unknown>;
        return (
          (typeof n["fr"] === "string" && n["fr"]) ||
          (typeof n["en"] === "string" && n["en"]) ||
          (typeof n["ar"] === "string" && n["ar"]) ||
          ""
        );
      }
      return typeof name === "string" ? name : "";
    };

    const all: OfficialInventoryRow[] = (rows ?? []).map((v) => {
      const inv = (v as { inventory?: unknown }).inventory;
      const invRow = (Array.isArray(inv) ? inv[0] : inv) as {
        quantity?: number | null;
        reserved_quantity?: number | null;
        low_stock_threshold?: number | null;
      } | null;
      const product = (v as { products?: unknown }).products;
      const prodRow = (Array.isArray(product) ? product[0] : product) as {
        id?: string;
        name?: unknown;
        slug?: string | null;
      } | null;
      const quantity = invRow?.quantity ?? 0;
      const reserved = invRow?.reserved_quantity ?? 0;
      const available = quantity - reserved;
      const threshold = invRow?.low_stock_threshold ?? 0;
      return {
        variantId: v.id as string,
        sku: (v.sku as string | null) ?? null,
        price: v.price != null ? Number(v.price) : null,
        productId: prodRow?.id ?? "",
        productName: pickName(prodRow?.name) || (v.sku as string) || "—",
        productSlug: prodRow?.slug ?? null,
        quantity,
        reserved,
        available,
        threshold,
        status: (available <= 0
          ? "out"
          : threshold > 0 && available <= threshold
            ? "low"
            : "ok") as "ok" | "low" | "out",
      };
    });

    const filtered = data.status === "all" ? all : all.filter((r) => r.status === data.status);
    const from = (data.page - 1) * PAGE_SIZE;
    return {
      rows: filtered.slice(from, from + PAGE_SIZE),
      total: filtered.length,
      page: data.page,
      pageSize: PAGE_SIZE,
      counts: {
        total: all.length,
        ok: all.filter((r) => r.status === "ok").length,
        low: all.filter((r) => r.status === "low").length,
        out: all.filter((r) => r.status === "out").length,
      },
    };
  });

export const adjustOfficialStoreInventory = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        variantId: uuid,
        quantity: z.number().int().min(0).max(1_000_000).optional(),
        lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
      })
      .refine((v) => v.quantity !== undefined || v.lowStockThreshold !== undefined, {
        message: "Nothing to update.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);

    // Ownership: variant → product → official store's seller.
    const { data: variant, error: varErr } = await sb
      .from("product_variants")
      .select("id, sku, products!inner(id, seller_id)")
      .eq("id", data.variantId)
      .maybeSingle();
    if (varErr) throw new Error("Variant lookup failed.");
    const product = (variant as { products?: unknown } | null)?.products;
    const prodRow = (Array.isArray(product) ? product[0] : product) as {
      seller_id?: string;
    } | null;
    if (!variant || !prodRow || prodRow.seller_id !== ref.seller_id) {
      throw new Error("Variant not found or does not belong to the official store.");
    }

    const { data: before, error: selErr } = await sb
      .from("inventory")
      .select("quantity, reserved_quantity, low_stock_threshold")
      .eq("variant_id", data.variantId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!before) throw new Error("Inventory row missing for this variant.");

    const patch: { quantity?: number; low_stock_threshold?: number } = {};
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.lowStockThreshold !== undefined) patch.low_stock_threshold = data.lowStockThreshold;
    const { error: upErr } = await sb
      .from("inventory")
      .update(patch)
      .eq("variant_id", data.variantId);
    if (upErr) throw new Error(upErr.message);

    await auditLog(
      context.userId ?? null,
      "official_store.inventory_adjusted",
      "inventory",
      data.variantId,
      {
        seller_id: ref.seller_id,
        before: { quantity: before.quantity, low_stock_threshold: before.low_stock_threshold },
        after: {
          quantity: data.quantity ?? before.quantity,
          low_stock_threshold: data.lowStockThreshold ?? before.low_stock_threshold,
        },
      },
    );
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Reviews scoped to the official store
// ---------------------------------------------------------------------------

export type OfficialReviewQueue = "pending" | "approved" | "rejected" | "hidden" | "flagged";

export const listOfficialStoreReviews = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        queue: z.enum(["pending", "approved", "rejected", "hidden", "flagged"]),
        page: z.number().int().min(1).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);
    const from = (data.page - 1) * PAGE_SIZE;

    let query = sb
      .from("reviews")
      .select(
        "id, product_id, rating, body, moderation_status, flagged_at, verified_purchase, moderation_reason, first_name, last_name, created_at, products!inner(id, slug, name, seller_id)",
        { count: "exact" },
      )
      .eq("products.seller_id", ref.seller_id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (data.queue === "flagged") {
      query = query.not("flagged_at", "is", null);
    } else {
      query = query.eq("moderation_status", data.queue);
    }
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { reviews: rows ?? [], total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

// ---------------------------------------------------------------------------
// Offers (coupons) scoped to the official store
// ---------------------------------------------------------------------------

export const listOfficialStoreCoupons = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => pageInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);
    const from = (data.page - 1) * PAGE_SIZE;
    const {
      data: rows,
      error,
      count,
    } = await sb
      .from("coupons")
      .select(
        "id, code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, ends_at, seller_id, status, created_at, updated_at",
        { count: "exact" },
      )
      .eq("seller_id", ref.seller_id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { coupons: rows ?? [], total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

// ---------------------------------------------------------------------------
// Categories used by the official store (categories themselves are global)
// ---------------------------------------------------------------------------

export const listOfficialStoreCategories = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);
    const [{ data: categories, error: catErr }, { data: products, error: prodErr }] =
      await Promise.all([
        sb
          .from("categories")
          .select("id, parent_id, slug, name, status, sort_order")
          .order("sort_order"),
        sb
          .from("products")
          .select("id, category_id, status")
          .eq("seller_id", ref.seller_id)
          .not("category_id", "is", null)
          .limit(5000),
      ]);
    if (catErr) throw new Error(catErr.message);
    if (prodErr) throw new Error(prodErr.message);
    const counts = new Map<string, { total: number; published: number }>();
    for (const p of products ?? []) {
      const key = p.category_id as string;
      const cur = counts.get(key) ?? { total: 0, published: 0 };
      cur.total += 1;
      if (p.status === "active") cur.published += 1;
      counts.set(key, cur);
    }
    return {
      categories: (categories ?? []).map((c) => ({
        ...c,
        official_products: counts.get(c.id as string)?.total ?? 0,
        official_published: counts.get(c.id as string)?.published ?? 0,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Appearance: settings + curated collections (both live in stores.settings)
// ---------------------------------------------------------------------------

/** Admin-curated collections live in stores.settings.official_collections (shared schema). */
export type OfficialCollection = StoreCollectionConfig;

function parseCollections(raw: unknown): OfficialCollection[] {
  const parsed = z.array(storeCollectionSchema).safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data;
}

export type OfficialStoreAppearance = {
  store: { id: string; seller_id: string; slug: string | null; name: string | null };
  settings: StoreSettings;
  collections: OfficialCollection[];
};

export const getOfficialStoreAppearance = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }): Promise<{ appearance: OfficialStoreAppearance }> => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);
    const { data: store, error } = await sb
      .from("stores")
      .select("id, seller_id, slug, name, settings")
      .eq("id", ref.id)
      .single();
    if (error || !store) throw new Error(error?.message ?? "Store not found.");
    const settings = normalizeStoreSettings(store.settings);
    return {
      appearance: {
        store: { id: store.id, seller_id: store.seller_id, slug: store.slug, name: store.name },
        settings,
        collections: settings.official_collections,
      },
    };
  });

/** Merge updates into the raw settings jsonb so untouched keys (official, collections) survive. */
async function writeStoreSettings(
  sb: AdminSb,
  storeId: string,
  patch: Record<string, unknown>,
  auditAction: string,
  auditMetadata: Record<string, Json>,
  actorId: string | null,
) {
  const { data: store, error: readError } = await sb
    .from("stores")
    .select("settings")
    .eq("id", storeId)
    .single();
  if (readError || !store) throw new Error("Store not found.");
  const next = { ...((store.settings as Record<string, unknown> | null) ?? {}), ...patch };
  const { error } = await sb
    .from("stores")
    .update({ settings: next as unknown as Json })
    .eq("id", storeId);
  if (error) throw new Error(error.message);
  await auditLog(actorId, auditAction, "stores", storeId, auditMetadata);
}

export const updateOfficialStoreAppearance = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        accent: z.enum(STORE_ACCENT_IDS),
        announcement: trilingualText,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);
    await writeStoreSettings(
      sb,
      ref.id,
      { accent: data.accent, announcement: data.announcement },
      "official_store.appearance.update",
      { accent: data.accent },
      context.userId ?? null,
    );
    return { ok: true as const };
  });

const sectionInputSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(STORE_SECTION_KINDS),
  title: trilingualText,
  enabled: z.boolean(),
});

export const updateOfficialStoreSections = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        sections: z.array(sectionInputSchema).max(12),
        featuredProductIds: z.array(uuid).max(50).default([]),
        featuredCategoryIds: z.array(uuid).max(24).default([]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);

    // Featured products must belong to the official store's seller; categories must exist.
    const [ownedProducts, existingCategories] = await Promise.all([
      data.featuredProductIds.length
        ? sb
            .from("products")
            .select("id")
            .eq("seller_id", ref.seller_id)
            .in("id", data.featuredProductIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
      data.featuredCategoryIds.length
        ? sb.from("categories").select("id").in("id", data.featuredCategoryIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    const ownedProductIds = new Set(
      ((ownedProducts.data ?? []) as { id: string }[]).map((row) => row.id),
    );
    const existingCategoryIds = new Set(
      ((existingCategories.data ?? []) as { id: string }[]).map((row) => row.id),
    );

    await writeStoreSettings(
      sb,
      ref.id,
      {
        sections: data.sections,
        featured_product_ids: data.featuredProductIds.filter((id) => ownedProductIds.has(id)),
        featured_category_ids: data.featuredCategoryIds.filter((id) => existingCategoryIds.has(id)),
      },
      "official_store.sections.update",
      {
        sections: data.sections.map((s) => s.kind) as unknown as Json,
        featured_products: data.featuredProductIds.filter((id) => ownedProductIds.has(id)).length,
        featured_categories: data.featuredCategoryIds.filter((id) => existingCategoryIds.has(id))
          .length,
      },
      context.userId ?? null,
    );
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Curated collections (stored in stores.settings.official_collections)
// ---------------------------------------------------------------------------

const collectionInput = z.object({
  id: z.string().max(64).optional(),
  title: trilingualText,
  subtitle: trilingualText,
  productIds: z.array(uuid).max(60),
  enabled: z.boolean().default(true),
});

export const upsertOfficialCollection = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => collectionInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);

    // Products must belong to the official store's seller.
    let ownedIds: string[] = [];
    if (data.productIds.length) {
      const { data: owned, error } = await sb
        .from("products")
        .select("id")
        .eq("seller_id", ref.seller_id)
        .in("id", data.productIds);
      if (error) throw new Error(error.message);
      ownedIds = (owned ?? []).map((r) => r.id as string);
    }

    const { data: store, error: readError } = await sb
      .from("stores")
      .select("settings")
      .eq("id", ref.id)
      .single();
    if (readError || !store) throw new Error("Store not found.");
    const raw = (store.settings as Record<string, unknown> | null) ?? {};
    const collections = parseCollections(raw["official_collections"]);

    const id = data.id ?? `col-${Date.now().toString(36)}`;
    const next: OfficialCollection = {
      id,
      title: data.title,
      subtitle: data.subtitle,
      product_ids: data.productIds.filter((pid) => ownedIds.includes(pid)),
      enabled: data.enabled,
    };
    const idx = collections.findIndex((c) => c.id === id);
    if (idx >= 0) collections[idx] = next;
    else collections.push(next);

    await writeStoreSettings(
      sb,
      ref.id,
      { official_collections: collections },
      "official_store.collection.upsert",
      { collection_id: id, title_fr: data.title.fr },
      context.userId ?? null,
    );
    return { ok: true as const, id };
  });

export const deleteOfficialCollection = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ id: z.string().max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "content.manage");
    const sb = await adminClient();
    const ref = await officialStoreRef(sb);
    const { data: store, error: readError } = await sb
      .from("stores")
      .select("settings")
      .eq("id", ref.id)
      .single();
    if (readError || !store) throw new Error("Store not found.");
    const raw = (store.settings as Record<string, unknown> | null) ?? {};
    const collections = parseCollections(raw["official_collections"]).filter(
      (c) => c.id !== data.id,
    );
    await writeStoreSettings(
      sb,
      ref.id,
      { official_collections: collections },
      "official_store.collection.delete",
      { collection_id: data.id },
      context.userId ?? null,
    );
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Official store overview (consolidated — single source of truth)     */
/* ------------------------------------------------------------------ */

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];

export type OfficialStoreOverview = {
  store: StoreRow;
  seller_legal_name: string | null;
  product_count: number;
  published_count: number;
  recent_products: { id: string; slug: string; name: Json; base_price: number; status: string }[];
} | null;

/**
 * Admin-only lookup of the store flagged as the platform's official store
 * (`stores.settings.official === true`). Returns `{ official: null }` when no
 * store is flagged yet — the UI must say so honestly instead of guessing.
 * This is the single canonical implementation (previously duplicated in
 * admin-ops.functions.ts and admin-search.functions.ts with different shapes).
 */
export const getOfficialStore = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({}).parse(data))
  .handler(async ({ context }): Promise<{ official: OfficialStoreOverview }> => {
    await assertAdminPermission(context, "content.manage");
    const supabaseAdmin = await adminClient();
    const { data: store, error } = await supabaseAdmin
      .from("stores")
      .select("*, sellers(legal_name)")
      .contains("settings", { official: true })
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!store) return { official: null };

    const sellerId = (store as StoreRow).seller_id;
    const [{ data: products }, { data: sellerProducts }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id,slug,name,base_price,status,publication_status")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin.from("products").select("id,status").eq("seller_id", sellerId).limit(2000),
    ]);

    const published = (sellerProducts ?? []).filter((p) => p.status === "active").length;

    return {
      official: {
        store: store as StoreRow,
        seller_legal_name:
          (store as { sellers?: { legal_name?: string | null } | null }).sellers?.legal_name ??
          null,
        product_count: (sellerProducts ?? []).length,
        published_count: published,
        recent_products: (products ?? []).map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          base_price: Number(p.base_price) || 0,
          status: p.status,
        })),
      },
    };
  });
