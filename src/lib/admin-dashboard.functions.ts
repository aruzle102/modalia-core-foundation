import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminPermission } from "@/lib/admin-permissions";

const adminOnly = [requireSupabaseAuth] as const;

export type TableDiagnostic = { table: string; ok: boolean; message?: string };

/**
 * One bounded dashboard query with a recorded diagnostic entry, so a single
 * failing table never takes down the whole metrics page. Rows are cast to the
 * declared row shape T; every row query carries an explicit limit.
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

function pickName(name: Record<string, string> | null | undefined, fallback: string): string {
  if (!name) return fallback;
  return name["fr"] ?? name["en"] ?? name["ar"] ?? fallback;
}

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type OrderAggRow = { id: string; status: string; grand_total: number | string; created_at: string };
type RecentOrderRow = { id: string; order_number: string; first_name: string | null; last_name: string | null; grand_total: number | string; status: string; created_at: string };
type SellerOrderRow = { id: string; seller_id: string; status: string; commission_total: number | string; subtotal: number | string };
type SettlementRow = { id: string; seller_id: string; amount: number | string; status: string; period_start: string | null; period_end: string | null; created_at: string; payment_reference: string | null };
type InventoryRow = { id: string; quantity: number; low_stock_threshold: number; variant_id: string };
type InventoryAlertRow = {
  id: string; quantity: number; low_stock_threshold: number; variant_id: string;
  product_variants: { id: string; sku: string; product_id: string; products: { id: string; slug: string; name: Record<string, string> | null } | null } | null;
};
type OrderItemRow = { product_id: string | null; quantity: number; total: number | string };
type ProductLiteRow = { id: string; slug: string; name: Record<string, string> | null; category_id: string | null };
type CategoryLiteRow = { id: string; name: Record<string, string> | null; slug: string };
type SellerLiteRow = { id: string; legal_name: string };
type StoreLiteRow = { id: string; seller_id: string; name: string };

export type AdminMetricsResult = {
  metrics: {
    /** Total parent orders, all statuses. */
    ordersTotal: number;
    /** SUM(grand_total) of all parent orders with status='delivered', all time (bounded fetch). */
    salesDelivered: number;
    /** SUM(seller_orders.commission_total) where seller_order status IN ('delivered','fulfilled'). */
    commissionPayable: number;
    /** seller_settlements with status='pending'. */
    pendingSettlementsCount: number;
    pendingSettlementsAmount: number;
    /** sellers.account_status='active'. */
    activeSellers: number;
    /** seller_applications.status='pending'. */
    pendingApplications: number;
    /** All products, any moderation status. */
    productsTotal: number;
    /** products.moderation_status NOT IN ('approved'). */
    pendingModeration: number;
    /** inventory rows with 0 < quantity <= low_stock_threshold. */
    lowStock: number;
    /** inventory rows with quantity <= 0. */
    outOfStock: number;
    /** order_returns count, all statuses. */
    returnsCount: number;
    /** parent orders with status='cancelled'. */
    cancelledCount: number;
    /** parent orders with status='failed_delivery'. */
    failedDeliveryCount: number;
  };
  /** Last 30 days (oldest -> newest): { date: 'YYYY-MM-DD', orders, sales }. sales = delivered orders' grand_total per day. */
  series: { date: string; orders: number; sales: number }[];
  topProducts: { productId: string; label: string; slug: string; qty: number; hint?: string }[];
  topSellers: { sellerId: string; label: string; orders: number; total: number; hint?: string }[];
  topCategories: { categoryId: string; label: string; value: string; hint?: string }[];
  statusBreakdown: { status: string; count: number }[];
  recentOrders: { id: string; orderNumber: string; customer: string; total: number; status: string; createdAt: string }[];
  pendingSettlements: { id: string; sellerName: string; amount: number; periodStart: string | null; periodEnd: string | null; createdAt: string; paymentReference: string | null }[];
  lowStock: { productName: string; slug: string; variantSku: string; qty: number; threshold: number; outOfStock: boolean }[];
  diagnostics: TableDiagnostic[];
};

const ORDER_STATUSES = [
  "pending", "confirmed", "processing", "preparing", "ready_for_shipping", "handed_to_courier",
  "in_transit", "shipped", "received", "delivered", "cancelled", "returned", "refunded", "failed_delivery",
] as const;

const WINDOW_DAYS = 30;
const AGG_LIMIT = 50000;

