/**
 * AI server functions for Modalia — honest, catalog-grounded assistance.
 *
 * Every response is built ONLY from real database rows (products, categories,
 * stores, applications). Nothing is ever invented: missing data is reported
 * as missing. Each answer carries a `source` field ("provider" | "rules") so
 * the UI can label who actually answered.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSeller, type SellerContext, type SellerPermission } from "@/lib/seller-auth";
import { rateLimitEndpoint } from "@/lib/rate-limit";
import { getAiMode, resolveProvider, buildCatalogSystemPrompt, type AiProvider } from "./ai/provider";
import {
  parseQuery,
  intentSummary,
  matchCategory,
  type ParsedIntent,
  type SupportedParseLocale,
  type CatalogCategoryLike,
} from "./ai/query-parse";
import {
  answerWithRules,
  similarProducts,
  RULE_ASSISTANT_NAME,
  type AiCatalogItem,
  type RuleCategory,
} from "./ai/fallback";

const sellerOnly = [requireSupabaseAuth] as const;
const adminOnly = [requireSupabaseAuth] as const;

async function sellerCtx(context: any, ...permissions: SellerPermission[]): Promise<SellerContext> {
  return requireSeller(context, ...permissions);
}

async function assertAdmin(context: any) {
  if (!context) throw new Error("Unauthorized");
  const { data, error } = await context.supabase.rpc("is_super_admin");
  if (error || data !== true) throw new Error("Forbidden");
}

const localeSchema = z.enum(["ar", "fr", "en"]);

// ---------------------------------------------------------------------------
// Shared catalog access (public, published products only)
// ---------------------------------------------------------------------------

function createPublicClient() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The marketplace catalogue is unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

type LocalizedText = Json | null;

function localized(value: LocalizedText, locale: string, fallback = ""): string {
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

type RawCategory = { id: string; slug: string; name: LocalizedText };

async function fetchCategories(supabase: ReturnType<typeof createPublicClient>): Promise<RawCategory[]> {
  const result = await supabase
    .from("categories")
    .select("id,slug,name")
    .eq("status", "active")
    .order("sort_order")
    .limit(100);
  if (result.error) return [];
  return result.data ?? [];
}

function toCategoryLikes(categories: RawCategory[], locale: string): CatalogCategoryLike[] {
  return categories.map((c) => ({
    slug: c.slug,
    names: [localized(c.name, "ar", ""), localized(c.name, "fr", ""), localized(c.name, "en", ""), c.slug].filter(
      Boolean,
    ),
  }));
}

function toRuleCategories(categories: RawCategory[], locale: string): RuleCategory[] {
  return categories.map((c) => ({ slug: c.slug, name: localized(c.name, locale, c.slug) }));
}

/** Real, published catalog items for search — capped for performance. */
async function fetchAiCatalog(
  supabase: ReturnType<typeof createPublicClient>,
  locale: string,
): Promise<AiCatalogItem[]> {
  const result = await supabase
    .from("products")
    .select(
      "id,slug,name,description,base_price,compare_at_price,created_at,category:categories(slug,name),seller:sellers(stores(slug,name)),images:product_images(storage_path,sort_order)",
    )
    .eq("status", "active")
    .eq("publication_status", "published")
    .eq("moderation_status", "approved")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(300);
  if (result.error) return [];
  return (result.data ?? []).map((product) => {
    const images = Array.isArray(product.images) ? [...product.images].sort((a, b) => a.sort_order - b.sort_order) : [];
    const seller = Array.isArray(product.seller) ? product.seller[0] : product.seller;
    const stores = seller && Array.isArray(seller.stores) ? seller.stores : [];
    const category = Array.isArray(product.category) ? product.category[0] : product.category;
    return {
      id: product.id,
      slug: product.slug,
      name: localized(product.name, locale, product.slug),
      description: localized(product.description, locale, "") || null,
      price: Number(product.base_price),
      compareAtPrice: product.compare_at_price ?? null,
      storeName: stores[0]?.name ?? "",
      storeSlug: stores[0]?.slug ?? null,
      categorySlug: category?.slug ?? null,
      categoryName: category ? localized(category.name, locale, category.slug) : null,
      imagePath: publicUrl(images[0]?.storage_path ?? null),
    };
  });
}

