import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import type { CatalogCategory, CatalogProduct } from "@/lib/catalog.functions";
import {
  defaultStoreSettings,
  localizeText,
  normalizeStoreSettings,
  type StoreAccentId,
  type StoreSectionKind,
} from "@/lib/store-settings";

type LocalizedText = Json | null;

function text(value: LocalizedText, locale: string, fallback: string) {
  if (!value || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  const localized = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof localized === "string" ? localized : fallback;
}

function publicUrl(path: string | null) { return path && /^https?:\/\//.test(path) ? path : null; }

function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Stores are temporarily unavailable.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => { const headers = new Headers(init?.headers); if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization"); headers.set("apikey", key); return fetch(input, { ...init, headers }); } } });
}

export interface StoreSectionView {
  id: string;
  kind: StoreSectionKind;
  title: string;
}

export type StoreDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  verified: boolean;
  products: CatalogProduct[];
  categories: string[];
  /** Seller-configured appearance (from stores.settings). */
  accent: StoreAccentId;
  announcement: string | null;
  sections: StoreSectionView[];
  featuredProducts: CatalogProduct[];
  featuredCategories: CatalogCategory[];
  newProducts: CatalogProduct[];
  offerProducts: CatalogProduct[];
  bestProducts: CatalogProduct[];
};

const PRODUCT_SELECT = "id,slug,name,base_price,created_at,category:categories(slug),images:product_images(storage_path,alt_text,sort_order)";

interface ProductRow {
  id: string;
  slug: string;
  name: Json;
  base_price: number;
  created_at: string;
  category: { slug: string } | { slug: string }[] | null;
  images: { storage_path: string | null; alt_text: Json | null; sort_order: number }[] | null;
  compare_at_price?: number | null;
}

function toCatalogProduct(product: ProductRow, storeName: string, locale: string): CatalogProduct {
  const images = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const category = Array.isArray(product.category) ? product.category[0] : product.category;
  return {
    id: product.id,
    slug: product.slug,
    name: text(product.name, locale, product.slug),
    price: Number(product.base_price),
    compareAtPrice: product.compare_at_price ?? null,
    storeName,
    categorySlug: category?.slug ?? null,
    imagePath: publicUrl(images[0]?.storage_path ?? null),
    imageAlt: text(images[0]?.alt_text ?? null, locale, ""),
    secondImagePath: publicUrl(images[1]?.storage_path ?? null),
    secondImageAlt: text(images[1]?.alt_text ?? null, locale, ""),
    createdAt: product.created_at,
  } satisfies CatalogProduct;
}

function publishedQuery<const S extends string>(supabase: ReturnType<typeof publicClient>, storeId: string, select: S) {
  return supabase
    .from("products")
    .select(select)
    .eq("store_id", storeId)
    .eq("status", "active")
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public");
}

export const getStoreDetail = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string(), locale: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const storeResult = await supabase.from("stores").select("id,slug,name,description,logo_path,banner_path,verification_status,settings").eq("slug", data.slug).eq("status", "active").maybeSingle();
    if (storeResult.error) throw new Error("This store could not be loaded.");
    if (!storeResult.data) return null;
    const store = storeResult.data;

    const settings = normalizeStoreSettings(store.settings);
    const defaults = defaultStoreSettings().sections;
    const defaultTitle = (kind: StoreSectionKind) =>
      localizeText(defaults.find((section) => section.kind === kind)?.title, data.locale, kind);

    const [productsResult, featuredResult, categoriesResult, countsResult, offersResult, reviewsResult] = await Promise.all([
      publishedQuery(supabase, store.id, PRODUCT_SELECT).order("published_at", { ascending: false }).limit(48),
      settings.featured_product_ids.length
        ? publishedQuery(supabase, store.id, PRODUCT_SELECT).in("id", settings.featured_product_ids).order("published_at", { ascending: false }).limit(12)
        : Promise.resolve({ data: [] as ProductRow[], error: null }),
      settings.featured_category_ids.length
        ? supabase.from("categories").select("id,slug,name").in("id", settings.featured_category_ids)
        : Promise.resolve({ data: [] as { id: string; slug: string; name: Json }[], error: null }),
      publishedQuery(supabase, store.id, "id,category_id").limit(500),
      publishedQuery(supabase, store.id, `${PRODUCT_SELECT},compare_at_price`).not("compare_at_price", "is", null).order("published_at", { ascending: false }).limit(24),
      (async () => {
        const idsResult = await publishedQuery(supabase, store.id, "id").limit(500);
        const ids = (idsResult.data ?? []).map((row: { id: string }) => row.id);
        if (!ids.length) return { data: [] as { product_id: string; rating: number }[], error: null };
        return supabase.from("reviews").select("product_id,rating").in("product_id", ids).eq("moderation_status", "approved").limit(2000);
      })(),
    ]);

    if (productsResult.error) throw new Error("Store products could not be loaded.");
    const products = (productsResult.data ?? []).map((product: ProductRow) => toCatalogProduct(product, store.name, data.locale));

    const featuredProducts = ((featuredResult.data ?? []) as ProductRow[]).map((product: ProductRow) =>
      toCatalogProduct(product, store.name, data.locale),
    );

    const categoryCounts = new Map<string, number>();
    for (const row of countsResult.data ?? []) {
      if (row.category_id) categoryCounts.set(row.category_id, (categoryCounts.get(row.category_id) ?? 0) + 1);
    }
    const featuredCategories: CatalogCategory[] = (categoriesResult.data ?? []).map((category: { id: string; slug: string; name: Json }) => ({
      id: category.id,
      slug: category.slug,
      name: text(category.name, data.locale, category.slug),
      productCount: categoryCounts.get(category.id) ?? 0,
    }));

    const offerProducts = ((offersResult.data ?? []) as ProductRow[])
      .filter((product) => product.compare_at_price != null && Number(product.compare_at_price) > Number(product.base_price))
      .slice(0, 8)
      .map((product) => toCatalogProduct(product, store.name, data.locale));

    const newProducts = products.slice(0, 8);

    // Best sellers: products with the most approved reviews (tie-break: average rating).
    const reviewStats = new Map<string, { count: number; total: number }>();
    for (const review of reviewsResult.data ?? []) {
      const stats = reviewStats.get(review.product_id) ?? { count: 0, total: 0 };
      stats.count += 1;
      stats.total += Number(review.rating) || 0;
      reviewStats.set(review.product_id, stats);
    }
    const rankedIds = [...reviewStats.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].total / b[1].count - a[1].total / a[1].count)
      .slice(0, 8)
      .map(([id]) => id);
    const bestRows = rankedIds.length
      ? await publishedQuery(supabase, store.id, PRODUCT_SELECT).in("id", rankedIds)
      : { data: [] as ProductRow[], error: null };
    const bestById = new Map(
      ((bestRows.data ?? []) as ProductRow[]).map((product) => [product.id, toCatalogProduct(product, store.name, data.locale)]),
    );
    const bestProducts = rankedIds
      .map((id) => bestById.get(id))
      .filter((product): product is CatalogProduct => Boolean(product));

    const announcement = localizeText(settings.announcement, data.locale) || null;
    const sections: StoreSectionView[] = settings.sections
      .filter((section) => section.enabled)
      .map((section) => ({ id: section.id, kind: section.kind, title: localizeText(section.title, data.locale, defaultTitle(section.kind)) }));

    return {
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: store.description,
      logoUrl: publicUrl(store.logo_path),
      bannerUrl: publicUrl(store.banner_path),
      verified: store.verification_status === "verified",
      products,
      categories: [...new Set(products.map((product) => product.categorySlug).filter((category): category is string => Boolean(category)))],
      accent: settings.accent,
      announcement,
      sections,
      featuredProducts,
      featuredCategories,
      newProducts,
      offerProducts,
      bestProducts,
    } satisfies StoreDetail;
  });
