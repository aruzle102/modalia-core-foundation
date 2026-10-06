/**
 * Seller analytics server functions — Section 26 (V8), seller-scoped.
 *
 * Security contract — every function below:
 *  1. runs behind `requireSupabaseAuth` (context.userId is authenticated),
 *  2. calls `requireSeller(context, "analytics.view")` which resolves the
 *     caller's seller record from the SESSION ONLY — never from client input,
 *  3. scopes every query with the resolved `seller.sellerId`:
 *     `.eq("seller_id", seller.sellerId)`, an inner join on seller_orders
 *     plus `.eq("seller_orders.seller_id", ...)`, or an inner join on
 *     products plus `.eq("products.seller_id", ...)`,
 *  4. reads behavioral events only through the `seller_analytics_events()`
 *     RPC, which re-resolves the seller from auth.uid() inside the database
 *     and returns only this store's product/store events.
 *
 * No function in this module accepts a seller_id parameter; the client cannot
 * influence which seller's data is returned. Isolation was verified by grepping
 * this file for any client-supplied seller reference (see final report).
 *
 * Every number is computed from real rows only (analytics_events via the RPC,
 * seller_orders, order_items, products, reviews). Empty windows return honest
 * zero / empty / null states — never estimates or samples.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, type SellerContext } from "@/lib/seller-auth";
import { pickLocalizedName } from "@/lib/names";
import type { SupabaseClient } from "@supabase/supabase-js";

const sellerOnly = [requireSupabaseAuth] as const;

export type TableDiagnostic = { table: string; ok: boolean; message?: string | undefined };

type RpcResult = { data: any; error: { message?: string } | null };

/** Call a Postgres RPC that is not (yet) in the generated Supabase types. */
async function callRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const rpc = client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResult>;
  return rpc(name, args);
}

/** Authenticate + authorize, returning the caller's seller context (session-only). */
async function sellerGuard(context: any): Promise<SellerContext> {
  const userId = context?.userId as string | undefined;
  if (!userId) throw new Error("Unauthorized");
  return requireSeller({ supabase: context.supabase as SupabaseClient, userId }, "analytics.view");
}

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** One bounded seller-scoped query with a recorded diagnostic entry; failures degrade to []. */
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

type AnalyticsEventRow = {
  id: string;
  anon_id: string;
  event_type: "page_view" | "product_view" | "search" | "category_view" | "add_to_cart" | "buy_now_started" | "wishlist_add" | "checkout_started" | "checkout_completed" | "purchase" | "store_view";
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const daysInput = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

function uniqueCountBy(events: AnalyticsEventRow[], type: AnalyticsEventRow["event_type"]): number {
  const seen = new Set<string>();
  for (const e of events) if (e.event_type === type) seen.add(e.anon_id);
  return seen.size;
}

function countBy(events: AnalyticsEventRow[], type: AnalyticsEventRow["event_type"]): number {
  let n = 0;
  for (const e of events) if (e.event_type === type) n += 1;
  return n;
}

/** Full window of UTC day keys, oldest -> newest. */
function windowDays(days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

function windowSinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Registered, store-attributable events for this seller over the window. */
async function sellerEvents(
  context: any,
  days: number,
  diagnostics: TableDiagnostic[],
): Promise<AnalyticsEventRow[]> {
  const { data: rows, error } = await callRpc(context.supabase as SupabaseClient, "seller_analytics_events", {
    p_days: days,
  });
  diagnostics.push({
    table: "analytics_events",
    ok: !error,
    message: error ? (error.message ?? "Query failed") : undefined,
  });
  return (error ? [] : ((rows ?? []) as AnalyticsEventRow[]));
}

function itemName(item: { title: unknown; product_snapshot: unknown }, fallback: string): string {
  const snap = (item.product_snapshot ?? {}) as Record<string, unknown>;
  return pickLocalizedName(item.title, "") || pickLocalizedName(snap["title"], "") || fallback;
}

/* --------------------------------- profile --------------------------------- */

export type SellerAnalyticsProfile = { legalName: string; storeId: string | null };

export const getSellerAnalyticsProfile = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerAnalyticsProfile> => {
    const seller = await sellerGuard(context);
    return { legalName: seller.legalName, storeId: seller.storeId };
  });

/* --------------------------------- traffic --------------------------------- */

export interface TrafficDayPoint {
  date: string;
  storeViews: number;
  productViews: number;
  visitors: number;
}

export interface SellerTraffic {
  days: number;
  hasData: boolean;
  totals: { uniqueVisitors: number; storeViews: number; productViews: number };
  series: TrafficDayPoint[];
  /**
   * Searches attributed to this seller's store: `search` events recorded with
   * entity_type='store' + this store's id (shop page attaches it when the
   * shopper filters to a single store). Searches without a store filter
   * cannot be attributed — those are honestly not counted.
   */
  searchAppearances: { tracked: boolean; count: number };
  diagnostics: TableDiagnostic[];
}

export const getSellerTraffic = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => daysInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerTraffic> => {
    await sellerGuard(context);
    const diagnostics: TableDiagnostic[] = [];
    const events = await sellerEvents(context, data.days, diagnostics);

    const visitors = new Set<string>();
    for (const e of events) visitors.add(e.anon_id);
    const storeViews = countBy(events, "store_view");
    const productViews = countBy(events, "product_view");
    const searchAppearances = countBy(events, "search");

    const perDay = new Map<string, { storeViews: number; productViews: number; visitors: Set<string> }>();
    for (const key of windowDays(data.days)) perDay.set(key, { storeViews: 0, productViews: 0, visitors: new Set() });
    for (const e of events) {
      const bucket = perDay.get(e.created_at.slice(0, 10));
      if (!bucket) continue;
      bucket.visitors.add(e.anon_id);
      if (e.event_type === "store_view") bucket.storeViews += 1;
      if (e.event_type === "product_view") bucket.productViews += 1;
    }
    const series: TrafficDayPoint[] = [...perDay.entries()].map(([date, b]) => ({
      date,
      storeViews: b.storeViews,
      productViews: b.productViews,
      visitors: b.visitors.size,
    }));

    return {
      days: data.days,
      hasData: events.length > 0,
      totals: { uniqueVisitors: visitors.size, storeViews, productViews },
      series,
      searchAppearances: { tracked: true, count: searchAppearances },
      diagnostics,
    };
  });