// ---------------------------------------------------------------------------
// Scoring: rank catalog items against a parsed intent
// ---------------------------------------------------------------------------

function tokenizeLocal(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreItem(item: AiCatalogItem, intent: ParsedIntent): number {
  let score = 0;
  const nameTokens = new Set(tokenizeLocal(item.name));
  const descTokens = new Set(tokenizeLocal(item.description ?? ""));
  const catTokens = new Set(tokenizeLocal(`${item.categoryName ?? ""} ${item.categorySlug ?? ""}`));
  const storeTokens = new Set(tokenizeLocal(item.storeName));

  for (const kw of intent.keywords) {
    const k = kw.toLowerCase();
    if ([...nameTokens].some((t) => t === k || t.startsWith(k) || k.startsWith(t))) score += 4;
    else if ([...catTokens].some((t) => t === k || t.startsWith(k))) score += 3;
    else if ([...descTokens].some((t) => t === k || t.startsWith(k))) score += 1;
    else if ([...storeTokens].some((t) => t === k || t.startsWith(k))) score += 1;
  }
  return score;
}

function filterAndRank(items: AiCatalogItem[], intent: ParsedIntent): AiCatalogItem[] {
  const filtered = items.filter((item) => {
    if (intent.categorySlug && item.categorySlug !== intent.categorySlug) return false;
    if (intent.minPrice !== null && item.price < intent.minPrice) return false;
    if (intent.maxPrice !== null && item.price > intent.maxPrice) return false;
    return true;
  });
  const scored = filtered.map((item) => ({ item, score: scoreItem(item, intent) }));
  const hasKeywords = intent.keywords.length > 0;
  // With keywords, require at least one token hit; pure price/category
  // browsing keeps everything (still ranked by relevance).
  const pool = scored.filter((s) => !hasKeywords || s.score > 0);
  const priceOrder =
    intent.sort === "price_desc"
      ? (a: number, b: number) => b - a
      : intent.sort === "price_asc"
        ? (a: number, b: number) => a - b
        : () => 0;
  pool.sort((a, b) => b.score - a.score || priceOrder(a.item.price, b.item.price));
  return pool.slice(0, 24).map((s) => s.item);
}

export type AiChatProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  storeName: string;
  imagePath: string | null;
};

function toChatProduct(item: AiCatalogItem): AiChatProduct {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    price: item.price,
    compareAtPrice: item.compareAtPrice,
    storeName: item.storeName,
    imagePath: item.imagePath,
  };
}

function formatChatPrice(price: number, locale: SupportedParseLocale): string {
  const formatted = new Intl.NumberFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-US",
  ).format(price);
  return locale === "ar" ? `${formatted} دج` : locale === "fr" ? `${formatted} DA` : `${formatted} DZD`;
}

/**
 * Detect "similar to X" phrasing and resolve X to a real catalog product.
 * Returns null when the phrasing is absent or X matches nothing.
 */