export const getAdminMetrics = createServerFn({ method: "GET" }).middleware(adminOnly).handler(async ({ context }): Promise<AdminMetricsResult> => {
  await assertAdminPermission(context, "dashboard.view");
  const supabase = context.supabase;
  const diagnostics: TableDiagnostic[] = [];

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1));
  windowStart.setHours(0, 0, 0, 0);
  const windowStartIso = windowStart.toISOString();

  const [
    statusCounts,
    deliveredAgg,
    windowOrders,
    commissionRows,
    pendingSettlementsRows,
    pendingSettlementsCount,
    activeSellers,
    pendingApplications,
    productsTotal,
    pendingModeration,
    returnsCount,
    inventoryRows,
    inventoryAlerts,
    orderItems,
    productsLite,
    categories,
    sellersLite,
    recentOrdersRows,
    storesLite,
  ] = await Promise.all([
    // 0: exact per-status parent-order counts (14 parallel head queries)
    Promise.all(
      ORDER_STATUSES.map((status) =>
        countRows(`orders:status=${status}`, diagnostics, supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", status)),
      ),
    ),
    // 1: all-time delivered sales (bounded)
    fetchTable<OrderAggRow>("orders:delivered_sales", diagnostics, supabase.from("orders").select("id,status,grand_total,created_at").eq("status", "delivered").limit(AGG_LIMIT)),
    // 2: 30-day window orders for the time series (bounded)
    fetchTable<OrderAggRow>("orders:window_30d", diagnostics, supabase.from("orders").select("id,status,grand_total,created_at").gte("created_at", windowStartIso).limit(AGG_LIMIT)),
    // 3: commission payable = seller_orders delivered/fulfilled (bounded).
    // Also reused for top sellers (was an identical duplicate query).
    fetchTable<SellerOrderRow>("seller_orders:commission", diagnostics, supabase.from("seller_orders").select("id,seller_id,status,commission_total,subtotal").in("status", ["delivered", "fulfilled"]).limit(AGG_LIMIT)),
    // 5: pending settlements list (bounded, latest 100)
    fetchTable<SettlementRow>("seller_settlements:pending", diagnostics, supabase.from("seller_settlements").select("id,seller_id,amount,status,period_start,period_end,created_at,payment_reference").eq("status", "pending").order("created_at", { ascending: false }).limit(100)),
    // 6: pending settlements count (exact)
    countRows("seller_settlements:pending_count", diagnostics, supabase.from("seller_settlements").select("*", { count: "exact", head: true }).eq("status", "pending")),
    // 7: active sellers (exact)
    countRows("sellers:active", diagnostics, supabase.from("sellers").select("*", { count: "exact", head: true }).eq("account_status", "active")),
    // 8: pending seller applications (exact)
    countRows("seller_applications:pending", diagnostics, supabase.from("seller_applications").select("*", { count: "exact", head: true }).eq("status", "pending")),
    // 9: products total (exact)
    countRows("products:total", diagnostics, supabase.from("products").select("*", { count: "exact", head: true })),
    // 10: products awaiting moderation = moderation_status NOT 'approved' (exact)
    countRows("products:pending_moderation", diagnostics, supabase.from("products").select("*", { count: "exact", head: true }).not("moderation_status", "eq", "approved")),
    // 11: returns count (exact)
    countRows("order_returns:total", diagnostics, supabase.from("order_returns").select("*", { count: "exact", head: true })),
    // 12: inventory levels for low/out-of-stock counts (bounded)
    fetchTable<InventoryRow>("inventory:levels", diagnostics, supabase.from("inventory").select("id,quantity,low_stock_threshold,variant_id").limit(AGG_LIMIT)),
    // 13: low-stock alerts with variant + product labels (bounded)
    fetchTable<InventoryAlertRow>("inventory:alerts", diagnostics, supabase.from("inventory").select("id,quantity,low_stock_threshold,variant_id,product_variants(id,sku,product_id,products(id,slug,name))").limit(500)),
    // 14: order items for top products (bounded)
    fetchTable<OrderItemRow>("order_items:top_products", diagnostics, supabase.from("order_items").select("product_id,quantity,total").limit(AGG_LIMIT)),
    // 15: product labels (bounded)
    fetchTable<ProductLiteRow>("products:labels", diagnostics, supabase.from("products").select("id,slug,name,category_id").limit(20000)),
    // 16: categories for top categories (bounded)
    fetchTable<CategoryLiteRow>("categories:labels", diagnostics, supabase.from("categories").select("id,name,slug").limit(1000)),
    // 17: seller labels (bounded)
    fetchTable<SellerLiteRow>("sellers:labels", diagnostics, supabase.from("sellers").select("id,legal_name").limit(5000)),
    // 18: 8 latest parent orders
    fetchTable<RecentOrderRow>("orders:recent", diagnostics, supabase.from("orders").select("id,order_number,first_name,last_name,grand_total,status,created_at").order("created_at", { ascending: false }).limit(8)),
    // 19: store labels so "top stores" shows real store names (bounded)
    fetchTable<StoreLiteRow>("stores:labels", diagnostics, supabase.from("stores").select("id,seller_id,name").limit(5000)),
  ]);

  const statusMap = new Map<string, number>(ORDER_STATUSES.map((s, i) => [s, statusCounts[i] ?? 0]));
  const ordersTotal = [...statusMap.values()].reduce((a, b) => a + b, 0);
  const salesDelivered = deliveredAgg.reduce((sum, o) => sum + num(o.grand_total), 0);
  const commissionPayable = commissionRows.reduce((sum, o) => sum + num(o.commission_total), 0);
  const pendingSettlementsAmount = pendingSettlementsRows.reduce((sum, s) => sum + num(s.amount), 0);

  // 30-day series (oldest -> newest)
  const series: { date: string; orders: number; sales: number }[] = [];
  const bucket = new Map<string, { orders: number; sales: number }>();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    bucket.set(key, { orders: 0, sales: 0 });
    series.push({ date: key, orders: 0, sales: 0 });
  }
  for (const o of windowOrders) {
    const key = (o.created_at ?? "").slice(0, 10);
    const b = bucket.get(key);
    if (!b) continue;
    b.orders += 1;
    if (o.status === "delivered") b.sales += num(o.grand_total);
  }
  for (const s of series) {
    const b = bucket.get(s.date);
    if (b) { s.orders = b.orders; s.sales = b.sales; }
  }

  // Inventory: low = 0 < qty <= threshold; out = qty <= 0
  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const row of inventoryRows) {
    const q = num(row.quantity);
    if (q <= 0) outOfStockCount += 1;
    else if (q <= num(row.low_stock_threshold)) lowStockCount += 1;
  }
  const lowStock = inventoryAlerts
    .filter((row) => num(row.quantity) <= num(row.low_stock_threshold))
    .map((row) => {
      const variant = row.product_variants;
      const product = variant?.products;
      const qty = num(row.quantity);
      return {
        productName: pickName(product?.name, variant?.sku ?? row.variant_id),
        slug: product?.slug ?? "",
        variantSku: variant?.sku ?? row.variant_id,
        qty,
        threshold: num(row.low_stock_threshold),
        outOfStock: qty <= 0,
      };
    })
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 12);

  // Top products by order_items total (bounded aggregate)
  const productLabels = new Map(productsLite.map((p) => [p.id, p]));
  const productTotals = new Map<string, { qty: number; total: number }>();
  for (const item of orderItems) {
    if (!item.product_id) continue;
    const agg = productTotals.get(item.product_id) ?? { qty: 0, total: 0 };
    agg.qty += num(item.quantity);
    agg.total += num(item.total);
    productTotals.set(item.product_id, agg);
  }
  const topProducts = [...productTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([productId, agg]) => {
      const p = productLabels.get(productId);
      return {
        productId,
        label: pickName(p?.name, p?.slug ?? productId.slice(0, 8)),
        slug: p?.slug ?? "",
        qty: agg.qty,
      };
    });

  // Top stores by delivered seller_orders subtotal (real store names; the
  // dashboard section is honestly titled "Top stores").
  const sellerLabels = new Map(sellersLite.map((s) => [s.id, s.legal_name]));
  const storeNameBySeller = new Map(storesLite.map((st) => [st.seller_id, st.name]));
  const sellerTotals = new Map<string, number>();
  for (const so of commissionRows) {
    sellerTotals.set(so.seller_id, (sellerTotals.get(so.seller_id) ?? 0) + num(so.subtotal));
  }
  const topSellers = [...sellerTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sellerId, total]) => ({
      sellerId,
      label: storeNameBySeller.get(sellerId) ?? sellerLabels.get(sellerId) ?? sellerId.slice(0, 8),
      orders: commissionRows.filter((so) => so.seller_id === sellerId).length,
      total,
    }));

  // Top categories by product count
  const categoryLabels = new Map(categories.map((c) => [c.id, c]));
  const categoryCounts = new Map<string, number>();
  for (const p of productsLite) {
    if (!p.category_id) continue;
    categoryCounts.set(p.category_id, (categoryCounts.get(p.category_id) ?? 0) + 1);
  }
  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([categoryId, count]) => {
      const c = categoryLabels.get(categoryId);
      return {
        categoryId,
        label: pickName(c?.name, c?.slug ?? categoryId.slice(0, 8)),
        value: `${count} products`,
      };
    });

  const statusBreakdown = [...statusMap.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }));

  const recentOrders = recentOrdersRows.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customer: `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() || "Guest",
    total: num(o.grand_total),
    status: o.status,
    createdAt: o.created_at,
  }));

  const pendingSettlements = pendingSettlementsRows.map((s) => ({
    id: s.id,
    sellerName: sellerLabels.get(s.seller_id) ?? s.seller_id.slice(0, 8),
    amount: num(s.amount),
    periodStart: s.period_start,
    periodEnd: s.period_end,
    createdAt: s.created_at,
    paymentReference: s.payment_reference,
  }));

  diagnostics.sort((a, b) => a.table.localeCompare(b.table));

  return {
    metrics: {
      ordersTotal,
      salesDelivered,
      commissionPayable,
      pendingSettlementsCount,
      pendingSettlementsAmount,
      activeSellers,
      pendingApplications,
      productsTotal,
      pendingModeration,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
      returnsCount,
      cancelledCount: statusMap.get("cancelled") ?? 0,
      failedDeliveryCount: statusMap.get("failed_delivery") ?? 0,
    },
    series,
    topProducts,
    topSellers,
    topCategories,
    statusBreakdown,
    recentOrders,
    pendingSettlements,
    lowStock,
    diagnostics,
  };
});
