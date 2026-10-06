import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminPermission } from "@/lib/admin-permissions";

/**
 * Admin Order Operations Center — server functions (Phase 1/4, Problem 2).
 *
 * Every function is admin-only (requireSupabaseAuth + is_super_admin RPC).
 * All writes go through supabaseAdmin so they succeed regardless of RLS;
 * reads use the request-scoped client (super admins have SELECT via RLS).
 * Totals/statuses are always re-fetched server-side — client values are
 * never trusted for writes.
 */

type OrderStatus = Database["public"]["Enums"]["order_status"];
type SellerOrderStatus = Database["public"]["Enums"]["seller_order_status"];

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "received",
  "preparing",
  "ready_for_shipping",
  "handed_to_courier",
  "in_transit",
  "returned",
  "failed_delivery",
] as const;

const SELLER_ORDER_STATUSES = [
  "pending",
  "accepted",
  "processing",
  "fulfilled",
  "cancelled",
  "refunded",
  "confirmed",
  "ready_for_shipping",
  "handed_to_courier",
  "in_transit",
  "delivered",
  "returned",
  "failed_delivery",
] as const;

/** Strict parent-order transition matrix enforced on every status write. */
const PARENT_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  received: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  processing: ["preparing", "cancelled"],
  preparing: ["ready_for_shipping", "cancelled"],
  ready_for_shipping: ["handed_to_courier", "cancelled"],
  handed_to_courier: ["in_transit", "failed_delivery"],
  shipped: ["in_transit", "delivered"],
  in_transit: ["delivered", "failed_delivery"],
  failed_delivery: ["preparing", "cancelled"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
  refunded: [],
};

/** Strict seller-order transition matrix enforced on every status write. */
const SELLER_TRANSITIONS: Record<SellerOrderStatus, SellerOrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  confirmed: ["accepted", "processing", "cancelled"],
  accepted: ["processing", "cancelled"],
  processing: ["ready_for_shipping", "cancelled"],
  ready_for_shipping: ["handed_to_courier", "cancelled"],
  handed_to_courier: ["in_transit", "failed_delivery"],
  in_transit: ["delivered", "failed_delivery"],
  failed_delivery: ["processing", "cancelled"],
  fulfilled: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
  refunded: [],
};

const adminOnly = [requireSupabaseAuth] as const;

const PAGE_SIZE = 25;

function actorId(context: any): string {
  const id = context?.userId;
  if (typeof id !== "string" || id.length === 0) throw new Error("Unauthorized");
  return id;
}

/** Pull a localized string out of a JSON name object ({en,fr,ar}) or a plain string. */
function localizedLabel(value: unknown, preferred = "en"): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of [preferred, "fr", "en", "ar"]) {
      const label = record[key];
      if (typeof label === "string" && label.trim()) return label;
    }
  }
  return "";
}

function addressPart(snapshot: Json | null, key: "wilaya" | "commune" | "address_line"): string {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return "";
  return localizedLabel((snapshot as Record<string, unknown>)[key]);
}

