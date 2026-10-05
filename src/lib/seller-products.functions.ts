/**
 * Seller product + inventory server functions (Phase 2/4, Worker 3).
 *
 * Security: every function runs `.middleware([requireSupabaseAuth])` plus a
 * zod `inputValidator`, then `requireSeller(context, ...permissions)`.
 * `seller_id` is NEVER taken from the client — all ownership checks scope
 * with `products.seller_id = seller.sellerId`.
 *
 * Workflow states:
 *  - draft:            status='draft'
 *  - submit for review: moderation_status='pending', publication_status='pending_review', visibility='private'
 *  - approved (admin):  moderation_status='approved', publication_status='published', visibility='public', status='active'
 *  - hide:             visibility='hidden' (stays published)
 *  - reject (admin):   moderation_status='rejected' (+ moderation_reason)
 *  - archive:          status='archived'
 *
 * Sellers may edit freely while draft/rejected; price/stock edits on
 * published products are allowed but written to audit_logs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import type { Database, Json } from "@/integrations/supabase/types";
import { emitCustomerNotification, emitSellerNotification } from "@/lib/notifications.functions";

type Sb = SupabaseClient<Database>;

const sellerOnly = [requireSupabaseAuth] as const;
const PAGE_SIZE = 25;
const uuid = z.string().uuid();

async function auditLog(
  actorId: string | null,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

/** Verify the product belongs to the seller; return its row (id, status, moderation_status). */
async function ownedProduct(sb: Sb, sellerId: string, productId: string) {
  const { data, error } = await sb
    .from("products")
    .select("id, status, moderation_status")
    .eq("id", productId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) throw new Error("Product lookup failed.");
  if (!data) throw new Error("Product not found or access denied.");
  return data;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function makeSlug(name: Record<string, string>): string {
  const base = slugify(name['en'] || name['fr'] || name['ar'] || "product") || "product";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function asLocaleText(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const k of ["fr", "en", "ar"]) {
      const v = (value as Record<string, unknown>)[k];
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  return {};
}

function localeName(name: unknown, fallback = "—"): string {
  const t = asLocaleText(name);
  return t['fr'] || t['en'] || t['ar'] || fallback;
}

// ---------------------------------------------------------------------------
// Shared zod schemas
// ---------------------------------------------------------------------------

const localeText = z.object({
  fr: z.string().max(4000).optional(),
  en: z.string().max(4000).optional(),
  ar: z.string().max(4000).optional(),
});

const nonEmptyLocale = localeText.refine(
  (v) => (v.fr ?? "").trim() || (v.en ?? "").trim() || (v.ar ?? "").trim(),
  { message: "At least one language is required." },
);

const optionValueInput = z.object({
  label: localeText,
  value: z.string().min(1).max(120),
  colorId: uuid.nullable().optional(),
});

const optionInput = z.object({
  code: z.string().min(1).max(60).optional(),
  name: nonEmptyLocale,
  values: z.array(optionValueInput).min(1).max(60),
});

const variantInput = z.object({
  id: uuid.optional(),
  optionRefs: z
    .array(
      z.object({
        optionCode: z.string().min(1).max(60),
        value: z.string().min(1).max(120),
      }),
    )
    .max(10),
  sku: z.string().min(1).max(80),
  price: z.number().min(0).max(100_000_000),
  compareAtPrice: z.number().min(0).max(100_000_000).optional(),
  barcode: z.string().max(60).optional(),
  weightGrams: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.number().int().min(0).max(100_000).default(3),
  imageId: uuid.optional(),
});

const imageInput = z.object({
  id: uuid.optional(),
  storagePath: z.string().min(1).max(500),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  mediaType: z.enum(["image", "model_3d"]).default("image"),
  altText: localeText.optional(),
});

const saveProductSchema = z.object({
  id: uuid.optional(),
  name: nonEmptyLocale,
  description: localeText.optional(),
  shortDescription: localeText.optional(),
  categoryId: uuid.nullable().optional(),
  brandId: uuid.nullable().optional(),
  sku: z.string().max(80).optional(),
  barcode: z.string().max(60).optional(),
  weightGrams: z.number().int().min(0).optional(),
  basePrice: z.number().min(0).max(100_000_000),
  compareAtPrice: z.number().min(0).max(100_000_000).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
  seoTitle: z.string().max(120).optional(),
  seoDescription: z.string().max(320).optional(),
  images: z.array(imageInput).max(20).default([]),
  options: z.array(optionInput).max(5).default([]),
  variants: z.array(variantInput).min(1).max(200),
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export const getSellerCategories = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    await requireSeller(context, "products.view");
    const sb = context.supabase as Sb;
    const { data, error } = await sb
      .from("categories")
      .select("id, parent_id, name, status")
      .eq("status", "active")
      .order("name->>fr");
    if (error) throw new Error(error.message);
    return { categories: data ?? [] };
  });

export const getSellerBrands = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    await requireSeller(context, "products.view");
    const sb = context.supabase as Sb;
    const { data, error } = await sb
      .from("brands")
      .select("id, name, slug")
      .order("name");
    if (error) throw new Error(error.message);
    return { brands: data ?? [] };
  });

