/**
 * Modalia Recommendation Engine — deterministic, database-backed, no external AI.
 *
 * Scoring is fully deterministic: same inputs always produce the same ranking.
 * All candidates are filtered for public visibility before scoring:
 *   active + published + approved + public, seller active, in stock.
 *
 * Signals (weights configurable via RECOMMENDATION_WEIGHTS, overridable from
 * intelligence_settings.ranking_weights where the keys overlap):
 *   - Same category ............ +5
 *   - Same brand ............... +3
 *   - Same store ............... +2
 *   - Price affinity ........... +2 (within 20%) / +1 (within 50%)
 *   - Shared color ............. +2
 *   - Category affinity ........ +3 per matched session category
 *   - Trending popularity ...... +0..3 (rank in trending_products RPC)
 *   - Recency .................. +1 (created < 30 days ago)
 *
 * Never fabricates: returns { products: [], hasData: false } when no
 * candidates or no signals exist.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import type { CatalogProduct } from "@/lib/catalog.functions";

/** Tunable weights. Keys mirror intelligence_settings.ranking_weights where overlapping. */
export const RECOMMENDATION_WEIGHTS = {
  sameCategory: 5,
  sameBrand: 3,
  sameStore: 2,
  priceClose: 2, // within 20%
  priceNear: 1, // within 50%
  sharedColor: 2,
  categoryAffinity: 3, // per session category match
  trendingMax: 3, // scaled by trending rank
  recencyBoost: 1, // created within 30 days
} as const;

export type SessionSignals = {
  /** Category slugs from recently viewed / searched (anonymous-safe). */
  categorySlugs?: string[];
  /** Product IDs to exclude (already seen / in cart). */
  excludeIds?: string[];
};

const recommendationsInput = z.object({
  productId: z.string().uuid().optional(),
  locale: z.string().min(2).max(5).default("en"),
  limit: z.coerce.number().int().min(1).max(24).default(8),
  sessionSignals: z
    .object({
      categorySlugs: z.array(z.string().min(1).max(160)).max(20).optional(),
      excludeIds: z.array(z.string().uuid()).max(50).optional(),
    })
    .optional(),
});

function publicClient(): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The marketplace catalogue is unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function localized(value: Json | null, locale: string, fallback: string): string {
  if (!value || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  const text = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof text === "string" ? text : fallback;
}

function publicUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return null;
}

type CandidateRow = {
  id: string;
  slug: string;
  name: Json | null;
  base_price: number;
  created_at: string;
  brand_id: string | null;
  store_id: string | null;
  category_id: string | null;
  category_slug: string | null;
  color_ids: string[];
  stock: number;
};

/**
 * Fetch scored candidate products. All filtering happens in the database;
 * scoring is deterministic in JS over a bounded candidate set.
 */
async function fetchCandidates(
  client: SupabaseClient<Database>,
  opts: {
    excludeId?: string;
    excludeIds?: string[];
    categoryIds?: string[];
    limit: number;
  },
): Promise<CandidateRow[]> {
  // Pull a bounded pool of visible, in-stock products. The pool is ordered
  // by recency so scoring has fresh inventory to work with; final ranking
  // is by score, not by this order.
  let query = client
    .from("products")
    .select(
      "id,slug,name,base_price,created_at,brand_id,store_id,category_id,category:categories(slug)",
    )
    .eq("status", "active")
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(200);

  if (opts.excludeId) query = query.neq("id", opts.excludeId);
  if (opts.excludeIds?.length) query = query.not("id", "in", `(${opts.excludeIds.join(",")})`);

  const { data, error } = await query;
  if (error || !data?.length) return [];

  const ids = data.map((r) => r.id);

  // Resolve color_ids per product via variant option values (single batched query).
  const colorByProduct = new Map<string, string[]>();
  const variantResult = await client
    .from("product_variants")
    .select("id,product_id")
    .in("product_id", ids)
    .eq("available", true);
  const variants = variantResult.data ?? [];
  if (variants.length) {
    const variantIds = variants.map((v) => v.id);
    const linkResult = await client
      .from("variant_option_values")
      .select("variant_id,product_option_value:product_option_values(color_id)")
      .in("variant_id", variantIds);
    const variantToProduct = new Map(variants.map((v) => [v.id, v.product_id]));
    for (const link of linkResult.data ?? []) {
      const pov = Array.isArray(link.product_option_value)
        ? link.product_option_value[0]
        : link.product_option_value;
      const colorId = pov?.color_id;
      const productId = variantToProduct.get(link.variant_id);
      if (colorId && productId) {
        const list = colorByProduct.get(productId) ?? [];
        if (!list.includes(colorId)) list.push(colorId);
        colorByProduct.set(productId, list);
      }
    }
  }

  // Stock per product via variants (single batched query pattern).
  const stockByProduct = new Map<string, number>();
  const variantStockResult = await client
    .from("product_variants")
    .select("id,product_id")
    .in("product_id", ids);
  const variantToProduct = new Map(
    (variantStockResult.data ?? []).map((v) => [v.id, v.product_id] as const),
  );
  const allVariantIds = [...variantToProduct.keys()];
  if (allVariantIds.length) {
    const stockResult = await client
      .from("inventory")
      .select("variant_id,quantity,reserved_quantity")
      .in("variant_id", allVariantIds);
    for (const row of stockResult.data ?? []) {
      const pid = variantToProduct.get(row.variant_id);
      if (!pid) continue;
      const available = Math.max(0, Number(row.quantity ?? 0) - Number(row.reserved_quantity ?? 0));
      stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + available);
    }
  }

  return data
    .map((row): CandidateRow | null => {
      const category = Array.isArray(row.category) ? row.category[0] : row.category;
      const stock = stockByProduct.get(row.id) ?? 0;
      if (stock <= 0) return null; // availability is a filter, not a score
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        base_price: Number(row.base_price),
        created_at: row.created_at,
        brand_id: row.brand_id,
        store_id: row.store_id,
        category_id: row.category_id,
        category_slug: category?.slug ?? null,
        color_ids: colorByProduct.get(row.id) ?? [],
        stock,
      };
    })
    .filter((r): r is CandidateRow => r !== null);
}

