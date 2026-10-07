import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { storagePublicUrl } from "@/lib/store.functions";

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
  /** V8 taxonomy (#167): merchandising + SEO fields, null when unset. */
  imageUrl: string | null;
  gender: "men" | "women" | "kids" | "unisex" | null;
  featured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
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
  /** Merchandising gender (categories.gender: men|women|kids|unisex). */
  gender: z.string().optional(),
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
    client.from("categories").select("id,slug,name,parent_id,image_url,gender,featured,seo_title,seo_description").eq("status", "active").order("sort_order"),
    publishedFilter(client, "id,category_id").limit(5000),
  ]);
  const categories = (categoryResult.data ?? []) as {
    id: string;
    slug: string;
    name: LocalizedText;
    parent_id: string | null;
    image_url: string | null;
    gender: string | null;
    featured: boolean | null;
    seo_title: string | null;
    seo_description: string | null;
  }[];
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
    imageUrl: category.image_url,
    gender: isCategoryGender(category.gender) ? category.gender : null,
    featured: category.featured === true,
    seoTitle: category.seo_title,
    seoDescription: category.seo_description,
  }));
}

const CATEGORY_GENDERS = new Set(["men", "women", "kids", "unisex"]);

function isCategoryGender(value: string | null): value is "men" | "women" | "kids" | "unisex" {
  return value !== null && CATEGORY_GENDERS.has(value);
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
  return storagePublicUrl(path);
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
      supabase.from("categories").select("id,slug,name,image_url,gender,featured,seo_title,seo_description").eq("status", "active").is("parent_id", null).order("sort_order"),
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
      categories: (categoryResult.data ?? []).map((category: { id: string; slug: string; name: LocalizedText; image_url?: string | null; gender?: string | null; featured?: boolean | null; seo_title?: string | null; seo_description?: string | null }) => {
        const gender = category.gender ?? null;
        return {
          id: category.id,
          slug: category.slug,
          name: localized(category.name, locale, category.slug),
          productCount: categoryCounts.get(category.slug) ?? 0,
          imageUrl: category.image_url ?? null,
          gender: isCategoryGender(gender) ? gender : null,
          featured: category.featured === true,
          seoTitle: category.seo_title ?? null,
          seoDescription: category.seo_description ?? null,
        };
      }),
      products,
      stores: (storeResult.data ?? []).map((store) => ({ id: store.id, slug: store.slug, name: store.name, description: store.description, logoPath: publicUrl(store.logo_path), bannerPath: publicUrl(store.banner_path), productCount: storeCounts.get(store.name) ?? 0, verified: store.verification_status === "verified" })),
    };
}

export const getDiscoveryData = createServerFn({ method: "GET" })
  .validator((data) => discoveryInput.parse(data))
  .handler(async ({ data }) => fetchDiscoveryData(data.locale));

/** Lightweight top-level categories for the site header dropdown (no product data). */
export const getHeaderCategories = createServerFn({ method: "GET" })
  .validator((data) => z.object({ locale: z.enum(["ar", "fr", "en"]).default("fr") }).parse(data))
  .handler(async ({ data }) => {
    const client = createPublicClient();
    return { categories: await fetchTopCategories(client, data.locale) };
  });

