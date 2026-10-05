import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { emitSellerNotification } from "@/lib/notifications.functions";
import { assertAdmin } from "@/lib/admin-auth";

type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ShippingRuleInsert = Database["public"]["Tables"]["shipping_rules"]["Insert"];
type SettlementUpdate = Database["public"]["Tables"]["seller_settlements"]["Update"];

/**
 * Admin catalog & operations server functions (Phase 1/4, Worker 5).
 *
 * Covers products, categories, reviews, coupons, shipping rules, seller
 * settlements and audit logs. Every function is admin-only:
 * `.middleware([requireSupabaseAuth])` plus the shared `assertAdmin` from
 * `@/lib/admin-auth` that calls the `is_super_admin` RPC.
 *
 * All financial math and validation happen server-side; client values are
 * never trusted. Important mutations are written to public.audit_logs.
 */

const adminOnly = [requireSupabaseAuth] as const;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function auditLog(
  actorId: string | null,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const supabaseAdmin = await adminClient();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action,
      resource,
      resource_id: resourceId,
      metadata,
    });
  } catch {
    // Audit logging must never block the underlying mutation.
  }
}

const PAGE_SIZE = 25;

const pageInput = z.object({ page: z.number().int().min(1).default(1) });

const nameJson = z.object({
  fr: z.string().optional(),
  en: z.string().optional(),
  ar: z.string().optional(),
});

/** Local row shapes (kept loose: server data crosses the wire as JSON). */
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

// ---------------------------------------------------------------------------
// Sellers (lite list for scope selects)
// ---------------------------------------------------------------------------

export const listAdminSellersLite = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("sellers")
      .select("id, legal_name, account_status")
      .order("legal_name");
    if (error) throw new Error(error.message);
    return { sellers: data ?? [] };
  });

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type AdminProductModerationDecision = "approve" | "reject" | "hide";
export type AdminProductStatus = "draft" | "active" | "archived";

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        q: z.string().max(120).optional(),
        moderationStatus: z.string().max(40).optional(),
        status: z.enum(["draft", "active", "archived"]).optional(),
        sellerId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const from = (data.page - 1) * PAGE_SIZE;
    let query = context.supabase
      .from("products")
      .select(
        "id, slug, name, base_price, compare_at_price, status, moderation_status, publication_status, visibility, featured, seller_id, category_id, weight_grams, moderation_reason, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (data.q) {
      const term = data.q.trim().replace(/[%_,]/g, "");
      if (term) {
        query = query.or(
          `slug.ilike.%${term}%,name->>fr.ilike.%${term}%,name->>en.ilike.%${term}%,name->>ar.ilike.%${term}%`,
        );
      }
    }
    if (data.moderationStatus) query = query.eq("moderation_status", data.moderationStatus);
    if (data.status) query = query.eq("status", data.status);
    if (data.sellerId) query = query.eq("seller_id", data.sellerId);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      products: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });

export const moderateAdminProduct = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approve", "reject", "hide"]),
        reason: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const now = new Date().toISOString();
    const base = {
      moderated_by: context.userId ?? null,
      moderated_at: now,
      moderation_reason: data.reason?.trim() || null,
    };
    const update =
      data.decision === "approve"
        ? {
            ...base,
            moderation_status: "approved",
            publication_status: "published",
            visibility: "public",
            status: "active" as const,
            published_at: now,
          }
        : data.decision === "hide"
          ? { ...base, visibility: "hidden", publication_status: "hidden" }
          : {
              ...base,
              moderation_status: "rejected",
              publication_status: "rejected",
              visibility: "hidden",
              status: "draft" as const,
            };
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin.from("products").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `product_${data.decision}d`, "product", data.id, {
      decision: data.decision,
      reason: data.reason ?? null,
    });

    // Notify the seller about the moderation decision (best-effort).
    try {
      const productRow = await supabaseAdmin.from("products").select("id,seller_id,name").eq("id", data.id).maybeSingle();
      const sellerId = productRow.data?.seller_id;
      if (sellerId) {
        const rawName = productRow.data?.name as Record<string, unknown> | string | null;
        const productName =
          typeof rawName === "string"
            ? rawName
            : typeof rawName?.["fr"] === "string"
              ? (rawName["fr"] as string)
              : typeof rawName?.["en"] === "string"
                ? (rawName["en"] as string)
                : "Product";
        await emitSellerNotification(sellerId, {
          type: data.decision === "approve" ? "product_approved" : data.decision === "reject" ? "product_rejected" : "product_hidden",
          params: { productName, reason: data.reason?.trim() || undefined },
          link: `/seller/products/${data.id}`,
          payload: { product_id: data.id, decision: data.decision },
        });
      }
    } catch {
      /* notifications are best-effort */
    }

    return { ok: true as const };
  });