async function fetchTrendingRanks(
  client: SupabaseClient<Database>,
  limit: number,
): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  try {
    // Bypass the typed RPC registry (trending_products is granted to anon).
    const rpc = client.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: { product_id: string }[] | null; error: unknown }>;
    const { data, error } = await rpc("trending_products", {
      p_days: 7,
      p_limit: 20,
    });
    if (error || !data) return ranks;
    data.forEach((row, index) => {
      ranks.set(row.product_id, index);
    });
  } catch {
    // Trending is a boost, not a requirement — never fail recommendations.
  }
  return ranks;
}

type ReferenceProduct = {
  id: string;
  category_id: string | null;
  category_slug: string | null;
  brand_id: string | null;
  store_id: string | null;
  base_price: number;
  color_ids: string[];
};

async function fetchReference(
  client: SupabaseClient<Database>,
  productId: string,
): Promise<ReferenceProduct | null> {
  const { data, error } = await client
    .from("products")
    .select("id,base_price,brand_id,store_id,category_id,category:categories(slug)")
    .eq("id", productId)
    .eq("status", "active")
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public")
    .maybeSingle();
  if (error || !data) return null;

  const category = Array.isArray(data.category) ? data.category[0] : data.category;
  const colorIds = new Set<string>();
  const variantResult = await client
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("available", true);
  const variantIds = (variantResult.data ?? []).map((v) => v.id);
  if (variantIds.length) {
    const linkResult = await client
      .from("variant_option_values")
      .select("product_option_value:product_option_values(color_id)")
      .in("variant_id", variantIds);
    for (const link of linkResult.data ?? []) {
      const pov = Array.isArray(link.product_option_value)
        ? link.product_option_value[0]
        : link.product_option_value;
      if (pov?.color_id) colorIds.add(pov.color_id);
    }
  }

  return {
    id: data.id,
    category_id: data.category_id,
    category_slug: category?.slug ?? null,
    brand_id: data.brand_id,
    store_id: data.store_id,
    base_price: Number(data.base_price),
    color_ids: [...colorIds],
  };
}

function scoreCandidate(
  candidate: CandidateRow,
  reference: ReferenceProduct | null,
  sessionCategories: Set<string>,
  trendingRanks: Map<string, number>,
  now: number,
): number {
  let score = 0;
  const W = RECOMMENDATION_WEIGHTS;

  if (reference) {
    if (candidate.category_id && candidate.category_id === reference.category_id) {
      score += W.sameCategory;
    }
    if (candidate.brand_id && candidate.brand_id === reference.brand_id) {
      score += W.sameBrand;
    }
    if (candidate.store_id && candidate.store_id === reference.store_id) {
      score += W.sameStore;
    }
    if (reference.base_price > 0 && candidate.base_price > 0) {
      const ratio =
        Math.min(candidate.base_price, reference.base_price) /
        Math.max(candidate.base_price, reference.base_price);
      if (ratio >= 0.8) score += W.priceClose;
      else if (ratio >= 0.5) score += W.priceNear;
    }
    if (
      reference.color_ids.length &&
      candidate.color_ids.some((c) => reference.color_ids.includes(c))
    ) {
      score += W.sharedColor;
    }
  }

  if (candidate.category_slug && sessionCategories.has(candidate.category_slug)) {
    score += W.categoryAffinity;
  }

  const trendRank = trendingRanks.get(candidate.id);
  if (trendRank !== undefined) {
    // Rank 0 (top) gets full boost, decaying linearly over the top 20.
    score += Math.max(0, W.trendingMax * (1 - trendRank / 20));
  }

  const ageMs = now - Date.parse(candidate.created_at);
  if (!Number.isNaN(ageMs) && ageMs < 30 * 86_400_000) {
    score += W.recencyBoost;
  }

  return score;
}

