import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const checkoutSchema = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(100),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^(0[5-7][0-9]{8}|\+213[5-7][0-9]{8})$/),
  wilayaId: z.string().uuid(),
  communeId: z.string().uuid(),
  address: z.string().trim().min(4).max(500),
  deliveryMethod: z.enum(["home", "office"]),
  note: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(16).max(120),
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sessionToken = crypto.randomUUID() + crypto.randomUUID();
    const { data: cart, error: cartError } = await supabaseAdmin.from("carts").insert({ session_token: sessionToken, currency: "DZD" }).select("id").single();
    if (cartError || !cart) throw new Error("Unable to prepare checkout.");
    const { error: itemError } = await supabaseAdmin.from("cart_items").insert(data.items.map((item) => ({ cart_id: cart.id, variant_id: item.variantId, quantity: item.quantity })));
    if (itemError) throw new Error("Unable to prepare cart items.");
    const { data: result, error } = await supabaseAdmin.rpc("checkout_cart", {
      p_cart_id: cart.id,
      p_session_token: sessionToken,
      p_first_name: data.firstName,
      p_last_name: data.lastName,
      p_phone: data.phone.startsWith("0") ? "+213" + data.phone.slice(1) : data.phone,
      p_wilaya_id: data.wilayaId,
      p_commune_id: data.communeId,
      p_address_line: data.address,
      p_delivery_method: data.deliveryMethod,
      ...(data.note ? { p_customer_note: data.note } : {}),
      p_idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message.replace(/^.*?\n/, ""));
    const order = result as { order_id?: string; order_number?: string; subtotal?: number; shipping_total?: number; grand_total?: number; delivery_method?: string } | null;
    if (!order?.order_id || !order.order_number) throw new Error("Order confirmation was unavailable.");
    return {
      orderId: order.order_id,
      orderNumber: order.order_number,
      subtotal: Number(order.subtotal ?? 0),
      shippingTotal: Number(order.shipping_total ?? 0),
      grandTotal: Number(order.grand_total ?? 0),
      deliveryMethod: order.delivery_method ?? data.deliveryMethod,
    };
  });
