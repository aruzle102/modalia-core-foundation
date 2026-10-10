/**
 * MODALIA — Admin Store Control Center server functions.
 *
 * Tabbed workspace data for /admin/stores/$storeId:
 *  - getStoreDetail      full store profile + stats (delegates to getStoreProfile)
 *  - getStoreProducts    all products of the store's seller
 *  - getStoreOrders      recent seller_orders of the store's seller
 *  - getStoreFinance     aggregated commerce numbers from seller_orders
 *  - sendStoreNotification  admin message to the seller's team + audit entry
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminPermission } from "@/lib/admin-permissions";
import { getStoreProfile } from "@/lib/admin-stores.functions";
import type { Json } from "@/integrations/supabase/types";

const adminOnly = [requireSupabaseAuth] as const;

/* ------------------------------------------------------------------ */
/* Store detail (overview tab)                                         */
/* ------------------------------------------------------------------ */

/**
 * Full store profile + stats for the control center overview tab.
 * Delegates to the existing getStoreProfile (identity, seller, catalog,
 * orders, sales, reviews, offers, collections, appearance, activity).
 */
export const getStoreDetail = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "stores.view");
    return getStoreProfile({ data: { storeId: data.storeId } });
  });

/* ------------------------------------------------------------------ */
/* Store products tab                                                  */
/* ------------------------------------------------------------------ */

export type StoreProductRow = {
  id: string;
  slug: string;
  name: Json;
  base_price: number | null;
  status: string | null;
  moderation_status: string | null;
  moderation_reason: string | null;
  visibility: string | null;
  publication_status: string | null;
  created_at: string;
};

/** Every product belonging to the store's seller (no pagination — store-scoped). */
export const getStoreProducts = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ sellerId: string; products: StoreProductRow[] }> => {
    await assertAdminPermission(context, "products.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id,seller_id")
      .eq("id", data.storeId)
      .single();
    if (storeError || !store?.seller_id) throw new Error("Store not found.");

    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .select(
        "id,slug,name,base_price,status,moderation_status,moderation_reason,visibility,publication_status,created_at",
      )
      .eq("seller_id", store.seller_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { sellerId: store.seller_id as string, products: (rows ?? []) as StoreProductRow[] };
  });

/* ------------------------------------------------------------------ */
/* Store orders tab                                                    */
/* ------------------------------------------------------------------ */

export type StoreOrderRow = {
  id: string;
  order_id: string;
  order_number: string | null;
  status: string | null;
  subtotal: number | null;
  commission_total: number | null;
  created_at: string;
};