function findSimilarTarget(message: string, catalog: AiCatalogItem[]): AiCatalogItem | null {
  const patterns = [
    /(?:مشابه|شبيه|مثل|زي|كيما)\s+(?:ل|لـ|لهذا|لهاذا)?\s*(.+)/,
    /(?:similar to|like|such as)\s+(?:the\s+)?(.+)/i,
    /(?:similaire à|comme)\s+(?:le|la|les|l')?\s*(.+)/i,
  ];
  let subject: string | null = null;
  for (const pattern of patterns) {
    const m = pattern.exec(message.trim());
    if (m?.[1]?.trim()) {
      subject = m[1].trim().slice(0, 120);
      break;
    }
  }
  if (!subject) return null;
  const keywords = tokenizeLocal(subject).filter((t) => t.length >= 3).slice(0, 6);
  if (!keywords.length) return null;
  let best: AiCatalogItem | null = null;
  let bestScore = 0;
  for (const item of catalog) {
    const nameTokens = new Set(tokenizeLocal(item.name));
    let score = 0;
    for (const kw of keywords) {
      if ([...nameTokens].some((t) => t === kw || t.startsWith(kw) || kw.startsWith(t))) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 2 ? best : null;
}

// ---------------------------------------------------------------------------
// 1. getAiStatus — safe mode banner for the UI (no secrets)
// ---------------------------------------------------------------------------

export const getAiStatus = createServerFn({ method: "GET" })
  .validator((data) => z.object({}).parse(data))
  .handler(async () => {
    const mode = getAiMode();
    return {
      source: mode.mode as "provider" | "rules",
      providerLabel: mode.providerLabel,
      ruleAssistantName: RULE_ASSISTANT_NAME,
    };
  });

// ---------------------------------------------------------------------------
// 2. aiSearchCatalog — natural-language search over the REAL catalog
// ---------------------------------------------------------------------------

const searchInput = z.object({ q: z.string().trim().min(1).max(200), locale: localeSchema });

export const aiSearchCatalog = createServerFn({ method: "GET" })
  .validator((data) => searchInput.parse(data))
  .handler(async ({ data }) => {
    // Public and expensive (full catalog fetch per query) — throttle per IP.
    rateLimitEndpoint("aiSearchCatalog", 60);
    const supabase = createPublicClient();
    const [categories, catalog] = await Promise.all([
      fetchCategories(supabase),
      fetchAiCatalog(supabase, data.locale),
    ]);
    const intent = parseQuery(data.q, toCategoryLikes(categories, data.locale));
    const products = filterAndRank(catalog, intent);
    return {
      intent: {
        keywords: intent.keywords,
        categorySlug: intent.categorySlug,
        categoryName: intent.categoryName,
        minPrice: intent.minPrice,
        maxPrice: intent.maxPrice,
        priceHint: intent.priceHint,
        summary: intentSummary(intent, data.locale),
      },
      total: products.length,
      products: products.map(toChatProduct),
    };
  });

// ---------------------------------------------------------------------------
// 3. aiChat — conversational shopping assistant
// ---------------------------------------------------------------------------

const chatInput = z.object({
  message: z.string().trim().min(1).max(500),
  locale: localeSchema,
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(8)
    .optional(),
});

export const aiChat = createServerFn({ method: "POST" })
  .validator((data) => chatInput.parse(data))
  .handler(async ({ data }) => {
    // Public chat can invoke a paid external LLM provider — throttle per IP.
    rateLimitEndpoint("aiChat", 60);
    const supabase = createPublicClient();
    const [categories, catalog] = await Promise.all([
      fetchCategories(supabase),
      fetchAiCatalog(supabase, data.locale),
    ]);
    const intent = parseQuery(data.message, toCategoryLikes(categories, data.locale));
    const matches = filterAndRank(catalog, intent);
    const provider: AiProvider | null = resolveProvider();

    // "Similar to X" requests: resolve X to a real product, then recommend
    // from the same category / seller / price band (real data only).
    const similarTarget = findSimilarTarget(data.message, catalog);
    if (similarTarget) {
      const similar = similarProducts(similarTarget, catalog, 8);
      const targetLink = `[${similarTarget.name}](/product/${similarTarget.slug}?locale=${data.locale})`;
      const intro =
        data.locale === "ar"
          ? `منتجات مشابهة لـ ${targetLink} (نفس الفئة/المتجر/نطاق السعر):\n`
          : data.locale === "fr"
            ? `Produits similaires à ${targetLink} (même catégorie / boutique / gamme de prix) :\n`
            : `Products similar to ${targetLink} (same category / store / price band):\n`;
      const lines = similar
        .slice(0, 6)
        .map(
          (p) =>
            `- [${p.name}](/product/${p.slug}?locale=${data.locale}) — **${formatChatPrice(p.price, data.locale)}** · ${p.storeName}`,
        )
        .join("\n");
      const empty =
        data.locale === "ar"
          ? "لم أجد منتجات مشابهة في الكتالوج الحالي."
          : data.locale === "fr"
            ? "Aucun produit similaire dans le catalogue actuel."
            : "No similar products in the current catalog.";
      return {
        source: "rules" as const,
        text: similar.length ? intro + lines : intro + empty,
        products: similar.slice(0, 6).map(toChatProduct),
        intentSummary:
          data.locale === "ar" ? `مشابه لـ: ${similarTarget.name}` : data.locale === "fr" ? `Similaire à : ${similarTarget.name}` : `Similar to: ${similarTarget.name}`,
      };
    }

    if (provider) {
      const catalogContext = matches
        .slice(0, 12)
        .map(
          (p) =>
            `- ${p.name} | price: ${p.price} DZD${p.compareAtPrice && p.compareAtPrice > p.price ? ` (was ${p.compareAtPrice})` : ""} | store: ${p.storeName} | category: ${p.categoryName ?? "?"} | slug: ${p.slug}`,
        )
        .join("\n");
      const history = (data.history ?? []).slice(-6).map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));
      const text = await provider.generateText(
        [
          { role: "system", content: buildCatalogSystemPrompt(data.locale, catalogContext) },
          ...history,
          { role: "user", content: data.message },
        ],
        { maxTokens: 500, temperature: 0.3 },
      );
      return {
        source: "provider" as const,
        text,
        products: matches.slice(0, 6).map(toChatProduct),
        intentSummary: intentSummary(intent, data.locale),
      };
    }

    // Rule-based mode: fully local, catalog-grounded, honestly labeled.
    const answer = answerWithRules({
      raw: data.message,
      intent,
      matches,
      categories: toRuleCategories(categories, data.locale),
      locale: data.locale,
    });
    return {
      source: "rules" as const,
      text: answer.text,
      products: answer.products.map(toChatProduct),
      intentSummary: intentSummary(intent, data.locale),
    };
  });

// ---------------------------------------------------------------------------
// 4. aiSimilarProducts — recommendations from real data
// ---------------------------------------------------------------------------

const similarInput = z.object({
  slug: z.string().min(1).max(160),
  locale: localeSchema,
  limit: z.number().int().min(1).max(12).default(8),
});

export const aiSimilarProducts = createServerFn({ method: "GET" })
  .validator((data) => similarInput.parse(data))
  .handler(async ({ data }) => {
    rateLimitEndpoint("aiSimilarProducts", 60);
    const supabase = createPublicClient();
    const catalog = await fetchAiCatalog(supabase, data.locale);
    const target = catalog.find((p) => p.slug === data.slug);
    if (!target) return { products: [], reason: "not_found" as const };
    const items = similarProducts(target, catalog, data.limit);
    return {
      products: items.map(toChatProduct),
      reason: "same_category_seller_price" as const,
      basis: {
        category: target.categoryName,
        store: target.storeName,
        price: target.price,
      },
    };
  });

// ---------------------------------------------------------------------------
// 5. Seller: draft generation (human approval required — never auto-publishes)
// ---------------------------------------------------------------------------

type SellerProductFacts = {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  basePrice: number;
  sku: string;
  category: string;
  attributes: Record<string, string>;
};

async function getSellerProductFacts(context: any, sellerId: string, productId: string): Promise<SellerProductFacts | null> {
  const result = await context.supabase
    .from("products")
    .select("id,name,description,short_description,base_price,sku,metadata,categories(name)")
    .eq("id", productId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data;
  const attributes: Record<string, string> = {};
  const metadata = row.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const record = metadata as Record<string, unknown>;
    for (const key of ["color", "size", "material", "brand", "weight", "dimensions", "warranty"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) attributes[key] = value.trim();
    }
    const attrs = record["attributes"];
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim() && Object.keys(attributes).length < 10) attributes[k] = v.trim();
      }
    }
  }
  const categoryRow = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const label = (v: LocalizedText) => localized(v, "en", "");
  return {
    id: row.id,
    name: label(row.name) || "Product",
    description: label(row.description),
    shortDescription: label(row.short_description),
    basePrice: Number(row.base_price),
    sku: row.sku ?? "",
    category: label(categoryRow?.name ?? null),
    attributes,
  };
}

