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
  ar: "مساعد موداليا",
  fr: "Assistant Modalia",
  en: "Modalia Assistant",
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
  const t = raw.trim().toLowerCase();
  // Arabic greetings (\b doesn't work with Arabic script, use explicit boundary)
  if (/^(سلام|صباح الخير|مساء الخير|مرحبا|أهلا|اهلا|هاي|هلا)(\s|$|[!؟?.,])/.test(t)) return true;
  // Latin greetings
  return /^(salut|bonjour|bonsoir|hello|hi|hey)\b/.test(t);
}

const T = {
  ar: {
    greetings: [
      (name: string) => `أهلاً بك! أنا **${name}** 😊 أساعدك تلقى واش تحوس عليه من متاجر موداليا. قولي واش تحتاج؟`,
      (name: string) => `مرحباً! **${name}** في الخدمة 🛍️ نحوس لك على منتجات حقيقية بأحسن الأسعار. واش راك تحوس؟`,
      (name: string) => `أهلاً وسهلاً! أنا **${name}** — دليلك في موداليا. قولي واش تحتاج نلقاه لك؟`,
    ],
    foundIntros: [
      (n: number, summary: string | null) => `لقيت لك **${n}** منتج${summary ? ` (${summary})` : ""} 👇\n`,
      (n: number, summary: string | null) => `هاذو **${n}** منتجات${summary ? ` (${summary})` : ""} اللي يوالموا طلبك ✨\n`,
      (n: number, summary: string | null) => `شوف واش لقيت لك — **${n}** منتج${summary ? ` (${summary})` : ""} 🎯\n`,
    ],
    notFounds: [
      (summary: string | null) => `ما لقيتش منتج يوالم${summary ? ` «${summary}»` : ""} 😕 جرب كلمات أخرى أو وسع ميزانيتك شوية.`,
      (summary: string | null) => `للأسف ما كاش نتيجة${summary ? ` لـ«${summary}»` : ""}. جرب تحوس بكلمات أبسط؟`,
      (summary: string | null) => `ما لقيت والو${summary ? ` يطابق «${summary}»` : ""} في الكتالوج الحالي. بدل الكلمات وجرب مرة أخرى 🔄`,
    ],
    item: (p: AiCatalogItem, loc: SupportedParseLocale) =>
      `- ${productLink(p, loc)} — **${formatPrice(p.price, loc)}**${p.compareAtPrice && p.compareAtPrice > p.price ? ` (بدل ${formatPrice(p.compareAtPrice, loc)})` : ""} · ${p.storeName}`,
    noFacts: "هذي المعلومة ما عنديش في بيانات المتجر، ما نحبش نخمن 🤷",
    unclear: "ما فهمتش مليح واش تحوس 😅 قولي مثلاً: واش من منتج؟ وشحال ميزانيتك؟",
    categories: (list: string) => `تصفح التصنيفات: ${list}`,
  },
  fr: {
    greetings: [
      (name: string) => `Salut ! Je suis **${name}** 😊 Je vous aide à trouver ce que vous cherchez sur Modalia. Dites-moi !`,
      (name: string) => `Bienvenue ! **${name}** à votre service 🛍️ Je cherche des produits réels aux meilleurs prix. Que cherchez-vous ?`,
      (name: string) => `Hello ! Moi c'est **${name}** — votre guide sur Modalia. Que puis-je trouver pour vous ?`,
    ],
    foundIntros: [
      (n: number, summary: string | null) => `Voici **${n}** produit(s)${summary ? ` (${summary})` : ""} 👇\n`,
      (n: number, summary: string | null) => `J'ai déniché **${n}** produit(s)${summary ? ` (${summary})` : ""} pour vous ✨\n`,
      (n: number, summary: string | null) => `Regardez ce que j'ai trouvé — **${n}** produit(s)${summary ? ` (${summary})` : ""} 🎯\n`,
    ],
    notFounds: [
      (summary: string | null) => `Hmm, rien trouvé${summary ? ` pour « ${summary} »` : ""} 😕 Essayez d'autres mots ou élargissez le budget.`,
      (summary: string | null) => `Désolé, aucun résultat${summary ? ` pour « ${summary} »` : ""}. Essayez avec des mots plus simples ?`,
      (summary: string | null) => `Rien ne correspond${summary ? ` à « ${summary} »` : ""} pour le moment. Changez les mots-clés et réessayez 🔄`,
    ],
    item: (p: AiCatalogItem, loc: SupportedParseLocale) =>
      `- ${productLink(p, loc)} — **${formatPrice(p.price, loc)}**${p.compareAtPrice && p.compareAtPrice > p.price ? ` (au lieu de ${formatPrice(p.compareAtPrice, loc)})` : ""} · ${p.storeName}`,
    noFacts: "Je n'ai pas cette info dans les données, je préfère ne pas inventer 🤷",
    unclear: "Je n'ai pas bien saisi 😅 Dites-moi : quel produit cherchez-vous ? Quel budget ?",
    categories: (list: string) => `Parcourez les catégories : ${list}`,
  },
  en: {
    greetings: [
      (name: string) => `Hey! I'm **${name}** 😊 I help you find what you need on Modalia. What are you looking for?`,
      (name: string) => `Welcome! **${name}** at your service 🛍️ I find real products at the best prices. What do you need?`,
      (name: string) => `Hi there! I'm **${name}** — your guide on Modalia. What can I find for you?`,
    ],
    foundIntros: [
      (n: number, summary: string | null) => `Found **${n}** product(s)${summary ? ` (${summary})` : ""} 👇\n`,
      (n: number, summary: string | null) => `I dug up **${n}** product(s)${summary ? ` (${summary})` : ""} for you ✨\n`,
      (n: number, summary: string | null) => `Check what I found — **${n}** product(s)${summary ? ` (${summary})` : ""} 🎯\n`,
    ],
    notFounds: [
      (summary: string | null) => `Hmm, nothing found${summary ? ` for "${summary}"` : ""} 😕 Try different words or widen your budget.`,
      (summary: string | null) => `Sorry, no results${summary ? ` for "${summary}"` : ""}. Try simpler keywords?`,
      (summary: string | null) => `Nothing matches${summary ? ` "${summary}"` : ""} right now. Change keywords and retry 🔄`,
    ],
    item: (p: AiCatalogItem, loc: SupportedParseLocale) =>
      `- ${productLink(p, loc)} — **${formatPrice(p.price, loc)}**${p.compareAtPrice && p.compareAtPrice > p.price ? ` (was ${formatPrice(p.compareAtPrice, loc)})` : ""} · ${p.storeName}`,
    noFacts: "I don't have that info in the store data, I'd rather not guess 🤷",
    unclear: "Didn't quite catch that 😅 Tell me: what product? What's your budget?",
    categories: (list: string) => `Browse categories: ${list}`,
  },
} as const;


