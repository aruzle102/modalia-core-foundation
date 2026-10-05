import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, type SellerContext, type SellerPermission } from "@/lib/seller-auth";
import { emitCustomerNotification } from "@/lib/notifications.functions";

/**
 * Seller Order Operations Center — server functions (Phase 2/4, Worker 7/7).
 *
 * Security contract (Worker 1's `@/lib/seller-auth`):
 *   every function is requireSupabaseAuth + zod validated, then resolves the
 *   seller via `requireSeller(ctx, ...permissions)`. The seller id is ALWAYS
 *   taken server-side from the resolved SellerContext — never from the client.
 * Writes go through `supabaseAdmin` and are re-scoped to the seller's own
 * rows; reads use the request-scoped client with the same server-side scoping.
 */

type SellerOrderStatus = Database["public"]["Enums"]["seller_order_status"];

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
] as const;

/**
 * Strict seller-allowed transitions, enforced server-side on every write.
 * Sellers may only move their slice of an order forward (or cancel early):
 *   pending            → accepted | cancelled
 *   accepted           → processing | cancelled
 *   processing         → ready_for_shipping
 *   ready_for_shipping → handed_to_courier
 * Everything else (in_transit, delivered, returned, refunded, …) is the
 * platform/courier's job and is rejected here.
 */
const SELLER_TRANSITIONS: Record<SellerOrderStatus, SellerOrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["processing", "cancelled"],
  processing: ["ready_for_shipping"],
  ready_for_shipping: ["handed_to_courier"],
  confirmed: [],
  fulfilled: [],
  cancelled: [],
  refunded: [],
  in_transit: [],
  delivered: [],
  returned: [],
  handed_to_courier: [],
  failed_delivery: [],
};

const sellerOnly = [requireSupabaseAuth] as const;

