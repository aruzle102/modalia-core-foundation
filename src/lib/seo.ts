/**
 * Shared SEO primitives for Modalia's public pages.
 *
 * Canonical source of the public site URL, head/meta builders for TanStack
 * Start `head:` route options, and JSON-LD builders fed only with real data
 * from the database (never invent prices, availability, ratings, or images).
 */

/**
 * Public site URL — single canonical source: `VITE_SITE_URL` (import.meta.env).
 * On the server, `process.env.SITE_URL` is accepted as the same value.
 * When unset, canonical URLs fall back to RELATIVE paths — never an invented
 * domain, never a hosting-provider preview URL (registry #12 fixed-inline).
 */
function resolveSiteUrl(): string | null {
  const viteEnv =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      : undefined;
  const fromVite = viteEnv?.["VITE_SITE_URL"];
  const fromNode = typeof process !== "undefined" ? process.env?.["SITE_URL"] : undefined;
  const raw = (fromVite ?? fromNode ?? "").trim().replace(/\/+$/, "");
  return raw || null;
}

export const SITE_URL: string | null = resolveSiteUrl();

export function canonicalUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return SITE_URL ? `${SITE_URL}${clean}` : clean;
}

/** Absolute URL helper for contexts (sitemap, feeds) that require one. */
export function absoluteUrl(path: string, fallbackBase?: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const base = SITE_URL ?? (fallbackBase ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}${clean}` : clean;
}

/** Trim text for meta descriptions (~160 chars) without cutting mid-word. */
export function truncateForMeta(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") || max - 1).trimEnd()}…`;
}

export type JsonLd = Record<string, unknown>;

type HeadMetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

export type RouteHead = {
  meta: HeadMetaEntry[];
  links: Array<{ rel: string; href: string }>;
  scripts: Array<{ type: string; children: string }>;
};

export function jsonLdScript(data: unknown): { type: string; children: string } {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

export function pageHead(options: {
  title: string;
  description: string;
  path: string;
  ogType?: string;
  image?: string | null;
  robots?: string | undefined;
  keywords?: string | null;
  jsonLd?: JsonLd[];
}): RouteHead {
  const url = canonicalUrl(options.path);
  const meta: HeadMetaEntry[] = [
    { title: options.title },
    { name: "description", content: truncateForMeta(options.description) },
    { property: "og:title", content: options.title },
    { property: "og:description", content: truncateForMeta(options.description) },
    { property: "og:url", content: url },
    { property: "og:type", content: options.ogType ?? "website" },
    { property: "og:site_name", content: "Modalia" },
    { name: "twitter:card", content: options.image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: options.title },
    { name: "twitter:description", content: truncateForMeta(options.description) },
  ];
  if (options.image) {
    meta.push({ property: "og:image", content: options.image });
    meta.push({ name: "twitter:image", content: options.image });
  }
  if (options.robots) meta.push({ name: "robots", content: options.robots });
  if (options.keywords) meta.push({ name: "keywords", content: options.keywords });
  return {
    meta,
    links: [{ rel: "canonical", href: url }],
    scripts: (options.jsonLd ?? []).map(jsonLdScript),
  };
}

/** Localized site-wide defaults (original copy, not sourced from other sites). */
export const siteMetaByLocale: Record<string, { title: string; description: string }> = {
  ar: {
    title: "موداليا — سوق الجزائر الراقي",
    description:
      "موداليا — سوق جزائري من الطراز الرفيع: بائعون مستقلون موثّقون، دفع عند الاستلام، وتوصيل شفاف إلى 58 ولاية.",
  },
  fr: {
    title: "Modalia — La marketplace premium d'Algérie",
    description:
      "Modalia — la marketplace premium d'Algérie : vendeurs indépendants vérifiés, paiement à la livraison, livraison transparente dans 58 wilayas.",
  },
  en: {
    title: "Modalia — Algeria's premium marketplace",
    description:
      "Modalia — Algeria's premium marketplace: verified independent sellers, cash on delivery, transparent delivery across 58 wilayas.",
  },
};

export function siteMeta(locale: string): { title: string; description: string } {
  return siteMetaByLocale[locale] ?? siteMetaByLocale["en"] ?? { title: "Modalia", description: "Modalia" };
}

/** schema.org/Organization for the whole site (homepage). */
export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Modalia",
    url: SITE_URL ?? canonicalUrl("/"),
    description: siteMeta("fr").description,
    areaServed: "DZ",
  };
}