function ruleDescription(facts: SellerProductFacts, locale: SupportedParseLocale): string {
  const price =
    facts.basePrice > 0
      ? new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-US").format(facts.basePrice)
      : null;
  const currency = locale === "ar" ? "دج" : locale === "fr" ? "DA" : "DZD";
  const lines: string[] = [];
  if (locale === "ar") {
    lines.push(facts.name);
    lines.push("");
    lines.push(facts.description || facts.shortDescription || `اكتشف ${facts.name} — متوفر الآن على موداليا.`);
    lines.push("");
    const entries = Object.entries(facts.attributes);
    if (entries.length) {
      lines.push("أبرز المواصفات:");
      for (const [k, v] of entries) lines.push(`• ${k}: ${v}`);
      lines.push("");
    }
    const details: string[] = [];
    if (facts.category) details.push(`التصنيف: ${facts.category}`);
    if (facts.sku) details.push(`المرجع: ${facts.sku}`);
    if (price) details.push(`السعر: ${price} ${currency}`);
    if (details.length) lines.push(details.join(" · "));
    lines.push("");
    lines.push("اطلب الآن — الدفع عند الاستلام متوفر عبر الجزائر.");
    lines.push("");
    lines.push("_مسودة من مساعد القواعد — راجعها وعدّلها قبل النشر._");
  } else if (locale === "fr") {
    lines.push(facts.name);
    lines.push("");
    lines.push(facts.description || facts.shortDescription || `Découvrez ${facts.name} — disponible maintenant sur Modalia.`);
    lines.push("");
    const entries = Object.entries(facts.attributes);
    if (entries.length) {
      lines.push("Points forts :");
      for (const [k, v] of entries) lines.push(`• ${k} : ${v}`);
      lines.push("");
    }
    const details: string[] = [];
    if (facts.category) details.push(`Catégorie : ${facts.category}`);
    if (facts.sku) details.push(`Réf : ${facts.sku}`);
    if (price) details.push(`Prix : ${price} ${currency}`);
    if (details.length) lines.push(details.join(" · "));
    lines.push("");
    lines.push("Commandez maintenant — paiement à la livraison disponible partout en Algérie.");
    lines.push("");
    lines.push("_Brouillon de l'assistant de règles — relisez-le avant publication._");
  } else {
    lines.push(facts.name);
    lines.push("");
    lines.push(facts.description || facts.shortDescription || `Discover ${facts.name} — available now on Modalia.`);
    lines.push("");
    const entries = Object.entries(facts.attributes);
    if (entries.length) {
      lines.push("Highlights:");
      for (const [k, v] of entries) lines.push(`• ${k}: ${v}`);
      lines.push("");
    }
    const details: string[] = [];
    if (facts.category) details.push(`Category: ${facts.category}`);
    if (facts.sku) details.push(`SKU: ${facts.sku}`);
    if (price) details.push(`Price: ${price} ${currency}`);
    if (details.length) lines.push(details.join(" · "));
    lines.push("");
    lines.push("Order today — cash on delivery available across Algeria.");
    lines.push("");
    lines.push("_Draft by the Rule Assistant — review it before publishing._");
  }
  return lines.join("\n");
}