export const getSellerColors = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    await requireSeller(context, "products.view");
    const sb = context.supabase as Sb;
    const { data, error } = await sb
      .from("colors")
      .select("id, name, slug, hex_value")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { colors: data ?? [] };
  });

export const listSellerProducts = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) =>
    z
      .object({
        q: z.string().max(120).optional(),
        status: z.enum(["draft", "active", "archived"]).optional(),
        moderation: z.string().max(40).optional(),
        page: z.number().int().min(1).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.view");
    const sb = context.supabase as Sb;
    const from = (data.page - 1) * PAGE_SIZE;
    let query = sb
      .from("products")
      .select(
        "id, slug, name, sku, base_price, status, moderation_status, publication_status, visibility, created_at, categories(name), brands(name), product_variants(id, sku, inventory(quantity, reserved_quantity, low_stock_threshold))",
        { count: "exact" },
      )
      .eq("seller_id", seller.sellerId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (data.q) {
      const term = data.q.trim().replace(/[%_,]/g, "");
      if (term) {
        query = query.or(
          `name->>fr.ilike.%${term}%,name->>en.ilike.%${term}%,name->>ar.ilike.%${term}%,sku.ilike.%${term}%`,
        );
      }
    }
    if (data.status) query = query.eq("status", data.status);
    if (data.moderation) query = query.eq("moderation_status", data.moderation);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      products: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });

// ---------------------------------------------------------------------------
// Editor payload
// ---------------------------------------------------------------------------

export const getProductEditor = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ productId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.view");
    const sb = context.supabase as Sb;
    await ownedProduct(sb, seller.sellerId, data.productId);

    const { data: product, error } = await sb
      .from("products")
      .select(
        "*, categories(id, name), brands(id, name), " +
          "product_options(id, code, name, sort_order, product_option_values(id, label, value, color_id, sort_order)), " +
          "product_variants(id, sku, price, compare_at_price, barcode, weight_grams, available, status, image_id, sort_order, variant_option_values(product_option_value_id), inventory(quantity, reserved_quantity, low_stock_threshold)), " +
          "product_images(id, storage_path, alt_text, is_primary, sort_order, media_type, variant_id), " +
          "product_tag_assignments(product_tags(id, name, slug))",
      )
      .eq("id", data.productId)
      .single();
    if (error || !product) throw new Error(error?.message ?? "Product not found.");
    return { product };
  });

// ---------------------------------------------------------------------------
// Save (create / update) — ordered writes, no real transaction available
// ---------------------------------------------------------------------------

type SaveInput = z.infer<typeof saveProductSchema>;