/** Pick a random template to avoid repetitive responses */
function pick<U>(arr: readonly U[]): U {
  return arr[Math.floor(Math.random() * arr.length)] as U;
}

export type RuleCategory = { slug: string; name: string };

/** Knowledge base: common marketplace questions answered directly */
const FAQ: { patterns: RegExp; answer: Record<SupportedParseLocale, string> }[] = [
  {
    patterns: /توصيل|شحن|livraison|shipping|delivery|توصيل/,
    answer: {
      ar: "التوصيل متوفر لـ 58 ولاية 🚚 عند الشراء تختار ولايتك والبلدية، والسعر يظهر لك حسب المتجر. كاين توصيل للدار أو للمكتب.",
      fr: "La livraison couvre 58 wilayas 🚚 Au checkout, choisissez votre wilaya et commune — le prix s'affiche selon la boutique. Livraison à domicile ou au bureau.",
      en: "Delivery covers 58 wilayas 🚚 At checkout, pick your wilaya and commune — the price shows per store. Home or office delivery.",
    },
  },
  {
    patterns: /دفع|خلاص|paiement|payment|pay|cod|عند الاستلام/,
    answer: {
      ar: "الدفع عند الاستلام 💵 تخلص كي توصلك السلعة. بسيطة وآمنة!",
      fr: "Paiement à la livraison 💵 Vous payez quand vous recevez. Simple et sûr !",
      en: "Cash on delivery 💵 You pay when you receive. Simple and safe!",
    },
  },
  {
    patterns: /إرجاع|استرجاع|retour|return|refund/,
    answer: {
      ar: "إذا المنتج فيه مشكلة أو ما عجبكش، تقدر تطلب إرجاع من صفحة طلباتك 📦 كل متجر عندو سياسة الإرجاع الخاصة بيه.",
      fr: "Si le produit a un problème, demandez un retour depuis vos commandes 📦 Chaque boutique a sa politique de retour.",
      en: "If the product has an issue, request a return from your orders 📦 Each store has its own return policy.",
    },
  },
  {
    patterns: /تتبع|وين وصل|suivi|track|where.*order/,
    answer: {
      ar: "تقدر تتبع طلبك من صفحة [تتبع الطلب](/track-order) 📍 دخل رمز الطلب أو رقم هاتفك ويظهر لك وين وصل.",
      fr: "Suivez votre commande sur [Suivre ma commande](/track-order) 📍 Entrez le code ou votre numéro et voyez où elle en est.",
      en: "Track your order on [Track Order](/track-order) 📍 Enter the code or your phone number to see where it is.",
    },
  },
  {
    patterns: /شكون|من هو|qui|who.*modalia|موداليا/,
    answer: {
      ar: "موداليا سوق جزائري 🛍️ يجمع متاجر حقيقية في مكان واحد — أزياء، إلكترونيات، أحذية وأكثر. كل المنتجات حقيقية من بائعين موثقين.",
      fr: "Modalia est un marketplace algérien 🛍️ qui réunit des boutiques réelles — mode, électronique, chaussures et plus. Produits réels de vendeurs vérifiés.",
      en: "Modalia is an Algerian marketplace 🛍️ bringing real stores together — fashion, electronics, shoes & more. Real products from verified sellers.",
    },
  },
];

