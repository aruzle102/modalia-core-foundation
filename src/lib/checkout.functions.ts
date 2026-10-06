import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { rateLimitEndpoint } from "@/lib/rate-limit";
import { emitCustomerNotification, emitSellerNotification } from "@/lib/notifications.functions";

const checkoutSchema = z
  .object({
    items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(100),
    firstName: z.string().trim().min(2).max(100),
    lastName: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^(0[5-7][0-9]{8}|\+213[5-7][0-9]{8})$/),
    wilayaId: z.string().uuid(),
    // Either a listed commune (id) or a manually typed commune name — never both.
    communeId: z.string().uuid().nullable(),
    communeName: z.string().trim().min(2).max(100).optional(),
    address: z.string().trim().min(4).max(500),
    // Legacy single-method field kept for compatibility; per-seller methods
    // below take precedence when present (V8 sections 29–32).
    deliveryMethod: z.enum(["home", "office"]).optional(),
    sellerMethods: z.record(z.string().uuid(), z.enum(["home", "office"])).optional(),
    officeIds: z.record(z.string().uuid(), z.string().uuid()).optional(),
    couponCode: z.string().trim().min(1).max(64).optional(),
    note: z.string().trim().max(1000).optional(),
    idempotencyKey: z.string().min(16).max(120),
  })
  .superRefine((data, ctx) => {
    if (!!data.communeId === !!data.communeName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["communeId"],
        message: "Choose either a listed commune or type the commune name — not both.",
      });
    }
  });

export const getCheckoutMeta = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabasePublic = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
  const [wilayas, communes] = await Promise.all([
    supabasePublic.from("wilayas").select("id,code,name,active").eq("active", true).order("code"),
    supabasePublic.from("communes").select("id,wilaya_id,code,name,active").eq("active", true).order("code"),
  ]);
  if (wilayas.error || communes.error) throw new Error("Delivery locations are unavailable.");
  return { wilayas: wilayas.data ?? [], communes: communes.data ?? [] };
});

export const createGuestOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => checkoutSchema.parse(data))
  .handler(async ({ data }) => {
    // Public checkout: cap order creation per IP (order spam / inventory griefing).
    rateLimitEndpoint("createGuestOrder", 20);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sessionToken = crypto.randomUUID() + crypto.randomUUID();
    const { data: cart, error: cartError } = await supabaseAdmin.from("carts").insert({ session_token: sessionToken, currency: "DZD" }).select("id").single();
    if (cartError || !cart) throw new Error("Unable to prepare checkout.");
    const { error: itemError } = await supabaseAdmin.from("cart_items").insert(data.items.map((item) => ({ cart_id: cart.id, variant_id: item.variantId, quantity: item.quantity })));
    if (itemError) throw new Error("Unable to prepare cart items.");
    // V8 (sections 29–32): the RPC gained optional coupon / per-seller method /
    // office / manual-commune params (hand-added to generated types.ts until
    // the next sync). The cast bridges the null/undefined gap on p_commune_id
    // (nullable for the manual-commune fallback); no ts-ignore.
    type CheckoutCartRpc = Database["public"]["Functions"]["checkout_cart"];
    type CheckoutCartArgs = CheckoutCartRpc extends { Args: infer A } ? A : never;
    const rpcArgs = {
      p_cart_id: cart.id,
      p_session_token: sessionToken,
      p_first_name: data.firstName,
      p_last_name: data.lastName,
      p_phone: data.phone.startsWith("0") ? "+213" + data.phone.slice(1) : data.phone,
      p_wilaya_id: data.wilayaId,
      p_commune_id: data.communeId,
      p_commune_name: data.communeName ?? null,
      p_address_line: data.address,
      p_delivery_method: data.deliveryMethod ?? "home",
      p_coupon_code: data.couponCode ?? null,
      p_seller_methods: data.sellerMethods ?? {},
      p_office_ids: data.officeIds ?? {},
      ...(data.note ? { p_customer_note: data.note } : {}),
      p_idempotency_key: data.idempotencyKey,
    } satisfies Record<string, unknown>;
    const { data: result, error } = await supabaseAdmin.rpc(
      "checkout_cart",
      rpcArgs as unknown as CheckoutCartArgs,
    );
    if (error) throw new Error(error.message.replace(/^.*?\n/, ""));
    const order = result as { order_id?: string; order_number?: string; subtotal?: number; shipping_total?: number; grand_total?: number; delivery_method?: string; discount_total?: number; coupon_code?: string; currency?: string } | null;
    if (!order?.order_id || !order.order_number) throw new Error("Order confirmation was unavailable.");

    // Notifications (DB-first): order received for the customer, new order for
    // each seller. Best-effort — a notification failure never breaks checkout.
    try {
      const orderRow = await supabaseAdmin
        .from("orders")
        .select("id,order_number,grand_total,currency,customer_id")
        .eq("id", order.order_id)
        .maybeSingle();
      if (orderRow.data) {
        const sellerOrders = await supabaseAdmin
          .from("seller_orders")
          .select("id,seller_id,subtotal")
          .eq("order_id", order.order_id);
        const pending: Promise<boolean>[] = [];
        for (const sellerOrder of sellerOrders.data ?? []) {
          if (!sellerOrder.seller_id) continue;
          pending.push(
            emitSellerNotification(sellerOrder.seller_id, {
              type: "new_order",
              params: { orderNumber: orderRow.data.order_number, total: Number(sellerOrder.subtotal ?? 0), currency: orderRow.data.currency ?? "DZD" },
              link: `/seller/orders/${sellerOrder.id}`,
              payload: { order_id: order.order_id, seller_order_id: sellerOrder.id, order_number: orderRow.data.order_number },
            }),
          );
        }
        if (orderRow.data.customer_id) {
          const customerRow = await supabaseAdmin
            .from("customers")
            .select("profile_id")
            .eq("id", orderRow.data.customer_id)
            .maybeSingle();
          const profileId = customerRow.data?.profile_id;
          if (profileId) {
            pending.push(
              emitCustomerNotification(profileId, {
                type: "order_received",
                params: { orderNumber: orderRow.data.order_number, total: Number(orderRow.data.grand_total ?? 0), currency: orderRow.data.currency ?? "DZD" },
                link: `/account/orders/${order.order_id}`,
                payload: { order_id: order.order_id, order_number: orderRow.data.order_number },
              }),
            );
          }
        }
        await Promise.allSettled(pending);
      }
    } catch {
      /* notifications are best-effort */
    }

    return {
      orderId: order.order_id,
      orderNumber: order.order_number,
      subtotal: Number(order.subtotal ?? 0),
      shippingTotal: Number(order.shipping_total ?? 0),
      discountTotal: Number(order.discount_total ?? 0),
      couponCode: order.coupon_code ?? data.couponCode ?? null,
      currency: order.currency ?? "DZD",
      grandTotal: Number(order.grand_total ?? 0),
      deliveryMethod: order.delivery_method ?? data.deliveryMethod ?? "home",
    };
  });
