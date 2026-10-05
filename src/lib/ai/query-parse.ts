/**
 * Natural-language query parsing over the real catalog.
 *
 * Client-safe: pure functions, no server access, no external calls.
 * Extracts: keywords, a price range (when mentioned), a cheap/expensive
 * hint, and a category (matched against REAL category names from the DB —
 * never guessed).
 */

export type SupportedParseLocale = "ar" | "fr" | "en";

export type ParsedIntent = {
  keywords: string[];
  categorySlug: string | null;
  categoryName: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceHint: "cheap" | "expensive" | null;
  sort: "price_asc" | "price_desc" | "newest";
};

export type CatalogCategoryLike = {
  slug: string;
  /** All localized names (ar/fr/en), used for matching. */
  names: string[];
};

const AR_STOP = new Set(
  "من في على الى إلى و أو او عن مع هذا هذه ذلك تلك الذي التي ما ماذا كيف أين أريد اريد ابحث ابغى عندي لدي هناك يوجد بدي بدي بكم شحال كاين وش هو هي انا أنا لل لـ ب".split(" "),
);
const FR_STOP = new Set(
  "le la les un une des du de d au aux en dans sur pour avec est sont et ou ou je tu il elle nous vous ils elles mon ma mes ton ta tes son sa ses notre votre leur ce cette ces quel quelle quels quelles qui que quoi comment combien cherche chercher trouve trouver veux voudrais aimerais avoir pas plus moins tres très bien bon bonne moins".split(" "),
);
const EN_STOP = new Set(
  "the a an of in on at to for with and or is are was were be been i you he she it we they my your his her our their this that these those what which who how much many do does did want wants would like look looking for find show me me under over between less more than cheap expensive cheapest".split(" "),
);

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // keep Arabic letters, latin letters and digits
      .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d\s.,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    if (raw === undefined) continue;
    const n = Number(raw.replace(/[\s.,]/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 100_000_000) out.push(n);
  }
  return out;
}

/** Parse an explicit price range from the raw query. Returns [min, max]. */
function parsePriceRange(raw: string): { min: number | null; max: number | null } {
  const numbers = extractNumbers(raw);
  const lower = raw.toLowerCase();
  if (!numbers.length) return { min: null, max: null };

  const between =
    /بين\s+(\d[\d\s.,]*)\s*(و|إلى|الى)\s*(\d[\d\s.,]*)/.test(raw) ||
    /entre\s+(\d[\d\s.,]*)\s+et\s+(\d[\d\s.,]*)/i.test(raw) ||
    /between\s+(\d[\d\s.,]*)\s+and\s+(\d[\d\s.,]*)/i.test(raw);
  const first = numbers[0];
  const second = numbers[1];
  if (between && first !== undefined && second !== undefined) {
    const a = Math.min(first, second);
    const b = Math.max(first, second);
    return { min: a, max: b };
  }

  const underish =
    /أقل من|تحت|أرخص من|اقل من/.test(raw) ||
    /moins de|au[-\s]?dessous de|<|under|less than|below|cheaper than|max/i.test(lower);
  const overish =
    /أكثر من|فوق|اكثر من/.test(raw) ||
    /plus de|au[-\s]?dessus de|>|over|more than|above|at least|min/i.test(lower);
  const single = numbers[0];
  if (single === undefined) return { min: null, max: null };
  if (underish && !overish) return { min: null, max: single };
  if (overish && !underish) return { min: single, max: null };
  // A bare number with a currency word: treat as an upper bound ("~5000 دج" → up to 5000).
  if (/دج|دينار|dzd|da\b|dinars?/i.test(raw)) return { min: null, max: single };
  return { min: null, max: null };
}

function detectPriceHint(lower: string): "cheap" | "expensive" | null {
  if (/رخيص|رخيصة|رخاص|سعر مليح|سومة مليحة|pas cher|bon marché|petit prix|cheap|affordable|budget|low price/.test(lower))
    return "cheap";
  if (/غالي|غالية|غاليين|cher|chère|premium|expensive|luxury|haut de gamme/.test(lower)) return "expensive";
  return null;
}

