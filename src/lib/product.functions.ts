import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { storagePublicUrl } from "@/lib/store.functions";

type LocalizedText = Json | null;

export type ProductMedia = { id: string; url: string | null; alt: string; colorId: string | null; variantId: string | null; isPrimary: boolean; mediaType: string };
export type ProductOptionValue = { id: string; value: string; label: string; colorId: string | null; hex: string | null; available: boolean };
export type ProductOption = { id: string; code: string; name: string; required: boolean; values: ProductOptionValue[] };
export type ProductVariant = { id: string; price: number; compareAtPrice: number | null; available: boolean; stock: number; lowStockThreshold: number; maxPurchaseQuantity: number | null; optionValueIds: string[] };
export type ProductReview = { id: string; firstName: string | null; rating: number; body: string | null; createdAt: string; verifiedPurchase: boolean; imageUrl: string | null };
export type RelatedProduct = { id: string; slug: string; name: string; price: number; storeName: string; categorySlug: string | null; imagePath: string | null; imageAlt: string; createdAt: string };
export type ProductDetail = { id: string; slug: string; name: string; description: string | null; shortDescription: string | null; price: number; compareAtPrice: number | null; currency: string; featured: boolean; weightGrams: number | null; category: { name: string; slug: string } | null; brand: { name: string; slug: string } | null; store: { name: string; slug: string; logoUrl: string | null; verified: boolean } | null; media: ProductMedia[]; options: ProductOption[]; variants: ProductVariant[]; reviews: ProductReview[]; reviewSummary: { average: number | null; count: number; distribution: Record<number, number> }; related: RelatedProduct[]; similar: RelatedProduct[] };

