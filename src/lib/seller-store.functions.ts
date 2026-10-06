import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  normalizeStoreSettings,
  storeAccentSchema,
  storeSectionSchema,
  storeSettingsSchema,
} from "@/lib/store-settings";

/* ------------------------------------------------------------------------- */
/* Audit                                                                     */
/* ------------------------------------------------------------------------- */

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

/* ------------------------------------------------------------------------- */
/* Read                                                                      */
/* ------------------------------------------------------------------------- */

const id = z.string().uuid();

type SellerIdentity = { storeId: string | null; sellerId: string };

async function readRawSettings(
  supabase: SupabaseClient<Database>,
  seller: SellerIdentity,
): Promise<Record<string, unknown>> {
  const { data: store, error } = await supabase
    .from("stores")
    .select("settings")
    .eq("id", seller.storeId ?? "")
    .eq("seller_id", seller.sellerId)
    .maybeSingle();
  if (error || !store) throw new Error("Store not found.");
  return (store.settings as Record<string, unknown> | null) ?? {};
}

/**
 * Merge a validated patch into the raw settings jsonb. Unknown keys already
 * present in the row (e.g. admin-managed flags) are preserved; the merged
 * result is validated against the shared settings schema before writing.
 */
async function writeSettingsPatch(
  supabase: SupabaseClient<Database>,
  seller: SellerIdentity,
  patch: Record<string, unknown>,
): Promise<void> {
  const raw = await readRawSettings(supabase, seller);
  storeSettingsSchema.parse({ ...raw, ...patch });
  const { error } = await supabase
    .from("stores")
    .update({ settings: { ...raw, ...patch } as unknown as Json })
    .eq("id", seller.storeId ?? "")
    .eq("seller_id", seller.sellerId);
  if (error) throw new Error(error.message);
}

/** Store row + current settings + the seller's products and all categories for the studio pickers. */
export const getStoreStudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const seller = await requireSeller(context, "store.manage");
    const [storeRes, productsRes, categoriesRes] = await Promise.all([
      context.supabase
        .from("stores")
        .select("id,slug,name,description,logo_path,banner_path,status,verification_status,contact_email,contact_phone,settings")
        .eq("id", seller.storeId ?? "")
        .eq("seller_id", seller.sellerId)
        .maybeSingle(),
      context.supabase
        .from("products")
        .select("id,slug,name,base_price,compare_at_price,created_at,published_at,status,publication_status,moderation_status,visibility,category:categories(slug),images:product_images(storage_path,alt_text,sort_order)")
        .eq("seller_id", seller.sellerId)
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase.from("categories").select("id,slug,name,image_url,gender,featured,seo_title,seo_description").order("slug", { ascending: true }).limit(200),
    ]);
    if (storeRes.error) throw new Error("Store could not be loaded.");
    if (!storeRes.data) throw new Error("Store not found.");
    return {
      store: storeRes.data,
      settings: normalizeStoreSettings(storeRes.data.settings),
      products: productsRes.data ?? [],
      categories: categoriesRes.data ?? [],
      legalName: seller.legalName,
    };
  });

export type StoreStudioData = Awaited<ReturnType<typeof getStoreStudio>>;

/* ------------------------------------------------------------------------- */
/* Profile                                                                   */
/* ------------------------------------------------------------------------- */

/** Plain text only — angle brackets are rejected so no HTML can be smuggled in. */
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[<>]/.test(value), "Plain text only — no HTML.");

const trilingualPlain = (max: number) =>
  z.object({
    fr: plainText(max).default(""),
    en: plainText(max).default(""),
    ar: plainText(max).default(""),
  });

const profileInput = z.object({
  name: z.string().trim().min(2).max(160),
  /** V8 #231: trilingual main description → settings.description. */
  description: trilingualPlain(2000).optional(),
  contactEmail: z.union([z.literal(""), z.string().trim().email().max(160)]).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  logoPath: z.string().trim().max(500).optional(),
  bannerPath: z.string().trim().max(500).optional(),
});

function nullIfEmpty(value: string | undefined): string | null {
  return value && value.trim() ? value : null;
}