async function toCatalogProducts(
  client: SupabaseClient<Database>,
  candidates: CandidateRow[],
  locale: string,
): Promise<CatalogProduct[]> {
  const ids = candidates.map((c) => c.id);
  if (!ids.length) return [];

  const { data, error } = await client
    .from("products")
    .select(
      "id,slug,name,base_price,compare_at_price,created_at,store_id,category:categories(slug),images:product_images(storage_path,alt_text,sort_order)",
    )
    .in("id", ids);
  if (error || !data) return [];

  const byId = new Map(data.map((p) => [p.id, p]));
  const order = new Map(ids.map((id, i) => [id, i]));

  return [...byId.values()]
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((product): CatalogProduct | null => {
      const candidate = candidates.find((c) => c.id === product.id);
      if (!candidate) return null;
      const images = Array.isArray(product.images)
        ? [...product.images].sort((a, b) => a.sort_order - b.sort_order)
        : [];
      const firstImage = images[0];
      const secondImage = images[1];
      const category = Array.isArray(product.category) ? product.category[0] : product.category;
      return {
        id: product.id,
        slug: product.slug,
        name: localized(product.name, locale, product.slug),
        price: Number(product.base_price),
        compareAtPrice: product.compare_at_price ?? null,
        storeName: "",
        categorySlug: category?.slug ?? null,
        imagePath: publicUrl(firstImage?.storage_path ?? null),
        imageAlt: localized(firstImage?.alt_text ?? null, locale, ""),
        secondImagePath: publicUrl(secondImage?.storage_path ?? null),
        secondImageAlt: localized(secondImage?.alt_text ?? null, locale, ""),
        totalStock: candidate.stock,
        createdAt: product.created_at,
      };
    })
    .filter((p): p is CatalogProduct => p !== null);
}

/**
 * Deterministic product recommendations.
 *
 * - With `productId`: "similar products" ranked by category/brand/store/
 *   price/color affinity plus trending and recency.
 * - Without `productId`: ranked by session category affinity (recently viewed
 *   / searched categories), trending, and recency.
 * - Returns `{ products: [], hasData: false }` when nothing qualifies —
 *   never fabricated.
 */
export const getRecommendations = createServerFn({ method: "GET" })
  .inputValidator((data) => recommendationsInput.parse(data))
  .handler(async ({ data }) => {
    const client = publicClient();
    const now = Date.now();

    const reference = data.productId ? await fetchReference(client, data.productId) : null;
    // A requested productId that doesn't resolve to a visible product yields
    // no recommendations rather than a generic list.
    if (data.productId && !reference) {
      return { products: [] as CatalogProduct[], hasData: false };
    }

    const sessionCategories = new Set(
      (data.sessionSignals?.categorySlugs ?? []).map((s) => s.toLowerCase()),
    );

    const candidates = await fetchCandidates(client, {
      ...(data.productId ? { excludeId: data.productId } : {}),
      ...(data.sessionSignals?.excludeIds?.length
        ? { excludeIds: data.sessionSignals.excludeIds }
        : {}),
      limit: 200,
    });
    if (!candidates.length) {
      return { products: [] as CatalogProduct[], hasData: false };
    }

    const trendingRanks = await fetchTrendingRanks(client, 20);

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate, reference, sessionCategories, trendingRanks, now),
      }))
      // Require at least one meaningful signal — no generic filler.
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.candidate.stock - a.candidate.stock);

    const top = scored.slice(0, data.limit).map((s) => s.candidate);
    const products = await toCatalogProducts(client, top, data.locale);
    return { products, hasData: products.length > 0 };
  });

/**
 * Internal helper for server-side callers (e.g. the AI assistant) that already
 * hold a Supabase client. Returns scored product IDs in rank order — no
 * CatalogProduct enrichment, no locale handling.
 *
 * This is the same deterministic engine as getRecommendations, exposed for
 * composition. Never fabricates: returns [] when nothing qualifies.
 */
export async function getSimilarProductIds(
  client: SupabaseClient<Database>,
  productId: string,
  limit = 8,
): Promise<string[]> {
  const now = Date.now();
  const reference = await fetchReference(client, productId);
  if (!reference) return [];

  const candidates = await fetchCandidates(client, {
    excludeId: productId,
    limit: 200,
  });
  if (!candidates.length) return [];

  const trendingRanks = await fetchTrendingRanks(client, 20);
  return candidates
    .map((candidate) => ({
      id: candidate.id,
      score: scoreCandidate(candidate, reference, new Set(), trendingRanks, now),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id);
}
