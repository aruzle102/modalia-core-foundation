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
  /** Product-level compare-at price. Present only when the source query selected it. */
  compareAtPrice?: number | null;
  /** Second image by sort_order, for hover crossfade on cards. */
  secondImagePath?: string | null;
  secondImageAlt?: string;
  /** Summed available stock across active variants. Absent when unknown — never guess. */
  totalStock?: number;
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
  verified: boolean;
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
const browseInput = z.object({
  locale: z.string().optional(),
  q: z.string().optional(),
  category: z.string().optional(),
  sort: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(48).optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  brands: z.array(z.string()).optional(),
  stores: z.array(z.string()).optional(),
  /** Color slugs (colors.slug). */
  colors: z.array(z.string()).optional(),
  /** Size display values (sizes.value, e.g. "M"). */
  sizes: z.array(z.string()).optional(),
  inStock: z.boolean().optional(),
  onSale: z.boolean().optional(),
});

export type CatalogBrand = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
};

export type FacetColor = {
  id: string;
  slug: string;
  name: string;
  hex: string | null;
  productCount: number;
};

export type FacetSize = {
  id: string;
  value: string;
  label: string;
  productCount: number;
};

export type BrowseResult = {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  brands: CatalogBrand[];
  stores: CatalogStore[];
  colors: FacetColor[];
  sizes: FacetSize[];
  priceBounds: { min: number; max: number };
  page: number;
  pageSize: number;
  total: number;
};

type PublicClient = ReturnType<typeof createPublicClient>;

/** Phase-1 projection: small rows for filtering/sorting, before image hydration. */
type BrowseRow = {
  id: string;
  slug: string;
  name: LocalizedText;
  base_price: number;
  compare_at_price: number | null;
  created_at: string;
  published_at: string | null;
  brand_id: string | null;
  store_id: string | null;
  category_id: string | null;
};

const BROWSE_ROW_LIMIT = 2000;
const DEFAULT_PAGE_SIZE = 24;

/** Real per-product available stock: sum (quantity - reserved) across active variants. */
async function fetchStockByProduct(client: PublicClient, productIds: string[]): Promise<Map<string, number>> {
  const stockByProduct = new Map<string, number>();
  if (!productIds.length) return stockByProduct;
  const variantResult = await client
    .from("product_variants")
    .select("id,product_id")
    .eq("status", "active")
    .in("product_id", productIds);
  if (variantResult.error) return stockByProduct;
  const variantToProduct = new Map(
    (variantResult.data ?? []).map((variant) => [variant.id, variant.product_id] as const),
  );
  const variantIds = [...variantToProduct.keys()];
  if (!variantIds.length) return stockByProduct;
  const inventoryResult = await client
    .from("inventory")
    .select("variant_id,quantity,reserved_quantity")
    .in("variant_id", variantIds);
  if (inventoryResult.error) return stockByProduct;
  for (const row of inventoryResult.data ?? []) {
    const pid = variantToProduct.get(row.variant_id);
    if (!pid) continue;
    const availableQty = Math.max(0, (row.quantity ?? 0) - (row.reserved_quantity ?? 0));
    stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + availableQty);
  }
  return stockByProduct;
}

/** Base filter for publicly visible, approved, published products. Call sites choose columns. */
function publishedFilter<const TColumns extends string>(client: PublicClient, columns: TColumns) {
  return client
    .from("products")
    .select(columns)
    .eq("status", "active")
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public");
}

function emptyBrowse(page: number, pageSize: number, categories: CatalogCategory[] = []): BrowseResult {
  return {
    products: [],
    categories,
    brands: [],
    stores: [],
    colors: [],
    sizes: [],
    priceBounds: { min: 0, max: 0 },
    page,
    pageSize,
    total: 0,
  };
}

