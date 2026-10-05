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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, type SellerContext } from "@/lib/seller-auth";
import { pickLocalizedName } from "@/lib/names";

const sellerOnly = [requireSupabaseAuth] as const;

export type TableDiagnostic = { table: string; ok: boolean; message?: string };

/**
 * One bounded seller-scoped query with a recorded diagnostic entry, so a
 * single failing table degrades to an empty slice instead of taking down the
 * whole page. Rows are cast to the declared row shape T.
 */
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

/** Exact-count head query for a total, with diagnostics fallback to 0. */
async function countRows(table: string, diagnostics: TableDiagnostic[], query: any): Promise<number> {
  try {
    const { count, error } = await query;
    if (error) {
      diagnostics.push({ table, ok: false, message: (error as { message?: string } | null)?.message ?? "Count failed" });
      return 0;
    }
    diagnostics.push({ table, ok: true });
    return count ?? 0;
  } catch (err) {
    diagnostics.push({ table, ok: false, message: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}


const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Authenticate + authorize, returning the caller's seller context. */
async function sellerGuard(context: any): Promise<SellerContext> {
  const userId = context?.userId as string | undefined;
  if (!userId) throw new Error("Unauthorized");
  return requireSeller({ supabase: context.supabase, userId }, "analytics.view");
}

const AGG_LIMIT = 50000;

/* --------------------------------- row types -------------------------------- */

type SellerOrderRow = {
  id: string;
  status: string;
  subtotal: number | string;
  shipping_total: number | string;
  commission_total: number | string;
  created_at: string;
};

type SettlementRow = {
  id: string;
  amount: number | string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  payment_reference: string | null;
};

type InventoryLevelRow = {
  quantity: number | string;
  reserved_quantity: number | string | null;
  low_stock_threshold: number | string | null;
  product_variants: {
    sku: string | null;
    products: { id: string; name: unknown; slug: string } | null;
  } | null;
};

type SellerOrderItemRow = {
  product_id: string | null;
  quantity: number;
  total: number | string;
  title: unknown;
  product_snapshot: unknown;
};

type ProductCategoryRow = { id: string; category_id: string | null };
type CategoryLiteRow = { id: string; name: unknown; slug: string };

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
const SETTLED_STATUSES = new Set(["approved", "paid"]);

export const getSellerOverview = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerOverviewResult> => {
    const seller = await sellerGuard(context);
    const supabase = context.supabase;
    const sellerId = seller.sellerId;
    const diagnostics: TableDiagnostic[] = [];

    const [orders, settlements, inventoryRows, productsCount] = await Promise.all([
      fetchTable<SellerOrderRow>(
        "seller_orders:overview",
        diagnostics,
        supabase
          .from("seller_orders")
          .select("id,status,subtotal,shipping_total,commission_total,created_at")
          .eq("seller_id", sellerId)
          .limit(AGG_LIMIT),
      ),
      fetchTable<SettlementRow>(
        "seller_settlements:overview",
        diagnostics,
        supabase
          .from("seller_settlements")
          .select("id,amount,status,period_start,period_end,created_at,payment_reference")
          .eq("seller_id", sellerId)
          .limit(5000),
      ),
      fetchTable<InventoryLevelRow>(
        "inventory:levels",
        diagnostics,
        supabase
          .from("inventory")
          .select("quantity,reserved_quantity,low_stock_threshold,product_variants!inner(sku,products!inner(id,seller_id,name,slug))")
          .eq("product_variants.products.seller_id", sellerId)
          .limit(AGG_LIMIT),
      ),
      countRows(
        "products:total",
        diagnostics,
        supabase.from("products").select("*", { count: "exact", head: true }).eq("seller_id", sellerId),
      ),
    ]);

    let totalDeliveredSales = 0;
    let deliveredCount = 0;
    let pendingOrdersCount = 0;
    let deliveredCommission = 0;
    for (const o of orders) {
      if (o.status === "delivered") {
        totalDeliveredSales += num(o.subtotal) + num(o.shipping_total);
        deliveredCommission += num(o.commission_total);
        deliveredCount += 1;
      }
      if (PENDING_ORDER_STATUSES.has(o.status)) pendingOrdersCount += 1;
    }

    let settledAmount = 0;
    let pendingSettlementAmount = 0;
    for (const s of settlements) {
      const amount = num(s.amount);
      if (SETTLED_STATUSES.has(s.status)) settledAmount += amount;
      else if (s.status === "pending") pendingSettlementAmount += amount;
    }
    const commissionPayable = Math.max(0, deliveredCommission - settledAmount);

    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockAlerts: SellerLowStockAlert[] = [];
    for (const row of inventoryRows) {
      const qty = num(row.quantity);
      const available = qty - num(row.reserved_quantity);
      const threshold = num(row.low_stock_threshold);
      if (available <= 0) {
        outOfStockCount += 1;
      } else if (qty > 0 && qty <= threshold) {
        lowStockCount += 1;
      }
      if (qty <= threshold) {
        const variant = row.product_variants;
        const product = variant?.products;
        lowStockAlerts.push({
          productName: pickLocalizedName(product?.name, variant?.sku ?? "Variant"),
          slug: product?.slug ?? "",
          variantSku: variant?.sku ?? "",
          qty,
          threshold,
          outOfStock: available <= 0,
        });
      }
    }
    lowStockAlerts.sort((a, b) => a.qty - b.qty);

    diagnostics.sort((a, b) => a.table.localeCompare(b.table));

    return {
      seller: { legalName: seller.legalName, storeId: seller.storeId, isOwner: seller.isOwner },
      currency: "DZD",
      kpis: {
        totalDeliveredSales,
        deliveredCount,
        ordersCount: orders.length,
        averageOrderValue: deliveredCount > 0 ? totalDeliveredSales / deliveredCount : 0,
        productsCount,
        lowStockCount,
        outOfStockCount,
        pendingOrdersCount,
        commissionPayable,
        netEarnings: totalDeliveredSales - commissionPayable,
        pendingSettlementAmount,
        settledAmount,
      },
      lowStockAlerts: lowStockAlerts.slice(0, 8),
      diagnostics,
    };
  });

/* -------------------------------- sales series ------------------------------- */

const seriesInput = z.object({ days: z.number().int().min(1).max(120).default(30) });

/**
 * Per-day { date, sales, orders } for the last `days` days (oldest -> newest).
 * - orders: count of this seller's non-cancelled seller_orders per day.
 * - sales: SUM(subtotal + shipping_total) of *delivered* orders per day.
 */
export const getSellerSalesSeries = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => seriesInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerSeriesPoint[]> => {
    const seller = await sellerGuard(context);
    const start = new Date();
    start.setDate(start.getDate() - (data.days - 1));
    start.setHours(0, 0, 0, 0);

    const { data: rows, error } = await context.supabase
      .from("seller_orders")
      .select("status,subtotal,shipping_total,created_at")
      .eq("seller_id", seller.sellerId)
      .neq("status", "cancelled")
      .gte("created_at", start.toISOString())
      .limit(AGG_LIMIT);
    if (error) throw new Error("Sales series could not be loaded.");

    const bucket = new Map<string, { sales: number; orders: number }>();
    const series: SellerSeriesPoint[] = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      bucket.set(key, { sales: 0, orders: 0 });
      series.push({ date: key, sales: 0, orders: 0 });
    }
    for (const o of rows ?? []) {
      const key = (o.created_at ?? "").slice(0, 10);
      const b = bucket.get(key);
      if (!b) continue;
      b.orders += 1;
      if (o.status === "delivered") b.sales += num(o.subtotal) + num(o.shipping_total);
    }
    for (const s of series) {
      const b = bucket.get(s.date);
      if (b) {
        s.sales = b.sales;
        s.orders = b.orders;
      }
    }
    return series;
  });