/** Escape user text for use inside a PostgREST .or("...ilike...") expression. */
function ilikeValue(raw: string): string {
  const cleaned = raw.replace(/[(),"]/g, "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${cleaned}%`;
}

/** Unwrap a many-to-one embedded relation that Supabase may type as object-or-array. */
function single<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// ---------------------------------------------------------------------------
// Types shared with the admin routes
// ---------------------------------------------------------------------------

export type AdminOrderListItem = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  wilaya: string;
  commune: string;
  itemCount: number;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  grandTotal: number;
  currency: string;
  paymentMethod: string;
  deliveryMethod: string | null;
  sellerNames: string[];
};

export type AdminOrderItem = {
  id: string;
  title: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  options: Json;
  imagePath: string | null;
};

export type AdminSellerOrder = {
  id: string;
  status: SellerOrderStatus;
  createdAt: string;
  sellerId: string;
  sellerName: string;
  storeId: string | null;
  storeName: string;
  subtotal: number;
  shippingTotal: number;
  commissionTotal: number;
  shippingSnapshot: Json;
  deliveryMethod: string | null;
  items: AdminOrderItem[];
  itemsTotal: number;
  allowedTransitions: SellerOrderStatus[];
};

export type AdminOrderHistoryEntry = {
  id: string;
  sellerOrderId: string | null;
  previousStatus: string | null;
  newStatus: string;
  actorType: string;
  note: string | null;
  createdAt: string;
};

export type AdminOrderNote = {
  id: string;
  sellerOrderId: string;
  body: string;
  createdAt: string;
  authorId: string | null;
};

export type AdminOrderReturn = {
  id: string;
  sellerOrderId: string;
  status: string;
  reason: string;
  requestedAt: string;
  processedAt: string | null;
  processedBy: string | null;
  notes: string | null;
};

export type AdminOrderDetail = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  addressSnapshot: Json;
  wilaya: string;
  commune: string;
  addressLine: string;
  deliveryMethod: string | null;
  paymentMethod: string;
  paymentStatus: string;
  customerNote: string | null;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  grandTotal: number;
  currency: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  failedDeliveryAt: string | null;
  failedDeliveryReason: string | null;
  parentAllowedTransitions: OrderStatus[];
  sellerOrders: AdminSellerOrder[];
  history: AdminOrderHistoryEntry[];
  notes: AdminOrderNote[];
  returns: AdminOrderReturn[];
};

// ---------------------------------------------------------------------------
// 1. listAdminOrders
// ---------------------------------------------------------------------------

const listAdminOrdersSchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  sellerId: z.string().uuid().optional(),
  wilaya: z.string().trim().min(1).max(120).optional(),
  paymentMethod: z.string().trim().min(1).max(40).optional(),
  minTotal: z.number().min(0).optional(),
  maxTotal: z.number().min(0).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(1).default(1),
});

export const listAdminOrders = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((data) => listAdminOrdersSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "orders.view");

    if (data.minTotal !== undefined && data.maxTotal !== undefined && data.minTotal > data.maxTotal) {
      throw new Error("Minimum total cannot be greater than maximum total.");
    }

    // Seller filter: find the order ids that involve this seller first.
    let sellerOrderIds: string[] | null = null;
    if (data.sellerId) {
      const sellerOrdersResult = await context.supabase
        .from("seller_orders")
        .select("order_id")
        .eq("seller_id", data.sellerId);
      if (sellerOrdersResult.error) throw new Error("Orders could not be loaded.");
      sellerOrderIds = [...new Set((sellerOrdersResult.data ?? []).map((row) => row.order_id))];
      if (sellerOrderIds.length === 0) return { orders: [] as AdminOrderListItem[], total: 0, page: data.page, pageSize: PAGE_SIZE };
    }

    const fromIndex = (data.page - 1) * PAGE_SIZE;
    let query = context.supabase
      .from("orders")
      .select(
        "id,order_number,created_at,status,payment_method,delivery_method,first_name,last_name,guest_phone,address_snapshot,subtotal,shipping_total,discount_total,grand_total,currency,customer_note,seller_orders(order_items(id))",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(fromIndex, fromIndex + PAGE_SIZE - 1);

    if (sellerOrderIds) query = query.in("id", sellerOrderIds);
    if (data.q) {
      const pattern = ilikeValue(data.q);
      query = query.or(
        [
          `order_number.ilike.${pattern}`,
          `guest_email.ilike.${pattern}`,
          `guest_phone.ilike.${pattern}`,
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
        ].join(","),
      );
    }
    if (data.status) query = query.eq("status", data.status);
    if (data.paymentMethod) query = query.eq("payment_method", data.paymentMethod);
    if (data.wilaya) query = query.ilike("address_snapshot->>wilaya", ilikeValue(data.wilaya));
    if (data.minTotal !== undefined) query = query.gte("grand_total", data.minTotal);
    if (data.maxTotal !== undefined) query = query.lte("grand_total", data.maxTotal);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) {
      const toDate = new Date(`${data.to}T00:00:00.000Z`);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      query = query.lt("created_at", toDate.toISOString());
    }

    const result = await query;
    if (result.error) throw new Error("Orders could not be loaded.");
    const rows = result.data ?? [];
    const total = result.count ?? 0;

    // Join seller/store names for the visible page.
    const sellerNamesByOrder = new Map<string, string[]>();
    const pageIds = rows.map((row) => row.id);
    if (pageIds.length > 0) {
      const namesResult = await context.supabase
        .from("seller_orders")
        .select("order_id,sellers(legal_name),stores(name)")
        .in("order_id", pageIds);
      if (!namesResult.error) {
        for (const row of namesResult.data ?? []) {
          const seller = single(row.sellers);
          const store = single(row.stores);
          const name = store?.name ?? seller?.legal_name ?? "Store";
          const list = sellerNamesByOrder.get(row.order_id) ?? [];
          if (!list.includes(name)) list.push(name);
          sellerNamesByOrder.set(row.order_id, list);
        }
      }
    }

    const orders: AdminOrderListItem[] = rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      createdAt: row.created_at,
      status: row.status as OrderStatus,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.guest_phone,
      wilaya: addressPart(row.address_snapshot, "wilaya"),
      commune: addressPart(row.address_snapshot, "commune"),
      itemCount: (row.seller_orders ?? []).reduce((sum, so) => sum + (so.order_items?.length ?? 0), 0),
      subtotal: Number(row.subtotal),
      shippingTotal: Number(row.shipping_total),
      discountTotal: Number(row.discount_total),
      grandTotal: Number(row.grand_total),
      currency: row.currency,
      paymentMethod: row.payment_method,
      deliveryMethod: row.delivery_method,
      sellerNames: sellerNamesByOrder.get(row.id) ?? [],
    }));

    return { orders, total, page: data.page, pageSize: PAGE_SIZE };
  });

// ---------------------------------------------------------------------------
// 2. getAdminOrder
// ---------------------------------------------------------------------------

export const getAdminOrder = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<AdminOrderDetail | null> => {
    await assertAdminPermission(context, "orders.view");

    const orderResult = await context.supabase.from("orders").select("*").eq("id", data.orderId).maybeSingle();
    if (orderResult.error) throw new Error("Order could not be loaded.");
    if (!orderResult.data) return null;
    const order = orderResult.data;

    const [sellerOrdersResult, parentHistoryResult] = await Promise.all([
      context.supabase
        .from("seller_orders")
        .select("*,sellers(legal_name),stores(name)")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("order_status_history")
        .select("*")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);
    if (sellerOrdersResult.error) throw new Error("Order could not be loaded.");
    if (parentHistoryResult.error) throw new Error("Order could not be loaded.");

    const sellerOrderRows = sellerOrdersResult.data ?? [];
    const sellerOrderIds = sellerOrderRows.map((row) => row.id);

    const [itemsResult, notesResult, returnsResult, sellerHistoryResult] = sellerOrderIds.length > 0
      ? await Promise.all([
          context.supabase.from("order_items").select("*").in("seller_order_id", sellerOrderIds).order("created_at", { ascending: true }),
          context.supabase.from("order_notes").select("*").in("seller_order_id", sellerOrderIds).order("created_at", { ascending: false }),
          context.supabase.from("order_returns").select("*").in("seller_order_id", sellerOrderIds).order("requested_at", { ascending: false }),
          context.supabase.from("order_status_history").select("*").in("seller_order_id", sellerOrderIds).order("created_at", { ascending: false }),
        ])
      : [{ data: [] as never[], error: null }, { data: [] as never[], error: null }, { data: [] as never[], error: null }, { data: [] as never[], error: null }];
    if (itemsResult.error) throw new Error("Order could not be loaded.");
    if (notesResult.error) throw new Error("Order could not be loaded.");
    if (returnsResult.error) throw new Error("Order could not be loaded.");
    if (sellerHistoryResult.error) throw new Error("Order could not be loaded.");

    const itemsBySellerOrder = new Map<string, AdminOrderItem[]>();
    for (const item of itemsResult.data ?? []) {
      const list = itemsBySellerOrder.get(item.seller_order_id) ?? [];
      list.push({
        id: item.id,
        title: localizedLabel(item.title, "en") || "Product",
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        total: Number(item.total),
        options: item.option_snapshot,
        imagePath: item.image_path,
      });
      itemsBySellerOrder.set(item.seller_order_id, list);
    }

    const sellerOrders: AdminSellerOrder[] = sellerOrderRows.map((row) => {
      const seller = single(row.sellers);
      const store = single(row.stores);
      const items = itemsBySellerOrder.get(row.id) ?? [];
      const status = row.status as SellerOrderStatus;
      return {
        id: row.id,
        status,
        createdAt: row.created_at,
        sellerId: row.seller_id,
        sellerName: seller?.legal_name ?? "Unknown seller",
        storeId: row.store_id,
        storeName: store?.name ?? seller?.legal_name ?? "Store",
        subtotal: Number(row.subtotal),
        shippingTotal: Number(row.shipping_total),
        commissionTotal: Number(row.commission_total),
        shippingSnapshot: row.shipping_snapshot,
        deliveryMethod: row.delivery_method,
        items,
        itemsTotal: items.reduce((sum, item) => sum + item.total, 0),
        allowedTransitions: SELLER_TRANSITIONS[status] ?? [],
      };
    });

    const historyRows = [...(parentHistoryResult.data ?? []), ...(sellerHistoryResult.data ?? [])].sort(
      (a, b) => (a.created_at < b.created_at ? 1 : -1),
    );
    const history: AdminOrderHistoryEntry[] = historyRows.map((row) => ({
      id: row.id,
      sellerOrderId: row.seller_order_id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      actorType: row.actor_type,
      note: row.note,
      createdAt: row.created_at,
    }));

    return {
      id: order.id,
      orderNumber: order.order_number,
      createdAt: order.created_at,
      status: order.status as OrderStatus,
      firstName: order.first_name,
      lastName: order.last_name,
      phone: order.guest_phone,
      email: order.guest_email,
      addressSnapshot: order.address_snapshot,
      wilaya: addressPart(order.address_snapshot, "wilaya"),
      commune: addressPart(order.address_snapshot, "commune"),
      addressLine: addressPart(order.address_snapshot, "address_line"),
      deliveryMethod: order.delivery_method,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      customerNote: order.customer_note,
      subtotal: Number(order.subtotal),
      shippingTotal: Number(order.shipping_total),
      discountTotal: Number(order.discount_total),
      grandTotal: Number(order.grand_total),
      currency: order.currency,
      cancelledAt: order.cancelled_at,
      cancellationReason: order.cancellation_reason,
      failedDeliveryAt: order.failed_delivery_at,
      failedDeliveryReason: order.failed_delivery_reason,
      parentAllowedTransitions: PARENT_TRANSITIONS[order.status as OrderStatus] ?? [],
      sellerOrders,
      history,
      notes: (notesResult.data ?? []).map((row) => ({
        id: row.id,
        sellerOrderId: row.seller_order_id,
        body: row.body,
        createdAt: row.created_at,
        authorId: row.author_id,
      })),
      returns: (returnsResult.data ?? []).map((row) => ({
        id: row.id,
        sellerOrderId: row.seller_order_id,
        status: row.status,
        reason: row.reason,
        requestedAt: row.requested_at,
        processedAt: row.processed_at,
        processedBy: row.processed_by,
        notes: row.notes,
      })),
    };
  });

// ---------------------------------------------------------------------------
// 3. updateOrderStatus — strict server-side transition enforcement
// ---------------------------------------------------------------------------

const updateOrderStatusSchema = z.object({
  scope: z.enum(["parent", "seller"]),
  id: z.string().uuid(),
  newStatus: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((data) => updateOrderStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "orders.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = actorId(context);
    const now = new Date().toISOString();
    const note = data.note && data.note.trim() ? data.note.trim() : null;

    if (data.scope === "parent") {
      if (!(ORDER_STATUSES as readonly string[]).includes(data.newStatus)) {
        throw new Error(`"${data.newStatus}" is not a valid order status.`);
      }
      const next = data.newStatus as OrderStatus;
      // Re-fetch current status server-side — never trust the client.
      const currentResult = await supabaseAdmin.from("orders").select("id,status").eq("id", data.id).maybeSingle();
      if (currentResult.error || !currentResult.data) throw new Error("Order not found.");
      const current = currentResult.data.status as OrderStatus;
      if (current === next) throw new Error("The order is already in this status.");
      const allowed = PARENT_TRANSITIONS[current] ?? [];
      if (!allowed.includes(next)) {
        throw new Error(`Transition from "${current}" to "${next}" is not allowed.`);
      }

      const patch: Database["public"]["Tables"]["orders"]["Update"] = { status: next, updated_at: now };
      if (next === "cancelled") {
        patch.cancelled_at = now;
        patch.cancelled_by = userId;
        patch.cancellation_reason = note ?? "Cancelled by admin";
      }
      if (next === "failed_delivery") {
        patch.failed_delivery_at = now;
        patch.failed_delivery_by = userId;
        patch.failed_delivery_reason = note ?? "Failed delivery";
      }
      const updateResult = await supabaseAdmin.from("orders").update(patch).eq("id", data.id);
      if (updateResult.error) throw new Error(updateResult.error.message);

      const historyResult = await supabaseAdmin.from("order_status_history").insert({
        order_id: data.id,
        seller_order_id: null,
        previous_status: current,
        new_status: next,
        actor_id: userId,
        actor_type: "admin",
        note,
      });
      if (historyResult.error) throw new Error(historyResult.error.message);

      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "admin_order_status_updated",
        resource: "order",
        resource_id: data.id,
        metadata: { previous_status: current, new_status: next, note },
      });

      // Cascade: a cancelled parent order cancels every child seller order that
      // the seller matrix still allows to cancel (fulfilled/delivered/returned
      // are left untouched — they need explicit handling, not silent cascade).
      let cascaded = 0;
      if (next === "cancelled") {
        const children = await supabaseAdmin
          .from("seller_orders")
          .select("id,status")
          .eq("order_id", data.id);
        const cancellable = (children.data ?? []).filter((child) =>
          (SELLER_TRANSITIONS[child.status as SellerOrderStatus] ?? []).includes("cancelled"),
        );
        for (const child of cancellable) {
          const childStatus = child.status as SellerOrderStatus;
          const upd = await supabaseAdmin.from("seller_orders").update({ status: "cancelled" }).eq("id", child.id);
          if (upd.error) continue;
          await supabaseAdmin.from("order_status_history").insert({
            order_id: data.id,
            seller_order_id: child.id,
            previous_status: childStatus,
            new_status: "cancelled",
            actor_id: userId,
            actor_type: "admin",
            note: "Parent order cancelled — cascaded by admin",
          });
          cascaded += 1;
        }
        if (cascaded > 0) {
          await supabaseAdmin.from("audit_logs").insert({
            actor_id: userId,
            action: "admin_order_cancel_cascaded",
            resource: "order",
            resource_id: data.id,
            metadata: { cascaded_seller_orders: cascaded },
          });
        }
      }

      return { scope: "parent" as const, id: data.id, status: next, allowedTransitions: PARENT_TRANSITIONS[next] ?? [], cascadedSellerOrders: cascaded };
    }

    if (!(SELLER_ORDER_STATUSES as readonly string[]).includes(data.newStatus)) {
      throw new Error(`"${data.newStatus}" is not a valid seller order status.`);
    }
    const next = data.newStatus as SellerOrderStatus;
    const currentResult = await supabaseAdmin.from("seller_orders").select("id,order_id,status").eq("id", data.id).maybeSingle();
    if (currentResult.error || !currentResult.data) throw new Error("Seller order not found.");
    const current = currentResult.data.status as SellerOrderStatus;
    if (current === next) throw new Error("The seller order is already in this status.");
    const allowed = SELLER_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new Error(`Transition from "${current}" to "${next}" is not allowed.`);
    }

    const updateResult = await supabaseAdmin
      .from("seller_orders")
      .update({ status: next, updated_at: now })
      .eq("id", data.id);
    if (updateResult.error) throw new Error(updateResult.error.message);

    const historyResult = await supabaseAdmin.from("order_status_history").insert({
      order_id: currentResult.data.order_id,
      seller_order_id: data.id,
      previous_status: current,
      new_status: next,
      actor_id: userId,
      actor_type: "admin",
      note,
    });
    if (historyResult.error) throw new Error(historyResult.error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "admin_seller_order_status_updated",
      resource: "seller_order",
      resource_id: data.id,
      metadata: { previous_status: current, new_status: next, note },
    });

    return { scope: "seller" as const, id: data.id, status: next, allowedTransitions: SELLER_TRANSITIONS[next] ?? [] };
  });

// ---------------------------------------------------------------------------
// 4. addOrderNote
// ---------------------------------------------------------------------------

export const addOrderNote = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((data) => z.object({ sellerOrderId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "orders.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = actorId(context);

    const sellerOrderResult = await supabaseAdmin.from("seller_orders").select("id,order_id").eq("id", data.sellerOrderId).maybeSingle();
    if (sellerOrderResult.error || !sellerOrderResult.data) throw new Error("Seller order not found.");

    const noteResult = await supabaseAdmin
      .from("order_notes")
      .insert({ seller_order_id: data.sellerOrderId, author_id: userId, visibility: "internal", body: data.body })
      .select("id,body,created_at,author_id")
      .single();
    if (noteResult.error || !noteResult.data) throw new Error(noteResult.error?.message ?? "Note could not be saved.");

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "admin_order_note_added",
      resource: "order_note",
      resource_id: noteResult.data.id,
      metadata: { seller_order_id: data.sellerOrderId, order_id: sellerOrderResult.data.order_id },
    });

    return {
      id: noteResult.data.id,
      sellerOrderId: data.sellerOrderId,
      body: noteResult.data.body,
      createdAt: noteResult.data.created_at,
      authorId: noteResult.data.author_id,
    };
  });

// ---------------------------------------------------------------------------
// 5. processReturn
// ---------------------------------------------------------------------------

export const processReturn = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .validator((data) =>
    z.object({ returnId: z.string().uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(1000).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPermission(context, "orders.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = actorId(context);
    const now = new Date().toISOString();
    const note = data.note && data.note.trim() ? data.note.trim() : null;

    const returnResult = await supabaseAdmin.from("order_returns").select("id,seller_order_id,status").eq("id", data.returnId).maybeSingle();
    if (returnResult.error || !returnResult.data) throw new Error("Return request not found.");
    if (returnResult.data.status !== "requested") {
      throw new Error("This return request has already been processed.");
    }

    const newStatus = data.decision === "approve" ? "approved" : "rejected";
    const updateResult = await supabaseAdmin
      .from("order_returns")
      .update({ status: newStatus, processed_at: now, processed_by: userId, notes: note })
      .eq("id", data.returnId);
    if (updateResult.error) throw new Error(updateResult.error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "admin_order_return_processed",
      resource: "order_return",
      resource_id: data.returnId,
      metadata: { decision: data.decision, new_status: newStatus, note },
    });

    return { id: data.returnId, status: newStatus, processedAt: now };
  });