/** schema.org/WebSite with a real site-search action (GET /shop?q=…). */
export function websiteJsonLd(): JsonLd {
  const base = SITE_URL ?? canonicalUrl("/");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Modalia",
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/shop?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export type ProductJsonLdInput = {
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  currency: string;
  media: Array<{ url: string | null }>;
  category: { name: string; slug: string } | null;
  brand: { name: string } | null;
  store: { name: string; slug: string } | null;
  variants: Array<{ available: boolean }>;
  reviewSummary: { average: number | null; count: number };
};

/**
 * schema.org/Product — built only from real listing data:
 * real price/currency, real per-variant availability, and aggregateRating
 * only when real approved reviews exist.
 */
export function productJsonLd(product: ProductJsonLdInput, url: string): JsonLd {
  const images = product.media
    .map((item) => item.url)
    .filter((value): value is string => Boolean(value));
  const inStock = product.variants.some((variant) => variant.available);
  const offer: JsonLd = {
    "@type": "Offer",
    url,
    price: product.price,
    priceCurrency: product.currency,
    availability: inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  };
  if (product.store) {
    offer["seller"] = {
      "@type": "OnlineStore",
      name: product.store.name,
      url: canonicalUrl(`/store/${product.store.slug}`),
    };
  }
  const data: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? product.shortDescription ?? product.name,
    url,
    sku: product.slug,
    image: images,
    brand: { "@type": "Brand", name: product.brand?.name ?? product.store?.name ?? "Modalia" },
    offers: offer,
  };
  if (product.category) data["category"] = product.category.name;
  if (product.reviewSummary.count > 0 && product.reviewSummary.average != null) {
    data["aggregateRating"] = {
      "@type": "AggregateRating",
      ratingValue: Number(product.reviewSummary.average.toFixed(1)),
      reviewCount: product.reviewSummary.count,
    };
  }
  return data;
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export type StoreJsonLdInput = {
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
};

/** schema.org/OnlineStore for a seller storefront — only real store data. */
export function onlineStoreJsonLd(store: StoreJsonLdInput, url: string): JsonLd {
  const data: JsonLd = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: store.name,
    url,
    parentOrganization: { "@type": "Organization", name: "Modalia", url: SITE_URL ?? canonicalUrl("/") },
  };
  if (store.description) data["description"] = truncateForMeta(store.description, 300);
  if (store.logoUrl) data["logo"] = store.logoUrl;
  if (store.bannerUrl) data["image"] = store.bannerUrl;
  return data;
}

