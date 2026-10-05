import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller } from "@/lib/seller-auth";
import type { Json } from "@/integrations/supabase/types";
import {
  normalizeStoreSettings,
  storeAccentSchema,
  storeSectionSchema,
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
        .select("id,slug,name")
        .eq("seller_id", seller.sellerId)
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase.from("categories").select("id,slug,name").order("slug", { ascending: true }).limit(200),
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

const profileInput = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
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
        description: nullIfEmpty(data.description),
        contact_email: nullIfEmpty(data.contactEmail),
        contact_phone: nullIfEmpty(data.contactPhone),
        logo_path: nullIfEmpty(data.logoPath),
        banner_path: nullIfEmpty(data.bannerPath),
      })
      .eq("id", seller.storeId ?? "")
      .eq("seller_id", seller.sellerId);
    if (error) throw new Error(error.message);
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
    const { data: store, error: readError } = await context.supabase
      .from("stores")
      .select("settings")
      .eq("id", seller.storeId ?? "")
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (readError || !store) throw new Error("Store not found.");
    const settings = normalizeStoreSettings(store.settings);
    settings.accent = data.accent;
    settings.announcement = data.announcement;
    const { error } = await context.supabase
      .from("stores")
      .update({ settings: settings as unknown as Json })
      .eq("id", seller.storeId ?? "")
      .eq("seller_id", seller.sellerId);
    if (error) throw new Error(error.message);
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

    const { data: store, error: readError } = await context.supabase
      .from("stores")
      .select("settings")
      .eq("id", seller.storeId ?? "")
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (readError || !store) throw new Error("Store not found.");
    const settings = normalizeStoreSettings(store.settings);
    settings.sections = data.sections;
    settings.featured_product_ids = data.featuredProductIds.filter((value) => ownedProductIds.has(value));
    settings.featured_category_ids = data.featuredCategoryIds.filter((value) => existingCategoryIds.has(value));

    const { error } = await context.supabase
      .from("stores")
      .update({ settings: settings as unknown as Json })
      .eq("id", seller.storeId ?? "")
      .eq("seller_id", seller.sellerId);
    if (error) throw new Error(error.message);
    await auditLog(context.userId, "store.sections.update", "stores", seller.storeId, {
      sections: data.sections.map((section) => section.kind),
      featured_products: settings.featured_product_ids.length,
      featured_categories: settings.featured_category_ids.length,
    });
    return { ok: true };
  });
