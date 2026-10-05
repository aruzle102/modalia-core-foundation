/**
 * Dynamic sitemap.xml generator (server-side only).
 *
 * Lists every publicly visible product, category, and store straight from
 * the database — the same "published & approved & active" filters the
 * storefront uses — plus the static public routes. Imported by the custom
 * server entry (src/server.ts), which serves it at GET /sitemap.xml.
 */
import { createClient } from "@supabase/supabase-js";
import { canonicalUrl } from "./seo";

type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
};

const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: number }> = [
  { path: "/", changefreq: "daily", priority: 1 },
  { path: "/shop", changefreq: "daily", priority: 0.9 },
  { path: "/about", changefreq: "monthly", priority: 0.5 },
  { path: "/contact", changefreq: "monthly", priority: 0.5 },
  { path: "/help", changefreq: "monthly", priority: 0.6 },
  { path: "/shipping", changefreq: "monthly", priority: 0.4 },
  { path: "/returns", changefreq: "monthly", priority: 0.4 },
  { path: "/privacy", changefreq: "yearly", priority: 0.3 },
  { path: "/terms", changefreq: "yearly", priority: 0.3 },
  { path: "/become-a-seller", changefreq: "monthly", priority: 0.5 },
  { path: "/track-order", changefreq: "yearly", priority: 0.2 },
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toLastmod(value: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function createPublicClient() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Sitemap: Supabase credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAllSlugs(
  table: "products" | "categories" | "stores",
): Promise<Array<{ slug: string; updatedAt: string | null }>> {
  const supabase = createPublicClient();
  const pageSize = 1000;
  const rows: Array<{ slug: string; updated_at: string | null }> = [];
  for (let page = 0; ; page += 1) {
    let query = supabase
      .from(table)
      .select("slug,updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (table === "products") {
      query = query
        .eq("publication_status", "published")
        .eq("moderation_status", "approved")
        .eq("visibility", "public");
    }
    const { data, error } = await query;
    if (error) throw new Error(`Sitemap: could not list ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows
    .filter((row) => row.slug)
    .map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
}

function renderXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
      const changefreq = entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : "";
      const priority =
        entry.priority != null ? `<priority>${entry.priority.toFixed(1)}</priority>` : "";
      return `  <url><loc>${escapeXml(entry.loc)}</loc>${lastmod}${changefreq}${priority}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cached: { xml: string; at: number } | null = null;

export async function getSitemapXml(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.xml;

  const [products, categories, stores] = await Promise.all([
    fetchAllSlugs("products"),
    fetchAllSlugs("categories"),
    fetchAllSlugs("stores"),
  ]);

  const entries: SitemapEntry[] = [
    ...STATIC_ROUTES.map((route) => ({
      loc: canonicalUrl(route.path),
      changefreq: route.changefreq,
      priority: route.priority,
    })),
    ...categories.map((category) => ({
      loc: canonicalUrl(`/category/${encodeURIComponent(category.slug)}`),
      lastmod: toLastmod(category.updatedAt),
      changefreq: "weekly",
      priority: 0.8,
    })),
    ...stores.map((store) => ({
      loc: canonicalUrl(`/store/${encodeURIComponent(store.slug)}`),
      lastmod: toLastmod(store.updatedAt),
      changefreq: "weekly",
      priority: 0.7,
    })),
    ...products.map((product) => ({
      loc: canonicalUrl(`/product/${encodeURIComponent(product.slug)}`),
      lastmod: toLastmod(product.updatedAt),
      changefreq: "weekly",
      priority: 0.8,
    })),
  ];

  const xml = renderXml(entries);
  cached = { xml, at: now };
  return xml;
}