/** schema.org/FAQPage from real FAQ content (help page). */
export function faqJsonLd(faqs: Array<{ question: string; answer: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function formatPriceForMeta(price: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

/* ------------------------------------------------------------------ */
/* Admin-editable SEO defaults (Section 52).                           */
/* ------------------------------------------------------------------ */

/**
 * Public SEO defaults as stored in `site_settings` (Admin > SEO).
 * Served by the public `getPublicSeoSettings` server function; empty
 * strings mean "not configured — use the locale defaults below".
 */
export type PublicSeoOverrides = {
  title: string;
  description: string;
  keywords: string;
  /** "index" | "noindex" | "" */
  robots: string;
};

/**
 * Resolve the default SEO for a page that does not set its own tags:
 * admin-configured overrides win, locale copy is the fallback. A global
 * `noindex` from Admin > SEO is honored here.
 */
export function defaultSeoForLocale(
  locale: string,
  overrides?: PublicSeoOverrides | null,
): { title: string; description: string; keywords: string | null; robots: string | undefined } {
  const base = siteMeta(locale);
  const title = overrides?.title?.trim() || base.title;
  const description = overrides?.description?.trim() || base.description;
  const keywords = overrides?.keywords?.trim() || null;
  const robots = overrides?.robots?.trim() === "noindex" ? "noindex,nofollow" : undefined;
  return { title, description, keywords, robots };
}

/* ------------------------------------------------------------------ */
/* Product-page head copy (Section 52, FIX #16).                        */
/* ------------------------------------------------------------------ */

export type ProductHeadCopy = {
  title: string;
  titleFallback: string;
  descriptionFallback: string;
  descriptionTemplate: string;
};

/**
 * Trilingual product-page head copy. Pre-merge fallback copy lives here;
 * when the `seo.*` keys from `/tmp/v8_i18n_A.json` are merged into the i18n
 * modules, the route passes them in and they take precedence.
 */
const PRODUCT_HEAD_COPY_FALLBACK: Record<string, ProductHeadCopy> = {
  ar: {
    title: "{name} — {store} — موداليا",
    titleFallback: "{slug} — موداليا",
    descriptionFallback: "اكتشف هذا المنتج على موداليا.",
    descriptionTemplate:
      "{name} من {store} بسعر {price}. الدفع عند الاستلام في جميع أنحاء الجزائر.",
  },
  fr: {
    title: "{name} — {store} — Modalia",
    titleFallback: "{slug} — Modalia",
    descriptionFallback: "Découvrez ce produit sur Modalia.",
    descriptionTemplate:
      "{name} vendu par {store} pour {price}. Paiement à la livraison partout en Algérie.",
  },
  en: {
    title: "{name} — {store} — Modalia",
    titleFallback: "{slug} — Modalia",
    descriptionFallback: "Explore this product on Modalia.",
    descriptionTemplate:
      "{name} sold by {store} for {price}. Cash on delivery across Algeria.",
  },
};

/** Pull optional `seo.*` keys out of a Translation object (post-merge). */
export function extractSeoKeys(t: unknown): Partial<ProductHeadCopy> | undefined {
  if (!t || typeof t !== "object") return undefined;
  const seo = (t as { seo?: unknown }).seo;
  if (!seo || typeof seo !== "object") return undefined;
  const out: Partial<ProductHeadCopy> = {};
  for (const key of ["title", "titleFallback", "descriptionFallback", "descriptionTemplate"] as const) {
    const value = (seo as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function productHeadCopy(locale: string, i18nSeo?: Partial<ProductHeadCopy>): ProductHeadCopy {
  const fallback = PRODUCT_HEAD_COPY_FALLBACK[locale] ?? PRODUCT_HEAD_COPY_FALLBACK["en"]!;
  return { ...fallback, ...(i18nSeo ?? {}) };
}

/** Fill a `{name}`/`{store}`/`{slug}`/`{price}` template. */
export function fillSeoTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] !== undefined ? values[key] : match,
  );
}

/* ------------------------------------------------------------------ */
/* Category/store-page head copy (Section 56, FIX #178).                */
/* ------------------------------------------------------------------ */

export type CategoryHeadCopy = {
  descriptionWithProducts: string;
  descriptionEmpty: string;
};

export type StoreHeadCopy = {
  descriptionWithBlurb: string;
  descriptionFallback: string;
};

const CATEGORY_HEAD_COPY_FALLBACK: Record<string, CategoryHeadCopy> = {
  ar: {
    descriptionWithProducts:
      "تسوّق {count} منتجًا معتمدًا من {name} لدى متاجر مستقلة موثّقة على Modalia. الدفع عند الاستلام في جميع أنحاء الجزائر.",
    descriptionEmpty: "تصفّح {name} على Modalia — سوق مميّز للمتاجر المستقلة الموثّقة.",
  },
  fr: {
    descriptionWithProducts:
      "Achetez {count} produits {name} approuvés auprès de boutiques indépendantes vérifiées sur Modalia. Paiement à la livraison partout en Algérie.",
    descriptionEmpty:
      "Parcourez {name} sur Modalia — une marketplace premium de boutiques indépendantes vérifiées.",
  },
  en: {
    descriptionWithProducts:
      "Shop {count} approved {name} products from verified independent stores on Modalia. Cash on delivery across Algeria.",
    descriptionEmpty: "Browse {name} on Modalia — a premium marketplace of verified independent stores.",
  },
};

const STORE_HEAD_COPY_FALLBACK: Record<string, StoreHeadCopy> = {
  ar: {
    descriptionWithBlurb: "{name} على Modalia: {blurb}",
    descriptionFallback:
      "اكتشف {name}، متجر مستقل على Modalia. الدفع عند الاستلام في جميع أنحاء الجزائر.",
  },
  fr: {
    descriptionWithBlurb: "{name} sur Modalia : {blurb}",
    descriptionFallback:
      "Découvrez {name}, une boutique indépendante sur Modalia. Paiement à la livraison partout en Algérie.",
  },
  en: {
    descriptionWithBlurb: "{name} on Modalia: {blurb}",
    descriptionFallback:
      "Explore {name}, an independent store on Modalia. Cash on delivery across Algeria.",
  },
};

export function categoryHeadCopy(locale: string): CategoryHeadCopy {
  return CATEGORY_HEAD_COPY_FALLBACK[locale] ?? CATEGORY_HEAD_COPY_FALLBACK["en"]!;
}

export function storeHeadCopy(locale: string): StoreHeadCopy {
  return STORE_HEAD_COPY_FALLBACK[locale] ?? STORE_HEAD_COPY_FALLBACK["en"]!;
}

export type PageHeadCopy = { title: string; description: string };

const PAGE_HEAD_COPY_FALLBACK: Record<string, Record<string, PageHeadCopy>> = {
  ar: {
    shop: {
      title: "التسوق — Modalia",
      description: "تصفح منتجات معتمدة من متاجر Modalia المستقلة. الدفع عند الاستلام في جميع أنحاء الجزائر.",
    },
    trackOrder: {
      title: "تتبع الطلب — Modalia",
      description: "تحقق من أحدث حالة لطلبك على Modalia.",
    },
    orderSuccess: {
      title: "تم استلام الطلب — Modalia",
      description: "تم استلام طلبك بالدفع عند الاستلام على Modalia.",
    },
    becomeSeller: {
      title: "كن بائعًا — Modalia",
      description: "قدّم طلبًا لبناء متجر موثّق على Modalia.",
    },
    sellerNotifications: {
      title: "الإشعارات — البائع — Modalia",
      description: "إشعارات متجرك.",
    },
  },
  fr: {
    shop: {
      title: "Boutique — Modalia",
      description: "Parcourez les produits approuvés des boutiques indépendantes Modalia. Paiement à la livraison partout en Algérie.",
    },
    trackOrder: {
      title: "Suivre la commande — Modalia",
      description: "Vérifiez le dernier statut de votre commande Modalia.",
    },
    orderSuccess: {
      title: "Commande reçue — Modalia",
      description: "Votre commande Modalia en paiement à la livraison a bien été reçue.",
    },
    becomeSeller: {
      title: "Devenir vendeur — Modalia",
      description: "Postulez pour ouvrir une boutique vérifiée sur Modalia.",
    },
    sellerNotifications: {
      title: "Notifications — Vendeur — Modalia",
      description: "Notifications de votre boutique.",
    },
  },
  en: {
    shop: {
      title: "Shop — Modalia",
      description: "Browse approved products from Modalia’s independent stores. Cash on delivery across Algeria.",
    },
    trackOrder: {
      title: "Track order — Modalia",
      description: "Check the latest status of your Modalia order.",
    },
    orderSuccess: {
      title: "Order received — Modalia",
      description: "Your Modalia cash-on-delivery order has been received.",
    },
    becomeSeller: {
      title: "Become a seller — Modalia",
      description: "Apply to build a verified store on Modalia.",
    },
    sellerNotifications: {
      title: "Notifications — Seller — Modalia",
      description: "Notifications for your store.",
    },
  },
};

export function pageHeadCopy(locale: string, page: string): PageHeadCopy {
  const byLocale = PAGE_HEAD_COPY_FALLBACK[locale] ?? PAGE_HEAD_COPY_FALLBACK["en"]!;
  return byLocale[page] ?? byLocale["shop"]!;
}

/* ------------------------------------------------------------------ */
/* Global robots rollout (Section 52, #176).                           */
/* ------------------------------------------------------------------ */

import type { QueryClient } from "@tanstack/react-query";
import { getPublicSeoSettings } from "@/lib/engagement.functions";

export const SEO_SETTINGS_QUERY_KEY = ["public-seo-settings"] as const;

/**
 * Prefetch the global SEO settings into the query cache (call in route
 * loaders). The `head` function then reads them synchronously — no extra
 * round trip per render, and crawlers see the directive during SSR.
 */
export function prefetchSeoSettings(queryClient: QueryClient): Promise<void> {
  return queryClient
    .prefetchQuery({
      queryKey: SEO_SETTINGS_QUERY_KEY,
      queryFn: () => getPublicSeoSettings().catch(() => null),
      staleTime: 5 * 60 * 1000,
    })
    .then(() => undefined);
}

/**
 * Sync read of the prefetched global robots directive (call in `head`).
 * Returns "noindex,nofollow" only when the admin explicitly set the global
 * noindex switch; otherwise undefined (page decides for itself).
 */
export function seoRobotsFromCache(queryClient: QueryClient): string | undefined {
  const seo = queryClient.getQueryData<{ robots?: string }>(SEO_SETTINGS_QUERY_KEY);
  return seo?.robots?.trim() === "noindex" ? "noindex,nofollow" : undefined;
}

/**
 * Head-function convenience: resolve the global robots directive from the
 * route matches' query client. Pass the `head` ctx directly.
 */
export function seoRobotsFromHeadCtx(ctx: {
  matches?: Array<{ context?: { queryClient?: QueryClient } }>;
}): string | undefined {
  const qc = ctx.matches?.[ctx.matches.length - 1]?.context?.queryClient;
  return qc ? seoRobotsFromCache(qc) : undefined;
}
