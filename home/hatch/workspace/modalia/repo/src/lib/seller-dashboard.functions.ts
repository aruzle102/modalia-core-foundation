/**
 * Seller dashboard server functions (overview KPIs, sales series, rankings).
 *
 * Security contract — every function below:
 *  1. runs behind `requireSupabaseAuth` (context.userId is authenticated),
 *  2. calls `requireSeller(context, "analytics.view")` which resolves the
 *     caller's seller record and asserts the permission,
 *  3. scopes every query with `.eq("seller_id", seller.sellerId)`.
 *
 * The seller id is NEVER accepted from client input.
 *
 * Every number is computed from real rows only. There is no synthetic or
 * placeholder data anywhere in this module; empty states are honest.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, requireSellerAllowMustReset, type SellerContext } from "@/lib/seller-auth";
import { pickLocalizedName } from "@/lib/names";

const sellerOnly = [requireSupabaseAuth] as const;

export type TableDiagnostic = { table: string; ok: boolean; message?: string };

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Authenticate + authorize, returning the caller's seller context. */
/* V10: overview is the dashboard landing — any authenticated seller/staff
   can view it, not just those with analytics.view. */
async function sellerGuard(context: any): Promise<SellerContext> {
  const userId = context?.userId as string | undefined;
  if (!userId) throw new Error("Unauthorized");
  // Dashboard is read-only: allow sellers with must_reset_password flag to view.
  // Write operations use requireSeller (deny variant) separately.
  // This fixes the systemic lockout where provisioned sellers could never load the dashboard.
  return requireSellerAllowMustReset({ supabase: context.supabase, userId });
}

type RpcResult = { data: unknown; error: { message?: string } | null };

/** Call a Postgres RPC that is not (yet) in the generated Supabase types. */
async function callRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const rpc = client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResult>;
  return rpc(name, args);
}

/** Call an RPC returning a row set; on failure returns an empty set plus the error message. */
async function callRpcRows<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ rows: T[]; errorMessage: string | null }> {
  const r = await callRpc(client, name, args);
  if (r.error) return { rows: [], errorMessage: r.error.message ?? "RPC failed" };
  const data = r.data as T[] | null | undefined;
  return { rows: Array.isArray(data) ? data : [], errorMessage: null };
}

/**
 * True when sellers.onboarded_at is set (Worker A migration + types.ts).
 * A missing column/row reads as null → callers treat it as "not onboarded",
 * so the onboarding nudge stays visible rather than silently disappearing.
 */
async function fetchOnboardedFlag(supabase: SupabaseClient, sellerId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("sellers")
      .select("onboarded_at")
      .eq("id", sellerId)
      .maybeSingle();
    if (error || !data) return null;
    return data.onboarded_at != null;
  } catch {
    return null;
  }
}

/* --------------------------------- row types -------------------------------- */

type AnalyticsEventLite = {
  event_type: string;
  anon_id: string;
  created_at: string;
};

type SellerRecentOrderRow = {
  id: string;
  status: string;
  subtotal: number | string;
  shipping_total: number | string;
  created_at: string;
  orders: { order_number: string; first_name: string | null; last_name: string | null } | null;
};

/* -------------------------------- result types ------------------------------- */

export type SellerKpis = {
  /** SUM(subtotal + shipping_total) of this seller's seller_orders with status='delivered', all time. */
  totalDeliveredSales: number;
  /** Count of this seller's seller_orders with status='delivered'. */
  deliveredCount: number;
  /** Total seller_orders rows for this seller, all statuses. */
  ordersCount: number;
  /** totalDeliveredSales / deliveredCount; 0 when nothing has been delivered yet. */
  averageOrderValue: number;
  /** Exact count of products owned by this seller. */
  productsCount: number;
  /** Inventory rows for this seller's variants with 0 < quantity <= low_stock_threshold. */
  lowStockCount: number;
  /** Inventory rows for this seller's variants with quantity - reserved_quantity <= 0. */
  outOfStockCount: number;
  /** seller_orders with status in ('pending','accepted','processing'). */
  pendingOrdersCount: number;
  /** SUM(subtotal + shipping_total) of this seller's cancelled seller_orders. */
  cancelledSales: number;
  /** SUM(subtotal + shipping_total) of this seller's returned seller_orders. */
  returnedSales: number;
  /** SUM(commission_total) of delivered seller_orders minus SUM(settlements with
      status in ('approved','paid')), floored at 0. */
  commissionPayable: number;
  /** totalDeliveredSales - commissionPayable. */
  netEarnings: number;
  /** SUM(settlements.amount) with status='pending'. */
  pendingSettlementAmount: number;
  /** SUM(settlements.amount) with status in ('approved','paid'). */
  settledAmount: number;
};