function ruleTags(facts: SellerProductFacts): string[] {
  const words = new Set<string>();
  const add = (text: string) => {
    for (const token of text.toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/i)) {
      if (token.length >= 3 && words.size < 10) words.add(token);
    }
  };
  add(facts.name);
  if (facts.category) add(facts.category);
  for (const value of Object.values(facts.attributes)) add(value);
  return [...words];
}

const draftInput = z.object({
  productId: z.string().uuid(),
  kind: z.enum(["description", "tags", "category"]),
  locale: localeSchema,
});

export const aiSellerDraft = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .validator((data) => draftInput.parse(data))
  .handler(async ({ data, context }) => {
    rateLimitEndpoint("aiSellerDraft", 120);
    const seller = await sellerCtx(context, "products.view");
    const facts = await getSellerProductFacts(context, seller.sellerId, data.productId);
    if (!facts) throw new Error("Product not found.");

    const provider: AiProvider | null = resolveProvider();

    if (data.kind === "tags") {
      if (provider) {
        const tags = await provider.suggestTags({
          name: facts.name,
          category: facts.category || null,
          description: facts.description || null,
          locale: data.locale,
        });
        return { kind: "tags" as const, source: "provider" as const, tags, categories: [] as string[] };
      }
      return { kind: "tags" as const, source: "rules" as const, tags: ruleTags(facts), categories: [] as string[] };
    }

    if (data.kind === "category") {
      // Match the product name against REAL active categories — never invent one.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const catResult = await supabaseAdmin.from("categories").select("id,slug,name").eq("status", "active").limit(100);
      const categories: RawCategory[] = (catResult.data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name as LocalizedText }));
      const likes = toCategoryLikes(categories, data.locale);
      const nameTokens = facts.name.toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/i).filter((t) => t.length >= 3);
      const ranked = likes
        .map((like) => ({ like, match: matchCategory(nameTokens, [like]) }))
        .filter((r) => r.match)
        .slice(0, 3);
      const suggestions = ranked.map((r) => {
        const raw = categories.find((c) => c.slug === r.like.slug);
        return { slug: r.like.slug, name: localized(raw?.name ?? null, data.locale, r.like.slug) };
      });
      return {
        kind: "category" as const,
        source: "rules" as const,
        tags: [] as string[],
        categories: suggestions,
        note:
          data.locale === "ar"
            ? "اقتراحات من أسماء التصنيفات الحقيقية فقط — الاختيار النهائي لك."
            : data.locale === "fr"
              ? "Suggestions issues des vraies catégories uniquement — le choix final vous appartient."
              : "Suggestions from real category names only — the final choice is yours.",
      };
    }

    // description
    if (provider) {
      const draft = await provider.generateDescription({
        name: facts.name,
        category: facts.category || null,
        attributes: facts.attributes,
        price: facts.basePrice,
        currency: "DZD",
        locale: data.locale,
      });
      return {
        kind: "description" as const,
        source: "provider" as const,
        draft,
        tags: [] as string[],
        categories: [] as string[],
        needsHumanApproval: true,
      };
    }
    return {
      kind: "description" as const,
      source: "rules" as const,
      draft: ruleDescription(facts, data.locale),
      tags: [] as string[],
      categories: [] as string[],
      needsHumanApproval: true,
    };
  });