/* --------------------------------- top lists --------------------------------- */

const limitInput = z.object({ limit: z.number().int().min(1).max(25).default(5) });

function itemName(item: { title: unknown; product_snapshot: unknown }, fallback: string): string {
  const snap = (item.product_snapshot ?? {}) as Record<string, unknown>;
  return pickLocalizedName(item.title, "") || pickLocalizedName(snap["title"], "") || fallback;
}

/** Top products by revenue (SUM(order_items.total)) across this seller's non-cancelled seller_orders. */
export const getSellerTopProducts = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => limitInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerTopProduct[]> => {
    const seller = await sellerGuard(context);
    const { data: items, error } = await context.supabase
      .from("order_items")
      .select("product_id,title,product_snapshot,quantity,total,seller_orders!inner(id,seller_id,status)")
      .eq("seller_orders.seller_id", seller.sellerId)
      .neq("seller_orders.status", "cancelled")
      .limit(AGG_LIMIT);
    if (error) throw new Error("Top products could not be loaded.");

    const totals = new Map<string, { name: string; units: number; revenue: number }>();
    for (const item of (items ?? []) as SellerOrderItemRow[]) {
      if (!item.product_id) continue;
      const agg = totals.get(item.product_id) ?? {
        name: itemName(item, `Product ${item.product_id.slice(0, 8)}`),
        units: 0,
        revenue: 0,
      };
      agg.units += num(item.quantity);
      agg.revenue += num(item.total);
      totals.set(item.product_id, agg);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, data.limit)
      .map(([productId, agg]) => ({ productId, name: agg.name, units: agg.units, revenue: agg.revenue }));
  });