export const updateStoreProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => profileInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");
    const { error } = await context.supabase
      .from("stores")
      .update({
        name: data.name,
        contact_email: nullIfEmpty(data.contactEmail),
        contact_phone: nullIfEmpty(data.contactPhone),
        logo_path: nullIfEmpty(data.logoPath),
        banner_path: nullIfEmpty(data.bannerPath),
      })
      .eq("id", seller.storeId ?? "")
      .eq("seller_id", seller.sellerId);
    if (error) throw new Error(error.message);
    // V8 #231: the main description is trilingual — it lives in
    // settings.description. The legacy text column is left untouched as a
    // read fallback for stores that never edited it.
    if (data.description) {
      await writeSettingsPatch(context.supabase, seller, { description: data.description });
    }
    await auditLog(context.userId, "store.profile.update", "stores", seller.storeId, {
      name: data.name,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------------- */
/* Appearance                                                                */
/* ------------------------------------------------------------------------- */

const announcementSchema = z.object({
  fr: z.string().trim().max(120).default(""),
  en: z.string().trim().max(120).default(""),
  ar: z.string().trim().max(120).default(""),
});

const appearanceInput = z.object({ accent: storeAccentSchema, announcement: announcementSchema });

export const updateStoreAppearance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => appearanceInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");
    // V8 #57: raw-merge (read-modify-write) — unknown keys already in
    // stores.settings (e.g. admin-managed flags) are preserved instead of
    // being stripped by normalize-then-full-write.
    await writeSettingsPatch(context.supabase, seller, {
      accent: data.accent,
      announcement: data.announcement,
    });
    await auditLog(context.userId, "store.appearance.update", "stores", seller.storeId, {
      accent: data.accent,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------------- */
/* Sections                                                                  */
/* ------------------------------------------------------------------------- */

const sectionsInput = z.object({
  sections: z.array(storeSectionSchema).max(12),
  featuredProductIds: z.array(id).max(50).default([]),
  featuredCategoryIds: z.array(id).max(24).default([]),
});

export const updateStoreSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => sectionsInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");

    // Featured products must belong to this seller; featured categories must exist.
    const [ownedProducts, existingCategories] = await Promise.all([
      data.featuredProductIds.length
        ? context.supabase.from("products").select("id").eq("seller_id", seller.sellerId).in("id", data.featuredProductIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
      data.featuredCategoryIds.length
        ? context.supabase.from("categories").select("id").in("id", data.featuredCategoryIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    const ownedProductIds = new Set((ownedProducts.data ?? []).map((row) => row.id));
    const existingCategoryIds = new Set((existingCategories.data ?? []).map((row) => row.id));

    const featuredProductIds = data.featuredProductIds.filter((value) => ownedProductIds.has(value));
    const featuredCategoryIds = data.featuredCategoryIds.filter((value) => existingCategoryIds.has(value));

    // V8 #57: raw-merge (read-modify-write) — unknown keys already in
    // stores.settings (e.g. admin-managed flags) are preserved instead of
    // being stripped by normalize-then-full-write.
    await writeSettingsPatch(context.supabase, seller, {
      sections: data.sections,
      featured_product_ids: featuredProductIds,
      featured_category_ids: featuredCategoryIds,
    });

    await auditLog(context.userId, "store.sections.update", "stores", seller.storeId, {
      sections: data.sections.map((section) => section.kind),
      featured_products: featuredProductIds.length,
      featured_categories: featuredCategoryIds.length,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------------- */
/* Store address (slug)                                                      */
/* ------------------------------------------------------------------------- */

const RESERVED_SLUGS = new Set([
  "admin", "api", "auth", "account", "about", "cart", "categories", "category",
  "checkout", "contact", "faq", "help", "modalia", "new", "official",
  "order-success", "orders", "privacy", "product", "products", "returns",
  "search", "seller", "sellers", "settings", "shipping", "shop", "store",
  "stores", "support", "terms", "track-order", "wishlist",
]);

const slugInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens."),
});

/**
 * Change the store's public address. Validated for format + reserved words +
 * uniqueness (app-level check plus the DB unique constraint as backstop).
 * The seller's own data is keyed by store id, so their studio links keep
 * working; callers must regenerate public links from the returned slug.
 */
export const updateStoreSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => slugInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");
    const slug = data.slug;
    if (RESERVED_SLUGS.has(slug)) throw new Error("This address is reserved. Please choose another one.");
    if (!seller.storeId) throw new Error("Store not found.");

    const { data: clash } = await context.supabase
      .from("stores")
      .select("id")
      .eq("slug", slug)
      .neq("id", seller.storeId)
      .limit(1);
    if (clash && clash.length > 0) throw new Error("This address is already taken. Please choose another one.");

    const { error } = await context.supabase
      .from("stores")
      .update({ slug })
      .eq("id", seller.storeId)
      .eq("seller_id", seller.sellerId);
    if (error) {
      // Backstop for a race between the check above and the write.
      if (error.code === "23505") throw new Error("This address is already taken. Please choose another one.");
      throw new Error(error.message);
    }
    await auditLog(context.userId, "store.slug.update", "stores", seller.storeId, { slug });
    return { ok: true, slug };
  });

/* ------------------------------------------------------------------------- */
/* Category                                                                  */
/* ------------------------------------------------------------------------- */

const categoryInput = z.object({ categoryId: z.string().uuid().nullable() });

/** Set (or clear) the store's primary business category, stored in settings. */
export const updateStoreCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => categoryInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");
    if (data.categoryId) {
      const { data: category } = await context.supabase
        .from("categories")
        .select("id")
        .eq("id", data.categoryId)
        .maybeSingle();
      if (!category) throw new Error("Unknown category.");
    }
    await writeSettingsPatch(context.supabase, seller, { category_id: data.categoryId });
    await auditLog(context.userId, "store.category.update", "stores", seller.storeId, {
      category_id: data.categoryId,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------------- */
/* Social links                                                              */
/* ------------------------------------------------------------------------- */

function httpUrlOrEmpty(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

const socialInput = z.object({
  instagram: z.string().trim().max(300).default(""),
  facebook: z.string().trim().max(300).default(""),
  tiktok: z.string().trim().max(300).default(""),
  website: z.string().trim().max(300).default(""),
});

/** Persist social profiles / website. Every non-empty value must be an http(s) URL. */
export const updateStoreSocials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => socialInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");
    const social_links: Record<string, string> = {};
    for (const key of ["instagram", "facebook", "tiktok", "website"] as const) {
      const normalized = httpUrlOrEmpty(data[key]);
      if (normalized === null) throw new Error(`"${data[key]}" is not a valid http(s) URL.`);
      social_links[key] = normalized;
    }
    await writeSettingsPatch(context.supabase, seller, { social_links });
    await auditLog(context.userId, "store.socials.update", "stores", seller.storeId, {});
    return { ok: true };
  });

/* ------------------------------------------------------------------------- */
/* Store SEO                                                                 */
/* ------------------------------------------------------------------------- */

const seoInput = z.object({
  title: trilingualPlain(70),
  description: trilingualPlain(160),
});

/** Seller-authored SEO title/description overrides (plain text, per language). */
export const updateStoreSeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => seoInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");
    await writeSettingsPatch(context.supabase, seller, { seo: data });
    await auditLog(context.userId, "store.seo.update", "stores", seller.storeId, {});
    return { ok: true };
  });

/* ------------------------------------------------------------------------- */
/* Seller collections                                                        */
/* ------------------------------------------------------------------------- */

const sellerCollectionInput = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  title: trilingualPlain(120),
  subtitle: trilingualPlain(160),
  productIds: z.array(id).max(60).default([]),
  enabled: z.boolean().default(true),
});

export type SellerCollection = {
  id: string;
  title: { fr: string; en: string; ar: string };
  subtitle: { fr: string; en: string; ar: string };
  product_ids: string[];
  enabled: boolean;
};

/**
 * Create or update a seller-curated collection (stored in
 * settings.seller_collections). Product ids are filtered to products the
 * seller actually owns; only published products ever render publicly.
 */
export const upsertSellerCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => sellerCollectionInput.parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");

    const ownedIds = new Set<string>();
    if (data.productIds.length) {
      const { data: owned } = await context.supabase
        .from("products")
        .select("id")
        .eq("seller_id", seller.sellerId)
        .in("id", data.productIds);
      for (const row of owned ?? []) ownedIds.add(row.id);
    }

    const raw = await readRawSettings(context.supabase, seller);
    const settings = normalizeStoreSettings(raw);
    const collections: SellerCollection[] = [...settings.seller_collections];
    if (collections.length >= 20 && !data.id) throw new Error("You can create up to 20 collections.");

    const collection: SellerCollection = {
      id: data.id ?? crypto.randomUUID(),
      title: data.title,
      subtitle: data.subtitle,
      product_ids: data.productIds.filter((value) => ownedIds.has(value)),
      enabled: data.enabled,
    };
    const index = collections.findIndex((item) => item.id === collection.id);
    if (index >= 0) collections[index] = collection;
    else collections.push(collection);

    await writeSettingsPatch(context.supabase, seller, { seller_collections: collections });
    await auditLog(context.userId, "store.collection.upsert", "stores", seller.storeId, {
      collection_id: collection.id,
    });
    return { ok: true, collection };
  });

export const deleteSellerCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().trim().min(1).max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    const seller = await requireSeller(context, "store.manage");
    const raw = await readRawSettings(context.supabase, seller);
    const settings = normalizeStoreSettings(raw);
    const collections = settings.seller_collections.filter((item) => item.id !== data.id);
    await writeSettingsPatch(context.supabase, seller, { seller_collections: collections });
    await auditLog(context.userId, "store.collection.delete", "stores", seller.storeId, {
      collection_id: data.id,
    });
    return { ok: true };
  });
