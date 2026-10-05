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
  /** Canonical color keys (e.g. "black") found in the query — ar/fr/en. */
  colors: string[];
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
  "من في على الى إلى و أو او عن مع هذا هذه ذلك تلك الذي التي ما ماذا كيف أين أريد اريد ابحث ابغى عندي لدي هناك يوجد بدي بدي بكم شحال كاين وش هو هي انا أنا لل لـ ب تحت فوق دج دينار أقل اكثر أكثر حتى حوالي نحو تقريبا".split(" "),
);
const FR_STOP = new Set(
  "le la les un une des du de d au aux en dans sur pour avec est sont et ou ou je tu il elle nous vous ils elles mon ma mes ton ta tes son sa ses notre votre leur ce cette ces quel quelle quels quelles qui que quoi comment combien cherche chercher trouve trouver veux voudrais aimerais avoir pas plus moins tres très bien bon bonne moins da".split(" "),
);
const EN_STOP = new Set(
  "the a an of in on at to for with and or is are was were be been i you he she it we they my your his her our their this that these those what which who how much many do does did want wants would like look looking for find show me me under over between less more than cheap expensive cheapest da".split(" "),
);

/** Canonical color key → words in ar/fr/en (written naturally; normalized before matching). */
export const COLOR_WORDS: Record<string, string[]> = {
  black: ["أسود", "سوداء", "سود", "كحل", "noir", "noire", "noirs", "noires", "black"],
  white: ["أبيض", "بيضاء", "بيض", "blanc", "blanche", "blancs", "blanches", "white"],
  red: ["أحمر", "حمراء", "حمر", "rouge", "rouges", "red"],
  blue: ["أزرق", "زرقاء", "زرق", "bleu", "bleue", "bleus", "bleues", "blue"],
  green: ["أخضر", "خضراء", "خضر", "vert", "verte", "verts", "vertes", "green"],
  yellow: ["أصفر", "صفراء", "صفر", "jaune", "jaunes", "yellow"],
  orange: ["برتقالي", "برتقالية", "orange", "oranges"],
  pink: ["وردي", "وردية", "rose", "roses", "pink"],
  purple: ["بنفسجي", "بنفسجية", "violet", "violette", "violets", "purple"],
  brown: ["بني", "بنية", "brun", "brune", "bruns", "brunes", "marron", "brown"],
  gray: ["رمادي", "رمادية", "gris", "grise", "gray", "grey"],
  beige: ["بيج", "beige"],
  gold: ["ذهبي", "ذهبية", "doré", "dore", "dorée", "gold", "golden"],
  silver: ["فضي", "فضية", "argenté", "argente", "silver"],
};

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]/g, "");
}

const COLOR_LOOKUP = new Map<string, string>();
for (const [key, words] of Object.entries(COLOR_WORDS)) {
  for (const word of words) {
    const normalized = normalizeWord(word);
    if (normalized && !COLOR_LOOKUP.has(normalized)) COLOR_LOOKUP.set(normalized, key);
  }
}

/** Localized display labels for canonical color keys (for "understood" summaries). */
export const COLOR_LABELS: Record<SupportedParseLocale, Record<string, string>> = {
  ar: { black: "أسود", white: "أبيض", red: "أحمر", blue: "أزرق", green: "أخضر", yellow: "أصفر", orange: "برتقالي", pink: "وردي", purple: "بنفسجي", brown: "بني", gray: "رمادي", beige: "بيج", gold: "ذهبي", silver: "فضي" },
  fr: { black: "noir", white: "blanc", red: "rouge", blue: "bleu", green: "vert", yellow: "jaune", orange: "orange", pink: "rose", purple: "violet", brown: "marron", gray: "gris", beige: "beige", gold: "doré", silver: "argenté" },
  en: { black: "black", white: "white", red: "red", blue: "blue", green: "green", yellow: "yellow", orange: "orange", pink: "pink", purple: "purple", brown: "brown", gray: "gray", beige: "beige", gold: "gold", silver: "silver" },
};

/** Extract canonical color keys from query tokens (ar/fr/en). Never invents — dictionary only. */
export function extractColors(tokens: string[]): string[] {
  const found: string[] = [];
  for (const token of tokens) {
    const key = COLOR_LOOKUP.get(normalizeWord(token));
    if (key && !found.includes(key)) found.push(key);
  }
  return found;
}

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

/** Light Arabic normalization so «الحذاء»/«حذاء» match category names. Not a stemmer — both sides normalized identically. */
function normalizeAr(token: string): string {
  let t = token;
  if (t.startsWith("ال") && t.length > 4) t = t.slice(2);
  return t
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/**
 * Match query tokens against real category names (all locales).
 * Returns the best category plus the actual name that matched (for
 * locale-correct summaries) — or null. Never invents one.
 */
export function matchCategory(
  tokens: string[],
  categories: CatalogCategoryLike[],
): { category: CatalogCategoryLike; name: string } | null {
  let best: CatalogCategoryLike | null = null;
  let bestName = "";
  let bestScore = 0;
  for (const category of categories) {
    const nameVariants = [...category.names, category.slug.replace(/[-_]/g, " ")];
    for (const name of nameVariants) {
      if (!name) continue;
      const nameTokens = new Set(tokenize(name).map(normalizeAr));
      let score = 0;
      for (const token of tokens) {
        const nt = normalizeAr(token);
        if (nt.length < 3) continue;
        for (const cand of nameTokens) {
          if (cand === nt) score += 3;
          else if (cand.startsWith(nt) || nt.startsWith(cand)) score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = category;
        bestName = name;
      }
    }
  }
  return bestScore >= 2 && best ? { category: best, name: bestName } : null;
}

export function parseQuery(raw: string, categories: CatalogCategoryLike[]): ParsedIntent {
  const query = raw.trim().slice(0, 200);
  const lower = query.toLowerCase();
  const tokens = tokenize(query);

  const stop = new Set<string>();
  for (const w of AR_STOP) stop.add(w);
  for (const w of FR_STOP) stop.add(w);
  for (const w of EN_STOP) stop.add(w);

  const keywords = tokens
    .filter((t) => !stop.has(t) && (t.length >= 3 || /[\u0600-\u06ff]/.test(t)) && !/^\d+$/.test(t))
    .slice(0, 8);

  const colors = extractColors(tokens);
  const match = matchCategory(keywords.length ? keywords : tokens, categories);
  const { min, max } = parsePriceRange(query);
  const priceHint = detectPriceHint(lower);

  let sort: ParsedIntent["sort"] = "newest";
  if (priceHint === "cheap" || max !== null) sort = "price_asc";
  if (priceHint === "expensive") sort = "price_desc";

  return {
    keywords,
    colors,
    categorySlug: match?.category.slug ?? null,
    categoryName: match?.name ?? null,
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
  if (intent.colors.length) {
    const labels = COLOR_LABELS[locale];
    const joiner = locale === "ar" ? "، " : ", ";
    parts.push(intent.colors.map((c) => labels[c] ?? c).join(joiner));
  }
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