/** Check if the message matches a FAQ entry */
function matchFaq(raw: string, locale: SupportedParseLocale): string | null {
  const lower = raw.toLowerCase();
  for (const faq of FAQ) {
    if (faq.patterns.test(lower)) {
      return faq.answer[locale];
    }
  }
  return null;
}

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

  // FAQ first: direct answers for common questions (no product search needed)
  const faqAnswer = matchFaq(raw, locale);
  if (faqAnswer && !matches.length) {
    return { text: faqAnswer, products: [] };
  }

  if (isGreeting(raw)) {
    const catLinks = categories
      .slice(0, 6)
      .map((c) => `[${c.name}](/shop?locale=${locale}&category=${c.slug})`)
      .join(" · ");
    return { text: pick(t.greetings)(name) + (catLinks ? `\n\n${t.categories(catLinks)}` : ""), products: [] };
  }

  if (!matches.length) {
    const summary = intentSummary(intent, locale);
    const catLinks = categories
      .slice(0, 8)
      .map((c) => `[${c.name}](/shop?locale=${locale}&category=${c.slug})`)
      .join(" · ");
    return {
      text: pick(t.notFounds)(summary) + (catLinks ? `\n\n${t.categories(catLinks)}` : ""),
      products: [],
    };
  }

  const shown = matches.slice(0, 6);
  const summary = intentSummary(intent, locale);
  const lines = shown.map((p) => t.item(p, locale)).join("\n");
  const text = pick(t.foundIntros)(matches.length, summary) + lines;
  return { text, products: shown };
}