const applyDraftInput = z.object({
  productId: z.string().uuid(),
  locale: localeSchema,
  description: z.string().trim().min(1).max(8000),
});

/**
 * Apply a reviewed draft to the seller's own product description.
 * This only edits text — it NEVER changes publication/workflow status,
 * so nothing goes live without the seller's normal publish step.
 */
export const aiApplySellerDraft = createServerFn({ method: "POST" })
  .middleware(sellerOnly)
  .validator((data) => applyDraftInput.parse(data))
  .handler(async ({ data, context }) => {
    rateLimitEndpoint("aiApplySellerDraft", 120);
    const seller = await sellerCtx(context, "products.edit");
    const existing = await context.supabase
      .from("products")
      .select("id,description,publication_status")
      .eq("id", data.productId)
      .eq("seller_id", seller.sellerId)
      .maybeSingle();
    if (existing.error || !existing.data) throw new Error("Product not found.");

    const current = (existing.data.description ?? {}) as Record<string, unknown>;
    const merged = { ...current, [data.locale]: data.description };
    const update = await context.supabase
      .from("products")
      .update({ description: merged as unknown as Json, updated_at: new Date().toISOString() })
      .eq("id", data.productId)
      .eq("seller_id", seller.sellerId);
    if (update.error) throw new Error("The draft could not be saved.");

    return {
      ok: true as const,
      publicationStatus: existing.data.publication_status as string,
      note: "Description updated. The product's publication status is unchanged — publish it yourself when ready.",
    };
  });