/** Top-level categories with real product counts (children roll up to their parent). */
async function fetchTopCategories(client: PublicClient, locale: string): Promise<CatalogCategory[]> {
  const [categoryResult, countResult] = await Promise.all([
    client.from("categories").select("id,slug,name,parent_id").eq("status", "active").order("sort_order"),
    publishedFilter(client, "id,category_id").limit(5000),
  ]);
  const categories = (categoryResult.data ?? []) as { id: string; slug: string; name: LocalizedText; parent_id: string | null }[];
  const parentById = new Map<string, string | null>(categories.map((category) => [category.id, category.parent_id] as [string, string | null]));
  const topLevel = categories.filter((category) => category.parent_id === null);
  const rootOf = (categoryId: string | null): string | null => {
    let current = categoryId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const parent = parentById.get(current);
      if (parent === null || parent === undefined) return current;
      current = parent;
    }
    return null;
  };
  const counts = new Map<string, number>();
  for (const row of countResult.data ?? []) {
    const root = rootOf(row.category_id);
    if (root) counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return topLevel.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: localized(category.name, locale, category.slug),
    productCount: counts.get(category.id) ?? 0,
  }));
}

/** Hydrate a page of BrowseRows into full CatalogProducts (images, store names, stock). */
async function hydrateCards(
  client: PublicClient,
  locale: string,
  rows: BrowseRow[],
): Promise<CatalogProduct[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const storeIds = [
    ...new Set(
      rows.map((row) => row.store_id).filter((value): value is string => value !== null),
    ),
  ];
  type StoreNameRow = { id: string; name: string; verification_status: string };
  const [detailResult, storeResult] = await Promise.all([
    client
      .from("products")
      .select("id,slug,name,base_price,compare_at_price,created_at,store_id,category:categories(slug),seller:sellers(stores(name)),images:product_images(storage_path,alt_text,sort_order)")
      .in("id", ids),
    storeIds.length
      ? client.from("stores").select("id,name,verification_status").in("id", storeIds)
      : Promise.resolve({ data: [] as StoreNameRow[], error: null }),
  ]);
  if (detailResult.error) throw new Error("The catalogue could not be loaded.");
  const stockByProduct = await fetchStockByProduct(client, ids);
  const storeById = new Map((storeResult.data ?? []).map((store) => [store.id, store] as const));
  const byId = new Map((detailResult.data ?? []).map((product) => [product.id, product] as const));
  return rows
    .map((row): CatalogProduct | null => {
      const product = byId.get(row.id);
      if (!product) return null;
      const images = Array.isArray(product.images) ? [...product.images].sort((a, b) => a.sort_order - b.sort_order) : [];
      const firstImage = images[0];
      const secondImage = images[1];
      const seller = Array.isArray(product.seller) ? product.seller[0] : product.seller;
      const sellerStores = seller && Array.isArray(seller.stores) ? seller.stores : [];
      const category = Array.isArray(product.category) ? product.category[0] : product.category;
      const directStore = row.store_id ? storeById.get(row.store_id) : undefined;
      const totalStock = stockByProduct.get(row.id);
      return {
        id: product.id,
        slug: product.slug,
        name: localized(product.name, locale, product.slug),
        price: Number(product.base_price),
        compareAtPrice: product.compare_at_price ?? null,
        storeName: directStore?.name ?? sellerStores[0]?.name ?? "Modalia store",
        categorySlug: category?.slug ?? null,
        imagePath: publicUrl(firstImage?.storage_path ?? null),
        imageAlt: localized(firstImage?.alt_text ?? null, locale, ""),
        secondImagePath: publicUrl(secondImage?.storage_path ?? null),
        secondImageAlt: localized(secondImage?.alt_text ?? null, locale, ""),
        ...(totalStock === undefined ? {} : { totalStock }),
        createdAt: product.created_at,
      } satisfies CatalogProduct;
    })
    .filter((product): product is CatalogProduct => product !== null);
}

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
  // Prefer server env; fall back to VITE_ vars (some hosts only inject those).
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
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
      supabase.from("products").select("id,slug,name,base_price,compare_at_price,created_at,category:categories(slug),seller:sellers(stores(name)),images:product_images(storage_path,alt_text,sort_order)").eq("status", "active").eq("publication_status", "published").eq("moderation_status", "approved").eq("visibility", "public").order("created_at", { ascending: false }).limit(24),
      supabase.from("stores").select("id,slug,name,description,logo_path,banner_path,seller_id,verification_status").eq("status", "active").order("created_at", { ascending: false }).limit(12),
    ]);
    if (sectionResult.error || categoryResult.error || productResult.error || storeResult.error) {
      console.error("Catalog query failed", { sections: sectionResult.error?.message, categories: categoryResult.error?.message, products: productResult.error?.message, stores: storeResult.error?.message });
    }

    const rows = productResult.data ?? [];
    const productIds = rows.map((product) => product.id);

    // Real per-product stock: sum available (quantity - reserved) across active variants.
    // One batched lookup; if it fails we simply omit totalStock so no badge is shown.
    const stockByProduct = new Map<string, number>();
    if (productIds.length) {
      const variantResult = await supabase
        .from("product_variants")
        .select("id,product_id")
        .eq("status", "active")
        .in("product_id", productIds);
      if (!variantResult.error) {
        const variantToProduct = new Map(
          (variantResult.data ?? []).map((variant) => [variant.id, variant.product_id] as const),
        );
        const variantIds = [...variantToProduct.keys()];
        if (variantIds.length) {
          const inventoryResult = await supabase
            .from("inventory")
            .select("variant_id,quantity,reserved_quantity")
            .in("variant_id", variantIds);
          if (!inventoryResult.error) {
            for (const row of inventoryResult.data ?? []) {
              const pid = variantToProduct.get(row.variant_id);
              if (!pid) continue;
              const availableQty = Math.max(0, (row.quantity ?? 0) - (row.reserved_quantity ?? 0));
              stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + availableQty);
            }
          }
        }
      }
    }

    const products = rows.map((product) => {
      const images = Array.isArray(product.images) ? [...product.images].sort((a, b) => a.sort_order - b.sort_order) : [];
      const firstImage = images[0];
      const secondImage = images[1];
      const seller = Array.isArray(product.seller) ? product.seller[0] : product.seller;
      const sellerStores = seller && Array.isArray(seller.stores) ? seller.stores : [];
      const category = Array.isArray(product.category) ? product.category[0] : product.category;
      const totalStock = stockByProduct.get(product.id);
      return { id: product.id, slug: product.slug, name: localized(product.name, locale, product.slug), price: Number(product.base_price), compareAtPrice: product.compare_at_price ?? null, storeName: sellerStores[0]?.name ?? "Modalia store", categorySlug: category?.slug ?? null, imagePath: publicUrl(firstImage?.storage_path ?? null), imageAlt: localized(firstImage?.alt_text ?? null, locale, ""), secondImagePath: publicUrl(secondImage?.storage_path ?? null), secondImageAlt: localized(secondImage?.alt_text ?? null, locale, ""), ...(totalStock === undefined ? {} : { totalStock }), createdAt: product.created_at };
    });
    const categoryCounts = new Map<string, number>();
    products.forEach((product) => { if (product.categorySlug) categoryCounts.set(product.categorySlug, (categoryCounts.get(product.categorySlug) ?? 0) + 1); });
    const storeCounts = new Map<string, number>();
    products.forEach((product) => storeCounts.set(product.storeName, (storeCounts.get(product.storeName) ?? 0) + 1));
    return {
      sections: (sectionResult.data ?? []).map((section) => ({ sectionKey: section.section_key, kind: section.kind, title: localized(section.title, locale, ""), subtitle: localized(section.subtitle, locale, ""), content: section.content })),
      categories: (categoryResult.data ?? []).map((category) => ({ id: category.id, slug: category.slug, name: localized(category.name, locale, category.slug), productCount: categoryCounts.get(category.slug) ?? 0 })),
      products,
      stores: (storeResult.data ?? []).map((store) => ({ id: store.id, slug: store.slug, name: store.name, description: store.description, logoPath: publicUrl(store.logo_path), bannerPath: publicUrl(store.banner_path), productCount: storeCounts.get(store.name) ?? 0, verified: store.verification_status === "verified" })),
    };
}

