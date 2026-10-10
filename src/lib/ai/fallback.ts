/**
 * Rule-based assistant ("مساعد القواعد") — the honest fallback.
 *
 * Runs entirely on Modalia's own catalog data: real products, real prices,
 * real categories. It NEVER invents prices, stock, specs, warranties,
 * ingredients or medical claims. Anything not in the data is answered with
 * an explicit "not found".
 *
 * SERVER-SIDE (used by ai.functions.ts). Pure functions otherwise.
 */

import { intentSummary, type ParsedIntent, type SupportedParseLocale } from "./query-parse";

/** Minimal real catalog facts the rule engine is allowed to use. */
export type AiCatalogItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  storeName: string;
  storeSlug: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  imagePath: string | null;
};

export type RuleAnswer = {
  text: string;
  /** Real matched products to render as cards (top few). */
  products: AiCatalogItem[];
};

export const RULE_ASSISTANT_NAME: Record<SupportedParseLocale, string> = {
  ar: "مساعد القواعد",
  fr: "Assistant de règles",
  en: "Rule Assistant",
};

function formatPrice(price: number, locale: SupportedParseLocale): string {
  const formatted = new Intl.NumberFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-US",
  ).format(price);
  return locale === "ar" ? `${formatted} دج` : locale === "fr" ? `${formatted} DA` : `${formatted} DZD`;
}

function productLink(item: AiCatalogItem, locale: SupportedParseLocale): string {
  return `[${item.name}](/product/${item.slug}?locale=${locale})`;
}

function isGreeting(raw: string): boolean {
  return /^(سلام|صباح الخير|مساء الخير|مرحبا|أهلا|اهلا|salut|bonjour|bonsoir|hello|hi|hey)\b/.test(raw.trim().toLowerCase());
}

const T = {
  ar: {
    greeting: (name: string) =>
      `أهلاً بك! أنا **${name}** — أساعدك تجد منتجات حقيقية من متاجر موداليا فقط. جرّب مثلاً: «أريد هاتفاً رخيصاً» أو «أحذية رياضية تحت 8000 دج».`,
    found: (n: number, summary: string | null) =>
      `وجدت **${n}** منتجاً حقيقياً${summary ? ` (${summary})` : ""}:\n`,
    item: (p: AiCatalogItem, loc: SupportedParseLocale) =>
      `- ${productLink(p, loc)} — **${formatPrice(p.price, loc)}**${p.compareAtPrice && p.compareAtPrice > p.price ? ` (بدل ${formatPrice(p.compareAtPrice, loc)})` : ""} · ${p.storeName}`,
    notFound: (summary: string | null) =>
      `لم أجد أي منتج مطابق${summary ? ` لـ«${summary}»` : ""} في الكتالوج الحالي. جرّب كلمات أبسط أو وسّع نطاق السعر — أنا أعرض فقط منتجات حقيقية موجودة فعلاً.`,
    noFacts: "لا أملك هذه المعلومة في بيانات المتجر، لذلك لن أخمّن.",
    unclear: "لم أفهم طلبك تماماً. أخبرني مثلاً: ما المنتج الذي تبحث عنه؟ وما ميزانيتك التقريبية؟",
    categories: (list: string) => `تصفح التصنيفات المتاحة: ${list}`,
    disclaimer: "\n\n_الأسعار المعروضة هي أسعار المتاجر الحالية، وقد تتغير._",
  },
  fr: {
    greeting: (name: string) =>
      `Bienvenue ! Je suis **${name}** — je ne vous montre que des produits réels des boutiques Modalia. Essayez : « je veux un téléphone pas cher » ou « chaussures de sport moins de 8000 DA ».`,
    found: (n: number, summary: string | null) =>
      `J'ai trouvé **${n}** produit(s) réel(s)${summary ? ` (${summary})` : ""} :\n`,
    item: (p: AiCatalogItem, loc: SupportedParseLocale) =>
      `- ${productLink(p, loc)} — **${formatPrice(p.price, loc)}**${p.compareAtPrice && p.compareAtPrice > p.price ? ` (au lieu de ${formatPrice(p.compareAtPrice, loc)})` : ""} · ${p.storeName}`,
    notFound: (summary: string | null) =>
      `Je n'ai trouvé aucun produit correspondant${summary ? ` à « ${summary} »` : ""} dans le catalogue actuel. Essayez des mots plus simples ou élargissez le budget — je ne montre que des produits réellement disponibles.`,
    noFacts: "Je n'ai pas cette information dans les données de la boutique, je ne vais donc pas l'inventer.",
    unclear: "Je n'ai pas bien compris. Dites-moi par exemple : quel produit cherchez-vous, et quel est votre budget approximatif ?",
    categories: (list: string) => `Parcourez les catégories disponibles : ${list}`,
    disclaimer: "\n\n_Les prix affichés sont ceux actuels des boutiques et peuvent changer._",
  },
  en: {
    greeting: (name: string) =>
      `Welcome! I'm **${name}** — I only show real products from Modalia stores. Try: "I want a cheap phone" or "running shoes under 8000 DZD".`,
    found: (n: number, summary: string | null) =>
      `I found **${n}** real product(s)${summary ? ` (${summary})` : ""}:\n`,
    item: (p: AiCatalogItem, loc: SupportedParseLocale) =>
      `- ${productLink(p, loc)} — **${formatPrice(p.price, loc)}**${p.compareAtPrice && p.compareAtPrice > p.price ? ` (was ${formatPrice(p.compareAtPrice, loc)})` : ""} · ${p.storeName}`,
    notFound: (summary: string | null) =>
      `I couldn't find any matching products${summary ? ` for "${summary}"` : ""} in the current catalog. Try simpler words or widen the price range — I only show products that really exist.`,
    noFacts: "I don't have that information in the store data, so I won't guess.",
    unclear: "I didn't quite get that. Tell me for example: what product are you looking for, and what's your approximate budget?",
    categories: (list: string) => `Browse the available categories: ${list}`,
    disclaimer: "\n\n_Shown prices are the stores' current prices and may change._",
  },
} as const;

export type RuleCategory = { slug: string; name: string };

export function answerWithRules(opts: {
  raw: string;
  intent: ParsedIntent;
  /** Scored, filtered matches (already ranked). */
  matches: AiCatalogItem[];
  categories: RuleCategory[];
  locale: SupportedParseLocale;
}): RuleAnswer {
  const { raw, intent, matches, categories, locale } = opts;
  const t = T[locale];
  const name = RULE_ASSISTANT_NAME[locale];

  if (isGreeting(raw)) {
    const catLinks = categories
      .slice(0, 6)
      .map((c) => `[${c.name}](/shop?locale=${locale}&category=${c.slug})`)
      .join(" · ");
    return { text: t.greeting(name) + (catLinks ? `\n\n${t.categories(catLinks)}` : ""), products: [] };
  }

  if (!matches.length) {
    const summary = intentSummary(intent, locale);
    const catLinks = categories
      .slice(0, 8)
      .map((c) => `[${c.name}](/shop?locale=${locale}&category=${c.slug})`)
      .join(" · ");
    return {
      text: t.notFound(summary) + (catLinks ? `\n\n${t.categories(catLinks)}` : ""),
      products: [],
    };
  }

  const shown = matches.slice(0, 6);
  const summary = intentSummary(intent, locale);
  const lines = shown.map((p) => t.item(p, locale)).join("\n");
  const text = t.found(matches.length, summary) + lines + t.disclaimer;
  return { text, products: shown };
}
