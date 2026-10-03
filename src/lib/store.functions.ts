import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import type { CatalogProduct } from "@/lib/catalog.functions";

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

export type StoreDetail = { id: string; slug: string; name: string; description: string | null; logoUrl: string | null; bannerUrl: string | null; verified: boolean; products: CatalogProduct[]; categories: string[] };

export const getStoreDetail = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string(), locale: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const storeResult = await supabase.from("stores").select("id,slug,name,description,logo_path,banner_path,verification_status").eq("slug", data.slug).eq("status", "active").maybeSingle();
    if (storeResult.error) throw new Error("This store could not be loaded.");
    if (!storeResult.data) return null;
    const store = storeResult.data;
    const productsResult = await supabase.from("products").select("id,slug,name,base_price,created_at,category:categories(slug),images:product_images(storage_path,alt_text,sort_order)").eq("store_id", store.id).eq("status", "active").eq("publication_status", "published").eq("moderation_status", "approved").eq("visibility", "public").order("published_at", { ascending: false }).limit(48);
    if (productsResult.error) throw new Error("Store products could not be loaded.");
    const products = (productsResult.data ?? []).map((product) => {
      const images = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const category = Array.isArray(product.category) ? product.category[0] : product.category;
      return { id: product.id, slug: product.slug, name: text(product.name, data.locale, product.slug), price: Number(product.base_price), storeName: store.name, categorySlug: category?.slug ?? null, imagePath: publicUrl(images[0]?.storage_path ?? null), imageAlt: text(images[0]?.alt_text ?? null, data.locale, ""), createdAt: product.created_at } satisfies CatalogProduct;
    });
    return { id: store.id, slug: store.slug, name: store.name, description: store.description, logoUrl: publicUrl(store.logo_path), bannerUrl: publicUrl(store.banner_path), verified: store.verification_status === "verified", products, categories: [...new Set(products.map((product) => product.categorySlug).filter((category): category is string => Boolean(category)))] } satisfies StoreDetail;
  });