export const getDiscoveryData = createServerFn({ method: "GET" })
  .validator((data) => discoveryInput.parse(data))
  .handler(async ({ data }) => fetchDiscoveryData(data.locale));

export const browseCatalog = createServerFn({ method: "GET" })
  .validator((data) => browseInput.parse(data))
  .handler(async ({ data }): Promise<BrowseResult> => {
    const locale = data.locale ?? "fr";
    const client = createPublicClient();
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? DEFAULT_PAGE_SIZE;
    const sort = data.sort === "price_asc" || data.sort === "price_desc" ? data.sort : "newest";

    const categories = await fetchTopCategories(client, locale);

    // ——— Phase 1: direct filters (category, brand, store, price, search) ———
    let rows: BrowseRow[];
    try {
      let query = publishedFilter(
        client,
        "id,slug,name,base_price,compare_at_price,created_at,published_at,brand_id,store_id,category_id",
      );

      const categorySlug = data.category?.trim();
      if (categorySlug) {
        const categoryResult = await client
          .from("categories")
          .select("id,parent_id")
          .eq("slug", categorySlug)
          .eq("status", "active");
        const allCategories = await client.from("categories").select("id,parent_id").eq("status", "active");
        const childrenByParent = new Map<string, string[]>();
        for (const category of allCategories.data ?? []) {
          if (category.parent_id) {
            const list = childrenByParent.get(category.parent_id) ?? [];
            list.push(category.id);
            childrenByParent.set(category.parent_id, list);
          }
        }
        const categoryIds = new Set<string>();
        for (const root of categoryResult.data ?? []) {
          const queue = [root.id];
          while (queue.length) {
            const current = queue.pop() as string;
            if (categoryIds.has(current)) continue;
            categoryIds.add(current);
            queue.push(...(childrenByParent.get(current) ?? []));
          }
        }
        if (!categoryIds.size) return emptyBrowse(page, pageSize, categories);
        query = query.in("category_id", [...categoryIds]);
      }

      if (data.brands?.length) {
        const brandResult = await client
          .from("brands")
          .select("id")
          .in("slug", data.brands)
          .eq("status", "active");
        const brandIds = (brandResult.data ?? []).map((brand) => brand.id);
        if (!brandIds.length) return emptyBrowse(page, pageSize, categories);
        query = query.in("brand_id", brandIds);
      }

      if (data.stores?.length) {
        const storeResult = await client
          .from("stores")
          .select("id")
          .in("slug", data.stores)
          .eq("status", "active");
        const storeIds = (storeResult.data ?? []).map((store) => store.id);
        if (!storeIds.length) return emptyBrowse(page, pageSize, categories);
        query = query.in("store_id", storeIds);
      }

      if (data.minPrice !== undefined) query = query.gte("base_price", data.minPrice);
      if (data.maxPrice !== undefined) query = query.lte("base_price", data.maxPrice);

      // Server-side search across localized names (PostgREST ->> JSON operator).
      const rawQuery = data.q?.trim() ?? "";
      const safeQuery = rawQuery.replace(/[%*,()\\]/g, "").slice(0, 80);
      if (safeQuery) {
        query = query.or(
          `name->>ar.ilike.%${safeQuery}%,name->>fr.ilike.%${safeQuery}%,name->>en.ilike.%${safeQuery}%`,
        );
      }

      const result = await query.limit(BROWSE_ROW_LIMIT);
      if (result.error) throw new Error("The catalogue could not be loaded.");
      rows = (result.data ?? []) as unknown as BrowseRow[];
    } catch (error) {
      console.error("Catalog browse failed", error);
      throw new Error("The catalogue could not be loaded.");
    }

    // ——— Phase 2: refinements needing joins (sale, sizes, colors, stock) ———
    if (data.onSale) {
      rows = rows.filter(
        (row) => row.compare_at_price != null && Number(row.compare_at_price) > Number(row.base_price),
      );
    }

    if (data.sizes?.length || data.colors?.length) {
      const valueIds = new Set<string>();
      if (data.sizes?.length) {
        const sizeValues = await client
          .from("product_option_values")
          .select("id")
          .in("value", data.sizes);
        (sizeValues.data ?? []).forEach((value) => valueIds.add(value.id));
      }
      if (data.colors?.length) {
        const colorRows = await client
          .from("colors")
          .select("id")
          .in("slug", data.colors)
          .eq("active", true);
        const colorIds = (colorRows.data ?? []).map((color) => color.id);
        if (colorIds.length) {
          const colorValues = await client
            .from("product_option_values")
            .select("id")
            .in("color_id", colorIds);
          (colorValues.data ?? []).forEach((value) => valueIds.add(value.id));
        }
      }
      if (!valueIds.size) {
        rows = [];
      } else {
        const linkResult = await client
          .from("variant_option_values")
          .select("variant_id")
          .in("product_option_value_id", [...valueIds]);
        const variantIds = (linkResult.data ?? []).map((link) => link.variant_id);
        if (!variantIds.length) {
          rows = [];
        } else {
          const variantResult = await client
            .from("product_variants")
            .select("product_id")
            .in("id", variantIds)
            .eq("status", "active");
          const matching = new Set((variantResult.data ?? []).map((variant) => variant.product_id));
          rows = rows.filter((row) => matching.has(row.id));
        }
      }
    }

    if (data.inStock && rows.length) {
      const stockByProduct = await fetchStockByProduct(
        client,
        rows.map((row) => row.id),
      );
      rows = rows.filter((row) => (stockByProduct.get(row.id) ?? 0) > 0);
    }

    // ——— Phase 3: sort + paginate ———
    if (sort === "price_asc") rows.sort((a, b) => Number(a.base_price) - Number(b.base_price));
    else if (sort === "price_desc") rows.sort((a, b) => Number(b.base_price) - Number(a.base_price));
    else
      rows.sort((a, b) =>
        (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at),
      );

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

    // ——— Phase 4: facets from the full refined set (honest counts) ———
    const [brands, stores, colorSizes, priceBounds] = await Promise.all([
      (async (): Promise<CatalogBrand[]> => {
        const brandIds = [...new Set(rows.map((row) => row.brand_id).filter((id): id is string => id !== null))];
        if (!brandIds.length) return [];
        const brandResult = await client
          .from("brands")
          .select("id,slug,name")
          .in("id", brandIds)
          .eq("status", "active");
        const counts = new Map<string, number>();
        rows.forEach((row) => {
          if (row.brand_id) counts.set(row.brand_id, (counts.get(row.brand_id) ?? 0) + 1);
        });
        return (brandResult.data ?? [])
          .map((brand) => ({
            id: brand.id,
            slug: brand.slug,
            name: brand.name,
            productCount: counts.get(brand.id) ?? 0,
          }))
          .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
      })(),
      (async (): Promise<CatalogStore[]> => {
        const storeIds = [...new Set(rows.map((row) => row.store_id).filter((id): id is string => id !== null))];
        if (!storeIds.length) return [];
        const storeResult = await client
          .from("stores")
          .select("id,slug,name,verification_status")
          .in("id", storeIds)
          .eq("status", "active");
        const counts = new Map<string, number>();
        rows.forEach((row) => {
          if (row.store_id) counts.set(row.store_id, (counts.get(row.store_id) ?? 0) + 1);
        });
        return (storeResult.data ?? [])
          .map((store) => ({
            id: store.id,
            slug: store.slug,
            name: store.name,
            description: null,
            logoPath: null,
            bannerPath: null,
            productCount: counts.get(store.id) ?? 0,
            verified: store.verification_status === "verified",
          }))
          .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
      })(),
      (async (): Promise<{ colors: FacetColor[]; sizes: FacetSize[] }> => {
        const productIds = rows.map((row) => row.id);
        if (!productIds.length) return { colors: [], sizes: [] };
        const optionResult = await client
          .from("product_options")
          .select("id,product_id")
          .in("product_id", productIds);
        const optionToProduct = new Map(
          (optionResult.data ?? []).map((option) => [option.id, option.product_id] as const),
        );
        const optionIds = [...optionToProduct.keys()];
        if (!optionIds.length) return { colors: [], sizes: [] };
        const valueResult = await client
          .from("product_option_values")
          .select("id,product_option_id,value,label,color_id,size_id")
          .in("product_option_id", optionIds);
        const colorProducts = new Map<string, Set<string>>();
        const sizeProducts = new Map<string, Set<string>>();
        for (const value of valueResult.data ?? []) {
          const productId = optionToProduct.get(value.product_option_id);
          if (!productId) continue;
          if (value.color_id) {
            const set = colorProducts.get(value.color_id) ?? new Set<string>();
            set.add(productId);
            colorProducts.set(value.color_id, set);
          }
          if (value.size_id) {
            const set = sizeProducts.get(value.size_id) ?? new Set<string>();
            set.add(productId);
            sizeProducts.set(value.size_id, set);
          }
        }
        const [colorResult, sizeResult] = await Promise.all([
          colorProducts.size
            ? client.from("colors").select("id,slug,name,hex_value").in("id", [...colorProducts.keys()]).eq("active", true)
            : Promise.resolve({ data: [] as { id: string; slug: string; name: LocalizedText; hex_value: string | null }[] }),
          sizeProducts.size
            ? client.from("sizes").select("id,value,label").in("id", [...sizeProducts.keys()]).eq("active", true)
            : Promise.resolve({ data: [] as { id: string; value: string; label: LocalizedText }[] }),
        ]);
        return {
          colors: (colorResult.data ?? [])
            .map((color) => ({
              id: color.id,
              slug: color.slug,
              name: localized(color.name, locale, color.slug),
              hex: color.hex_value,
              productCount: colorProducts.get(color.id)?.size ?? 0,
            }))
            .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name)),
          sizes: (sizeResult.data ?? [])
            .map((size) => ({
              id: size.id,
              value: size.value,
              label: localized(size.label, locale, size.value),
              productCount: sizeProducts.get(size.id)?.size ?? 0,
            }))
            .sort((a, b) => b.productCount - a.productCount || a.label.localeCompare(b.label)),
        };
      })(),
      (async (): Promise<{ min: number; max: number }> => {
        if (!rows.length) return { min: 0, max: 0 };
        let min = Number.POSITIVE_INFINITY;
        let max = 0;
        for (const row of rows) {
          const price = Number(row.base_price);
          if (price < min) min = price;
          if (price > max) max = price;
        }
        return { min: Math.floor(min), max: Math.ceil(max) };
      })(),
    ]);

    const products = await hydrateCards(client, locale, pageRows);

    return {
      products,
      categories,
      brands,
      stores,
      colors: colorSizes.colors,
      sizes: colorSizes.sizes,
      priceBounds,
      page: safePage,
      pageSize,
      total,
    };
  });
/** Public store directory: active stores with real published-product counts and verification flags. */
export const getStoreDirectory = createServerFn({ method: "GET" })
  .validator((data) => z.object({ locale: z.string().optional() }).parse(data))
  .handler(async ({ data }): Promise<CatalogStore[]> => {
    const client = createPublicClient();
    const [storeResult, countResult] = await Promise.all([
      client
        .from("stores")
        .select("id,slug,name,description,logo_path,banner_path,verification_status")
        .eq("status", "active")
        .order("name"),
      publishedFilter(client, "id,store_id").limit(5000),
    ]);
    if (storeResult.error) throw new Error("The store directory could not be loaded.");
    const counts = new Map<string, number>();
    for (const row of countResult.data ?? []) {
      if (row.store_id) counts.set(row.store_id, (counts.get(row.store_id) ?? 0) + 1);
    }
    return ((storeResult.data ?? []) as { id: string; slug: string; name: string; description: string | null; logo_path: string | null; banner_path: string | null; verification_status: string }[]).map((store) => ({
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: store.description,
      logoPath: publicUrl(store.logo_path),
      bannerPath: publicUrl(store.banner_path),
      productCount: counts.get(store.id) ?? 0,
      verified: store.verification_status === "verified",
    }));
  });
