import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { emitSellerNotification } from "@/lib/notifications.functions";
import { assertAdmin } from "@/lib/admin-auth";

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];

const adminOnly = [requireSupabaseAuth] as const;

/* ------------------------------------------------------------------ */
/* Store profile (admin store detail workspace)                        */
/* ------------------------------------------------------------------ */

export type StoreProfileReview = {
  id: string;
  product_id: string;
  rating: number | null;
  body: string | null;
  moderation_status: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  products: { name: Json } | null;
};

/**
 * Full admin workspace for a single storefront: identity, seller, catalog,
 * orders, sales, reviews, offers, collections, appearance summary, activity.
 *
 * Every number is computed from real rows — no placeholders, no fabricated
 * badges. `official` badges are rendered only when `settings.official === true`.
 */
export const getStoreProfile = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const storeId = data.storeId;

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();
    if (storeError || !store) throw new Error("Store not found.");
    const typedStore = store as StoreRow;

    const sellerId = typedStore.seller_id;

    const [
      sellerRes,
      productCountRes,
      productsRes,
      ordersRes,
      allOrdersRes,
      auditRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("sellers")
        .select("id,legal_name,first_name,last_name,email,phone,account_status,commission_rate,created_at")
        .eq("id", sellerId)
        .maybeSingle(),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("seller_id", sellerId),
      supabaseAdmin
        .from("products")
        .select("id,name,slug,base_price,status,moderation_status,created_at")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("seller_orders")
        .select("id,status,subtotal,commission_total,created_at,order_id,orders(order_number)")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin.from("seller_orders").select("subtotal,status").eq("seller_id", sellerId).limit(5000),
      supabaseAdmin
        .from("audit_logs")
        .select("*")
        .or(`resource_id.eq.${storeId},metadata->>store_id.eq.${storeId}`)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const allOrders = allOrdersRes.data ?? [];
    const orderCount = allOrders.length;
    const salesTotal = allOrders
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + (o.subtotal ?? 0), 0);
    const orderStatusCounts = new Map<string, number>();
    for (const o of allOrders) {
      orderStatusCounts.set(o.status, (orderStatusCounts.get(o.status) ?? 0) + 1);
    }

    // Reviews: on this seller's products.
    let reviews: StoreProfileReview[] = [];
    let reviewCount = 0;
    let ratingSum = 0;
    let ratingN = 0;
    const { data: productRows } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("seller_id", sellerId)
      .limit(500);
    const productIds = (productRows ?? []).map((p) => p.id);
    if (productIds.length) {
      const [recentReviewsRes, reviewStatsRes] = await Promise.all([
        supabaseAdmin
          .from("reviews")
          .select("id,product_id,rating,body,moderation_status,created_at,first_name,last_name,products(name)")
          .in("product_id", productIds)
          .order("created_at", { ascending: false })
          .limit(10),
        supabaseAdmin
          .from("reviews")
          .select("rating", { count: "exact" })
          .in("product_id", productIds)
          .limit(5000),
      ]);
      reviews = (recentReviewsRes.data ?? []) as unknown as StoreProfileReview[];
      reviewCount = reviewStatsRes.count ?? 0;
      for (const r of reviewStatsRes.data ?? []) {
        if (typeof r.rating === "number") {
          ratingSum += r.rating;
          ratingN += 1;
        }
      }
    }

    // Active offers: promotions currently running on this seller's products.
    let promotions: {
      id: string;
      product_id: string;
      sale_price: number;
      starts_at: string;
      ends_at: string;
      product: { id: string; name: Json; slug: string } | null;
    }[] = [];
    if (productIds.length) {
      const { data: promoRows } = await supabaseAdmin
        .from("product_promotions")
        .select("id,sale_price,starts_at,ends_at,product_id,products(id,name,slug)")
        .in("product_id", productIds)
        .eq("active", true)
        .order("ends_at", { ascending: true })
        .limit(20);
      promotions = (promoRows ?? []).map((p) => ({
        id: p.id as string,
        product_id: p.product_id as string,
        sale_price: p.sale_price as number,
        starts_at: p.starts_at as string,
        ends_at: p.ends_at as string,
        product: p.products as { id: string; name: Json; slug: string } | null,
      }));
    }

    return {
      store: typedStore,
      seller: (sellerRes.data ?? null) as Pick<
        SellerRow,
        | "id"
        | "legal_name"
        | "first_name"
        | "last_name"
        | "email"
        | "phone"
        | "account_status"
        | "commission_rate"
        | "created_at"
      > | null,
      stats: {
        productCount: productCountRes.count ?? 0,
        orderCount,
        salesTotal,
        reviewCount,
        avgRating: ratingN > 0 ? ratingSum / ratingN : null,
        activeOfferCount: promotions.length,
      },
      recentOrders: ordersRes.data ?? [],
      recentProducts: productsRes.data ?? [],
      reviews,
      promotions,
      orderStatusCounts: [...orderStatusCounts.entries()].map(([status, count]) => ({
        status,
        count,
      })),
      auditLogs: auditRes.data ?? [],
    };
  });

/* ------------------------------------------------------------------ */
/* Store status                                                        */
/* ------------------------------------------------------------------ */

const storeStatusSchema = z.enum(["draft", "active", "suspended", "closed"]);

export const updateStoreStatus = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ storeId: z.string().uuid(), status: storeStatusSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id,status,seller_id")
      .eq("id", data.storeId)
      .single();
    if (!store) throw new Error("Store not found.");
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ status: data.status })
      .eq("id", data.storeId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "store_status_updated",
      resource: "store",
      resource_id: data.storeId,
      metadata: { from: store.status, to: data.status },
    });

    // Notify the seller's team about the store status change (best-effort).
    try {
      if (store.seller_id) {
        await emitSellerNotification(store.seller_id, {
          type: "store_status_changed",
          params: { status: data.status },
          link: "/seller/settings",
          payload: { store_id: data.storeId, from: store.status, to: data.status },
        });
      }
    } catch {
      /* notifications are best-effort */
    }

    return { ok: true as const, status: data.status };
  });