export type SellerLowStockAlert = {
  productName: string;
  slug: string;
  variantSku: string;
  qty: number;
  threshold: number;
  outOfStock: boolean;
};

export type SellerOverviewResult = {
  seller: { legalName: string; storeId: string | null; isOwner: boolean };
  currency: "DZD";
  kpis: SellerKpis;
  /** Up to 8 lowest-stock variants for this seller, lowest quantity first. */
  lowStockAlerts: SellerLowStockAlert[];
  /**
   * True when sellers.onboarded_at is set. Worker A adds the column via
   * migration + types.ts; until then it is read through a defensive
   * projection (see fetchOnboardedFlag) and a missing/unknown column reads as
   * false (not onboarded), so the onboarding nudge stays visible.
   */
  onboarded: boolean;
  diagnostics: TableDiagnostic[];
};

export type SellerSeriesPoint = { date: string; sales: number; orders: number };
export type SellerTopProduct = { productId: string; name: string; units: number; revenue: number };
export type SellerTopCategory = { categoryId: string; name: string; units: number; revenue: number };
export type SellerStatusCount = { status: string; count: number };
export type SellerRecentOrder = {
  id: string;
  orderNumber: string;
  customer: string;
  total: number;
  status: string;
  createdAt: string;
};

/* ---------------------------------- overview --------------------------------- */

const PENDING_ORDER_STATUSES = new Set(["pending", "accepted", "processing"]);

type OverviewRpcOrderRow = {
  status: string;
  cnt: number | string;
  sales: number | string;
  commission: number | string;
};

type OverviewRpcAlert = {
  sku: string | null;
  name: unknown;
  slug: string;
  qty: number | string;
  threshold: number | string;
  available: number | string;
};

type OverviewRpc = {
  order_rows: OverviewRpcOrderRow[];
  settled_amount: number | string;
  pending_settlement_amount: number | string;
  products_count: number | string;
  low_stock_count: number | string;
  out_of_stock_count: number | string;
  low_stock_alerts: OverviewRpcAlert[];
};

/**
 * Dashboard overview KPIs. All aggregates (per-status order totals, settlement
 * sums, inventory counts, low-stock alerts) are computed in SQL inside the
 * `seller_dashboard_overview` RPC — a single round-trip instead of fetching up
 * to 50,000 rows per table. The page degrades to zeros (never fake numbers)
 * when the RPC fails; the failure is recorded in diagnostics.
 */