export const browseCatalog = createServerFn({ method: "GET" })
  .validator((data) => browseInput.parse(data))
  .handler(async ({ data }): Promise<BrowseResult> => {
    const locale = data.locale ?? "fr";
    const client = createPublicClient();
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? DEFAULT_PAGE_SIZE;
    const sort = data.sort === "price_asc" || data.sort === "price_desc" ? data.sort : "newest";

    const categories = await fetchTopCategories(client, locale);

    // ——— Database-native path: FTS + structured filters + DB pagination ———
    // Every filter (category, brand, store, price, color, size, gender,
    // in-stock, on-sale) is passed as an RPC param — no 2000-row JS prefetch.
    // The RPC also accepts an empty query (published products, newest first).
    try {
      return await runFtsSearch(client, data, locale, categories, { allowEmptyQuery: true });
    } catch (err) {
      if (!(err instanceof FtsUnavailableError)) throw err;
      console.warn("FTS browse unavailable, falling back to legacy browse:", err.message);
    }

    // ——— Legacy fallback (FTS migration not applied): direct filters ———
    let rows: BrowseRow[];
    try {
      let query = publishedFilter(
        client,
        "id,slug,name,base_price,compare_at_price,created_at,published_at,brand_id,store_id,category_id",
      );

      const categorySlug = data.category?.trim();
      // V8 #228: gender is allowlisted at the boundary (same canonical set
      // as the FTS p_gender param); anything else = no gender filter.
      const legacyGender =
        data.gender === "men" ||
        data.gender === "women" ||
        data.gender === "kids" ||
        data.gender === "unisex"
          ? data.gender
          : null;
      // Category tree (with gender) is shared by the category filter and the
      // gender filter; built once when either is active.
      type CategoryTree = {
        rows: Array<{ id: string; parent_id: string | null; gender: string | null }>;
        childrenByParent: Map<string, string[]>;
      };
      const buildCategoryTree = async (): Promise<CategoryTree> => {
        const allCategories = await client
          .from("categories")
          .select("id,parent_id,gender")
          .eq("status", "active");
        const rows = (allCategories.data ?? []) as CategoryTree["rows"];
        const childrenByParent = new Map<string, string[]>();
        for (const category of rows) {
          if (category.parent_id) {
            const list = childrenByParent.get(category.parent_id) ?? [];
            list.push(category.id);
            childrenByParent.set(category.parent_id, list);
          }
        }
        return { rows, childrenByParent };
      };
      let categoryTree: CategoryTree | null = null;
      const ensureCategoryTree = async (): Promise<CategoryTree> =>
        categoryTree ?? (categoryTree = await buildCategoryTree());
      const descendantClosure = (tree: CategoryTree, roots: string[]): Set<string> => {
        const ids = new Set<string>();
        const queue = [...roots];
        while (queue.length) {
          const current = queue.pop() as string;
          if (ids.has(current)) continue;
          ids.add(current);
          queue.push(...(tree.childrenByParent.get(current) ?? []));
        }
        return ids;
      };
      if (categorySlug) {
        const categoryResult = await client
          .from("categories")
          .select("id,parent_id")
          .eq("slug", categorySlug)
          .eq("status", "active");
        const tree = await ensureCategoryTree();
        const categoryIds = descendantClosure(
          tree,
          (categoryResult.data ?? []).map((category) => category.id),
        );
        if (!categoryIds.size) return emptyBrowse(page, pageSize, categories);
        query = query.in("category_id", [...categoryIds]);
      }
      if (legacyGender) {
        // Mirrors the RPC's descendant-closure semantics: a product matches
        // iff its category or any ancestor carries the gender.
        const tree = await ensureCategoryTree();
        const genderRoots = tree.rows
          .filter((category) => category.gender === legacyGender)
          .map((category) => category.id);
        const genderedIds = descendantClosure(tree, genderRoots);
        if (!genderedIds.size) return emptyBrowse(page, pageSize, categories);
        query = query.in("category_id", [...genderedIds]);
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

      // Legacy ilike search (FTS migration not applied).
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

/**
 * Thrown when the database-native FTS path cannot be used (RPC missing,
 * migration not applied, or query error). Callers fall back to ilike search.
 */
export class FtsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FtsUnavailableError";
  }
}

type FtsFacetBrand = { id: string; slug: string; name: string; count: number };
type FtsFacetStore = {
  id: string;
  slug: string;
  name: string;
  verified: boolean;
  count: number;
};
type FtsFacetColor = {
  id: string;
  slug: string;
  name: LocalizedText;
  hex: string | null;
  count: number;
};
type FtsFacetSize = {
  id: string;
  value: string;
  label: LocalizedText;
  count: number;
};

type FtsPayload = {
  total: number;
  ids: string[];
  facets: {
    brands: FtsFacetBrand[];
    stores: FtsFacetStore[];
    colors: FtsFacetColor[];
    sizes: FtsFacetSize[];
    price_bounds: { min: number; max: number } | null;
  };
};

/**
 * Database-native full-text search via the `search_products_fts` RPC.
 * All filtering, ranking (ts_rank + trigram fallback), and pagination happen
 * in PostgreSQL — no multi-thousand-row fetch with JS post-filtering.
 * Throws FtsUnavailableError when the RPC is unavailable so callers can
 * fall back to the legacy ilike path.
 */
async function runFtsSearch(
  client: PublicClient,
  data: z.infer<typeof browseInput>,
  locale: string,
  categories: CatalogCategory[],
  opts?: { allowEmptyQuery?: boolean },
): Promise<BrowseResult> {
  const page = data.page ?? 1;
  const pageSize = data.pageSize ?? DEFAULT_PAGE_SIZE;
  const sort =
    data.sort === "price_asc" || data.sort === "price_desc"
      ? data.sort
      : data.sort === "newest"
        ? "newest"
        : "relevance";

  const rawQuery = data.q?.trim() ?? "";
  const safeQuery = rawQuery.replace(/[%*,()\\]/g, "").slice(0, 80);
  // The RPC handles an empty query itself (lists published products, newest
  // first). The public search endpoint keeps the strict behavior; the browse
  // path allows it so color/size/stock/sale filters reach the DB without a
  // 2000-row JS prefetch.
  if (!safeQuery && !opts?.allowEmptyQuery) throw new FtsUnavailableError("empty query");

  // Gender: structured DB filter (V8 #180/#228) — allowlisted at the boundary
  // so a malformed URL value degrades to "no gender filter" instead of
  // throwing. Matches categories.gender ('men'|'women'|'kids'|'unisex').
  const gender =
    data.gender === "men" ||
    data.gender === "women" ||
    data.gender === "kids" ||
    data.gender === "unisex"
      ? data.gender
      : null;

  const rpcArgs: Record<string, string | number | boolean | string[]> = {
    p_query: safeQuery,
    p_in_stock: data.inStock ?? false,
    p_on_sale: data.onSale ?? false,
    p_sort: sort,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  };
  const categorySlug = data.category?.trim();
  if (categorySlug) rpcArgs["p_category_slug"] = categorySlug;
  if (data.brands?.length) rpcArgs["p_brand_slugs"] = data.brands;
  if (data.stores?.length) rpcArgs["p_store_slugs"] = data.stores;
  if (data.minPrice !== undefined) rpcArgs["p_min_price"] = data.minPrice;
  if (data.maxPrice !== undefined) rpcArgs["p_max_price"] = data.maxPrice;
  if (data.colors?.length) rpcArgs["p_color_slugs"] = data.colors;
  if (data.sizes?.length) rpcArgs["p_size_values"] = data.sizes;
  if (gender) rpcArgs["p_gender"] = gender;
  const { data: payload, error } = await client.rpc("search_products_fts", rpcArgs as never);
  if (error) throw new FtsUnavailableError(error.message);

  const result = payload as unknown as FtsPayload;
  const ids: string[] = Array.isArray(result?.ids) ? result.ids : [];
  const total = Number(result?.total ?? 0);

  // Fetch card rows for this page, preserving the RPC's rank order.
  // Visibility predicates are re-applied on the re-fetch (defense in depth —
  // the RPC already enforced them when producing the ids).
  let rows: BrowseRow[] = [];
  if (ids.length) {
    const rowResult = await client
      .from("products")
      .select(
        "id,slug,name,base_price,compare_at_price,created_at,published_at,brand_id,store_id,category_id",
      )
      .eq("status", "active")
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .eq("visibility", "public")
      .in("id", ids);
    if (rowResult.error) throw new FtsUnavailableError(rowResult.error.message);
    const byId = new Map(
      ((rowResult.data ?? []) as unknown as BrowseRow[]).map((row) => [row.id, row] as const),
    );
    rows = ids
      .map((id) => byId.get(id))
      .filter((row): row is BrowseRow => row !== undefined);
  }

  const products = await hydrateCards(client, locale, rows);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const facets = result?.facets;

  return {
    products,
    categories,
    brands: (facets?.brands ?? []).map((brand) => ({
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      productCount: brand.count,
    })),
    stores: (facets?.stores ?? []).map((store) => ({
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: null,
      logoPath: null,
      bannerPath: null,
      productCount: store.count,
      verified: store.verified,
    })),
    colors: (facets?.colors ?? []).map((color) => ({
      id: color.id,
      slug: color.slug,
      name: localized(color.name, locale, color.slug),
      hex: color.hex,
      productCount: color.count,
    })),
    sizes: (facets?.sizes ?? []).map((size) => ({
      id: size.id,
      value: size.value,
      label: localized(size.label, locale, size.value),
      productCount: size.count,
    })),
    priceBounds: facets?.price_bounds ?? { min: 0, max: 0 },
    page: safePage,
    pageSize,
    total,
  };
}

/**
 * Public full-text product search. Uses database-native FTS
 * (`search_products_fts` RPC: tsvector + ts_rank with trigram fallback,
 * DB-level filters, DB-level pagination). Throws FtsUnavailableError when
 * the FTS migration has not been applied.
 */
export const searchProductsFTS = createServerFn({ method: "GET" })
  .validator((data) => browseInput.parse(data))
  .handler(async ({ data }): Promise<BrowseResult> => {
    const locale = data.locale ?? "fr";
    const client = createPublicClient();
    const categories = await fetchTopCategories(client, locale);
    return runFtsSearch(client, data, locale, categories);
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
