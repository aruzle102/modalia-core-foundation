/**
 * Shared SEO primitives for Modalia's public pages.
 *
 * Canonical source of the public site URL, head/meta builders for TanStack
 * Start `head:` route options, and JSON-LD builders fed only with real data
 * from the database (never invent prices, availability, ratings, or images).
 */

/** Public site URL: env-configurable, falls back to the Lovable preview URL. */
export const SITE_URL =
  (typeof process !== "undefined" && process.env?.["SITE_URL"]) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.["VITE_SITE_URL"]) ||
  "https://modalia-core-foundation.lovable.app";

export function canonicalUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean}`;
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
  robots?: string;
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
    url: SITE_URL,
    description: siteMeta("fr").description,
    areaServed: "DZ",
  };
}

/** schema.org/WebSite with a real site-search action (GET /shop?q=…). */
export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Modalia",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/shop?q={search_term_string}`,
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
    parentOrganization: { "@type": "Organization", name: "Modalia", url: SITE_URL },
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