function localized(value: LocalizedText, locale: string, fallback: string) {
  if (!value || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  const text = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof text === "string" ? text : fallback;
}

function publicUrl(path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return storagePublicUrl(path);
}

/** Public URL for a review photo stored in the `review-images` bucket. */
function reviewImageUrl(path: string | null): string | null {
  const base = process.env["SUPABASE_URL"];
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/review-images/${path}`;
}

function createPublicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The product catalogue is unavailable.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => { const headers = new Headers(init?.headers); if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization"); headers.set("apikey", key); return fetch(input, { ...init, headers }); } } });
}

export const getProductDetail = createServerFn({ method: "GET" })
  .validator((data) => z.object({ slug: z.string(), locale: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const productResult = await supabase.from("products").select("id,slug,name,description,short_description,base_price,compare_at_price,currency,featured,weight_grams,category_id,category:categories(name,slug),brand:brands(name,slug),store:stores(name,slug,logo_path,verification_status)").eq("slug", data.slug).eq("status", "active").eq("publication_status", "published").eq("moderation_status", "approved").eq("visibility", "public").maybeSingle();
    if (productResult.error) throw new Error("The product could not be loaded.");
    if (!productResult.data) return null;
    const product = productResult.data;
    const [mediaResult, optionsResult, valuesResult, variantsResult, optionLinksResult, reviewsResult, relatedResult, similarResult] = await Promise.all([
      supabase.from("product_images").select("id,storage_path,alt_text,color_id,variant_id,is_primary,media_type").eq("product_id", product.id).order("is_primary", { ascending: false }).order("sort_order"),
      supabase.from("product_options").select("id,code,name,required").eq("product_id", product.id).order("sort_order"),
      supabase.from("product_option_values").select("id,product_option_id,value,label,color_id,colors(hex_value)").order("sort_order"),
      supabase.from("product_variants").select("id,price,compare_at_price,available,status").eq("product_id", product.id).eq("status", "active").order("sort_order"),
      supabase.from("variant_option_values").select("variant_id,product_option_value_id"),
      supabase.from("reviews").select("id,first_name,rating,body,created_at,verified_purchase,image_path").eq("product_id", product.id).eq("moderation_status", "approved").order("created_at", { ascending: false }).limit(20),
      supabase.from("products").select("id,slug,name,base_price,created_at,category:categories(slug),seller:sellers(stores(name)),images:product_images(storage_path,alt_text,sort_order)").eq("category_id", product.category_id ?? "00000000-0000-0000-0000-000000000000").eq("status", "active").eq("publication_status", "published").eq("moderation_status", "approved").eq("visibility", "public").neq("id", product.id).order("published_at", { ascending: false }).limit(4),
      supabase.from("products").select("id,slug,name,base_price,created_at,category:categories(slug),seller:sellers(stores(name)),images:product_images(storage_path,alt_text,sort_order)").eq("category_id", product.category_id ?? "00000000-0000-0000-0000-000000000000").eq("status", "active").eq("publication_status", "published").eq("moderation_status", "approved").eq("visibility", "public").neq("id", product.id).order("published_at", { ascending: false }).limit(12),
    ]);
    if (mediaResult.error || optionsResult.error || valuesResult.error || variantsResult.error || optionLinksResult.error || reviewsResult.error || relatedResult.error || similarResult.error) throw new Error("The product details could not be loaded.");
    const inventories = await Promise.all((variantsResult.data ?? []).map((variant) => supabase.from("inventory").select("quantity,reserved_quantity,low_stock_threshold,max_purchase_quantity").eq("variant_id", variant.id).maybeSingle()));
    const optionIds = new Set((optionsResult.data ?? []).map((option) => option.id));
    const values = (valuesResult.data ?? []).filter((value) => optionIds.has(value.product_option_id));
    const links = optionLinksResult.data ?? [];
    const variants = (variantsResult.data ?? []).map((variant, index) => {
      const inventory = inventories[index]?.data;
      const stock = inventory ? Math.max(0, inventory.quantity - inventory.reserved_quantity) : 0;
      return { id: variant.id, price: variant.price ?? Number(product.base_price), compareAtPrice: variant.compare_at_price, available: variant.available && stock > 0, stock, lowStockThreshold: inventory?.low_stock_threshold ?? 0, maxPurchaseQuantity: inventory?.max_purchase_quantity ?? null, optionValueIds: links.filter((link) => link.variant_id === variant.id).map((link) => link.product_option_value_id) };
    });
    const options = (optionsResult.data ?? []).map((option) => ({ id: option.id, code: option.code, name: localized(option.name, data.locale, option.code), required: option.required, values: values.filter((value) => value.product_option_id === option.id).map((value) => { const color = Array.isArray(value.colors) ? value.colors[0] : value.colors; const matchingVariants = variants.filter((variant) => variant.optionValueIds.includes(value.id)); return { id: value.id, value: value.value, label: localized(value.label, data.locale, value.value), colorId: value.color_id, hex: color?.hex_value ?? null, available: matchingVariants.some((variant) => variant.available) }; }) }));
    const reviews = (reviewsResult.data ?? []).map((review) => ({ id: review.id, firstName: review.first_name, rating: review.rating, body: review.body, createdAt: review.created_at, verifiedPurchase: review.verified_purchase, imageUrl: reviewImageUrl(review.image_path) }));
    const distribution = [1, 2, 3, 4, 5].reduce<Record<number, number>>((result, rating) => ({ ...result, [rating]: reviews.filter((review) => review.rating === rating).length }), {});
    const toCard = (item: NonNullable<typeof relatedResult.data>[number]): RelatedProduct => { const images = Array.isArray(item.images) ? [...item.images].sort((a, b) => a.sort_order - b.sort_order) : []; const seller = Array.isArray(item.seller) ? item.seller[0] : item.seller; const stores = seller && Array.isArray(seller.stores) ? seller.stores : []; const category = Array.isArray(item.category) ? item.category[0] : item.category; return { id: item.id, slug: item.slug, name: localized(item.name, data.locale, item.slug), price: Number(item.base_price), storeName: stores[0]?.name ?? "Modalia store", categorySlug: category?.slug ?? null, imagePath: publicUrl(images[0]?.storage_path ?? null), imageAlt: localized(images[0]?.alt_text ?? null, data.locale, ""), createdAt: item.created_at }; };
    const related = (relatedResult.data ?? []).map(toCard);
    // Similar: same category, excluding the related picks, ordered by price proximity.
    // No store-priority of any kind — purely category + price distance from real data.
    const relatedIds = new Set(related.map((item) => item.id));
    const productPrice = Number(product.base_price);
    const similar = (similarResult.data ?? [])
      .map(toCard)
      .filter((item) => !relatedIds.has(item.id))
      .sort((a, b) => Math.abs(a.price - productPrice) - Math.abs(b.price - productPrice))
      .slice(0, 4);
    const category = Array.isArray(product.category) ? product.category[0] : product.category;
    const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand;
    const store = Array.isArray(product.store) ? product.store[0] : product.store;
    return { id: product.id, slug: product.slug, name: localized(product.name, data.locale, product.slug), description: localized(product.description, data.locale, "") || null, shortDescription: localized(product.short_description, data.locale, "") || null, price: Number(product.base_price), compareAtPrice: product.compare_at_price, currency: product.currency, featured: product.featured, weightGrams: product.weight_grams, category: category ? { name: localized(category.name, data.locale, category.slug), slug: category.slug } : null, brand: brand ? { name: brand.name, slug: brand.slug } : null, store: store ? { name: store.name, slug: store.slug, logoUrl: publicUrl(store.logo_path), verified: store.verification_status === "verified" } : null, media: (mediaResult.data ?? []).map((image) => ({ id: image.id, url: publicUrl(image.storage_path), alt: localized(image.alt_text, data.locale, ""), colorId: image.color_id, variantId: image.variant_id, isPrimary: image.is_primary, mediaType: image.media_type })), options, variants, reviews, reviewSummary: { average: reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null, count: reviews.length, distribution }, related, similar } satisfies ProductDetail;
  });
export type WishlistLivePrice = { productId: string; price: number; compareAtPrice: number | null; available: boolean; slug: string };

/**
 * Public batch lookup of current prices/availability for wishlist items.
 * Wishlist entries are snapshots in localStorage; this lets the wishlist
 * page show the live price, sale (compare-at) badges and out-of-stock state
 * instead of stale saved values — the storefront's "offers" surface for
 * wishlisted products.
 */
export const getWishlistLivePrices = createServerFn({ method: "GET" })
  .validator((data) => z.object({ productIds: z.array(z.string().uuid()).max(50), locale: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { rateLimitEndpoint } = await import("@/lib/rate-limit");
    rateLimitEndpoint("getWishlistLivePrices", 120);
    if (!data.productIds.length) return { items: [] as WishlistLivePrice[] };
    const supabase = createPublicClient();
    const { data: products, error } = await supabase
      .from("products")
      .select("id,slug,name,base_price,compare_at_price,product_variants(id,price,compare_at_price,available)")
      .in("id", data.productIds)
      .eq("status", "active")
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .eq("visibility", "public");
    if (error) throw new Error("Prices are temporarily unavailable.");
    const inventories = await Promise.all(
      (products ?? []).flatMap((p) => (p.product_variants ?? []).map((v) => v.id)).map((variantId) =>
        supabase.from("inventory").select("variant_id,quantity,reserved_quantity").eq("variant_id", variantId).maybeSingle(),
      ),
    );
    const stockByVariant = new Map(
      inventories
        .filter((r) => !r.error && r.data)
        .map((r) => [r.data!.variant_id, Math.max(0, r.data!.quantity - r.data!.reserved_quantity)] as const),
    );
    const items: WishlistLivePrice[] = (products ?? []).map((p) => {
      const variants = (p.product_variants ?? []).map((v) => ({
        price: Number(v.price ?? p.base_price),
        compareAtPrice: v.compare_at_price ?? p.compare_at_price,
        available: v.available && (stockByVariant.get(v.id) ?? 0) > 0,
      }));
      const available = variants.filter((v) => v.available);
      const pick = available.length ? available : variants.length ? [variants[0]!] : [];
      const price = pick.length ? Math.min(...pick.map((v) => v.price)) : Number(p.base_price);
      const compareAtPrice = pick.length
        ? pick.reduce<number | null>((best, v) => (v.compareAtPrice != null && (best == null || v.compareAtPrice > best) ? v.compareAtPrice : best), null)
        : p.compare_at_price;
      return {
        productId: p.id,
        price,
        compareAtPrice: compareAtPrice != null ? Number(compareAtPrice) : null,
        available: available.length > 0,
        slug: p.slug,
      };
    });
    return { items };
  });
