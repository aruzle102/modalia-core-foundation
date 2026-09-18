import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";

type LocalizedText = Json | null;

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  storeName: string;
  categorySlug: string | null;
  imagePath: string | null;
  imageAlt: string;
  createdAt: string;
};

export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
};

export type CatalogStore = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoPath: string | null;
  bannerPath: string | null;
  productCount: number;
};

export type HomepageSection = {
  sectionKey: string;
  kind: string;
  title: string | null;
  subtitle: string | null;
  content: Json;
};

export type DiscoveryData = {
  sections: HomepageSection[];
  categories: CatalogCategory[];
  products: CatalogProduct[];
  stores: CatalogStore[];
};

const discoveryInput = z.object({ locale: z.string() });
const browseInput = z.object({ q: z.string().optional(), category: z.string().optional(), sort: z.string().optional(), page: z.number().int().positive().optional() });

function localized(value: LocalizedText, locale: string, fallback: string) {
  if (!value || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  const text = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof text === "string" ? text : fallback;
}

function publicUrl(path: string | null) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return null;
}

function createPublicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The marketplace catalogue is unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => { const headers = new Headers(init?.headers); if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization"); headers.set("apikey", key); return fetch(input, { ...init, headers }); } },
  });
}

async function fetchDiscoveryData(locale: string): Promise<DiscoveryData> {
    const supabase = createPublicClient();
    const [sectionResult, categoryResult, productResult, storeResult] = await Promise.all([
      supabase.from("homepage_sections").select("section_key,kind,title,subtitle,content").eq("enabled", true).order("sort_order"),
      supabase.from("categories").select("id,slug,name").eq("status", "active").is("parent_id", null).order("sort_order"),
      supabase.from("products").select("id,slug,name,base_price,created_at,category:categories(slug),seller:sellers(stores(name)),images:product_images(storage_path,alt_text,sort_order)").eq("status", "active").eq("publication_status", "published").eq("moderation_status", "approved").eq("visibility", "public").order("created_at", { ascending: false }).limit(24),
      supabase.from("stores").select("id,slug,name,description,logo_path,banner_path,seller_id").eq("status", "active").order("created_at", { ascending: false }).limit(12),
    ]);
    if (sectionResult.error || categoryResult.error || productResult.error || storeResult.error) {
      console.error("Catalog query failed", { sections: sectionResult.error?.message, categories: categoryResult.error?.message, products: productResult.error?.message, stores: storeResult.error?.message });
    }

    const products = (productResult.data ?? []).map((product) => {
      const images = Array.isArray(product.images) ? [...product.images].sort((a, b) => a.sort_order - b.sort_order) : [];
      const firstImage = images[0];
      const seller = Array.isArray(product.seller) ? product.seller[0] : product.seller;
      const sellerStores = seller && Array.isArray(seller.stores) ? seller.stores : [];
      const category = Array.isArray(product.category) ? product.category[0] : product.category;
      return { id: product.id, slug: product.slug, name: localized(product.name, locale, product.slug), price: Number(product.base_price), storeName: sellerStores[0]?.name ?? "Modalia store", categorySlug: category?.slug ?? null, imagePath: publicUrl(firstImage?.storage_path ?? null), imageAlt: localized(firstImage?.alt_text ?? null, locale, ""), createdAt: product.created_at };
    });
    const categoryCounts = new Map<string, number>();
    products.forEach((product) => { if (product.categorySlug) categoryCounts.set(product.categorySlug, (categoryCounts.get(product.categorySlug) ?? 0) + 1); });
    const storeCounts = new Map<string, number>();
    products.forEach((product) => storeCounts.set(product.storeName, (storeCounts.get(product.storeName) ?? 0) + 1));
    return {
      sections: (sectionResult.data ?? []).map((section) => ({ sectionKey: section.section_key, kind: section.kind, title: localized(section.title, locale, ""), subtitle: localized(section.subtitle, locale, ""), content: section.content })),
      categories: (categoryResult.data ?? []).map((category) => ({ id: category.id, slug: category.slug, name: localized(category.name, locale, category.slug), productCount: categoryCounts.get(category.slug) ?? 0 })),
      products,
      stores: (storeResult.data ?? []).map((store) => ({ id: store.id, slug: store.slug, name: store.name, description: store.description, logoPath: publicUrl(store.logo_path), bannerPath: publicUrl(store.banner_path), productCount: storeCounts.get(store.name) ?? 0 })),
    };
}

export const getDiscoveryData = createServerFn({ method: "GET" })
  .validator((data) => discoveryInput.parse(data))
  .handler(async ({ data }) => fetchDiscoveryData(data.locale));

export const browseCatalog = createServerFn({ method: "GET" })
  .validator((data) => browseInput.parse(data))
  .handler(async ({ data }) => {
    const locale = "fr";
    const discovery = await fetchDiscoveryData(locale);
    const query = data.q?.trim().toLocaleLowerCase() ?? "";
    let products = discovery.products.filter((product) => (!data.category || product.categorySlug === data.category) && (!query || [product.name, product.storeName, product.categorySlug ?? ""].some((value) => value.toLocaleLowerCase().includes(query))));
    if (data.sort === "price_asc") products = [...products].sort((a, b) => a.price - b.price);
    if (data.sort === "price_desc") products = [...products].sort((a, b) => b.price - a.price);
    return { ...discovery, products };
  });