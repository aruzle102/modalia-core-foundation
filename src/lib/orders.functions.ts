import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateLimitEndpoint } from "@/lib/rate-limit";

type LocalizedText = Json;

export type CustomerOrderCard = { id: string; orderNumber: string; createdAt: string; itemCount: number; total: number; currency: string; status: string };
export type CustomerOrderDetail = CustomerOrderCard & { subtotal: number; shippingTotal: number; deliveryMethod: string | null; paymentMethod: string; paymentStatus: string; firstName: string | null; lastName: string | null; phone: string | null; address: Json; items: { id: string; title: string; sku: string | null; quantity: number; unitPrice: number; total: number; imagePath: string | null; options: Json }[] };
export type SellerOrderCard = { id: string; orderNumber: string; createdAt: string; customerName: string; itemCount: number; total: number; shippingTotal: number; status: string; deliveryMethod: string | null };

function localized(value: LocalizedText, fallback: string) {
  if (!value || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  const label = record["fr"] ?? record["en"] ?? record["ar"];
  return typeof label === "string" ? label : fallback;
}

const pageInput = z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().min(1).max(20).default(10) });

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => pageInput.parse(data))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const customerResult = await context.supabase.from("customers").select("id").eq("profile_id", context.userId).maybeSingle();
    if (customerResult.error) throw new Error("Your orders could not be loaded.");
    if (!customerResult.data) return { orders: [] as CustomerOrderCard[], page: data.page, hasMore: false };
    const ordersResult = await context.supabase.from("orders").select("id,order_number,created_at,grand_total,currency,status,seller_orders(order_items(id))").eq("customer_id", customerResult.data.id).order("created_at", { ascending: false }).range(from, from + data.pageSize);
    if (ordersResult.error) throw new Error("Your orders could not be loaded.");
    const records = ordersResult.data ?? [];
    const orders = records.slice(0, data.pageSize).map((order) => ({ id: order.id, orderNumber: order.order_number, createdAt: order.created_at, itemCount: (order.seller_orders ?? []).reduce((sum, sellerOrder) => sum + (sellerOrder.order_items?.length ?? 0), 0), total: Number(order.grand_total), currency: order.currency, status: order.status }));
    return { orders, page: data.page, hasMore: records.length > data.pageSize };
  });

export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from("orders").select("id,order_number,created_at,subtotal,shipping_total,grand_total,currency,status,delivery_method,payment_method,payment_status,first_name,last_name,guest_phone,address_snapshot,seller_orders(order_items(id,title,sku,quantity,unit_price,total,image_path,option_snapshot))").eq("id", data.orderId).maybeSingle();
    if (result.error) throw new Error("This order could not be loaded.");
    if (!result.data) return null;
    const items = (result.data.seller_orders ?? []).flatMap((sellerOrder) => sellerOrder.order_items ?? []).map((item) => ({ id: item.id, title: localized(item.title, "Product"), sku: item.sku, quantity: item.quantity, unitPrice: Number(item.unit_price), total: Number(item.total), imagePath: item.image_path, options: item.option_snapshot }));
    return { id: result.data.id, orderNumber: result.data.order_number, createdAt: result.data.created_at, itemCount: items.length, total: Number(result.data.grand_total), currency: result.data.currency, status: result.data.status, subtotal: Number(result.data.subtotal), shippingTotal: Number(result.data.shipping_total), deliveryMethod: result.data.delivery_method, paymentMethod: result.data.payment_method, paymentStatus: result.data.payment_status, firstName: result.data.first_name, lastName: result.data.last_name, phone: result.data.guest_phone, address: result.data.address_snapshot, items } satisfies CustomerOrderDetail;
  });

export const getOrderConfirmation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ orderNumber: z.string().regex(/^ORD-[A-Z0-9]{6}$/) }).parse(data))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from("orders").select("order_number,grand_total,currency,delivery_method,address_snapshot").eq("order_number", data.orderNumber).maybeSingle();
    if (result.error || !result.data) return null;
    return { orderNumber: result.data.order_number, total: Number(result.data.grand_total), currency: result.data.currency, deliveryMethod: result.data.delivery_method, address: result.data.address_snapshot };
  });

export const trackGuestOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ orderNumber: z.string().trim().toUpperCase().regex(/^ORD-[A-Z0-9]{6}$/), phone: z.string().trim().regex(/^\+213[5-7][0-9]{8}$/) }).parse(data))
  .handler(async ({ data }) => {
    rateLimitEndpoint("trackGuestOrder", 30);
    // NOTE: the anonymous key has no SELECT policy on `orders`, so an anon
    // client can never read rows. Use the service-role client server-side and
    // re-scope with the caller-supplied order number + checkout phone (both
    // validated above) — the same pattern guest checkout uses.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.from("orders").select("order_number,created_at,status,grand_total,currency,delivery_method,seller_orders(status,stores(name))").eq("order_number", data.orderNumber).eq("guest_phone", data.phone).maybeSingle();
    if (result.error || !result.data) return null;
    const sellerOrders = (result.data.seller_orders ?? []).map((sellerOrder: any) => ({ status: sellerOrder.status, storeName: Array.isArray(sellerOrder.stores) ? sellerOrder.stores[0]?.name ?? "Store" : sellerOrder.stores?.name ?? "Store" }));
    return { orderNumber: result.data.order_number, createdAt: result.data.created_at, status: result.data.status, total: Number(result.data.grand_total), currency: result.data.currency, deliveryMethod: result.data.delivery_method, sellerOrders };
  });