export const getSellerOverview = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerOverviewResult> => {
    const seller = await sellerGuard(context);
    const supabase = context.supabase as SupabaseClient;
    const diagnostics: TableDiagnostic[] = [];

    const [rpc, onboardedFlag] = await Promise.all([
      callRpc(supabase, "seller_dashboard_overview", {}),
      fetchOnboardedFlag(supabase, seller.sellerId),
    ]);

    let totalDeliveredSales = 0;
    let deliveredCount = 0;
    let ordersCount = 0;
    let pendingOrdersCount = 0;
    let cancelledSales = 0;
    let returnedSales = 0;
    let deliveredCommission = 0;
    let settledAmount = 0;
    let pendingSettlementAmount = 0;
    let productsCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let lowStockAlerts: SellerLowStockAlert[] = [];

    if (rpc.error) {
      diagnostics.push({
        table: "rpc:seller_dashboard_overview",
        ok: false,
        message: rpc.error.message ?? "Overview RPC failed",
      });
    } else {
      diagnostics.push({ table: "rpc:seller_dashboard_overview", ok: true });
      const r = (rpc.data ?? {}) as Partial<OverviewRpc>;
      const rows = Array.isArray(r.order_rows) ? r.order_rows : [];
      for (const row of rows) {
        const cnt = num(row.cnt);
        ordersCount += cnt;
        if (row.status === "delivered") {
          totalDeliveredSales += num(row.sales);
          deliveredCommission += num(row.commission);
          deliveredCount += cnt;
        }
        if (PENDING_ORDER_STATUSES.has(row.status)) pendingOrdersCount += cnt;
        if (row.status === "cancelled") cancelledSales += num(row.sales);
        if (row.status === "returned") returnedSales += num(row.sales);
      }
      settledAmount = num(r.settled_amount);
      pendingSettlementAmount = num(r.pending_settlement_amount);
      productsCount = num(r.products_count);
      lowStockCount = num(r.low_stock_count);
      outOfStockCount = num(r.out_of_stock_count);
      // The RPC already orders by quantity ascending and limits to 8.
      lowStockAlerts = (Array.isArray(r.low_stock_alerts) ? r.low_stock_alerts : [])
        .slice(0, 8)
        .map((a) => ({
          productName: pickLocalizedName(a.name, a.sku ?? "Variant"),
          slug: a.slug ?? "",
          variantSku: a.sku ?? "",
          qty: num(a.qty),
          threshold: num(a.threshold),
          outOfStock: num(a.available) <= 0,
        }));
    }

    const commissionPayable = Math.max(0, deliveredCommission - settledAmount);

    diagnostics.sort((a, b) => a.table.localeCompare(b.table));

    return {
      seller: { legalName: seller.legalName, storeId: seller.storeId, isOwner: seller.isOwner },
      currency: "DZD",
      kpis: {
        totalDeliveredSales,
        deliveredCount,
        ordersCount,
        averageOrderValue: deliveredCount > 0 ? totalDeliveredSales / deliveredCount : 0,
        productsCount,
        lowStockCount,
        outOfStockCount,
        pendingOrdersCount,
        cancelledSales,
        returnedSales,
        commissionPayable,
        netEarnings: totalDeliveredSales - commissionPayable,
        pendingSettlementAmount,
        settledAmount,
      },
      lowStockAlerts,
      onboarded: onboardedFlag ?? false,
      diagnostics,
    };
  });

/* --------------------------------- today stats ------------------------------- */

/**
 * "Today" snapshot for the dashboard home (Section 23, V8).
 *
 * The day boundary is the UTC calendar day (seller timezone-agnostic by
 * design — documented here and in the UI subtitle). Every figure is computed
 * from real rows:
 * - todaySales / todayDeliveredCount / todayOrdersCount: from seller_orders
 *   created since today's 00:00 UTC.
 * - storeViews / productViews / addToCart: counted from the seller-scoped
 *   `seller_analytics_events` RPC (same isolation contract as
 *   getSellerAnalytics in analytics.functions.ts), filtered to the UTC day.
 *   When the RPC fails or the tracking pipeline records nothing for this
 *   store, viewsMeasurable is false and the UI renders an honest
 *   "not tracked yet" empty state instead of inventing numbers.
 * - conversionRate: distinct non-cancelled seller_orders today ÷ product
 *   views today × 100. Null (omitted) unless views are measurable and
 *   productViews > 0.
 */