async function sellerCtx(context: any, ...permissions: SellerPermission[]): Promise<SellerContext> {
  // The auth contract expects an explicit { supabase, userId } object.
  return requireSeller({ supabase: context.supabase, userId: context.userId }, ...permissions);
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function actorId(context: any): string {
  const id = context?.userId;
  if (typeof id !== "string" || id.length === 0) throw new Error("Unauthorized");
  return id;
}

/** Pull a localized string out of a {en,fr,ar} jsonb object or plain string. */
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

function snapshotPart(snapshot: Json | null, key: string): string {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return "";
  return localizedLabel((snapshot as Record<string, unknown>)[key]);
}

/** Escape user text for a PostgREST `.or("…ilike…")` expression. */
function ilikeValue(raw: string): string {
  const cleaned = raw.replace(/[(),"]/g, "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${cleaned}%`;
}

/** Unwrap a many-to-one embedded relation that Supabase may type as object-or-array. */
function single<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types shared with the seller routes
// ---------------------------------------------------------------------------

export type SellerOrderListItem = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: SellerOrderStatus;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  itemCount: number;
  subtotal: number;
  shippingTotal: number;
  commissionTotal: number;
};

export type SellerOrderItem = {
  id: string;
  title: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  options: Json;
  imagePath: string | null;
};

export type SellerOrderHistoryEntry = {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  actorType: string;
  note: string | null;
  createdAt: string;
};

export type SellerOrderNote = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
};

export type SellerOrderDetail = {
  id: string;
  orderNumber: string;
  parentStatus: string;
  createdAt: string;
  status: SellerOrderStatus;
  allowedTransitions: SellerOrderStatus[];
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  customerNote: string | null;
  wilaya: string;
  commune: string;
  addressLine: string;
  deliveryMethod: string | null;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  subtotal: number;
  shippingTotal: number;
  commissionTotal: number;
  estimatedPayout: number;
  shippingSnapshot: Json;
  items: SellerOrderItem[];
  history: SellerOrderHistoryEntry[];
  notes: SellerOrderNote[];
};

export type SellerCustomer = {
  name: string;
  phone: string;
  wilaya: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
};

export type SellerReview = {
  id: string;
  productId: string;
  productName: string;
  rating: number;
  body: string | null;
  firstName: string | null;
  verifiedPurchase: boolean;
  moderationStatus: string;
  flaggedAt: string | null;
  createdAt: string;
};

export type AiCatalogProduct = {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  basePrice: number;
  sku: string;
  category: string;
  attributes: Record<string, string>;
};

// ---------------------------------------------------------------------------
// 1. listSellerOrders
// ---------------------------------------------------------------------------

const listSellerOrdersSchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(SELLER_ORDER_STATUSES).optional(),
  page: z.number().int().min(1).default(1),
});

export const listSellerOrders = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => listSellerOrdersSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ orders: SellerOrderListItem[]; total: number; page: number; pageSize: number }> => {
    const seller = await sellerCtx(context);

    const fromIndex = (data.page - 1) * PAGE_SIZE;
    let query = context.supabase
      .from("seller_orders")
      .select(
        "id,status,created_at,subtotal,shipping_total,commission_total,orders(id,order_number,first_name,last_name,guest_phone),order_items(id)",
        { count: "exact" },
      )
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false })
      .range(fromIndex, fromIndex + PAGE_SIZE - 1);

    if (data.status) query = query.eq("status", data.status);
    if (data.q) {
      const pattern = ilikeValue(data.q);
      query = query.or(
        [
          `orders.order_number.ilike.${pattern}`,
          `orders.guest_phone.ilike.${pattern}`,
          `orders.first_name.ilike.${pattern}`,
          `orders.last_name.ilike.${pattern}`,
        ].join(","),
      );
    }

    const result = await query;
    if (result.error) throw new Error("Orders could not be loaded.");

    const orders: SellerOrderListItem[] = (result.data ?? []).map((row) => {
      const order = single(row.orders);
      return {
        id: row.id,
        orderNumber: order?.order_number ?? "—",
        createdAt: row.created_at,
        status: row.status as SellerOrderStatus,
        firstName: order?.first_name ?? null,
        lastName: order?.last_name ?? null,
        phone: order?.guest_phone ?? null,
        itemCount: (row.order_items ?? []).length,
        subtotal: Number(row.subtotal),
        shippingTotal: Number(row.shipping_total),
        commissionTotal: Number(row.commission_total),
      };
    });

    return { orders, total: result.count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

// ---------------------------------------------------------------------------
// 2. getSellerOrderDetail
// ---------------------------------------------------------------------------

export const getSellerOrderDetail = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => z.object({ sellerOrderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<SellerOrderDetail | null> => {
    const seller = await sellerCtx(context);

    // Ownership is enforced here: the row must belong to this seller.
    const soResult = await context.supabase
      .from("seller_orders")
      .select("*,orders(*)")
      .eq("id", data.sellerOrderId)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (soResult.error) throw new Error("Order could not be loaded.");
    if (!soResult.data) return null;
    const so = soResult.data;
    const order = single(so.orders);
    if (!order) return null;

    const [itemsResult, historyResult, notesResult] = await Promise.all([
      context.supabase.from("order_items").select("*").eq("seller_order_id", so.id).order("created_at", { ascending: true }),
      context.supabase.from("order_status_history").select("*").eq("seller_order_id", so.id).order("created_at", { ascending: false }),
      context.supabase.from("order_notes").select("*").eq("seller_order_id", so.id).order("created_at", { ascending: false }),
    ]);
    if (itemsResult.error) throw new Error("Order could not be loaded.");
    if (historyResult.error) throw new Error("Order could not be loaded.");
    if (notesResult.error) throw new Error("Order could not be loaded.");

    const status = so.status as SellerOrderStatus;
    const subtotal = Number(so.subtotal);
    const shippingTotal = Number(so.shipping_total);
    const commissionTotal = Number(so.commission_total);

    return {
      id: so.id,
      orderNumber: order.order_number,
      parentStatus: order.status,
      createdAt: so.created_at,
      status,
      allowedTransitions: SELLER_TRANSITIONS[status] ?? [],
      firstName: order.first_name,
      lastName: order.last_name,
      phone: order.guest_phone,
      email: order.guest_email,
      customerNote: order.customer_note,
      wilaya: snapshotPart(order.address_snapshot, "wilaya"),
      commune: snapshotPart(order.address_snapshot, "commune"),
      addressLine: snapshotPart(order.address_snapshot, "address_line"),
      deliveryMethod: so.delivery_method ?? order.delivery_method,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      currency: order.currency,
      subtotal,
      shippingTotal,
      commissionTotal,
      estimatedPayout: subtotal + shippingTotal - commissionTotal,
      shippingSnapshot: so.shipping_snapshot,
      items: (itemsResult.data ?? []).map((item) => ({
        id: item.id,
        title: localizedLabel(item.title, "en") || "Product",
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        total: Number(item.total),
        options: item.option_snapshot,
        imagePath: item.image_path,
      })),
      history: (historyResult.data ?? []).map((row) => ({
        id: row.id,
        previousStatus: row.previous_status,
        newStatus: row.new_status,
        actorType: row.actor_type,
        note: row.note,
        createdAt: row.created_at,
      })),
      notes: (notesResult.data ?? []).map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        authorId: row.author_id,
      })),
    };
  });

// ---------------------------------------------------------------------------
// 3. updateSellerOrderStatus — strict server-side transition enforcement
// ---------------------------------------------------------------------------

const updateSellerOrderStatusSchema = z.object({
  sellerOrderId: z.string().uuid(),
  status: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

export const updateSellerOrderStatus = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .validator((data) => updateSellerOrderStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerCtx(context, "orders.update" as SellerPermission);
    const supabaseAdmin = await adminClient();
    const userId = actorId(context);
    const now = new Date().toISOString();
    const note = data.note && data.note.trim() ? data.note.trim() : null;

    if (!(SELLER_ORDER_STATUSES as readonly string[]).includes(data.status)) {
      throw new Error(`"${data.status}" is not a valid seller order status.`);
    }
    const next = data.status as SellerOrderStatus;

    // Re-fetch current status server-side and verify ownership — never trust the client.
    const currentResult = await supabaseAdmin
      .from("seller_orders")
      .select("id,order_id,status")
      .eq("id", data.sellerOrderId)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (currentResult.error || !currentResult.data) throw new Error("Seller order not found.");
    const current = currentResult.data.status as SellerOrderStatus;
    if (current === next) throw new Error("The order is already in this status.");
    const allowed = SELLER_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new Error(`Transition from "${current}" to "${next}" is not allowed for sellers.`);
    }

    const updateResult = await supabaseAdmin
      .from("seller_orders")
      .update({ status: next, updated_at: now })
      .eq("id", data.sellerOrderId);
    if (updateResult.error) throw new Error(updateResult.error.message);

    const historyResult = await supabaseAdmin.from("order_status_history").insert({
      order_id: currentResult.data.order_id,
      seller_order_id: data.sellerOrderId,
      previous_status: current,
      new_status: next,
      actor_id: userId,
      actor_type: "seller",
      note,
    });
    if (historyResult.error) throw new Error(historyResult.error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "seller_order_status_updated",
      resource: "seller_order",
      resource_id: data.sellerOrderId,
      metadata: { seller_id: seller.sellerId, previous_status: current, new_status: next, note },
    });

    // Notify the customer about the status change (best-effort; guests have no profile).
    try {
      const orderRow = await supabaseAdmin
        .from("orders")
        .select("id,order_number,customer_id")
        .eq("id", currentResult.data.order_id)
        .maybeSingle();
      if (orderRow.data?.customer_id) {
        const customerRow = await supabaseAdmin
          .from("customers")
          .select("profile_id")
          .eq("id", orderRow.data.customer_id)
          .maybeSingle();
        const profileId = customerRow.data?.profile_id;
        if (profileId) {
          await emitCustomerNotification(profileId, {
            type: "order_status",
            params: { orderNumber: orderRow.data.order_number, status: next },
            link: `/account/orders/${orderRow.data.id}`,
            payload: { order_id: orderRow.data.id, seller_order_id: data.sellerOrderId, order_number: orderRow.data.order_number, status: next },
          });
        }
      }
    } catch {
      /* notifications are best-effort */
    }

    return { id: data.sellerOrderId, status: next, allowedTransitions: SELLER_TRANSITIONS[next] ?? [] };
  });

// ---------------------------------------------------------------------------
// 4. addSellerOrderNote (internal only)
// ---------------------------------------------------------------------------

export const addSellerOrderNote = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .validator((data) => z.object({ sellerOrderId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerCtx(context);
    const supabaseAdmin = await adminClient();
    const userId = actorId(context);

    // Ownership check before any write.
    const soResult = await supabaseAdmin
      .from("seller_orders")
      .select("id,order_id")
      .eq("id", data.sellerOrderId)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (soResult.error || !soResult.data) throw new Error("Seller order not found.");

    const noteResult = await supabaseAdmin
      .from("order_notes")
      .insert({ seller_order_id: data.sellerOrderId, author_id: userId, visibility: "internal", body: data.body })
      .select("id,body,created_at,author_id")
      .single();
    if (noteResult.error || !noteResult.data) throw new Error(noteResult.error?.message ?? "Note could not be saved.");

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "seller_order_note_added",
      resource: "order_note",
      resource_id: noteResult.data.id,
      metadata: { seller_id: seller.sellerId, seller_order_id: data.sellerOrderId, order_id: soResult.data.order_id },
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
// 5. getSellerCustomers — derived from the seller's own orders (read-only)
// ---------------------------------------------------------------------------

export const getSellerCustomers = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => z.object({}).parse(data))
  .handler(async ({ context }): Promise<{ customers: SellerCustomer[] }> => {
    const seller = await sellerCtx(context);

    const result = await context.supabase
      .from("seller_orders")
      .select("id,subtotal,created_at,orders(order_number,first_name,last_name,guest_phone,address_snapshot)")
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (result.error) throw new Error("Customers could not be loaded.");

    const byKey = new Map<string, SellerCustomer>();
    for (const row of result.data ?? []) {
      const order = single(row.orders);
      if (!order) continue;
      const name = [order.first_name, order.last_name].filter(Boolean).join(" ").trim() || "—";
      const phone = (order.guest_phone ?? "").trim();
      const key = phone ? `phone:${phone}` : `name:${name.toLowerCase()}`;
      const wilaya = snapshotPart(order.address_snapshot, "wilaya");
      const existing = byKey.get(key);
      const spent = Number(row.subtotal);
      if (existing) {
        existing.orderCount += 1;
        existing.totalSpent += spent;
        // rows arrive newest-first, so lastOrderAt is already the newest
        if (!existing.wilaya && wilaya) existing.wilaya = wilaya;
        if (existing.name === "—" && name !== "—") existing.name = name;
      } else {
        byKey.set(key, {
          name,
          phone: phone || "—",
          wilaya,
          orderCount: 1,
          totalSpent: spent,
          lastOrderAt: row.created_at,
        });
      }
    }

    const customers = [...byKey.values()].sort((a, b) => (a.lastOrderAt < b.lastOrderAt ? 1 : -1));
    return { customers };
  });

// ---------------------------------------------------------------------------
// 6. listSellerReviews — reviews on this seller's own products
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = ["pending", "flagged", "approved", "rejected", "hidden"] as const;

export const listSellerReviews = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) =>
    z.object({
      status: z.enum(REVIEW_STATUSES).optional(),
      page: z.number().int().min(1).default(1),
    }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ reviews: SellerReview[]; total: number; page: number; pageSize: number }> => {
    const seller = await sellerCtx(context);

    // Scope to own products: the client never supplies product ids.
    const productsResult = await context.supabase.from("products").select("id").eq("seller_id", seller.sellerId).limit(5000);
    if (productsResult.error) throw new Error("Reviews could not be loaded.");
    const productIds = (productsResult.data ?? []).map((p) => p.id);
    if (productIds.length === 0) return { reviews: [], total: 0, page: data.page, pageSize: PAGE_SIZE };

    const fromIndex = (data.page - 1) * PAGE_SIZE;
    let query = context.supabase
      .from("reviews")
      .select("*,products(name)", { count: "exact" })
      .in("product_id", productIds)
      .order("created_at", { ascending: false })
      .range(fromIndex, fromIndex + PAGE_SIZE - 1);
    if (data.status) query = query.eq("moderation_status", data.status);

    const result = await query;
    if (result.error) throw new Error("Reviews could not be loaded.");

    const reviews: SellerReview[] = (result.data ?? []).map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: localizedLabel(single(row.products)?.name, "en") || "Product",
      rating: row.rating,
      body: row.body,
      firstName: row.first_name,
      verifiedPurchase: row.verified_purchase,
      moderationStatus: row.moderation_status,
      flaggedAt: row.flagged_at,
      createdAt: row.created_at,
    }));

    return { reviews, total: result.count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });

// ---------------------------------------------------------------------------
// 7. flagReviewForRemoderation — seller flags, admins decide
// ---------------------------------------------------------------------------

export const flagReviewForRemoderation = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .validator((data) => z.object({ reviewId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await sellerCtx(context);
    const supabaseAdmin = await adminClient();
    const userId = actorId(context);
    const now = new Date().toISOString();

    // Verify the review belongs to one of this seller's products.
    const reviewResult = await supabaseAdmin
      .from("reviews")
      .select("id,moderation_status,products!inner(seller_id)")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (reviewResult.error || !reviewResult.data) throw new Error("Review not found.");
    const product = single((reviewResult.data as { products: { seller_id: string }[] | { seller_id: string } | null }).products);
    if (!product || product.seller_id !== seller.sellerId) throw new Error("Review not found.");
    if (reviewResult.data.moderation_status === "pending") throw new Error("This review is already awaiting moderation.");

    const updateResult = await supabaseAdmin
      .from("reviews")
      .update({ flagged_at: now, moderation_status: "pending", updated_at: now })
      .eq("id", data.reviewId);
    if (updateResult.error) throw new Error(updateResult.error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "seller_review_flagged",
      resource: "review",
      resource_id: data.reviewId,
      metadata: { seller_id: seller.sellerId },
    });

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// 8. getSellerAiCatalog — product fields for the rule-based AI tools page
// ---------------------------------------------------------------------------

export const getSellerAiCatalog = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .validator((data) => z.object({}).parse(data))
  .handler(async ({ context }): Promise<{ products: AiCatalogProduct[] }> => {
    const seller = await sellerCtx(context);

    const result = await context.supabase
      .from("products")
      .select("id,name,description,short_description,base_price,sku,metadata,categories(name)")
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) throw new Error("Products could not be loaded.");

    const products: AiCatalogProduct[] = (result.data ?? []).map((row) => {
      const attributes: Record<string, string> = {};
      const metadata = row.metadata;
      if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        const record = metadata as Record<string, unknown>;
        for (const key of ["color", "size", "material", "brand", "weight", "dimensions", "warranty"]) {
          const value = record[key];
          if (typeof value === "string" && value.trim()) attributes[key] = value.trim();
        }
        const attrs = record["attributes"];
        if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
          for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
            if (typeof v === "string" && v.trim() && Object.keys(attributes).length < 10) attributes[k] = v.trim();
          }
        }
      }
      return {
        id: row.id,
        name: localizedLabel(row.name, "en") || "Product",
        description: localizedLabel(row.description, "en"),
        shortDescription: localizedLabel(row.short_description, "en"),
        basePrice: Number(row.base_price),
        sku: row.sku ?? "",
        category: localizedLabel(single(row.categories)?.name, "en"),
        attributes,
      };
    });

    return { products };
  });
