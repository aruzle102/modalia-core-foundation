/**
 * Analytics server functions: event ingest + real-metric aggregations.
 *
 * Sacred rule: every number returned here is computed from genuine rows in
 * public.analytics_events (or real order rows). No synthetic, sampled or
 * placeholder data anywhere. When there are no rows, callers receive
 * `hasData: false` and must render honest empty states.
 *
 * Security contract:
 *  1. Ingest (`trackAnalyticsEvents`) is public (visitors are anonymous) but
 *     strictly validated (zod), rate-limited, metadata-sanitized, and honors
 *     the `analytics_enabled` site setting. It writes ONLY through the
 *     SECURITY DEFINER `track_analytics_event()` RPC -- there is no direct
 *     client insert path (RLS denies it).
 *  2. `getAdminAnalytics` runs behind `requireSupabaseAuth` + `is_super_admin()`
 *     and reads through `admin_analytics_events()`, which re-checks
 *     super-admin inside the database.
 *  3. `getSellerAnalytics` runs behind `requireSupabaseAuth` +
 *     `requireSeller(..., "analytics.view")` (session-only resolution, never
 *     from client input) and reads through `seller_analytics_events()`, which
 *     re-resolves the seller from auth.uid() and returns only that store's
 *     events. Strict per-store isolation.
 *  4. Public recommendation functions expose aggregates only (counts), never
 *     raw events or visitor identifiers.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import { assertAdmin } from "@/lib/admin-auth";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { pickLocalizedName } from "@/lib/names";

export type AnalyticsEventType =
  | "page_view"
  | "product_view"
  | "search"
  | "category_view"
  | "add_to_cart"
  | "wishlist_add"
  | "checkout_started"
  | "checkout_completed"
  | "purchase"
  | "store_view";

export interface AnalyticsEventRow {
  id: string;
  anon_id: string;
  event_type: AnalyticsEventType;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type TableDiagnostic = { table: string; ok: boolean; message?: string | undefined };

const EVENT_TYPES = [
  "page_view",
  "product_view",
  "search",
  "category_view",
  "add_to_cart",
  "wishlist_add",
  "checkout_started",
  "checkout_completed",
  "purchase",
  "store_view",
] as const;

/* --------------------------------- helpers -------------------------------- */

type RpcResult = { data: any; error: { message?: string } | null };

/** Call a Postgres RPC that is not (yet) in the generated Supabase types. */
async function callRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const rpc = client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResult>;
  return rpc(name, args);
}

/** Publishable-key client; forwards the caller's JWT when present so auth.uid() works in RPCs. */
function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Analytics is temporarily unavailable.");
  let authHeader: string | null = null;
  try {
    authHeader = getRequest()?.headers.get("authorization") ?? null;
  } catch {
    authHeader = null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      ...(authHeader && authHeader.startsWith("Bearer ") ? { headers: { Authorization: authHeader } } : {}),
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};


function localizedText(value: unknown, locale: string, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const localized = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof localized === "string" && localized ? localized : fallback;
}

function publicImageUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return null;
}

