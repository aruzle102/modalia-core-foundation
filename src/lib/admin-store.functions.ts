import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { assertAdminPermission } from "@/lib/admin-permissions";
import { emitSellerNotification } from "@/lib/notifications.functions";

const adminOnly = [requireSupabaseAuth] as const;
const storeIdSchema = z.object({ storeId: z.string().uuid() });

export type StoreProductRow = { id: string; name: Json; base_price: number | null; moderation_reason: string | null; moderation_status: string | null; status: string | null; visibility: string | null };
export type StoreOrderRow = { id: string; order_id: string; order_number: string | null; status: string | null; subtotal: number | null; commission_total: number | null; created_at: string };

async function getStoreOrThrow(storeId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: store, error } = await supabaseAdmin.from("stores").select("id,seller_id").eq("id", storeId).maybeSingle();
  if (error || !store) throw new Error("Store not found.");
  return { supabaseAdmin, store };
}

export const getStoreAnalytics = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => storeIdSchema.extend({ days: z.number().int().min(1).max(365).default(30) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "stores.view");
    const { supabaseAdmin, store } = await getStoreOrThrow(data.storeId);
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: orders, error } = await supabaseAdmin.from("seller_orders").select("id,subtotal,status,created_at").eq("seller_id", store.seller_id).gte("created_at", since).limit(5000);
    if (error) throw new Error(error.message);
    const byDay = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders ?? []) {
      const entry = byDay.get(order.created_at.slice(0, 10)) ?? { revenue: 0, orders: 0 };
      if (order.status === "delivered" || order.status === "fulfilled") { entry.revenue += Number(order.subtotal ?? 0); entry.orders += 1; }
      byDay.set(order.created_at.slice(0, 10), entry);
    }
    const deliveredIds = (orders ?? []).filter((order) => order.status === "delivered" || order.status === "fulfilled").map((order) => order.id);
    const { data: items } = deliveredIds.length ? await supabaseAdmin.from("order_items").select("product_id,quantity,total,products(name)").in("seller_order_id", deliveredIds).limit(5000) : { data: [] };
    const top = new Map<string, { product_id: string; title: Json; units: number; revenue: number }>();
    for (const item of items ?? []) {
      const productId = item.product_id ?? "unknown";
      const entry = top.get(productId) ?? { product_id: productId, title: (item.products as { name?: Json } | null)?.name ?? {}, units: 0, revenue: 0 };
      entry.units += Number(item.quantity ?? 0); entry.revenue += Number(item.total ?? 0); top.set(productId, entry);
    }
    return { series: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })), topProducts: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10) };
  });

export const getStoreProducts = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => storeIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ products: StoreProductRow[] }> => {
    await assertAdminPermission(context, "stores.view");
    const { supabaseAdmin, store } = await getStoreOrThrow(data.storeId);
    const { data: products, error } = await supabaseAdmin.from("products").select("id,name,base_price,moderation_reason,moderation_status,status,visibility").eq("seller_id", store.seller_id).order("created_at", { ascending: false }).limit(250);
    if (error) throw new Error(error.message);
    return { products: (products ?? []) as StoreProductRow[] };
  });

export const getStoreOrders = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => storeIdSchema.extend({ limit: z.number().int().min(1).max(100).default(50) }).parse(data))
  .handler(async ({ data, context }): Promise<{ orders: StoreOrderRow[] }> => {
    await assertAdminPermission(context, "stores.view");
    const { supabaseAdmin, store } = await getStoreOrThrow(data.storeId);
    const { data: rows, error } = await supabaseAdmin.from("seller_orders").select("id,order_id,status,subtotal,commission_total,created_at,orders(order_number)").eq("seller_id", store.seller_id).order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return { orders: (rows ?? []).map((row) => ({ id: row.id, order_id: row.order_id, order_number: (row.orders as { order_number?: string } | null)?.order_number ?? null, status: row.status, subtotal: row.subtotal, commission_total: row.commission_total, created_at: row.created_at })) };
  });

export const getStoreFinance = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => storeIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "stores.view");
    const { supabaseAdmin, store } = await getStoreOrThrow(data.storeId);
    const { data: rows, error } = await supabaseAdmin.from("seller_orders").select("status,subtotal,commission_total").eq("seller_id", store.seller_id).limit(5000);
    if (error) throw new Error(error.message);
    let grossSales = 0, commissionEarned = 0, pendingSales = 0, pendingCommission = 0, deliveredCount = 0;
    for (const row of rows ?? []) {
      const subtotal = Number(row.subtotal ?? 0), commission = Number(row.commission_total ?? 0);
      if (row.status === "delivered" || row.status === "fulfilled") { grossSales += subtotal; commissionEarned += commission; deliveredCount += 1; }
      else if (!["cancelled", "returned", "refunded"].includes(row.status)) { pendingSales += subtotal; pendingCommission += commission; }
    }
    return { grossSales, commissionEarned, sellerNet: grossSales - commissionEarned, pendingSales, pendingCommission, deliveredCount, orderCount: rows?.length ?? 0 };
  });

export const sendStoreNotification = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => storeIdSchema.extend({ title: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(1000), link: z.string().trim().max(500).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "stores.manage");
    const { store } = await getStoreOrThrow(data.storeId);
    const sent = await emitSellerNotification(store.seller_id, { type: "store_status_changed", params: { status: data.title, message: data.message }, link: data.link || "/seller/notifications", payload: { store_id: data.storeId, message: data.message } });
    return { ok: sent };
  });