/* --------------------------------- funnel ---------------------------------- */

export type FunnelStageKey = "product_view" | "wishlist_add" | "add_to_cart" | "checkout_started" | "purchase";

export interface SellerFunnelStage {
  stage: FunnelStageKey;
  /** Unique visitors for event stages; confirmed (non-cancelled) order count for `purchase`. */
  count: number;
  /** Share of the previous stage that continued here; null for the entry stage or when the previous stage is 0. */
  conversionFromPrev: number | null;
}

export interface SellerFunnel {
  days: number;
  hasData: boolean;
  stages: SellerFunnelStage[];
  diagnostics: TableDiagnostic[];
}

export const getSellerFunnel = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => daysInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerFunnel> => {
    const seller = await sellerGuard(context);
    const diagnostics: TableDiagnostic[] = [];
    const events = await sellerEvents(context, data.days, diagnostics);

    // Purchases are real confirmed order rows for this seller (non-cancelled),
    // windowed by the seller_order's own created_at — the same convention as
    // the storefront-engagement analytics.
    type OrderIdRow = { id: string };
    const purchaseRows = await fetchTable<OrderIdRow>(
      "seller_orders:funnel",
      diagnostics,
      (context.supabase as SupabaseClient)
        .from("seller_orders")
        .select("id")
        .eq("seller_id", seller.sellerId)
        .neq("status", "cancelled")
        .gte("created_at", windowSinceIso(data.days))
        .limit(50000),
    );

    const counts: { stage: FunnelStageKey; count: number }[] = [
      { stage: "product_view", count: uniqueCountBy(events, "product_view") },
      { stage: "wishlist_add", count: uniqueCountBy(events, "wishlist_add") },
      { stage: "add_to_cart", count: uniqueCountBy(events, "add_to_cart") },
      { stage: "checkout_started", count: uniqueCountBy(events, "checkout_started") },
      { stage: "purchase", count: purchaseRows.length },
    ];
    const stages: SellerFunnelStage[] = counts.map((s, i) => {
      const prev: { stage: FunnelStageKey; count: number } | null = i === 0 ? null : (counts[i - 1] ?? null);
      const conversionFromPrev =
        prev === null || prev.count === 0 ? null : Math.round((s.count / prev.count) * 1000) / 10;
      return { ...s, conversionFromPrev };
    });

    return {
      days: data.days,
      hasData: stages.some((s) => s.count > 0),
      stages,
      diagnostics,
    };
  });