async function ensureUniqueVariantSkus(
  sb: Sb,
  sellerId: string,
  skus: string[],
  excludeProductId?: string,
) {
  if (!skus.length) return;
  let q = sb
    .from("product_variants")
    .select("sku, product_id, products!inner(seller_id)")
    .in("sku", skus)
    .eq("products.seller_id", sellerId);
  if (excludeProductId) q = q.neq("product_id", excludeProductId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (data && data.length) {
    const dupes = [...new Set(data.map((r) => r.sku))];
    throw new Error(`Duplicate variant SKU${dupes.length > 1 ? "s" : ""}: ${dupes.join(", ")}`);
  }
}

export const saveProduct = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => saveProductSchema.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.edit");
    const sb = context.supabase as Sb;

    // Variant SKUs must be unique within the input itself…
    const seen = new Set<string>();
    for (const v of data.variants) {
      const key = v.sku.trim().toLowerCase();
      if (seen.has(key)) throw new Error(`Duplicate variant SKU in this product: ${v.sku}`);
      seen.add(key);
    }
    // …and unique per seller across the catalog.
    await ensureUniqueVariantSkus(
      sb,
      seller.sellerId,
      data.variants.map((v) => v.sku.trim()),
      data.id,
    );

    // Media uploaded through storage lives under `<sellerId>/…` (see the
    // product-media bucket policies). Reject paths outside the caller's own
    // prefix so one seller cannot attach another seller's objects to their
    // products.
    const mediaPrefix = `${seller.sellerId}/`;
    for (const img of data.images) {
      const path = img.storagePath.trim();
      if (path.includes("..") || !path.startsWith(mediaPrefix)) {
        throw new Error("One or more image paths are not valid for this seller.");
      }
    }

    let productId: string;
    let isNew: boolean;

    if (data.id) {
      const existing = await ownedProduct(sb, seller.sellerId, data.id);
      const wasPublished = existing.moderation_status === "approved";
      const { error } = await sb
        .from("products")
        .update({
          name: data.name as unknown as Json,
          description: (data.description ?? {}) as unknown as Json,
          short_description: (data.shortDescription ?? {}) as unknown as Json,
          category_id: data.categoryId ?? null,
          brand_id: data.brandId ?? null,
          sku: data.sku?.trim() || null,
          barcode: data.barcode?.trim() || null,
          weight_grams: data.weightGrams ?? null,
          base_price: data.basePrice,
          compare_at_price: data.compareAtPrice ?? null,
          metadata: {
            seo_title: data.seoTitle ?? null,
            seo_description: data.seoDescription ?? null,
          } as unknown as Json,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      productId = data.id;
      isNew = false;
      if (wasPublished) {
        await auditLog(context.userId, "product_edited_published", "product", productId, {
          seller_id: seller.sellerId,
        });
      }
    } else {
      if (!seller.storeId) throw new Error("Create a store before adding products.");
      const nameObj = Object.fromEntries(
        Object.entries(data.name).filter(([, v]) => typeof v === "string" && v.trim()),
      ) as Record<string, string>;
      const { data: inserted, error } = await sb
        .from("products")
        .insert({
          seller_id: seller.sellerId,
          store_id: seller.storeId,
          slug: makeSlug(nameObj),
          name: data.name as unknown as Json,
          description: (data.description ?? {}) as unknown as Json,
          short_description: (data.shortDescription ?? {}) as unknown as Json,
          category_id: data.categoryId ?? null,
          brand_id: data.brandId ?? null,
          sku: data.sku?.trim() || null,
          barcode: data.barcode?.trim() || null,
          weight_grams: data.weightGrams ?? null,
          base_price: data.basePrice,
          compare_at_price: data.compareAtPrice ?? null,
          status: "draft",
          moderation_status: "pending",
          publication_status: "pending_review",
          visibility: "private",
          metadata: {
            seo_title: data.seoTitle ?? null,
            seo_description: data.seoDescription ?? null,
          } as unknown as Json,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Unable to create product.");
      productId = inserted.id;
      isNew = true;
    }

    // Tags — rebuild assignments against existing global tags only.
    const { error: delTagsErr } = await sb
      .from("product_tag_assignments")
      .delete()
      .eq("product_id", productId);
    if (delTagsErr) throw new Error(delTagsErr.message);
    const tagSlugs = [...new Set(data.tags.map((t) => slugify(t)).filter(Boolean))];
    if (tagSlugs.length) {
      const { data: tagRows, error: tagErr } = await sb
        .from("product_tags")
        .select("id, slug")
        .in("slug", tagSlugs);
      if (tagErr) throw new Error(tagErr.message);
      if (tagRows && tagRows.length) {
        const { error: assignErr } = await sb.from("product_tag_assignments").insert(
          tagRows.map((t) => ({ product_id: productId, tag_id: t.id })),
        );
        if (assignErr) throw new Error(assignErr.message);
      }
    }

    // Options — rebuild: clear variant links first (FK), then values, then options.
    const { data: variantIdsRows } = await sb
      .from("product_variants")
      .select("id")
      .eq("product_id", productId);
    const allVariantIds = (variantIdsRows ?? []).map((r) => r.id);
    if (allVariantIds.length) {
      const { error: e1 } = await sb
        .from("variant_option_values")
        .delete()
        .in("variant_id", allVariantIds);
      if (e1) throw new Error(e1.message);
    }
    const { data: optionRows } = await sb
      .from("product_options")
      .select("id")
      .eq("product_id", productId);
    const optionIds = (optionRows ?? []).map((r) => r.id);
    if (optionIds.length) {
      const { error: e2 } = await sb
        .from("product_option_values")
        .delete()
        .in("product_option_id", optionIds);
      if (e2) throw new Error(e2.message);
      const { error: e3 } = await sb.from("product_options").delete().in("id", optionIds);
      if (e3) throw new Error(e3.message);
    }

    // Insert fresh options + values; build optionCode::value → id map.
    const valueIdByKey = new Map<string, string>();
    const optionCodeByIndex = data.options.map((o, i) => {
      const fromName = slugify(
        Object.values(o.name).find((v) => v && v.trim()) ?? `option-${i + 1}`,
      );
      return o.code ?? (fromName || `option-${i + 1}`);
    });
    for (let i = 0; i < data.options.length; i++) {
      const opt = data.options[i]!;
      const code = optionCodeByIndex[i]!;
      const { data: insertedOpt, error: optErr } = await sb
        .from("product_options")
        .insert({
          product_id: productId,
          code,
          name: opt.name as unknown as Json,
          required: true,
          sort_order: i,
        })
        .select("id")
        .single();
      if (optErr || !insertedOpt) throw new Error(optErr?.message ?? "Unable to save options.");
      for (let j = 0; j < opt.values.length; j++) {
        const val = opt.values[j]!;
        const { data: insertedVal, error: valErr } = await sb
          .from("product_option_values")
          .insert({
            product_option_id: insertedOpt.id,
            label: val.label as unknown as Json,
            value: val.value,
            color_id: val.colorId ?? null,
            sort_order: j,
          })
          .select("id")
          .single();
        if (valErr || !insertedVal)
          throw new Error(valErr?.message ?? "Unable to save option values.");
        valueIdByKey.set(`${code}::${val.value}`, insertedVal.id);
      }
    }

    // Variants — sync by id: update existing, insert new, retire removed.
    const existingIds = new Set(allVariantIds);
    const inputIds = new Set(
      data.variants.filter((v) => v.id && existingIds.has(v.id)).map((v) => v.id as string),
    );
    const removedIds = allVariantIds.filter((id) => !inputIds.has(id));

    for (const v of data.variants) {
      const row = {
        sku: v.sku.trim(),
        price: v.price,
        compare_at_price: v.compareAtPrice ?? null,
        barcode: v.barcode?.trim() || null,
        weight_grams: v.weightGrams ?? null,
        available: v.stock > 0,
        sort_order: data.variants.indexOf(v),
      };
      if (v.id && existingIds.has(v.id)) {
        const { error: upErr } = await sb.from("product_variants").update(row).eq("id", v.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        const { data: inserted, error: insErr } = await sb
          .from("product_variants")
          .insert({ ...row, product_id: productId, status: "active" })
          .select("id")
          .single();
        if (insErr || !inserted) throw new Error(insErr?.message ?? "Unable to save variants.");
        v.id = inserted.id;
      }
    }

    // Retire variants removed from the editor: delete when unreferenced,
    // otherwise archive (orders/carts may still reference them).
    for (const vid of removedIds) {
      const [orders, carts] = await Promise.all([
        sb.from("order_items").select("id", { count: "exact", head: true }).eq("variant_id", vid),
        sb.from("cart_items").select("id", { count: "exact", head: true }).eq("variant_id", vid),
      ]);
      const referenced = (orders.count ?? 0) > 0 || (carts.count ?? 0) > 0;
      if (referenced) {
        const { error: archErr } = await sb
          .from("product_variants")
          .update({ status: "archived", available: false })
          .eq("id", vid);
        if (archErr) throw new Error(archErr.message);
      } else {
        await sb.from("inventory").delete().eq("variant_id", vid);
        const { error: delErr } = await sb.from("product_variants").delete().eq("id", vid);
        if (delErr) throw new Error(delErr.message);
      }
    }

    // Rebuild variant_option_values from client-stable option refs.
    const { data: finalVariants, error: fvErr } = await sb
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .neq("status", "archived");
    if (fvErr) throw new Error(fvErr.message);
    const finalIds = (finalVariants ?? []).map((r) => r.id);
    const linkRows: { variant_id: string; product_option_value_id: string }[] = [];
    for (const v of data.variants) {
      if (!v.id || !finalIds.includes(v.id)) continue;
      for (const ref of v.optionRefs) {
        const valueId = valueIdByKey.get(`${ref.optionCode}::${ref.value}`);
        if (valueId) linkRows.push({ variant_id: v.id, product_option_value_id: valueId });
      }
    }
    if (linkRows.length) {
      const { error: linkErr } = await sb.from("variant_option_values").insert(linkRows);
      if (linkErr) throw new Error(linkErr.message);
    }

    // Inventory — upsert per variant (reserved_quantity untouched).
    const { data: invRows, error: invSelErr } = await sb
      .from("inventory")
      .select("variant_id")
      .in("variant_id", finalIds);
    if (invSelErr) throw new Error(invSelErr.message);
    const hasInv = new Set((invRows ?? []).map((r) => r.variant_id));
    for (const v of data.variants) {
      if (!v.id || !finalIds.includes(v.id)) continue;
      if (hasInv.has(v.id)) {
        const { error: invErr } = await sb
          .from("inventory")
          .update({ quantity: v.stock, low_stock_threshold: v.lowStockThreshold })
          .eq("variant_id", v.id);
        if (invErr) throw new Error(invErr.message);
      } else {
        const { error: invErr } = await sb.from("inventory").insert({
          variant_id: v.id,
          quantity: v.stock,
          reserved_quantity: 0,
          low_stock_threshold: v.lowStockThreshold,
        });
        if (invErr) throw new Error(invErr.message);
      }
    }

    // Images — sync by id: update existing, insert new, delete removed.
    const { data: existingImages, error: imgSelErr } = await sb
      .from("product_images")
      .select("id, storage_path")
      .eq("product_id", productId);
    if (imgSelErr) throw new Error(imgSelErr.message);
    const existingImageIds = new Set((existingImages ?? []).map((r) => r.id));
    const inputImageIds = new Set(
      data.images.filter((img) => img.id && existingImageIds.has(img.id)).map((img) => img.id as string),
    );
    const removedImageIds = [...existingImageIds].filter((id) => !inputImageIds.has(id));
    // Storage paths of removed rows, for orphan cleanup after the delete.
    const removedImagePaths = (existingImages ?? [])
      .filter((r) => removedImageIds.includes(r.id))
      .map((r) => r.storage_path);

    let primarySeen = false;
    for (let i = 0; i < data.images.length; i++) {
      const img = data.images[i]!;
      const isPrimary = img.isPrimary && !primarySeen;
      if (img.isPrimary) primarySeen = true;
      const row = {
        storage_path: img.storagePath,
        alt_text: (img.altText ?? {}) as unknown as Json,
        is_primary: isPrimary,
        sort_order: img.sortOrder ?? i,
        media_type: img.mediaType,
        variant_id: null,
      };
      if (img.id && existingImageIds.has(img.id)) {
        const { error: upErr } = await sb.from("product_images").update(row).eq("id", img.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        const { data: inserted, error: insErr } = await sb
          .from("product_images")
          .insert({ ...row, product_id: productId })
          .select("id")
          .single();
        if (insErr || !inserted) throw new Error(insErr?.message ?? "Unable to save images.");
        img.id = inserted.id;
      }
    }
    if (removedImageIds.length) {
      await sb
        .from("product_variants")
        .update({ image_id: null })
        .in("image_id", removedImageIds)
        .eq("product_id", productId);
      const { error: imgDelErr } = await sb.from("product_images").delete().in("id", removedImageIds);
      if (imgDelErr) throw new Error(imgDelErr.message);
      // Delete storage objects left unreferenced by any product_images row
      // (duplicateProduct copies storage paths between products, so a blind
      // delete would break the copies). Runs under the seller's session, so
      // the "Seller staff can delete own media" storage policy applies.
      const uniqPaths = [...new Set(removedImagePaths.filter(Boolean))];
      if (uniqPaths.length) {
        const { data: refs, error: refErr } = await sb
          .from("product_images")
          .select("storage_path")
          .in("storage_path", uniqPaths);
        if (refErr) throw new Error(refErr.message);
        const referenced = new Set((refs ?? []).map((r) => r.storage_path));
        const orphans = uniqPaths.filter((p) => !referenced.has(p));
        if (orphans.length) {
          const { error: rmErr } = await sb.storage.from("product-media").remove(orphans);
          if (rmErr) throw new Error(rmErr.message);
        }
      }
    }

    // Link variants to images chosen in the matrix (variant.imageId refs image ids).
    // Ids of images removed in this save are skipped — the nulling above already cleared them.
    const removedImageSet = new Set(removedImageIds);
    for (const v of data.variants) {
      if (!v.id || !finalIds.includes(v.id)) continue;
      if (v.imageId && removedImageSet.has(v.imageId)) continue;
      const { error: imgLinkErr } = await sb
        .from("product_variants")
        .update({ image_id: v.imageId ?? null })
        .eq("id", v.id);
      if (imgLinkErr) throw new Error(imgLinkErr.message);
    }

    await auditLog(context.userId, isNew ? "product_created" : "product_updated", "product", productId, {
      seller_id: seller.sellerId,
      variants: data.variants.length,
    });

    return { productId };
  });

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

/**
 * Shape of the duplicateProduct source query. Declared explicitly because the
 * supabase-js select-string inference collapses to GenericStringError once a
 * single query combines two doubly-nested relations with sibling columns (a
 * type-system limit, not a data problem) — the runtime query is unchanged.
 */
type DuplicateProductSource = {
  name: Json;
  slug: string;
  store_id: string | null;
  description: Json | null;
  short_description: Json | null;
  category_id: string | null;
  brand_id: string | null;
  sku: string | null;
  weight_grams: number | null;
  base_price: number;
  compare_at_price: number | null;
  metadata: Json;
  product_options: {
    id: string;
    code: string;
    name: Json;
    sort_order: number;
    product_option_values: { id: string; label: Json; value: string; color_id: string | null; sort_order: number }[];
  }[];
  product_variants: {
    id: string;
    sku: string;
    price: number | null;
    compare_at_price: number | null;
    barcode: string | null;
    weight_grams: number | null;
    sort_order: number;
    variant_option_values: { product_option_value_id: string }[];
  }[];
  product_images: {
    storage_path: string;
    alt_text: Json | null;
    is_primary: boolean;
    sort_order: number;
    media_type: string;
  }[];
  product_tag_assignments: { tag_id: string }[];
};

export const duplicateProduct = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ productId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.edit");
    const sb = context.supabase as Sb;
    await ownedProduct(sb, seller.sellerId, data.productId);

    const { data: source, error } = (await sb
      .from("products")
      .select(
        "*, product_options(id, code, name, sort_order, product_option_values(id, label, value, color_id, sort_order)), " +
          "product_variants(id, sku, price, compare_at_price, barcode, weight_grams, sort_order, variant_option_values(product_option_value_id)), " +
          "product_images(storage_path, alt_text, is_primary, sort_order, media_type), " +
          "product_tag_assignments(tag_id)",
      )
      .eq("id", data.productId)
      .single()) as unknown as {
      data: DuplicateProductSource | null;
      error: { message: string } | null;
    };
    if (error || !source) throw new Error(error?.message ?? "Product not found.");

    const nameObj = asLocaleText(source.name);
    const copyName: Record<string, string> = {};
    for (const k of ["fr", "en", "ar"]) {
      if (nameObj[k]) copyName[k] = `${nameObj[k]} (copy)`;
    }
    if (!Object.keys(copyName).length) copyName['en'] = `${source.slug} (copy)`;

    const { data: copy, error: copyErr } = await sb
      .from("products")
      .insert({
        seller_id: seller.sellerId,
        store_id: source.store_id,
        slug: makeSlug(copyName),
        name: copyName as unknown as Json,
        description: source.description,
        short_description: source.short_description,
        category_id: source.category_id,
        brand_id: source.brand_id,
        sku: source.sku ? `${source.sku}-COPY` : null,
        barcode: null,
        weight_grams: source.weight_grams,
        base_price: source.base_price,
        compare_at_price: source.compare_at_price,
        status: "draft",
        moderation_status: "pending",
        publication_status: "pending_review",
        visibility: "private",
        metadata: source.metadata,
      })
      .select("id")
      .single();
    if (copyErr || !copy) throw new Error(copyErr?.message ?? "Unable to duplicate product.");

    // Tags.
    const tagIds = (source.product_tag_assignments ?? []).map((a: { tag_id: string }) => a.tag_id);
    if (tagIds.length) {
      await sb
        .from("product_tag_assignments")
        .insert(tagIds.map((tag_id: string) => ({ product_id: copy.id, tag_id })));
    }

    // Options + values, keeping codes.
    const valueMap = new Map<string, string>(); // `${optionId}::${value}` -> new value id
    for (const opt of (source.product_options ?? []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )) {
      const { data: newOpt, error: optErr } = await sb
        .from("product_options")
        .insert({
          product_id: copy.id,
          code: opt.code,
          name: opt.name,
          required: true,
          sort_order: opt.sort_order,
        })
        .select("id")
        .single();
      if (optErr || !newOpt) throw new Error(optErr?.message ?? "Unable to copy options.");
      for (const val of (opt.product_option_values ?? []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0),
      )) {
        const { data: newVal, error: valErr } = await sb
          .from("product_option_values")
          .insert({
            product_option_id: newOpt.id,
            label: val.label,
            value: val.value,
            color_id: (val as { color_id?: string | null }).color_id ?? null,
            sort_order: val.sort_order,
          })
          .select("id")
          .single();
        if (valErr || !newVal) throw new Error(valErr?.message ?? "Unable to copy option values.");
        valueMap.set(`${opt.id}::${val.value}`, newVal.id);
      }
    }

    // value id -> { value, product_option_id } for relinking variant option values.
    const valueInfo = new Map<string, { value: string; product_option_id: string }>();
    for (const opt of source.product_options ?? []) {
      for (const val of opt.product_option_values ?? []) {
        valueInfo.set(val.id, { value: val.value, product_option_id: opt.id });
      }
    }

    // Variants with stock reset to 0.
    for (const v of (source.product_variants ?? []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )) {
      const { data: newVariant, error: varErr } = await sb
        .from("product_variants")
        .insert({
          product_id: copy.id,
          sku: `${v.sku}-COPY`,
          price: v.price,
          compare_at_price: v.compare_at_price,
          barcode: null,
          weight_grams: v.weight_grams,
          available: false,
          status: "draft",
          sort_order: v.sort_order,
        })
        .select("id")
        .single();
      if (varErr || !newVariant) throw new Error(varErr?.message ?? "Unable to copy variants.");
      const links = (v.variant_option_values ?? [])
        .map((l: { product_option_value_id: string }) => {
          const info = valueInfo.get(l.product_option_value_id);
          return info ? valueMap.get(`${info.product_option_id}::${info.value}`) : undefined;
        })
        .filter(Boolean) as string[];
      if (links.length) {
        await sb.from("variant_option_values").insert(
          links.map((product_option_value_id) => ({
            variant_id: newVariant.id,
            product_option_value_id,
          })),
        );
      }
      await sb.from("inventory").insert({
        variant_id: newVariant.id,
        quantity: 0,
        reserved_quantity: 0,
        low_stock_threshold: 3,
      });
    }

    // Images (same storage paths).
    for (const img of source.product_images ?? []) {
      await sb.from("product_images").insert({
        product_id: copy.id,
        storage_path: img.storage_path,
        alt_text: img.alt_text,
        is_primary: img.is_primary,
        sort_order: img.sort_order,
        media_type: img.media_type,
      });
    }

    await auditLog(context.userId, "product_duplicated", "product", copy.id, {
      seller_id: seller.sellerId,
      source_id: data.productId,
    });

    return { productId: copy.id };
  });

// ---------------------------------------------------------------------------
// Bulk actions + moderation workflow
// ---------------------------------------------------------------------------

export const bulkUpdateProducts = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) =>
    z
      .object({
        ids: z.array(uuid).min(1).max(50),
        action: z.enum(["archive", "hide", "submit"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const permissions = data.action === "submit" ? (["products.edit", "products.publish"] as const) : (["products.edit"] as const);
    const seller = await requireSeller(context, ...permissions);
    const sb = context.supabase as Sb;

    const patch =
      data.action === "archive"
        ? { status: "archived" as const }
        : data.action === "hide"
          ? { visibility: "hidden" }
          : { moderation_status: "pending", publication_status: "pending_review", visibility: "private" };

    let updated = 0;
    for (const id of data.ids) {
      await ownedProduct(sb, seller.sellerId, id); // throws on foreign products
      const { error } = await sb.from("products").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      await auditLog(context.userId, `product_bulk_${data.action}`, "product", id, {
        seller_id: seller.sellerId,
      });
      updated++;
    }
    return { updated };
  });

export const submitForModeration = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ productId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "products.publish");
    const sb = context.supabase as Sb;
    await ownedProduct(sb, seller.sellerId, data.productId);
    const { error } = await sb
      .from("products")
      .update({
        moderation_status: "pending",
        publication_status: "pending_review",
        visibility: "private",
      })
      .eq("id", data.productId);
    if (error) throw new Error(error.message);
    await auditLog(context.userId, "product_submitted", "product", data.productId, {
      seller_id: seller.sellerId,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const adjustInventory = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .inputValidator((data) =>
    z
      .object({
        variantId: uuid,
        quantity: z.number().int().min(0).max(1_000_000).optional(),
        lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
      })
      .refine((v) => v.quantity !== undefined || v.lowStockThreshold !== undefined, {
        message: "Nothing to update.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "inventory.manage");
    const sb = context.supabase as Sb;

    // Ownership: variant → product → seller in one checked pass.
    const { data: variant, error: varErr } = await sb
      .from("product_variants")
      .select("id, label, sku, products!inner(id, seller_id, name, slug)")
      .eq("id", data.variantId)
      .maybeSingle();
    if (varErr) throw new Error("Variant lookup failed.");
    const product = Array.isArray((variant as any)?.products)
      ? (variant as any).products[0]
      : (variant as any)?.products;
    if (!variant || !product || product.seller_id !== seller.sellerId) {
      throw new Error("Variant not found or access denied.");
    }

    const { data: before, error: selErr } = await sb
      .from("inventory")
      .select("quantity, reserved_quantity, low_stock_threshold")
      .eq("variant_id", data.variantId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!before) throw new Error("Inventory row missing for this variant.");

    const patch: { quantity?: number; low_stock_threshold?: number } = {};
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.lowStockThreshold !== undefined) patch.low_stock_threshold = data.lowStockThreshold;
    const { error: upErr } = await sb.from("inventory").update(patch).eq("variant_id", data.variantId);
    if (upErr) throw new Error(upErr.message);

    const after = {
      quantity: data.quantity ?? before.quantity,
      low_stock_threshold: data.lowStockThreshold ?? before.low_stock_threshold,
    };
    await auditLog(context.userId, "inventory_adjusted", "inventory", data.variantId, {
      seller_id: seller.sellerId,
      before: { quantity: before.quantity, low_stock_threshold: before.low_stock_threshold },
      after,
    });

    // Inventory event notifications (best-effort).
    try {
      const rawProduct = product as { name?: unknown; slug?: string | null } | null;
      const rawName = rawProduct?.name;
      const productName =
        typeof rawName === "string"
          ? rawName
          : rawName && typeof rawName === "object" && !Array.isArray(rawName)
            ? ((rawName as Record<string, unknown>)["fr"] as string) ||
              ((rawName as Record<string, unknown>)["en"] as string) ||
              "Product"
            : "Product";
      const variantLabel =
        ((variant as { label?: string | null; sku?: string | null } | null)?.label ??
          (variant as { label?: string | null; sku?: string | null } | null)?.sku ??
          "").trim();
      const threshold = after.low_stock_threshold ?? 0;

      // Low stock: notify once when the available quantity crosses the threshold downward.
      if (threshold > 0 && after.quantity <= threshold && before.quantity > threshold) {
        await emitSellerNotification(seller.sellerId, {
          type: "low_stock",
          params: { productName, variantLabel: variantLabel || undefined, quantity: after.quantity, threshold },
          link: "/seller/inventory",
          payload: { variant_id: data.variantId, quantity: after.quantity, threshold },
        });
      }

      // Back in stock: notify subscribers who asked to be alerted.
      if (before.quantity === 0 && after.quantity > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const subs = await supabaseAdmin
          .from("back_in_stock_subscriptions")
          .select("id,customer_id,customers(profile_id)")
          .eq("variant_id", data.variantId)
          .is("notified_at", null)
          .not("customer_id", "is", null);
        const notifiedIds: string[] = [];
        for (const sub of subs.data ?? []) {
          const customers = (sub as { customers?: { profile_id?: string | null } | { profile_id?: string | null }[] | null }).customers;
          const profileId = Array.isArray(customers) ? customers[0]?.profile_id : customers?.profile_id;
          if (!profileId) continue;
          const sent = await emitCustomerNotification(profileId, {
            type: "back_in_stock",
            params: { productName, variantLabel: variantLabel || undefined },
            link: rawProduct?.slug ? `/product/${rawProduct.slug}` : "/shop",
            payload: { variant_id: data.variantId, product_name: productName },
          });
          if (sent) notifiedIds.push(sub.id);
        }
        if (notifiedIds.length > 0) {
          await supabaseAdmin
            .from("back_in_stock_subscriptions")
            .update({ notified_at: new Date().toISOString() })
            .in("id", notifiedIds);
        }
      }
    } catch {
      /* notifications are best-effort */
    }

    return { ok: true, before: before.quantity, after: after.quantity };
  });

export type InventoryStatus = "ok" | "low" | "out";

export const getInventoryOverview = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .handler(async ({ context }) => {
    const seller = await requireSeller(context, "inventory.manage");
    const sb = context.supabase as Sb;
    const { data, error } = await sb
      .from("product_variants")
      .select(
        "id, sku, price, status, inventory(quantity, reserved_quantity, low_stock_threshold), products!inner(id, name, seller_id)",
      )
      .eq("products.seller_id", seller.sellerId)
      .neq("status", "archived")
      .order("sku");
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((v) => {
      const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
      const product = Array.isArray(v.products) ? v.products[0] : v.products;
      const quantity = inv?.quantity ?? 0;
      const reserved = inv?.reserved_quantity ?? 0;
      const available = quantity - reserved;
      const threshold = inv?.low_stock_threshold ?? 0;
      const status: InventoryStatus =
        available <= 0 ? "out" : available <= threshold ? "low" : "ok";
      return {
        variantId: v.id,
        sku: v.sku,
        price: v.price,
        productId: product?.id ?? "",
        productName: localeName(product?.name, v.sku),
        quantity,
        reserved,
        available,
        threshold,
        status,
      };
    });

    return {
      rows,
      counts: {
        total: rows.length,
        ok: rows.filter((r) => r.status === "ok").length,
        low: rows.filter((r) => r.status === "low").length,
        out: rows.filter((r) => r.status === "out").length,
      },
    };
  });

export const getInventoryHistory = createServerFn({ method: "GET" })
  .middleware(sellerOnly)
  .inputValidator((data) => z.object({ page: z.number().int().min(1).default(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "inventory.manage");
    const sb = context.supabase as Sb;

    // All variant ids owned by this seller (to scope audit logs + name map).
    const { data: variants, error: vErr } = await sb
      .from("product_variants")
      .select("id, sku, products!inner(id, name, seller_id)")
      .eq("products.seller_id", seller.sellerId);
    if (vErr) throw new Error(vErr.message);
    const variantIds = (variants ?? []).map((v) => v.id);
    const namesByVariant: Record<string, { sku: string; productName: string }> = {};
    for (const v of variants ?? []) {
      const product = Array.isArray(v.products) ? v.products[0] : v.products;
      namesByVariant[v.id] = { sku: v.sku, productName: localeName(product?.name, v.sku) };
    }

    if (!variantIds.length) return { logs: [], namesByVariant, total: 0, page: data.page };

    const from = (data.page - 1) * PAGE_SIZE;
    const { data: logs, error, count } = await sb
      .from("audit_logs")
      .select("id, actor_id, action, resource_id, metadata, created_at", { count: "exact" })
      .eq("resource", "inventory")
      .in("resource_id", variantIds)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    return { logs: logs ?? [], namesByVariant, total: count ?? 0, page: data.page };
  });
