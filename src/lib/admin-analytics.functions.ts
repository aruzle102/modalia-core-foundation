/**
 * MODALIA — Admin commerce analytics server functions (V10.1).
 *
 * Real financial analytics from the commerce tables (orders / seller_orders /
 * order_items) via SECURITY DEFINER RPCs. Commission ALWAYS comes from the
 * historical seller_orders.commission_total snapshot — never the current
 * sellers.commission_rate. Funnel behavior comes from analytics_events.
 *
 * Security: requireSupabaseAuth + assertAdminPermission("analytics.view")
 * on every function; the RPCs re-check is_super_admin() in the database
 * (fail closed).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminPermission } from "@/lib/admin-permissions";

const adminOnly = [requireSupabaseAuth] as const;

const rangeInput = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

const timeseriesInput = rangeInput.extend({
  granularity: z.enum(["day", "week"]).default("day"),
});

export interface CommerceOverview {
  orders_placed: number;
  orders_live: number;
  gmv: number;
  merchandise_subtotal: number;
  discounts: number;
  shipping_total: number;
  delivered_orders: number;
  cancelled_orders: number;
  returned_orders: number;
  active_orders: number;
  units_sold: number;
  aov: number;
  platform_commission: number;
  commission_pending: number;
  settled_commission: number | null;
  seller_net: number;
  visitors: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  checkout_completed: number;
  conversion_rate: number;
  cart_abandonment: number;
}

export interface TimeseriesBucket {
  bucket: string;
  gmv: number;
  orders_count: number;
  commission: number;
}

export interface SellerAnalyticsRow {
  seller_id: string;
  legal_name: string;
  email: string | null;
  commission_rate: number;
  orders_placed: number;
  gmv: number;
  units_sold: number;
  commission: number;
  seller_net: number;
  aov: number;
}

export interface CommissionBreakdownRow {
  seller_id: string;
  legal_name: string;
  month: string;
  sales: number;
  commission: number;
  order_count: number;
}

async function callRpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const rpc = client.rpc as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message?: string } | null }>;
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message ?? `${name} failed`);
  return (data ?? null) as T;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** Commerce overview KPIs for a date range. */
export const getCommerceOverview = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => rangeInput.parse(d))
  .handler(async ({ data, context }): Promise<CommerceOverview> => {
    await assertAdminPermission(context, "analytics.view");
    const raw = await callRpc<Record<string, unknown>>(
      (context as { supabase: SupabaseClient }).supabase,
      "admin_analytics_overview",
      { p_start: data.start, p_end: data.end },
    );
    return {
      orders_placed: num(raw['orders_placed']),
      orders_live: num(raw['orders_live']),
      gmv: num(raw['gmv']),
      merchandise_subtotal: num(raw['merchandise_subtotal']),
      discounts: num(raw['discounts']),
      shipping_total: num(raw['shipping_total']),
      delivered_orders: num(raw['delivered_orders']),
      cancelled_orders: num(raw['cancelled_orders']),
      returned_orders: num(raw['returned_orders']),
      active_orders: num(raw['active_orders']),
      units_sold: num(raw['units_sold']),
      aov: num(raw['aov']),
      platform_commission: num(raw['platform_commission']),
      commission_pending: num(raw['commission_pending']),
      settled_commission: raw['settled_commission'] == null ? null : num(raw['settled_commission']),
      seller_net: num(raw['seller_net']),
      visitors: num(raw['visitors']),
      product_views: num(raw['product_views']),
      add_to_cart: num(raw['add_to_cart']),
      checkout_started: num(raw['checkout_started']),
      checkout_completed: num(raw['checkout_completed']),
      conversion_rate: num(raw['conversion_rate']),
      cart_abandonment: num(raw['cart_abandonment']),
    };
  });

/** Sales/orders/commission per day or week. */
export const getCommerceTimeseries = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => timeseriesInput.parse(d))
  .handler(async ({ data, context }): Promise<TimeseriesBucket[]> => {
    await assertAdminPermission(context, "analytics.view");
    const rows = await callRpc<Record<string, unknown>[]>(
      (context as { supabase: SupabaseClient }).supabase,
      "admin_analytics_timeseries",
      { p_start: data.start, p_end: data.end, p_granularity: data.granularity },
    );
    return (rows ?? []).map((r) => ({
      bucket: String(r['bucket']),
      gmv: num(r['gmv']),
      orders_count: num(r['orders_count']),
      commission: num(r['commission']),
    }));
  });

/** Per-seller analytics for a date range. */
export const getCommerceBySeller = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => rangeInput.parse(d))
  .handler(async ({ data, context }): Promise<SellerAnalyticsRow[]> => {
    await assertAdminPermission(context, "analytics.view");
    const rows = await callRpc<Record<string, unknown>[]>(
      (context as { supabase: SupabaseClient }).supabase,
      "admin_analytics_by_seller",
      { p_start: data.start, p_end: data.end },
    );
    return (rows ?? []).map((r) => ({
      seller_id: String(r['seller_id']),
      legal_name: String(r['legal_name'] ?? ""),
      email: r['email'] == null ? null : String(r['email']),
      commission_rate: num(r['commission_rate']),
      orders_placed: num(r['orders_placed']),
      gmv: num(r['gmv']),
      units_sold: num(r['units_sold']),
      commission: num(r['commission']),
      seller_net: num(r['seller_net']),
      aov: num(r['aov']),
    }));
  });

/** Commission by seller per month (eligible orders only). */
export const getCommissionBreakdown = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((d) => rangeInput.parse(d))
  .handler(async ({ data, context }): Promise<CommissionBreakdownRow[]> => {
    await assertAdminPermission(context, "analytics.view");
    const rows = await callRpc<Record<string, unknown>[]>(
      (context as { supabase: SupabaseClient }).supabase,
      "admin_commission_breakdown",
      { p_start: data.start, p_end: data.end },
    );
    return (rows ?? []).map((r) => ({
      seller_id: String(r['seller_id']),
      legal_name: String(r['legal_name'] ?? ""),
      month: String(r['month']),
      sales: num(r['sales']),
      commission: num(r['commission']),
      order_count: num(r['order_count']),
    }));
  });