/**
 * Match query tokens against real category names (all locales).
 * Returns the best category or null — never invents one.
 */
export function matchCategory(tokens: string[], categories: CatalogCategoryLike[]): CatalogCategoryLike | null {
  let best: CatalogCategoryLike | null = null;
  let bestScore = 0;
  for (const category of categories) {
    const nameTokens = new Set<string>();
    for (const name of category.names) for (const t of tokenize(name)) nameTokens.add(t);
    // also try the slug itself (e.g. "smartphones")
    for (const t of tokenize(category.slug.replace(/[-_]/g, " "))) nameTokens.add(t);
    let score = 0;
    for (const token of tokens) {
      if (token.length < 3) continue;
      for (const nt of nameTokens) {
        if (nt === token) score += 3;
        else if (nt.startsWith(token) || token.startsWith(nt)) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function parseQuery(raw: string, categories: CatalogCategoryLike[]): ParsedIntent {
  const query = raw.trim().slice(0, 200);
  const lower = query.toLowerCase();
  const tokens = tokenize(query);

  const stop = new Set<string>();
  for (const w of AR_STOP) stop.add(w);
  for (const w of FR_STOP) stop.add(w);
  for (const w of EN_STOP) stop.add(w);

  const keywords = tokens.filter((t) => !stop.has(t) && (t.length >= 3 || /[\u0600-\u06ff]/.test(t))).slice(0, 8);

  const category = matchCategory(keywords.length ? keywords : tokens, categories);
  const { min, max } = parsePriceRange(query);
  const priceHint = detectPriceHint(lower);

  let sort: ParsedIntent["sort"] = "newest";
  if (priceHint === "cheap" || max !== null) sort = "price_asc";
  if (priceHint === "expensive") sort = "price_desc";

  return {
    keywords,
    categorySlug: category?.slug ?? null,
    categoryName: category?.names[0] ?? null,
    minPrice: min,
    maxPrice: max,
    priceHint,
    sort,
  };
}

/** Short, locale-aware summary of what the assistant understood (for UI chips). */
export function intentSummary(intent: ParsedIntent, locale: SupportedParseLocale): string | null {
  const parts: string[] = [];
  const fmt = (n: number) => new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-US").format(n);
  if (intent.categoryName) parts.push(intent.categoryName);
  if (intent.minPrice !== null && intent.maxPrice !== null)
    parts.push(locale === "ar" ? `بين ${fmt(intent.minPrice)} و ${fmt(intent.maxPrice)} دج` : locale === "fr" ? `entre ${fmt(intent.minPrice)} et ${fmt(intent.maxPrice)} DA` : `between ${fmt(intent.minPrice)} and ${fmt(intent.maxPrice)} DZD`);
  else if (intent.maxPrice !== null)
    parts.push(locale === "ar" ? `حتى ${fmt(intent.maxPrice)} دج` : locale === "fr" ? `jusqu'à ${fmt(intent.maxPrice)} DA` : `up to ${fmt(intent.maxPrice)} DZD`);
  else if (intent.minPrice !== null)
    parts.push(locale === "ar" ? `من ${fmt(intent.minPrice)} دج` : locale === "fr" ? `dès ${fmt(intent.minPrice)} DA` : `from ${fmt(intent.minPrice)} DZD`);
  else if (intent.priceHint === "cheap")
    parts.push(locale === "ar" ? "الأرخص أولاً" : locale === "fr" ? "les moins chers d'abord" : "cheapest first");
  else if (intent.priceHint === "expensive")
    parts.push(locale === "ar" ? "الفاخر أولاً" : locale === "fr" ? "haut de gamme d'abord" : "premium first");
  if (intent.keywords.length && !intent.categoryName) parts.push(intent.keywords.slice(0, 3).join(" "));
  return parts.length ? parts.join(" · ") : null;
}