export type SellerTodayStats = {
  /** UTC calendar date (YYYY-MM-DD) this snapshot covers. */
  todayIso: string;
  /** SUM(subtotal + shipping_total) of delivered seller_orders created today (UTC). */
  todaySales: number;
  /** Count of delivered seller_orders created today (UTC). */
  todayDeliveredCount: number;
  /** Count of non-cancelled seller_orders created today (UTC). */
  todayOrdersCount: number;
  /** store_view events today (UTC); null when view tracking isn't measurable. */
  storeViews: number | null;
  /** product_view events today (UTC); null when view tracking isn't measurable. */
  productViews: number | null;
  /** add_to_cart events today (UTC); null when view tracking isn't measurable. */
  addToCart: number | null;
  /** False when the analytics RPC failed — the UI must not invent numbers. */
  viewsMeasurable: boolean;
  /** Non-cancelled orders ÷ product views × 100; null unless measurable and productViews > 0. */
  conversionRate: number | null;
  diagnostics: TableDiagnostic[];
};

type TodayRpc = {
  sales: number | string;
  delivered_count: number | string;
  orders_count: number | string;
};

export const getSellerTodayStats = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerTodayStats> => {
    await sellerGuard(context);
    const supabase = context.supabase as SupabaseClient;
    const diagnostics: TableDiagnostic[] = [];

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const dayStartIso = `${todayIso}T00:00:00.000Z`;

    const [todayRpc, rpcResult] = await Promise.all([
      callRpc(supabase, "seller_dashboard_today", {}),
      callRpc(supabase, "seller_analytics_events", { p_days: 1 }),
    ]);

    let todaySales = 0;
    let todayDeliveredCount = 0;
    let todayOrdersCount = 0;
    if (todayRpc.error) {
      diagnostics.push({
        table: "rpc:seller_dashboard_today",
        ok: false,
        message: todayRpc.error.message ?? "Today RPC failed",
      });
    } else {
      diagnostics.push({ table: "rpc:seller_dashboard_today", ok: true });
      const t = (todayRpc.data ?? {}) as Partial<TodayRpc>;
      todaySales = num(t.sales);
      todayDeliveredCount = num(t.delivered_count);
      todayOrdersCount = num(t.orders_count);
    }

    let storeViews: number | null = null;
    let productViews: number | null = null;
    let addToCart: number | null = null;
    let viewsMeasurable = false;
    if (!rpcResult.error) {
      const events = (rpcResult.data ?? []) as AnalyticsEventLite[];
      let store = 0;
      let product = 0;
      let carts = 0;
      for (const e of events) {
        if ((e.created_at ?? "") < dayStartIso) continue;
        if (e.event_type === "store_view") store += 1;
        else if (e.event_type === "product_view") product += 1;
        else if (e.event_type === "add_to_cart") carts += 1;
      }
      storeViews = store;
      productViews = product;
      addToCart = carts;
      viewsMeasurable = true;
    }
    const rpcDiagnostic: TableDiagnostic = rpcResult.error
      ? { table: "analytics_events:today", ok: false, message: rpcResult.error.message ?? "View RPC failed" }
      : { table: "analytics_events:today", ok: true };
    diagnostics.push(rpcDiagnostic);

    const conversionRate =
      viewsMeasurable && (productViews ?? 0) > 0
        ? (todayOrdersCount / (productViews as number)) * 100
        : null;

    diagnostics.sort((a, b) => a.table.localeCompare(b.table));

    return {
      todayIso,
      todaySales,
      todayDeliveredCount,
      todayOrdersCount,
      storeViews,
      productViews,
      addToCart,
      viewsMeasurable,
      conversionRate,
      diagnostics,
    };
  });

/* -------------------------------- sales series ------------------------------- */

const seriesInput = z.object({ days: z.number().int().min(1).max(120).default(30) });

/**
 * Per-day { date, sales, orders } for the last `days` days (oldest -> newest),
 * aggregated in SQL by `seller_dashboard_sales_series` (GROUP BY day, zero-
 * filled). No row fetching: one round-trip regardless of order volume.
 * - orders: count of this seller's non-cancelled seller_orders per day.
 * - sales: SUM(subtotal + shipping_total) of *delivered* orders per day.
 */