// ---------------------------------------------------------------------------
// 6. Admin: rule-based moderation brief (facts only, no invented judgments)
// ---------------------------------------------------------------------------

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export const aiAdminModerationBrief = createServerFn({ method: "GET" })
  .middleware(adminOnly)
  .validator((data) => z.object({ locale: localeSchema }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [appsResult, productsResult, ticketsResult] = await Promise.all([
      supabaseAdmin
        .from("seller_applications")
        .select("id,first_name,last_name,proposed_store_name,business_description,product_categories,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(20),
      supabaseAdmin
        .from("products")
        .select("id,slug,name,created_at,seller:sellers(stores(name))", { count: "exact" })
        .eq("moderation_status", "pending")
        .order("created_at", { ascending: true })
        .limit(10),
      supabaseAdmin
        .from("seller_support_requests")
        .select("id,subject,created_at", { count: "exact" })
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(10),
    ]);

    const applications = (appsResult.data ?? []).map((a) => {
      const cats = Array.isArray(a.product_categories)
        ? (a.product_categories as unknown[]).filter((c): c is string => typeof c === "string")
        : [];
      return {
        id: a.id,
        applicant: `${a.first_name} ${a.last_name}`.trim(),
        proposedStore: a.proposed_store_name,
        business: truncate(a.business_description, 160),
        categories: cats,
        waitingDays: daysSince(a.created_at),
        createdAt: a.created_at,
      };
    });

    const pendingProducts = (productsResult.data ?? []).map((p) => {
      const seller = Array.isArray(p.seller) ? p.seller[0] : p.seller;
      const stores = seller && Array.isArray(seller.stores) ? seller.stores : [];
      return {
        id: p.id,
        slug: p.slug,
        name: localized(p.name, data.locale, p.slug),
        store: stores[0]?.name ?? "",
        waitingDays: daysSince(p.created_at),
      };
    });

    const openTickets = (ticketsResult.data ?? []).map((t) => ({
      id: t.id,
      subject: t.subject ?? "",
      waitingDays: daysSince(t.created_at),
    }));

    const oldestWaiting = applications.length ? Math.max(...applications.map((a) => a.waitingDays)) : 0;

    return {
      source: "rules" as const,
      generatedAt: new Date().toISOString(),
      counts: {
        pendingApplications: appsResult.count ?? applications.length,
        pendingProducts: productsResult.count ?? pendingProducts.length,
        openTickets: ticketsResult.count ?? openTickets.length,
        oldestApplicationWaitingDays: oldestWaiting,
      },
      applications,
      pendingProducts,
      openTickets,
      disclaimer:
        data.locale === "ar"
          ? "ملخص آلي من البيانات فقط — كل قرار قبول/رفض يحتاج مراجعة بشرية."
          : data.locale === "fr"
            ? "Résumé automatique basé uniquement sur les données — toute décision nécessite un examen humain."
            : "Automated summary from data only — every approve/reject decision needs human review.",
    };
  });