/* ---------------------------- product performance --------------------------- */

export interface ProductPerformanceRow {
  productId: string;
  name: string;
  views: number;
  units: number;
  revenue: number;
  /** units/views*100; null when there are no views (e.g. direct checkout links). */
  conversionPct: number | null;
}

export interface SellerProductPerformance {
  days: number;
  hasData: boolean;
  /** Top products by revenue (non-cancelled orders), with real view counts attached. */
  top: ProductPerformanceRow[];
  /** Products with views but zero purchases in the window, top by views. */
  lowPerforming: ProductPerformanceRow[];
  diagnostics: TableDiagnostic[];
}

const performanceInput = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const getSellerProductPerformance = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => performanceInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerProductPerformance> => {
    const seller = await sellerGuard(context);
    const diagnostics: TableDiagnostic[] = [];
    const events = await sellerEvents(context, data.days, diagnostics);

    const viewsByProduct = new Map<string, number>();
    for (const e of events) {
      if (e.event_type === "product_view" && e.entity_type === "product" && e.entity_id) {
        viewsByProduct.set(e.entity_id, (viewsByProduct.get(e.entity_id) ?? 0) + 1);
      }
    }

    type ItemRow = {
      product_id: string | null;
      quantity: number;
      total: number | string;
      title: unknown;
      product_snapshot: unknown;
    };
    const items = await fetchTable<ItemRow>(
      "order_items:performance",
      diagnostics,
      (context.supabase as SupabaseClient)
        .from("order_items")
        .select("product_id,title,product_snapshot,quantity,total,seller_orders!inner(id,seller_id,status)")
        .eq("seller_orders.seller_id", seller.sellerId)
        .neq("seller_orders.status", "cancelled")
        .gte("created_at", windowSinceIso(data.days))
        .limit(50000),
    );

    const sales = new Map<string, { units: number; revenue: number; name: string }>();
    for (const item of items) {
      if (!item.product_id) continue;
      const agg = sales.get(item.product_id) ?? {
        units: 0,
        revenue: 0,
        name: itemName(item, `Product ${item.product_id.slice(0, 8)}`),
      };
      agg.units += num(item.quantity);
      agg.revenue += num(item.total);
      sales.set(item.product_id, agg);
    }

    // Enrich names from the seller's own products (defense-in-depth scoping).
    const allIds = [...new Set([...sales.keys(), ...viewsByProduct.keys()])].slice(0, 500);
    type ProductNameRow = { id: string; name: unknown };
    const nameRows =
      allIds.length > 0
        ? await fetchTable<ProductNameRow>(
            "products:performance",
            diagnostics,
            (context.supabase as SupabaseClient)
              .from("products")
              .select("id,name")
              .in("id", allIds)
              .eq("seller_id", seller.sellerId),
          )
        : [];
    const nameById = new Map(nameRows.map((p) => [p.id, pickLocalizedName(p.name, "")]));

    const rows: ProductPerformanceRow[] = allIds.map((id) => {
      const views = viewsByProduct.get(id) ?? 0;
      const s = sales.get(id);
      const units = s?.units ?? 0;
      const name = nameById.get(id) || s?.name || `Product ${id.slice(0, 8)}`;
      return {
        productId: id,
        name,
        views,
        units,
        revenue: s?.revenue ?? 0,
        conversionPct: views > 0 ? Math.round((units / views) * 1000) / 10 : null,
      };
    });

    const top = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, data.limit);
    const lowPerforming = rows
      .filter((r) => r.views > 0 && r.units === 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, data.limit);

    return {
      days: data.days,
      hasData: rows.some((r) => r.views > 0 || r.units > 0),
      top: top.filter((r) => r.revenue > 0 || r.units > 0),
      lowPerforming,
      diagnostics,
    };
  });

/* --------------------------------- velocity --------------------------------- */

export interface VelocityDayPoint {
  date: string;
  /** Units sold from non-cancelled order items. */
  units: number;
  /** Delivered sales: SUM(subtotal + shipping_total). */
  revenue: number;
  /** Commission on delivered sales. */
  commission: number;
  /** revenue - commission. */
  net: number;
}