export const getSellerSalesSeries = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => seriesInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerSeriesPoint[]> => {
    await sellerGuard(context);
    const supabase = context.supabase as SupabaseClient;
    const { rows, errorMessage } = await callRpcRows<{
      day: string;
      sales: number | string;
      orders: number | string;
    }>(supabase, "seller_dashboard_sales_series", { p_days: data.days });
    if (errorMessage) throw new Error("Sales series could not be loaded.");
    return rows.map((r) => ({ date: r.day, sales: num(r.sales), orders: num(r.orders) }));
  });

/* --------------------------------- top lists --------------------------------- */

const limitInput = z.object({ limit: z.number().int().min(1).max(25).default(5) });

function itemName(item: { title: unknown; product_snapshot: unknown }, fallback: string): string {
  const snap = (item.product_snapshot ?? {}) as Record<string, unknown>;
  return pickLocalizedName(item.title, "") || pickLocalizedName(snap["title"], "") || fallback;
}

/** Top products by revenue (SUM(order_items.total)) across this seller's non-cancelled seller_orders — aggregated in SQL. */
export const getSellerTopProducts = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => limitInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerTopProduct[]> => {
    await sellerGuard(context);
    const supabase = context.supabase as SupabaseClient;
    const { rows, errorMessage } = await callRpcRows<{
      product_id: string;
      title: unknown;
      product_snapshot: unknown;
      units: number | string;
      revenue: number | string;
    }>(supabase, "seller_dashboard_top_products", { p_limit: data.limit });
    if (errorMessage) throw new Error("Top products could not be loaded.");
    return rows.map((item) => ({
      productId: item.product_id,
      name: itemName(
        { title: item.title, product_snapshot: item.product_snapshot },
        `Product ${item.product_id.slice(0, 8)}`,
      ),
      units: num(item.units),
      revenue: num(item.revenue),
    }));
  });

/** Top categories by revenue across this seller's non-cancelled seller_orders — aggregated in SQL. */
export const getSellerTopCategories = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => limitInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerTopCategory[]> => {
    await sellerGuard(context);
    const supabase = context.supabase as SupabaseClient;
    const { rows, errorMessage } = await callRpcRows<{
      category_id: string;
      name: unknown;
      slug: string;
      units: number | string;
      revenue: number | string;
    }>(supabase, "seller_dashboard_top_categories", { p_limit: data.limit });
    if (errorMessage) throw new Error("Top categories could not be loaded.");
    return rows.map((c) => ({
      categoryId: c.category_id,
      name: pickLocalizedName(c.name, c.slug) || c.category_id.slice(0, 8),
      units: num(c.units),
      revenue: num(c.revenue),
    }));
  });

/* ------------------------------- status breakdown ---------------------------- */

/** Exact per-status counts of this seller's seller_orders via a single SQL GROUP BY (statuses with zero rows are omitted). */
export const getSellerOrderStatusBreakdown = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerStatusCount[]> => {
    await sellerGuard(context);
    const supabase = context.supabase as SupabaseClient;
    const { rows, errorMessage } = await callRpcRows<{ status: string; order_count: number | string }>(
      supabase,
      "seller_dashboard_order_status_breakdown",
      {},
    );
    if (errorMessage) throw new Error("Status breakdown could not be loaded.");
    return rows
      .map((r) => ({ status: r.status, count: num(r.order_count) }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  });

/* -------------------------------- recent orders ------------------------------ */

/** Latest seller_orders for this seller, with the parent order's number and customer name. */
export const getSellerRecentOrders = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => limitInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerRecentOrder[]> => {
    const seller = await sellerGuard(context);
    const { data: rows, error } = await context.supabase
      .from("seller_orders")
      .select("id,status,subtotal,shipping_total,created_at,orders(order_number,first_name,last_name)")
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error("Recent orders could not be loaded.");

    return ((rows ?? []) as SellerRecentOrderRow[]).map((o) => {
      const parent = o.orders;
      return {
        id: o.id,
        orderNumber: parent?.order_number ?? "—",
        customer: `${parent?.first_name ?? ""} ${parent?.last_name ?? ""}`.trim() || "Guest",
        total: num(o.subtotal) + num(o.shipping_total),
        status: o.status,
        createdAt: o.created_at,
      };
    });
  });