/** One bounded query with a recorded diagnostic entry; failures degrade to []. */
async function fetchTable<T>(table: string, diagnostics: TableDiagnostic[], query: any): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) {
      diagnostics.push({ table, ok: false, message: (error as { message?: string } | null)?.message ?? "Query failed" });
      return [];
    }
    diagnostics.push({ table, ok: true });
    return (data ?? []) as T[];
  } catch (err) {
    diagnostics.push({ table, ok: false, message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/* ------------------------------ ingest (public) ---------------------------- */

const eventInput = z.object({
  anonId: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "invalid anon id"),
  eventType: z.enum(EVENT_TYPES),
  entityType: z.enum(["product", "category", "store", "order"]).optional(),
  entityId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ingestInput = z.object({ events: z.array(eventInput).min(1).max(25) });

/** Best-effort per-instance rate limiter: 120 events/minute per anon id. */
const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(anonId: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(anonId);
  if (!entry || entry.resetAt <= now) {
    RATE_LIMIT.set(anonId, { count: 1, resetAt: now + 60_000 });
    if (RATE_LIMIT.size > 5000) {
      for (const [k, v] of RATE_LIMIT) if (v.resetAt <= now) RATE_LIMIT.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= 120;
}

/** Cached `analytics_enabled` site setting (60s TTL). Defaults to enabled. */
let settingsCache: { enabled: boolean; at: number } | null = null;
async function analyticsEnabled(client: SupabaseClient): Promise<boolean> {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < 60_000) return settingsCache.enabled;
  try {
    const { data } = await client.from("site_settings").select("value").eq("key", "analytics_enabled").maybeSingle();
    // site_settings.value is jsonb: true/false, "true"/"false", or 1/0.
    const v = (data as { value: unknown } | null)?.value;
    const enabled = v === null || v === undefined ? true : v !== false && v !== "false" && v !== 0;
    settingsCache = { enabled, at: now };
    return enabled;
  } catch {
    return true;
  }
}

/** Strip anything that is not a short scalar; drops objects/arrays/nulls. */
function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= 20) break;
    if (!k || k.length > 40) continue;
    if (typeof v === "string") out[k] = v.slice(0, 300);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export const trackAnalyticsEvents = createServerFn({ method: "POST" })
  .inputValidator((data) => ingestInput.parse(data))
  .handler(async ({ data }) => {
    const client = publicClient();
    if (!(await analyticsEnabled(client))) return { ok: true, inserted: 0, skipped: true };
    let inserted = 0;
    for (const event of data.events) {
      if (!checkRateLimit(event.anonId)) continue;
      const { error } = await callRpc(client, "track_analytics_event", {
        p_anon_id: event.anonId,
        p_event_type: event.eventType,
        p_entity_type: event.entityType ?? null,
        p_entity_id: event.entityId ?? null,
        p_metadata: sanitizeMetadata(event.metadata),
      });
      if (!error) inserted += 1;
    }
    return { ok: true, inserted };
  });

/* ------------------------------- admin (all) ------------------------------- */

const daysInput = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

export interface FunnelStage {
  stage: AnalyticsEventType;
  label: string;
  count: number;
}

export interface AdminAnalytics {
  days: number;
  hasData: boolean;
  totals: {
    events: number;
    uniqueVisitors: number;
    productViews: number;
    searches: number;
    addToCarts: number;
    checkoutsStarted: number;
    purchases: number;
  };
  funnel: FunnelStage[];
  trendingProducts: { productId: string; name: string; slug: string; views: number }[];
  popularSearches: { query: string; count: number }[];
  velocity: { date: string; purchases: number }[];
  categories: { categoryId: string; name: string; views: number }[];
  sellers: { sellerId: string; name: string; views: number; carts: number }[];
  diagnostics: TableDiagnostic[];
}

const adminOnly = [requireSupabaseAuth] as const;

function countBy(events: AnalyticsEventRow[], type: AnalyticsEventType): number {
  let n = 0;
  for (const e of events) if (e.event_type === type) n += 1;
  return n;
}

/** Unique visitors reaching a funnel stage (dedupes repeat events / multi-product checkouts). */
function uniqueCountBy(events: AnalyticsEventRow[], type: AnalyticsEventType): number {
  const seen = new Set<string>();
  for (const e of events) if (e.event_type === type) seen.add(e.anon_id);
  return seen.size;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => daysInput.parse(data))
  .handler(async ({ data, context }): Promise<AdminAnalytics> => {
    await assertAdmin(context);
    const diagnostics: TableDiagnostic[] = [];
    const { data: rows, error } = await callRpc(context.supabase as SupabaseClient, "admin_analytics_events", {
      p_days: data.days,
    });
    const events = (error ? [] : ((rows ?? []) as AnalyticsEventRow[]));
    diagnostics.push({
      table: "analytics_events",
      ok: !error,
      message: error ? error.message ?? "Query failed" : undefined,
    });

    const hasData = events.length > 0;
    const visitors = new Set<string>();
    for (const e of events) visitors.add(e.anon_id);

    const productViews = countBy(events, "product_view");
    const searches = countBy(events, "search");
    const addToCarts = countBy(events, "add_to_cart");
    const checkoutsStarted = uniqueCountBy(events, "checkout_started");
    const purchases = countBy(events, "purchase");

    // Trending products: top product ids by product_view, enriched with names.
    const viewsByProduct = new Map<string, number>();
    for (const e of events) {
      if (e.event_type === "product_view" && e.entity_type === "product" && e.entity_id) {
        viewsByProduct.set(e.entity_id, (viewsByProduct.get(e.entity_id) ?? 0) + 1);
      }
    }
    const topProductIds = [...viewsByProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
    type ProductNameRow = { id: string; name: unknown; slug: string; seller_id: string | null };
    const productRows = topProductIds.length
      ? await fetchTable<ProductNameRow>(
          "products",
          diagnostics,
          (context.supabase as SupabaseClient).from("products").select("id,name,slug,seller_id").in("id", topProductIds),
        )
      : [];
    const productById = new Map(productRows.map((p) => [p.id, p]));
    const trendingProducts = topProductIds.map((id) => {
      const p = productById.get(id);
      return {
        productId: id,
        name: p ? pickLocalizedName(p.name, "Untitled product") : `Product ${id.slice(0, 8)}`,
        slug: p?.slug ?? "",
        views: viewsByProduct.get(id) ?? 0,
      };
    });

    // Popular searches from metadata.query.
    const searchesByQuery = new Map<string, number>();
    for (const e of events) {
      if (e.event_type !== "search") continue;
      const q = typeof e.metadata?.["query"] === "string" ? e.metadata["query"].trim().slice(0, 80) : "";
      if (q) searchesByQuery.set(q, (searchesByQuery.get(q) ?? 0) + 1);
    }
    const popularSearches = [...searchesByQuery.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    // Sales velocity: purchases per day over the window (real zeros included).
    const velocityMap = new Map<string, number>();
    for (const e of events) {
      if (e.event_type !== "purchase") continue;
      const d = dayKey(e.created_at);
      velocityMap.set(d, (velocityMap.get(d) ?? 0) + 1);
    }
    const velocity: { date: string; purchases: number }[] = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      velocity.push({ date: d, purchases: velocityMap.get(d) ?? 0 });
    }

    // Category performance: category_view events enriched with names.
    const viewsByCategory = new Map<string, number>();
    for (const e of events) {
      if (e.event_type === "category_view" && e.entity_type === "category" && e.entity_id) {
        viewsByCategory.set(e.entity_id, (viewsByCategory.get(e.entity_id) ?? 0) + 1);
      }
    }
    const topCategoryIds = [...viewsByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
    type CategoryNameRow = { id: string; name: unknown };
    const categoryRows = topCategoryIds.length
      ? await fetchTable<CategoryNameRow>(
          "categories",
          diagnostics,
          (context.supabase as SupabaseClient).from("categories").select("id,name").in("id", topCategoryIds),
        )
      : [];
    const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
    const categories = topCategoryIds.map((id) => ({
      categoryId: id,
      name: categoryById.get(id) ? pickLocalizedName(categoryById.get(id)!.name, "Category") : `Category ${id.slice(0, 8)}`,
      views: viewsByCategory.get(id) ?? 0,
    }));

    // Seller performance: attribute product views / carts to sellers.
    const viewsBySeller = new Map<string, { views: number; carts: number }>();
    const productSeller = new Map(productRows.map((p) => [p.id, p.seller_id]));
    // Enrich seller ids for any product not already fetched (bounded).
    const missingSellerIds = [...new Set(
      [...viewsByProduct.keys(), ...[...events].filter((e) => e.event_type === "add_to_cart" && e.entity_type === "product" && e.entity_id).map((e) => e.entity_id as string)]
        .filter((id) => !productSeller.has(id)),
    )].slice(0, 200);
    if (missingSellerIds.length) {
      const extra = await fetchTable<ProductNameRow>(
        "products",
        diagnostics,
        (context.supabase as SupabaseClient).from("products").select("id,name,slug,seller_id").in("id", missingSellerIds),
      );
      for (const p of extra) productSeller.set(p.id, p.seller_id);
    }
    for (const e of events) {
      if (e.entity_type !== "product" || !e.entity_id) continue;
      const sellerId = productSeller.get(e.entity_id);
      if (!sellerId) continue;
      const agg = viewsBySeller.get(sellerId) ?? { views: 0, carts: 0 };
      if (e.event_type === "product_view") agg.views += 1;
      if (e.event_type === "add_to_cart") agg.carts += 1;
      viewsBySeller.set(sellerId, agg);
    }
    const topSellerIds = [...viewsBySeller.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 8).map(([id]) => id);
    type SellerNameRow = { id: string; legal_name: string };
    const sellerRows = topSellerIds.length
      ? await fetchTable<SellerNameRow>(
          "sellers",
          diagnostics,
          (context.supabase as SupabaseClient).from("sellers").select("id,legal_name").in("id", topSellerIds),
        )
      : [];
    const sellerById = new Map(sellerRows.map((s) => [s.id, s]));
    const sellers = topSellerIds.map((id) => ({
      sellerId: id,
      name: sellerById.get(id)?.legal_name ?? `Seller ${id.slice(0, 8)}`,
      views: viewsBySeller.get(id)?.views ?? 0,
      carts: viewsBySeller.get(id)?.carts ?? 0,
    }));

    return {
      days: data.days,
      hasData,
      totals: {
        events: events.length,
        uniqueVisitors: visitors.size,
        productViews,
        searches,
        addToCarts,
        checkoutsStarted,
        purchases,
      },
      funnel: [
        { stage: "product_view", label: "Viewed a product", count: uniqueCountBy(events, "product_view") },
        { stage: "add_to_cart", label: "Added to bag", count: uniqueCountBy(events, "add_to_cart") },
        { stage: "checkout_started", label: "Started checkout", count: uniqueCountBy(events, "checkout_started") },
        { stage: "purchase", label: "Purchased", count: uniqueCountBy(events, "purchase") },
      ],
      trendingProducts,
      popularSearches,
      velocity,
      categories,
      sellers,
      diagnostics,
    };
  });

/* ------------------------- seller (own store only) ------------------------- */

const sellerOnly = [requireSupabaseAuth] as const;

async function sellerGuard(context: any) {
  const userId = context?.userId as string | undefined;
  if (!userId) throw new Error("Unauthorized");
  return requireSeller({ supabase: context.supabase as SupabaseClient, userId }, "analytics.view");
}

export interface SellerAnalytics {
  days: number;
  hasData: boolean;
  totals: {
    storeViews: number;
    productViews: number;
    uniqueVisitors: number;
    addToCarts: number;
    checkoutsStarted: number;
    purchases: number;
  };
  funnel: FunnelStage[];
  topProducts: { productId: string; name: string; views: number; carts: number }[];
  diagnostics: TableDiagnostic[];
}

export const getSellerAnalytics = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => daysInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerAnalytics> => {
    const seller = await sellerGuard(context);
    const diagnostics: TableDiagnostic[] = [];
    const { data: rows, error } = await callRpc(context.supabase as SupabaseClient, "seller_analytics_events", {
      p_days: data.days,
    });
    const events = (error ? [] : ((rows ?? []) as AnalyticsEventRow[]));
    diagnostics.push({
      table: "analytics_events",
      ok: !error,
      message: error ? error.message ?? "Query failed" : undefined,
    });

    const hasData = events.length > 0;
    const visitors = new Set<string>();
    for (const e of events) visitors.add(e.anon_id);

    const storeViews = countBy(events, "store_view");
    const productViews = countBy(events, "product_view");
    const addToCarts = countBy(events, "add_to_cart");
    const checkoutsStarted = uniqueCountBy(events, "checkout_started");

    // Purchases = real confirmed order lines for this seller's products.
    const sinceIso = new Date(Date.now() - data.days * 86_400_000).toISOString();
    type PurchaseRow = { seller_order_id: string; created_at: string };
    const purchaseRows = await fetchTable<PurchaseRow>(
      "order_items",
      diagnostics,
      (context.supabase as SupabaseClient)
        .from("order_items")
        .select("seller_order_id,created_at,seller_orders!inner(seller_id,status)")
        .eq("seller_orders.seller_id", seller.sellerId)
        .neq("seller_orders.status", "cancelled")
        .gte("created_at", sinceIso)
        .limit(50000),
    );
    const purchases = new Set(purchaseRows.map((r) => r.seller_order_id)).size;

    // Top viewed products (this store only -- the RPC already scoped them).
    const byProduct = new Map<string, { views: number; carts: number }>();
    for (const e of events) {
      if (e.entity_type !== "product" || !e.entity_id) continue;
      const agg = byProduct.get(e.entity_id) ?? { views: 0, carts: 0 };
      if (e.event_type === "product_view") agg.views += 1;
      if (e.event_type === "add_to_cart") agg.carts += 1;
      byProduct.set(e.entity_id, agg);
    }
    const topIds = [...byProduct.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 10).map(([id]) => id);
    type SellerProductRow = { id: string; name: unknown };
    const nameRows = topIds.length
      ? await fetchTable<SellerProductRow>(
          "products",
          diagnostics,
          (context.supabase as SupabaseClient)
            .from("products")
            .select("id,name")
            .in("id", topIds)
            .eq("seller_id", seller.sellerId),
        )
      : [];
    const nameById = new Map(nameRows.map((p) => [p.id, p]));
    const topProducts = topIds.map((id) => ({
      productId: id,
      name: nameById.get(id) ? pickLocalizedName(nameById.get(id)!.name, "Untitled product") : `Product ${id.slice(0, 8)}`,
      views: byProduct.get(id)?.views ?? 0,
      carts: byProduct.get(id)?.carts ?? 0,
    }));

    return {
      days: data.days,
      hasData,
      totals: { storeViews, productViews, uniqueVisitors: visitors.size, addToCarts, checkoutsStarted, purchases },
      funnel: [
        { stage: "product_view", label: "Viewed a product", count: uniqueCountBy(events, "product_view") },
        { stage: "add_to_cart", label: "Added to bag", count: uniqueCountBy(events, "add_to_cart") },
        { stage: "checkout_started", label: "Started checkout", count: uniqueCountBy(events, "checkout_started") },
        { stage: "purchase", label: "Purchases (confirmed orders)", count: purchases },
      ],
      topProducts,
      diagnostics,
    };
  });

/* ------------------- public aggregates (counts only) ----------------------- */

const trendingInput = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(12).default(8),
  locale: z.string().min(2).max(5).default("en"),
});

type ProductCardRow = {
  id: string;
  slug: string;
  name: unknown;
  base_price: number;
  created_at: string;
  category: { slug: string } | { slug: string }[] | null;
  images: { storage_path: string | null; alt_text: unknown; sort_order: number }[] | null;
  store: { name: string } | { name: string }[] | null;
};

function toCatalogProduct(row: ProductCardRow, locale: string): CatalogProduct {
  const images = [...(row.images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  const store = Array.isArray(row.store) ? row.store[0] : row.store;
  return {
    id: row.id,
    slug: row.slug,
    name: localizedText(row.name, locale, row.slug),
    price: num(row.base_price),
    storeName: store?.name ?? "Modalia store",
    categorySlug: category?.slug ?? null,
    imagePath: publicImageUrl(images[0]?.storage_path ?? null),
    imageAlt: localizedText(images[0]?.alt_text ?? null, locale, ""),
    createdAt: row.created_at,
  };
}

const PRODUCT_CARD_SELECT =
  "id,slug,name,base_price,created_at,category:categories(slug),images:product_images(storage_path,alt_text,sort_order),store:stores(name)";

function publishedFilter(query: any) {
  return query
    .eq("status", "active")
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public");
}

async function enrichProductCards(
  client: SupabaseClient,
  ids: string[],
  locale: string,
): Promise<{ products: CatalogProduct[]; hasData: boolean }> {
  if (!ids.length) return { products: [], hasData: false };
  const { data, error } = await publishedFilter(client.from("products").select(PRODUCT_CARD_SELECT))
    .in("id", ids)
    .limit(ids.length);
  if (error || !data?.length) return { products: [], hasData: false };
  const byId = new Map<string, CatalogProduct>();
  for (const row of data as ProductCardRow[]) byId.set(row.id, toCatalogProduct(row, locale));
  // Preserve the ranked order from the aggregate; drop products that are no
  // longer published (honest: only show what is really buyable).
  const products = ids.map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p);
  return { products, hasData: products.length > 0 };
}

/** "Popular right now": most-viewed published products. Empty until real views exist. */
export const getTrendingProducts = createServerFn({ method: "GET" })
  .inputValidator((data) => trendingInput.parse(data))
  .handler(async ({ data }) => {
    const client = publicClient();
    const { data: rows, error } = await callRpc(client, "trending_products", {
      p_days: data.days,
      p_limit: data.limit,
    });
    if (error || !rows?.length) return { products: [] as CatalogProduct[], hasData: false };
    const ids = (rows as { product_id: string }[]).map((r) => r.product_id);
    return enrichProductCards(client, ids, data.locale);
  });

const relatedInput = z.object({
  productId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(12).default(8),
  locale: z.string().min(2).max(5).default("en"),
});

/** "Viewed together": products co-viewed by the same visitors. Real co-views only. */
export const getRelatedProducts = createServerFn({ method: "GET" })
  .inputValidator((data) => relatedInput.parse(data))
  .handler(async ({ data }) => {
    const client = publicClient();
    const { data: rows, error } = await callRpc(client, "related_products", {
      p_product_id: data.productId,
      p_limit: data.limit,
    });
    if (error || !rows?.length) return { products: [] as CatalogProduct[], hasData: false };
    const ids = (rows as { product_id: string }[]).map((r) => r.product_id);
    return enrichProductCards(client, ids, data.locale);
  });

const bestsellersInput = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(8),
  locale: z.string().min(2).max(5).default("en"),
});

/**
 * "Best sellers": products ranked by real sold quantity across order items
 * whose seller order is not cancelled/refunded. Aggregation uses the
 * service-role client (order rows are not anon-readable) and exposes only
 * ranked product ids + totals — no customer or order data leaves the server.
 * Empty until real sales exist — never a fabricated ranking.
 */
export const getBestsellers = createServerFn({ method: "GET" })
  .inputValidator((data) => bestsellersInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity, seller_orders!inner(status)")
      .not("product_id", "is", null)
      .neq("seller_orders.status", "cancelled")
      .neq("seller_orders.status", "refunded")
      .limit(5000);
    if (error || !rows?.length) return { products: [] as CatalogProduct[], hasData: false };
    const totals = new Map<string, number>();
    for (const row of rows as { product_id: string | null; quantity: number }[]) {
      if (!row.product_id) continue;
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + num(row.quantity));
    }
    const ranked = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, data.limit)
      .map(([id]) => id);
    if (!ranked.length) return { products: [] as CatalogProduct[], hasData: false };
    return enrichProductCards(publicClient(), ranked, data.locale);
  });