export interface SellerVelocity {
  days: number;
  hasData: boolean;
  totals: { units: number; revenue: number; commission: number; net: number; avgUnitsPerDay: number };
  series: VelocityDayPoint[];
  diagnostics: TableDiagnostic[];
}

export const getSellerVelocity = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => daysInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerVelocity> => {
    const seller = await sellerGuard(context);
    const diagnostics: TableDiagnostic[] = [];
    const sinceIso = windowSinceIso(data.days);

    type SellerOrderRow = {
      status: string;
      subtotal: number | string;
      shipping_total: number | string;
      commission_total: number | string;
      created_at: string;
    };
    type ItemRow = { quantity: number; created_at: string };

    const [orders, items] = await Promise.all([
      fetchTable<SellerOrderRow>(
        "seller_orders:velocity",
        diagnostics,
        (context.supabase as SupabaseClient)
          .from("seller_orders")
          .select("status,subtotal,shipping_total,commission_total,created_at")
          .eq("seller_id", seller.sellerId)
          .neq("status", "cancelled")
          .gte("created_at", sinceIso)
          .limit(50000),
      ),
      fetchTable<ItemRow>(
        "order_items:velocity",
        diagnostics,
        (context.supabase as SupabaseClient)
          .from("order_items")
          .select("quantity,created_at,seller_orders!inner(id,seller_id,status)")
          .eq("seller_orders.seller_id", seller.sellerId)
          .neq("seller_orders.status", "cancelled")
          .gte("created_at", sinceIso)
          .limit(50000),
      ),
    ]);

    const perDay = new Map<string, VelocityDayPoint>();
    for (const key of windowDays(data.days)) perDay.set(key, { date: key, units: 0, revenue: 0, commission: 0, net: 0 });

    for (const item of items) {
      const bucket = perDay.get(item.created_at.slice(0, 10));
      if (bucket) bucket.units += num(item.quantity);
    }
    for (const o of orders) {
      if (o.status !== "delivered") continue;
      const bucket = perDay.get(o.created_at.slice(0, 10));
      if (!bucket) continue;
      const revenue = num(o.subtotal) + num(o.shipping_total);
      const commission = num(o.commission_total);
      bucket.revenue += revenue;
      bucket.commission += commission;
      bucket.net += revenue - commission;
    }

    const series = [...perDay.values()];
    const totals = {
      units: 0,
      revenue: 0,
      commission: 0,
      net: 0,
      avgUnitsPerDay: 0,
    };
    for (const p of series) {
      totals.units += p.units;
      totals.revenue += p.revenue;
      totals.commission += p.commission;
      totals.net += p.net;
    }
    totals.avgUnitsPerDay = Math.round((totals.units / data.days) * 10) / 10;

    return {
      days: data.days,
      hasData: totals.units > 0 || totals.revenue > 0,
      totals,
      series,
      diagnostics,
    };
  });

/* ------------------------------- review stats ------------------------------- */

export interface SellerReviewStats {
  hasData: boolean;
  /** Approved reviews across this seller's products. */
  approvedCount: number;
  /** Null when there are no approved reviews. */
  averageRating: number | null;
  distribution: { stars: number; count: number }[];
}

export const getSellerReviewStats = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerReviewStats> => {
    const seller = await sellerGuard(context);
    const diagnostics: TableDiagnostic[] = [];

    // Only approved reviews are visible (matches the public RLS policy); the
    // join to products scopes rows to this seller's listings.
    type ReviewRow = { rating: number };
    const rows = await fetchTable<ReviewRow>(
      "reviews:stats",
      diagnostics,
      (context.supabase as SupabaseClient)
        .from("reviews")
        .select("rating,products!inner(seller_id)")
        .eq("products.seller_id", seller.sellerId)
        .eq("moderation_status", "approved")
        .limit(50000),
    );

    const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 }));
    let sum = 0;
    for (const r of rows) {
      const rating = Math.round(num(r.rating));
      sum += num(r.rating);
      const slot = distribution.find((d) => d.stars === rating);
      if (slot) slot.count += 1;
    }

    return {
      hasData: rows.length > 0,
      approvedCount: rows.length,
      averageRating: rows.length > 0 ? Math.round((sum / rows.length) * 10) / 10 : null,
      distribution,
    };
  });
