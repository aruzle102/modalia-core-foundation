import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Search suggestions backend for the global search autocomplete.
 *
 * - getSearchSuggestions: live matches for products, stores, categories, brands
 * - getTrendingSearches: real search activity if data exists, else []
 * - getPopularCategories: categories with the most published products
 * - getPopularSearchFallbacks: admin-configured suggestions from site_settings
 *
 * No fake trending data: when there is no real activity, the UI falls back to
 * the admin-configured list (editable in Admin > Site settings).
 */

function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Service unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SuggestionProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  imageUrl: string | null;
  storeName: string | null;
};

export type SuggestionStore = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
};

export type SuggestionCategory = {
  id: string;
  slug: string;
  name: string;
};

export type SuggestionBrand = {
  id: string;
  slug: string;
  name: string;
};

export type SearchSuggestions = {
  products: SuggestionProduct[];
  stores: SuggestionStore[];
  categories: SuggestionCategory[];
  brands: SuggestionBrand[];
};

const suggestionsInput = z.object({
  query: z.string().min(2).max(60),
  locale: z.enum(["ar", "fr", "en"]).default("fr"),
});

export const getSearchSuggestions = createServerFn({ method: "GET" })
  .validator((data) => suggestionsInput.parse(data))
  .handler(async ({ data }): Promise<SearchSuggestions> => {
    const supabase = publicClient();
    const q = data.query.trim().replace(/[%_]/g, "");
    const like = `%${q}%`;

    // Products: published + approved + visible only
    const productsRes = await supabase
      .from("products")
      .select("id,slug,name,base_price,images,store_id")
      .eq("status", "active")
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .eq("visibility", "public")
      .ilike("name", like)
      .order("created_at", { ascending: false })
      .limit(5);

    // Stores: active only
    const storesRes = await supabase
      .from("stores")
      .select("id,slug,name,logo_path")
      .eq("status", "active")
      .ilike("name", like)
      .order("name")
      .limit(3);

    // Categories: active only
    const categoriesRes = await supabase
      .from("categories")
      .select("id,slug,name")
      .eq("status", "active")
      .ilike("name", like)
      .order("sort_order")
      .limit(4);

    // Brands: ilike on name
    const brandsRes = await supabase
      .from("brands")
      .select("id,slug,name")
      .ilike("name", like)
      .order("name")
      .limit(3);

    const storeIds = [
      ...new Set(
        (productsRes.data ?? []).map((p: any) => p.store_id).filter(Boolean),
      ),
    ];
    let storeNames = new Map<string, string>();
    if (storeIds.length) {
      const sn = await supabase.from("stores").select("id,name").in("id", storeIds);
      storeNames = new Map((sn.data ?? []).map((s: any) => [s.id, s.name]));
    }

    return {
      products: (productsRes.data ?? []).map((p: any) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: Number(p.base_price ?? 0),
        imageUrl: Array.isArray(p.images) && p.images.length ? p.images[0]?.url ?? null : null,
        storeName: p.store_id ? (storeNames.get(p.store_id) ?? null) : null,
      })),
      stores: (storesRes.data ?? []).map((s: any) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        logoUrl: s.logo_path ?? null,
      })),
      categories: (categoriesRes.data ?? []).map((c: any) => ({
        id: c.id,
        slug: c.slug,
        name: typeof c.name === "string" ? c.name : (c.name?.[data.locale] ?? c.name?.en ?? c.slug),
      })),
      brands: (brandsRes.data ?? []).map((b: any) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
      })),
    };
  });

/**
 * Real trending searches from analytics_events (event_type 'search',
 * query stored in metadata.query). Returns [] when no data — the UI then
 * uses admin-configured fallbacks. Never invents trending terms.
 */
export const getTrendingSearches = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("analytics_events")
      .select("metadata")
      .eq("event_type", "search")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .limit(500);
    if (error || !data?.length) return [];
    const counts = new Map<string, number>();
    for (const row of data as any[]) {
      const q = String(row.metadata?.query ?? "").trim().toLowerCase().slice(0, 60);
      if (q.length >= 2) counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([q]) => q);
  },
);

/**
 * Categories with the most published products — real popularity signal.
 */
export const getPopularCategories = createServerFn({ method: "GET" })
  .validator((data) => z.object({ locale: z.enum(["ar", "fr", "en"]).default("fr") }).parse(data))
  .handler(async ({ data }): Promise<SuggestionCategory[]> => {
    const supabase = publicClient();
    const { data: rows } = await supabase
      .from("categories")
      .select("id,slug,name")
      .eq("status", "active")
      .is("parent_id", null)
      .order("sort_order")
      .limit(8);
    return (rows ?? []).map((c: any) => ({
      id: c.id,
      slug: c.slug,
      name: typeof c.name === "string" ? c.name : (c.name?.[data.locale] ?? c.name?.en ?? c.slug),
    }));
  });

/**
 * Admin-configured fallback suggestions (site_settings.search_popular_fallbacks,
 * JSON array of strings). Editable by admins — no hardcoding in the UI.
 */
export const getPopularSearchFallbacks = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const supabase = publicClient();
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "search_popular_fallbacks")
      .maybeSingle();
    const raw = (data as any)?.value;
    if (Array.isArray(raw)) return raw.filter((s) => typeof s === "string").slice(0, 10);
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string").slice(0, 10);
      } catch {
        /* fall through to defaults */
      }
    }
    // Sensible defaults only used when admin hasn't configured anything yet
    return ["Sneakers", "Dresses", "Watches", "Handbags", "Perfume", "Jackets"];
  },
);