/** Recent seller_orders of the store's seller with parent order numbers. */
export const getStoreOrders = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({ storeId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(50) })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ orders: StoreOrderRow[] }> => {
    await assertAdminPermission(context, "orders.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id,seller_id")
      .eq("id", data.storeId)
      .single();
    if (storeError || !store?.seller_id) throw new Error("Store not found.");

    const { data: rows, error } = await supabaseAdmin
      .from("seller_orders")
      .select("id,order_id,status,subtotal,commission_total,created_at,orders(order_number)")
      .eq("seller_id", store.seller_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    return {
      orders: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        order_id: r.order_id as string,
        order_number: (r.orders as { order_number?: string } | null)?.order_number ?? null,
        status: (r.status ?? null) as string | null,
        subtotal: (r.subtotal ?? null) as number | null,
        commission_total: (r.commission_total ?? null) as number | null,
        created_at: r.created_at as string,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Store finance tab                                                   */
/* ------------------------------------------------------------------ */

export type StoreFinance = {
  grossSales: number;
  commissionEarned: number;
  sellerNet: number;
  pendingSales: number;
  pendingCommission: number;
  orderCount: number;
  deliveredCount: number;
};

const SETTLED_STATUSES = new Set(["delivered"]);
const VOID_STATUSES = new Set(["cancelled", "returned", "refunded"]);

/** Commerce aggregates computed from real seller_orders rows. */
export const getStoreFinance = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<StoreFinance> => {
    await assertAdminPermission(context, "stores.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id,seller_id")
      .eq("id", data.storeId)
      .single();
    if (storeError || !store?.seller_id) throw new Error("Store not found.");

    const { data: rows, error } = await supabaseAdmin
      .from("seller_orders")
      .select("subtotal,commission_total,status")
      .eq("seller_id", store.seller_id)
      .limit(5000);
    if (error) throw new Error(error.message);

    const finance: StoreFinance = {
      grossSales: 0,
      commissionEarned: 0,
      sellerNet: 0,
      pendingSales: 0,
      pendingCommission: 0,
      orderCount: rows?.length ?? 0,
      deliveredCount: 0,
    };
    for (const r of rows ?? []) {
      const subtotal = Number(r.subtotal ?? 0);
      const commission = Number(r.commission_total ?? 0);
      const status = String(r.status ?? "");
      if (SETTLED_STATUSES.has(status)) {
        finance.grossSales += subtotal;
        finance.commissionEarned += commission;
        finance.deliveredCount += 1;
      } else if (!VOID_STATUSES.has(status)) {
        finance.pendingSales += subtotal;
        finance.pendingCommission += commission;
      }
    }
    finance.sellerNet = finance.grossSales - finance.commissionEarned;
    return finance;
  });

/* ------------------------------------------------------------------ */
/* Store analytics tab                                                 */
/* ------------------------------------------------------------------ */

export type StoreSalesPoint = { date: string; orders: number; sales: number };
export type StoreTopProduct = {
  product_id: string;
  title: Json;
  units: number;
  revenue: number;
};

/**
 * Daily delivered-sales series + top products by revenue for the
 * store's seller. Aggregated server-side from seller_orders/order_items.
 */
export const getStoreAnalytics = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        storeId: z.string().uuid(),
        days: z.number().int().min(7).max(365).default(30),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ series: StoreSalesPoint[]; topProducts: StoreTopProduct[] }> => {
    await assertAdminPermission(context, "stores.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id,seller_id")
      .eq("id", data.storeId)
      .single();
    if (storeError || !store?.seller_id) throw new Error("Store not found.");
    const sellerId = store.seller_id as string;

    const since = new Date();
    since.setDate(since.getDate() - (data.days - 1));
    since.setHours(0, 0, 0, 0);

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("seller_orders")
      .select("id,status,subtotal,created_at")
      .eq("seller_id", sellerId)
      .gte("created_at", since.toISOString())
      .limit(5000);
    if (ordersError) throw new Error(ordersError.message);

    const buckets = new Map<string, { orders: number; sales: number }>();
    for (let i = 0; i < data.days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), { orders: 0, sales: 0 });
    }
    const orderIds: string[] = [];
    for (const o of orders ?? []) {
      const key = String(o.created_at).slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.orders += 1;
      if (o.status === "delivered") bucket.sales += Number(o.subtotal ?? 0);
      orderIds.push(o.id as string);
    }

    let topProducts: StoreTopProduct[] = [];
    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabaseAdmin
        .from("order_items")
        .select("product_id,title,quantity,total")
        .in("seller_order_id", orderIds)
        .limit(5000);
      if (itemsError) throw new Error(itemsError.message);
      const byProduct = new Map<string, { title: Json; units: number; revenue: number }>();
      for (const it of items ?? []) {
        const pid = (it.product_id ?? "unknown") as string;
        const entry = byProduct.get(pid) ?? { title: it.title as Json, units: 0, revenue: 0 };
        entry.units += Number(it.quantity ?? 0);
        entry.revenue += Number(it.total ?? 0);
        byProduct.set(pid, entry);
      }
      topProducts = [...byProduct.entries()]
        .map(([product_id, v]) => ({ product_id, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
    }

    return {
      series: [...buckets.entries()].map(([date, v]) => ({ date, orders: v.orders, sales: v.sales })),
      topProducts,
    };
  });

/* ------------------------------------------------------------------ */
/* Store notifications tab                                             */
/* ------------------------------------------------------------------ */

/**
 * Send a free-form admin message to the store seller's team.
 * Visible in the seller's notification center. Audited.
 */
export const sendStoreNotification = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        storeId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        message: z.string().trim().min(1).max(2000),
        link: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertAdminPermission(context, "stores.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id,name,seller_id")
      .eq("id", data.storeId)
      .single();
    if (storeError || !store?.seller_id) throw new Error("Store not found.");

    const localized = { ar: data.title, fr: data.title, en: data.title };
    const localizedBody = { ar: data.message, fr: data.message, en: data.message };

    const { error: notifError } = await supabaseAdmin.from("notifications").insert({
      seller_id: store.seller_id,
      user_id: null,
      is_admin: false,
      type: "admin_message",
      title: localized,
      body: localizedBody,
      payload: { store_id: store.id, store_name: (store as { name?: string }).name ?? null },
      link: data.link?.trim() || null,
    });
    if (notifError) throw new Error(notifError.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "store_notification_sent",
      resource: "store",
      resource_id: store.id,
      metadata: { title: data.title },
    });

    return { ok: true };
  });