export const updateAdminProduct = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            base_price: z.number().positive().max(100_000_000).optional(),
            compare_at_price: z.number().positive().max(100_000_000).nullable().optional(),
            weight_grams: z.number().int().positive().max(10_000_000).nullable().optional(),
            featured: z.boolean().optional(),
            category_id: z.string().uuid().nullable().optional(),
          })
          .refine((p) => Object.keys(p).length > 0, { message: "Nothing to update." }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();

    // Fetch current row so cross-field checks (compare_at_price > base_price)
    // use server-side truth, never client-supplied companions.
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("id, base_price, compare_at_price, category_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchError || !current) throw new Error("Product not found.");

    const newBase = data.patch.base_price ?? Number(current.base_price);
    const newCompare =
      data.patch.compare_at_price !== undefined ? data.patch.compare_at_price : current.compare_at_price;
    if (newCompare !== null && newCompare !== undefined && Number(newCompare) <= newBase) {
      throw new Error("Compare-at price must be higher than the selling price.");
    }
    if (data.patch.category_id) {
      const { data: category, error: catError } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("id", data.patch.category_id)
        .maybeSingle();
      if (catError || !category) throw new Error("Category not found.");
    }

    const update: ProductUpdate = { updated_at: new Date().toISOString() };
    if (data.patch.base_price !== undefined) update.base_price = data.patch.base_price;
    if (data.patch.compare_at_price !== undefined) update.compare_at_price = data.patch.compare_at_price;
    if (data.patch.weight_grams !== undefined) update.weight_grams = data.patch.weight_grams;
    if (data.patch.featured !== undefined) update.featured = data.patch.featured;
    if (data.patch.category_id !== undefined) update.category_id = data.patch.category_id;

    const { error } = await supabaseAdmin.from("products").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "product_updated", "product", data.id, { patch: update });
    return { ok: true as const };
  });

export const setProductStatus = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["draft", "active", "archived"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const update: ProductUpdate = { status: data.status, updated_at: new Date().toISOString() };
    if (data.status === "archived") {
      update.visibility = "hidden";
      update.publication_status = "hidden";
    }
    const { error } = await supabaseAdmin.from("products").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `product_${data.status}`, "product", data.id, {
      status: data.status,
    });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Admin product creation
// ---------------------------------------------------------------------------

/** Minimal slugifier for admin-created products: latin chars, dashes. */
function slugifyProductName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const createAdminProductInput = z.object({
  seller_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  name_locale: z.enum(["ar", "fr", "en"]),
  base_price: z.number().positive().max(100_000_000),
  category_id: z.string().uuid().nullable().optional(),
});

/**
 * Admin-only product creation. The product is inserted as a private draft
 * (status `draft`, visibility `private`, moderation `pending`) attached to the
 * chosen seller and their store when one exists; the seller completes it from
 * their own dashboard. The slug is generated server-side and guaranteed
 * unique.
 */