/** Top categories by revenue across this seller's non-cancelled seller_orders. */
export const getSellerTopCategories = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => limitInput.parse(data))
  .handler(async ({ data, context }): Promise<SellerTopCategory[]> => {
    const seller = await sellerGuard(context);
    const supabase = context.supabase;

    const [itemsResult, productsResult, categoriesResult] = await Promise.all([
      supabase
        .from("order_items")
        .select("product_id,quantity,total,seller_orders!inner(id,seller_id,status)")
        .eq("seller_orders.seller_id", seller.sellerId)
        .neq("seller_orders.status", "cancelled")
        .limit(AGG_LIMIT),
      supabase.from("products").select("id,category_id").eq("seller_id", seller.sellerId).limit(20000),
      supabase.from("categories").select("id,name,slug").limit(1000),
    ]);
    if (itemsResult.error) throw new Error("Top categories could not be loaded.");
    if (productsResult.error) throw new Error("Top categories could not be loaded.");
    if (categoriesResult.error) throw new Error("Top categories could not be loaded.");

    const productCategory = new Map<string, string | null>(
      ((productsResult.data ?? []) as ProductCategoryRow[]).map((p) => [p.id, p.category_id]),
    );
    const categoryNames = new Map<string, string>(
      ((categoriesResult.data ?? []) as CategoryLiteRow[]).map((c) => [
        c.id,
        pickLocalizedName(c.name, c.slug) || c.id.slice(0, 8),
      ]),
    );

    const totals = new Map<string, { units: number; revenue: number }>();
    for (const item of (itemsResult.data ?? []) as unknown as SellerOrderItemRow[]) {
      if (!item.product_id) continue;
      const categoryId = productCategory.get(item.product_id);
      if (!categoryId) continue;
      const agg = totals.get(categoryId) ?? { units: 0, revenue: 0 };
      agg.units += num(item.quantity);
      agg.revenue += num(item.total);
      totals.set(categoryId, agg);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, data.limit)
      .map(([categoryId, agg]) => ({
        categoryId,
        name: categoryNames.get(categoryId) ?? categoryId.slice(0, 8),
        units: agg.units,
        revenue: agg.revenue,
      }));
  });

/* ------------------------------- status breakdown ---------------------------- */

const SELLER_ORDER_STATUSES = [
  "pending",
  "accepted",
  "processing",
  "confirmed",
  "ready_for_shipping",
  "handed_to_courier",
  "in_transit",
  "fulfilled",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
  "failed_delivery",
] as const;

/** Exact per-status counts of this seller's seller_orders (statuses with zero rows are omitted). */
export const getSellerOrderStatusBreakdown = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }): Promise<SellerStatusCount[]> => {
    const seller = await sellerGuard(context);
    const counts = await Promise.all(
      SELLER_ORDER_STATUSES.map(async (status) => {
        const { count, error } = await context.supabase
          .from("seller_orders")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", seller.sellerId)
          .eq("status", status);
        if (error) throw new Error("Status breakdown could not be loaded.");
        return { status, count: count ?? 0 };
      }),
    );
    return counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
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