export const createAdminProduct = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => createAdminProductInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("sellers")
      .select("id,account_status")
      .eq("id", data.seller_id)
      .maybeSingle();
    if (sellerError || !seller) throw new Error("Seller not found.");
    if (seller.account_status === "disabled" || seller.account_status === "suspended") {
      throw new Error("Cannot create a product for a disabled or suspended seller.");
    }

    if (data.category_id) {
      const { data: category, error: catError } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("id", data.category_id)
        .maybeSingle();
      if (catError || !category) throw new Error("Category not found.");
    }

    // The seller's store (one store per seller), when it exists.
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("seller_id", data.seller_id)
      .maybeSingle();

    const base = slugifyProductName(data.name) || "product";
    let slug = base;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 8)}`;
      const { data: clash } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!clash) {
        slug = candidate;
        break;
      }
      slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    }
    {
      const { data: clash } = await supabaseAdmin.from("products").select("id").eq("slug", slug).maybeSingle();
      if (clash) throw new Error("Could not generate a unique slug. Please try again.");
    }

    const insert: ProductInsert = {
      seller_id: data.seller_id,
      store_id: store?.id ?? null,
      slug,
      name: { [data.name_locale]: data.name } as Json,
      base_price: data.base_price,
      category_id: data.category_id ?? null,
      status: "draft",
      currency: "DZD",
    };
    const { data: created, error: insertError } = await supabaseAdmin
      .from("products")
      .insert(insert)
      .select("id,slug")
      .single();
    if (insertError || !created) throw new Error(insertError?.message ?? "Could not create the product.");

    await auditLog(context.userId ?? null, "product_created", "product", created.id, {
      slug,
      seller_id: data.seller_id,
      via: "admin",
    });
    return { ok: true as const, id: created.id, slug: created.slug };
  });

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategoryNode = CategoryRow & { children: CategoryNode[] };

export const listAdminCategories = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("categories")
      .select("id, parent_id, slug, name, status, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CategoryRow[];
    const byParent = new Map<string | null, CategoryRow[]>();
    for (const row of rows) {
      const key = row.parent_id ?? null;
      const bucket = byParent.get(key);
      if (bucket) bucket.push(row);
      else byParent.set(key, [row]);
    }
    const build = (parentId: string | null): CategoryNode[] =>
      (byParent.get(parentId) ?? []).map((row) => ({ ...row, children: build(row.id) }));
    return { tree: build(null), flat: rows };
  });

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        parent_id: z.string().uuid().nullable().optional(),
        slug: z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, digits and hyphens."),
        name: nameJson.refine((n) => n.fr || n.en || n.ar, {
          message: "At least one name (fr/en/ar) is required.",
        }),
        status: z.enum(["active", "inactive"]).default("active"),
        sort_order: z.number().int().min(0).max(10_000).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    if (data.parent_id) {
      if (data.id && data.parent_id === data.id) {
        throw new Error("A category cannot be its own parent.");
      }
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("id", data.parent_id)
        .maybeSingle();
      if (parentError || !parent) throw new Error("Parent category not found.");
    }
    // Slug must be unique (excluding self on edit).
    let slugQuery = supabaseAdmin.from("categories").select("id").eq("slug", data.slug);
    if (data.id) slugQuery = slugQuery.neq("id", data.id);
    const { data: clash } = await slugQuery.maybeSingle();
    if (clash) throw new Error("Slug is already used by another category.");

    const payload = {
      parent_id: data.parent_id ?? null,
      slug: data.slug,
      name: { fr: data.name.fr ?? "", en: data.name.en ?? "", ar: data.name.ar ?? "" },
      status: data.status,
      sort_order: data.sort_order,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("categories").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await auditLog(context.userId ?? null, "category_updated", "category", data.id, { slug: data.slug });
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin.from("categories").insert(payload).select("id").single();
    if (error || !created) throw new Error(error?.message ?? "Could not create category.");
    await auditLog(context.userId ?? null, "category_created", "category", created.id, { slug: data.slug });
    return { id: created.id as string };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { count: childCount, error: childError } = await supabaseAdmin
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", data.id);
    if (childError) throw new Error(childError.message);
    if ((childCount ?? 0) > 0) {
      throw new Error(`Cannot delete: this category has ${childCount} sub-categorie(s). Move or delete them first.`);
    }
    const { count: productCount, error: productError } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);
    if (productError) throw new Error(productError.message);
    if ((productCount ?? 0) > 0) {
      throw new Error(`Cannot delete: ${productCount} product(s) still use this category. Reassign them first.`);
    }
    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "category_deleted", "category", data.id, {});
    return { ok: true as const };
  });

export const reorderCategories = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        orders: z
          .array(
            z.object({
              id: z.string().uuid(),
              sort_order: z.number().int().min(0).max(10_000),
              parent_id: z.string().uuid().nullable(),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    for (const order of data.orders) {
      if (order.parent_id === order.id) throw new Error("A category cannot be its own parent.");
      const { error } = await supabaseAdmin
        .from("categories")
        .update({ sort_order: order.sort_order, parent_id: order.parent_id, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw new Error(error.message);
    }
    await auditLog(context.userId ?? null, "categories_reordered", "category", null, {
      count: data.orders.length,
    });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export type ReviewQueue = "pending" | "approved" | "rejected" | "hidden" | "flagged";

export const listAdminReviews = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        queue: z.enum(["pending", "approved", "rejected", "hidden", "flagged"]),
        page: z.number().int().min(1).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const from = (data.page - 1) * PAGE_SIZE;
    let query = context.supabase
      .from("reviews")
      .select(
        "id, product_id, rating, body, moderation_status, flagged_at, verified_purchase, moderation_reason, first_name, last_name, created_at, image_path, products!inner(id, slug, name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (data.queue === "flagged") {
      query = query.not("flagged_at", "is", null);
    } else {
      query = query.eq("moderation_status", data.queue);
    }
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    // Pending (unapproved) review photos are not publicly readable — mint
    // short-lived signed URLs so moderators can actually see what they are
    // approving.
    const supabaseAdmin = await adminClient();
    const reviews = await Promise.all(
      (rows ?? []).map(async (row) => {
        let imageUrl: string | null = null;
        if (row.image_path) {
          try {
            const { data: signed } = await supabaseAdmin.storage
              .from("review-images")
              .createSignedUrl(row.image_path, 3600);
            imageUrl = signed?.signedUrl ?? null;
          } catch {
            imageUrl = null;
          }
        }
        return { ...row, image_url: imageUrl };
      }),
    );
    return {
      reviews,
      total: count ?? 0,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });

export const moderateReview = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approve", "reject", "hide"]),
        reason: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const update = {
      moderation_status: data.decision === "approve" ? "approved" : data.decision === "hide" ? "hidden" : "rejected",
      moderation_reason: data.reason?.trim() || null,
      moderated_by: context.userId ?? null,
      moderated_at: new Date().toISOString(),
    };
    const supabaseAdmin = await adminClient();
    // On reject/hide, remove the guest's photo from the review-images bucket
    // (best-effort) so rejected imagery never stays publicly reachable.
    if (data.decision !== "approve") {
      try {
        const { data: row } = await supabaseAdmin
          .from("reviews")
          .select("image_path")
          .eq("id", data.id)
          .maybeSingle();
        if (row?.image_path) {
          await supabaseAdmin.storage.from("review-images").remove([row.image_path]);
        }
      } catch {
        /* best effort */
      }
    }
    const { error } = await supabaseAdmin.from("reviews").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `review_${data.decision}d`, "review", data.id, {
      decision: data.decision,
      reason: data.reason ?? null,
    });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

/** Row shape including the new migration columns (types.ts has not been regenerated yet). */
export type AdminCouponRow = Database["public"]["Tables"]["coupons"]["Row"] & {
  min_order_amount: number | null;
  max_discount_amount: number | null;
  usage_count: number;
  per_customer_limit: number | null;
};

/** List shapes matching the selects below (keeps route code type-safe). */
export type AdminProductListItem = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  | "id" | "slug" | "name" | "base_price" | "compare_at_price" | "status"
  | "moderation_status" | "publication_status" | "visibility" | "featured"
  | "seller_id" | "category_id" | "weight_grams" | "moderation_reason" | "created_at"
>;
export type AdminSettlementListItem = Pick<
  Database["public"]["Tables"]["seller_settlements"]["Row"],
  | "id" | "seller_id" | "amount" | "currency" | "period_start" | "period_end"
  | "status" | "payment_reference" | "payment_proof_path" | "verified_by" | "verified_at" | "settled_at"
  | "notes" | "created_at"
>;
export type AdminShippingRuleListItem = Pick<
  Database["public"]["Tables"]["shipping_rules"]["Row"],
  | "id" | "seller_id" | "wilaya_id" | "commune_id" | "delivery_method" | "price"
  | "min_weight_grams" | "max_weight_grams" | "enabled" | "status"
> & {
  wilayas: { id: string; code: string; name: Json } | null;
  communes: { id: string; code: string; name: Json } | null;
};

const couponDates = z
  .object({
    starts_at: z.string().datetime().nullable().optional(),
    ends_at: z.string().datetime().nullable().optional(),
  })
  .refine(
    (d) => !d.starts_at || !d.ends_at || new Date(d.starts_at) < new Date(d.ends_at),
    { message: "Start date must be before the end date." },
  );

export const listAdminCoupons = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => pageInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const from = (data.page - 1) * PAGE_SIZE;
    const { data: rows, error, count } = await context.supabase
      .from("coupons")
      .select(
        "id, code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, ends_at, seller_id, status, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return {
      coupons: (rows ?? []) as unknown as AdminCouponRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });

export const upsertCoupon = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z
          .string()
          .min(3)
          .max(32)
          .transform((c) => c.trim().toUpperCase())
          .refine((c) => /^[A-Z0-9_-]+$/.test(c), {
            message: "Code may only contain letters, digits, hyphens and underscores.",
          }),
        discount_type: z.enum(["percentage", "fixed"]),
        discount_value: z.number().positive().max(10_000_000),
        min_order_amount: z.number().min(0).max(10_000_000).nullable().optional(),
        max_discount_amount: z.number().positive().max(10_000_000).nullable().optional(),
        usage_limit: z.number().int().positive().max(10_000_000).nullable().optional(),
        per_customer_limit: z.number().int().positive().max(10_000_000).nullable().optional(),
        seller_id: z.string().uuid().nullable().optional(),
        status: z.enum(["active", "inactive"]).default("active"),
      })
      .and(couponDates)
      .refine(
        (d) =>
          d.discount_type === "percentage"
            ? d.discount_value >= 1 && d.discount_value <= 100
            : d.discount_value > 0,
        { message: "Percentage discounts must be between 1 and 100." },
      )
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();

    // Code is uppercase + unique platform-wide.
    let codeQuery = supabaseAdmin.from("coupons").select("id").eq("code", data.code);
    if (data.id) codeQuery = codeQuery.neq("id", data.id);
    const { data: clash } = await codeQuery.maybeSingle();
    if (clash) throw new Error("This coupon code is already in use.");

    if (data.seller_id) {
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from("sellers")
        .select("id")
        .eq("id", data.seller_id)
        .maybeSingle();
      if (sellerError || !seller) throw new Error("Seller not found.");
    }

    // NOTE: min_order_amount / max_discount_amount / per_customer_limit / usage_count
    // were added by migration 20261005140000_modalia_coupon_columns.sql and are not
    // yet in the generated types — the payload is cast for that reason only.
    const payload: Record<string, unknown> = {
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_order_amount: data.min_order_amount ?? null,
      max_discount_amount: data.max_discount_amount ?? null,
      usage_limit: data.usage_limit ?? null,
      per_customer_limit: data.per_customer_limit ?? null,
      starts_at: data.starts_at ?? null,
      ends_at: data.ends_at ?? null,
      seller_id: data.seller_id ?? null,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("coupons").update(payload as any).eq("id", data.id);
      if (error) throw new Error(error.message);
      await auditLog(context.userId ?? null, "coupon_updated", "coupon", data.id, { code: data.code });
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("coupons")
      .insert(payload as any)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create coupon.");
    await auditLog(context.userId ?? null, "coupon_created", "coupon", created.id, { code: data.code });
    return { id: created.id as string };
  });

export const setCouponStatus = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["active", "inactive"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("coupons")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `coupon_${data.status}`, "coupon", data.id, {
      status: data.status,
    });
    return { ok: true as const };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: coupon } = await supabaseAdmin.from("coupons").select("code").eq("id", data.id).maybeSingle();
    const { error } = await supabaseAdmin.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, "coupon_deleted", "coupon", data.id, {
      code: coupon?.code ?? null,
    });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export const listWilayas = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("wilayas")
      .select("id, code, name, active")
      .order("code");
    if (error) throw new Error(error.message);
    return { wilayas: data ?? [] };
  });

export const listCommunes = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ wilayaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("communes")
      .select("id, wilaya_id, code, name, active")
      .eq("wilaya_id", data.wilayaId)
      .order("code");
    if (error) throw new Error(error.message);
    return { communes: rows ?? [] };
  });

export const listShippingRules = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        wilayaId: z.string().uuid().optional(),
        deliveryMethod: z.enum(["home", "office"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let query = context.supabase
      .from("shipping_rules")
      .select(
        "id, seller_id, wilaya_id, commune_id, delivery_method, price, min_weight_grams, max_weight_grams, enabled, status, wilayas(id, code, name), communes(id, code, name)",
      )
      .order("min_weight_grams", { ascending: true });
    if (data.wilayaId) query = query.eq("wilaya_id", data.wilayaId);
    if (data.deliveryMethod) query = query.eq("delivery_method", data.deliveryMethod);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rules: rows ?? [] };
  });

export const upsertShippingRule = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        seller_id: z.string().uuid().nullable().optional(),
        wilaya_id: z.string().uuid(),
        commune_id: z.string().uuid().nullable().optional(),
        delivery_method: z.enum(["home", "office"]),
        price: z.number().min(0).max(10_000_000),
        min_weight_grams: z.number().int().min(0).max(10_000_000).default(0),
        max_weight_grams: z.number().int().positive().max(10_000_000).nullable().optional(),
        enabled: z.boolean().default(true),
      })
      .refine((d) => d.max_weight_grams == null || d.max_weight_grams > d.min_weight_grams, {
        message: "Max weight must be greater than min weight (or left empty for no upper limit).",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();

    const { data: wilaya, error: wilayaError } = await supabaseAdmin
      .from("wilayas")
      .select("id")
      .eq("id", data.wilaya_id)
      .maybeSingle();
    if (wilayaError || !wilaya) throw new Error("Wilaya not found.");

    if (data.commune_id) {
      const { data: commune, error: communeError } = await supabaseAdmin
        .from("communes")
        .select("id, wilaya_id")
        .eq("id", data.commune_id)
        .maybeSingle();
      if (communeError || !commune) throw new Error("Commune not found.");
      if (commune.wilaya_id !== data.wilaya_id) {
        throw new Error("Commune does not belong to the selected wilaya.");
      }
    }

    if (data.seller_id) {
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from("sellers")
        .select("id")
        .eq("id", data.seller_id)
        .maybeSingle();
      if (sellerError || !seller) throw new Error("Seller not found.");
    }

    const payload: ShippingRuleInsert = {
      seller_id: data.seller_id ?? null,
      wilaya_id: data.wilaya_id,
      commune_id: data.commune_id ?? null,
      delivery_method: data.delivery_method,
      price: data.price,
      min_weight_grams: data.min_weight_grams,
      max_weight_grams: data.max_weight_grams ?? null,
      enabled: data.enabled,
      status: "active",
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("shipping_rules").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await auditLog(context.userId ?? null, "shipping_rule_updated", "shipping_rule", data.id, {
        wilaya_id: data.wilaya_id,
        delivery_method: data.delivery_method,
        price: data.price,
      });
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("shipping_rules")
      .insert(payload)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create shipping rule.");
    await auditLog(context.userId ?? null, "shipping_rule_created", "shipping_rule", created.id, {
      wilaya_id: data.wilaya_id,
      delivery_method: data.delivery_method,
      price: data.price,
    });
    return { id: created.id as string };
  });

export const setShippingRuleEnabled = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("shipping_rules")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `shipping_rule_${data.enabled ? "enabled" : "disabled"}`, "shipping_rule", data.id, {});
    return { ok: true as const };
  });

export const setWilayaActive = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ wilayaId: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("wilayas")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.wilayaId);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `wilaya_${data.active ? "activated" : "deactivated"}`, "wilaya", data.wilayaId, {});
    return { ok: true as const };
  });

export const setCommuneActive = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z.object({ communeId: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("communes")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.communeId);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `commune_${data.active ? "activated" : "deactivated"}`, "commune", data.communeId, {});
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

/** Statuses that count as already paid out to the seller. */
const SETTLED_STATUSES = ["approved", "paid"] as const;

/**
 * Seller orders whose commission is considered earned and payable.
 * Note: the seller_order_status enum only has "fulfilled" as a terminal,
 * pay-out state (there is no "delivered" status), so that is what we sum.
 */
const EARNED_ORDER_STATUS = "fulfilled";

const SETTLEMENT_TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["paid", "cancelled"],
  rejected: [],
  cancelled: [],
  paid: [],
};

export const listSettlements = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        status: z.enum(["pending", "approved", "paid", "rejected", "cancelled"]).optional(),
        sellerId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const from = (data.page - 1) * PAGE_SIZE;
    let query = context.supabase
      .from("seller_settlements")
      .select(
        "id, seller_id, amount, currency, period_start, period_end, status, payment_reference, payment_proof_path, verified_by, verified_at, settled_at, notes, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (data.status) query = query.eq("status", data.status);
    if (data.sellerId) query = query.eq("seller_id", data.sellerId);
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      settlements: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });

export const settlementReference = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => z.object({ sellerId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = context.supabase;

    const { data: orders, error: ordersError } = await s
      .from("seller_orders")
      .select("commission_total, subtotal")
      .eq("seller_id", data.sellerId)
      .eq("status", EARNED_ORDER_STATUS);
    if (ordersError) throw new Error(ordersError.message);

    const { data: settlements, error: settlementsError } = await s
      .from("seller_settlements")
      .select("amount")
      .eq("seller_id", data.sellerId)
      .in("status", [...SETTLED_STATUSES]);
    if (settlementsError) throw new Error(settlementsError.message);

    const earnedTotal = (orders ?? []).reduce((sum, o) => sum + Number(o.commission_total ?? 0), 0);
    const settledTotal = (settlements ?? []).reduce((sum, st) => sum + Number(st.amount ?? 0), 0);
    return {
      sellerId: data.sellerId,
      orderCount: orders?.length ?? 0,
      earnedTotal,
      settledTotal,
      available: earnedTotal - settledTotal,
      // Honest labels: the earned figure counts only fulfilled orders,
      // and settled counts approved + paid settlements only.
      earnedLabel: "Commission earned from fulfilled seller orders",
      settledLabel: "Already settled (approved + paid settlements)",
    };
  });

export const createSettlement = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        sellerId: z.string().uuid(),
        amount: z.number().positive().max(100_000_000_000),
        period_start: z.string().date().nullable().optional(),
        period_end: z.string().date().nullable().optional(),
        notes: z.string().max(1000).optional(),
      })
      .refine(
        (d) => !d.period_start || !d.period_end || d.period_start <= d.period_end,
        { message: "Period start must be before or on the period end." },
      )
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("sellers")
      .select("id")
      .eq("id", data.sellerId)
      .maybeSingle();
    if (sellerError || !seller) throw new Error("Seller not found.");

    const { data: created, error } = await supabaseAdmin
      .from("seller_settlements")
      .insert({
        seller_id: data.sellerId,
        amount: data.amount,
        currency: "DZD",
        period_start: data.period_start ?? null,
        period_end: data.period_end ?? null,
        status: "pending",
        notes: data.notes?.trim() || null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create settlement.");
    await auditLog(context.userId ?? null, "settlement_created", "seller_settlement", created.id, {
      seller_id: data.sellerId,
      amount: data.amount,
    });
    return { id: created.id as string };
  });

export const updateSettlementStatus = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "paid", "rejected", "cancelled"]),
        payment_reference: z.string().max(200).optional(),
        payment_proof_path: z
          .string()
          .max(500)
          .refine((p) => !p.includes(".."), { message: "Invalid proof path." })
          .nullable()
          .optional(),
        notes: z.string().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: settlement, error: fetchError } = await supabaseAdmin
      .from("seller_settlements")
      .select("id, status, seller_id, amount")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchError || !settlement) throw new Error("Settlement not found.");

    const allowed = SETTLEMENT_TRANSITIONS[settlement.status as string] ?? [];
    if (!allowed.includes(data.status)) {
      throw new Error(
        `Cannot move settlement from "${settlement.status}" to "${data.status}".`,
      );
    }

    const update: SettlementUpdate = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.payment_reference !== undefined) update.payment_reference = data.payment_reference.trim() || null;
    if (data.payment_proof_path !== undefined) update.payment_proof_path = data.payment_proof_path?.trim() || null;
    if (data.notes !== undefined) update.notes = data.notes.trim() || null;
    if (data.status === "paid") update.settled_at = new Date().toISOString();
    if (data.status === "approved") {
      update.verified_by = context.userId ?? null;
      update.verified_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin.from("seller_settlements").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.userId ?? null, `settlement_${data.status}`, "seller_settlement", data.id, {
      from: settlement.status,
      to: data.status,
      payment_reference: data.payment_reference ?? null,
      payment_proof_attached: data.payment_proof_path != null && data.payment_proof_path !== "",
    });

    // Notify the seller about the settlement decision (best-effort).
    try {
      await emitSellerNotification(settlement.seller_id, {
        type: "settlement_updated",
        params: { amount: Number(settlement.amount ?? 0), currency: "DZD", status: data.status },
        link: "/seller/settlements",
        payload: { settlement_id: data.id, status: data.status },
      });
    } catch {
      /* notifications are best-effort */
    }

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Audit logs (read-only)
// ---------------------------------------------------------------------------

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) =>
    z
      .object({
        action: z.string().max(120).optional(),
        resource: z.string().max(120).optional(),
        page: z.number().int().min(1).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const from = (data.page - 1) * PAGE_SIZE;
    let query = context.supabase
      .from("audit_logs")
      .select("id, actor_id, action, resource, resource_id, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (data.action) query = query.ilike("action", `%${data.action.trim().replace(/[%_,]/g, "")}%`);
    if (data.resource) query = query.eq("resource", data.resource);
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      logs: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });
// ---------------------------------------------------------------------------
// Bulk product operations — only reversible actions (Phase 3/8, Worker 4)
// ---------------------------------------------------------------------------

const bulkModerateInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  decision: z.enum(["approve", "reject", "hide"]),
  reason: z.string().max(500).optional(),
});

/**
 * Bulk moderation. Only reversible decisions are allowed in bulk:
 * approve / hide / reject — every one of them can be undone from the
 * product table (re-approve, re-hide, re-submit). Destructive deletes are
 * intentionally not offered in bulk.
 */
export const bulkModerateAdminProducts = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => bulkModerateInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const now = new Date().toISOString();
    const base = {
      moderated_by: context.userId ?? null,
      moderated_at: now,
      moderation_reason: data.reason?.trim() || null,
    };
    const update =
      data.decision === "approve"
        ? {
            ...base,
            moderation_status: "approved",
            publication_status: "published",
            visibility: "public",
            status: "active" as const,
            published_at: now,
          }
        : data.decision === "hide"
          ? { ...base, visibility: "hidden", publication_status: "hidden" }
          : {
              ...base,
              moderation_status: "rejected",
              publication_status: "rejected",
              visibility: "hidden",
              status: "draft" as const,
            };
    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .update(update)
      .in("id", data.ids)
      .select("id,seller_id");
    if (error) throw new Error(error.message);
    const affected = rows ?? [];
    await auditLog(context.userId ?? null, `product_bulk_${data.decision}d`, "product", null, {
      product_ids: affected.map((r) => r.id),
      decision: data.decision,
      reason: data.reason ?? null,
    });
    try {
      const sellerIds = [...new Set(affected.map((r) => r.seller_id).filter(Boolean))];
      for (const sellerId of sellerIds) {
        await emitSellerNotification(sellerId as string, {
          type:
            data.decision === "approve"
              ? "product_approved"
              : data.decision === "reject"
                ? "product_rejected"
                : "product_hidden",
          params: { productName: `${affected.length} products`, reason: data.reason?.trim() || undefined },
          link: "/seller/products",
          payload: { decision: data.decision, bulk: true },
        });
      }
    } catch {
      /* notifications are best-effort */
    }
    return { ok: true as const, count: affected.length };
  });

const bulkStatusInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum(["active", "archived"]),
});

/** Bulk publish / archive — both reversible from the product table. */
export const bulkSetProductStatus = createServerFn({ method: "POST" })
  .middleware(adminOnly)
  .inputValidator((data) => bulkStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    const affected = rows ?? [];
    await auditLog(context.userId ?? null, `product_bulk_${data.status}`, "product", null, {
      product_ids: affected.map((r) => r.id),
      status: data.status,
    });
    return { ok: true as const, count: affected.length };
  });

// ---------------------------------------------------------------------------
// Settlement payment proofs (Phase 3/8, Worker 4)
// ---------------------------------------------------------------------------

const proofUrlInput = z.object({ settlementId: z.string().uuid() });

/**
 * Mint a short-lived signed URL for a settlement's payment proof.
 * The bucket is private and super-admin only; sellers never see raw paths.
 */
export const getSettlementProofUrl = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => proofUrlInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data: settlement, error } = await supabaseAdmin
      .from("seller_settlements")
      .select("id, payment_proof_path")
      .eq("id", data.settlementId)
      .maybeSingle();
    if (error || !settlement) throw new Error("Settlement not found.");
    const path = settlement.payment_proof_path as string | null;
    if (!path) throw new Error("No payment proof attached to this settlement.");
    if (path.includes("..")) throw new Error("Invalid proof path.");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("settlement-proofs")
      .createSignedUrl(path, 600);
    if (signError || !signed?.signedUrl) throw new Error("Could not generate the proof link.");
    return { url: signed.signedUrl as string };
  });

// ---------------------------------------------------------------------------
// Admin commissions overview (Phase 3/8, Worker 4)
// ---------------------------------------------------------------------------

const listAdminCommissionsInput = z.object({
  q: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
});

export type AdminCommissionRow = {
  sellerId: string;
  legalName: string;
  email: string | null;
  commissionRate: number;
  orderCount: number;
  gross: number;
  commission: number;
  net: number;
  history: { id: string; rate: number; effectiveFrom: string; changedBy: string | null }[];
};

/**
 * Per-seller commission overview: current rate, earned order counts, and the
 * Gross / Commission / Net money split computed from per-order snapshots
 * (seller_orders.subtotal / commission_total — historical snapshots, never
 * recalculated). Rate history carries effective dates.
 */
export const listAdminCommissions = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .inputValidator((data) => listAdminCommissionsInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await adminClient();
    const from = (data.page - 1) * PAGE_SIZE;
    const q = (data.q ?? "").replace(/[,()]/g, "").trim().slice(0, 100);

    let query = supabaseAdmin
      .from("sellers")
      .select("id, legal_name, email, commission_rate", { count: "exact" });
    if (q) query = query.or(`legal_name.ilike.%${q}%,email.ilike.%${q}%`);
    const { data: sellers, error, count } = await query
      .order("legal_name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const sellerIds = (sellers ?? []).map((s) => s.id);

    const [ordersRes, historyRes] = await Promise.all([
      sellerIds.length
        ? supabaseAdmin
            .from("seller_orders")
            .select("seller_id, subtotal, commission_total, status")
            .in("seller_id", sellerIds)
            .in("status", ["delivered", "fulfilled"])
        : Promise.resolve({ data: [] as { seller_id: string; subtotal: number | null; commission_total: number | null; status: string }[], error: null }),
      sellerIds.length
        ? supabaseAdmin
            .from("seller_commission_history")
            .select("id, seller_id, rate, effective_from, changed_by")
            .in("seller_id", sellerIds)
            .order("effective_from", { ascending: false })
        : Promise.resolve({ data: [] as { id: string; seller_id: string; rate: number; effective_from: string; changed_by: string | null }[], error: null }),
    ]);
    if (ordersRes.error) throw new Error(ordersRes.error.message);
    if (historyRes.error) throw new Error(historyRes.error.message);

    const ordersBySeller = new Map<string, { count: number; gross: number; commission: number }>();
    for (const o of ordersRes.data ?? []) {
      const agg = ordersBySeller.get(o.seller_id) ?? { count: 0, gross: 0, commission: 0 };
      agg.count += 1;
      agg.gross += Number(o.subtotal ?? 0);
      agg.commission += Number(o.commission_total ?? 0);
      ordersBySeller.set(o.seller_id, agg);
    }
    const historyBySeller = new Map<string, AdminCommissionRow["history"]>();
    for (const h of historyRes.data ?? []) {
      const list = historyBySeller.get(h.seller_id) ?? [];
      list.push({
        id: h.id,
        rate: Number(h.rate),
        effectiveFrom: h.effective_from,
        changedBy: h.changed_by,
      });
      historyBySeller.set(h.seller_id, list);
    }

    const rows: AdminCommissionRow[] = (sellers ?? []).map((s) => {
      const agg = ordersBySeller.get(s.id) ?? { count: 0, gross: 0, commission: 0 };
      return {
        sellerId: s.id,
        legalName: s.legal_name,
        email: s.email,
        commissionRate: Number(s.commission_rate ?? 0),
        orderCount: agg.count,
        gross: agg.gross,
        commission: agg.commission,
        net: agg.gross - agg.commission,
        history: historyBySeller.get(s.id) ?? [],
      };
    });

    return { rows, total: count ?? 0, page: data.page, pageSize: PAGE_SIZE };
  });
