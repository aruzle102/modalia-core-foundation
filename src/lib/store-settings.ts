import { z } from "zod";

/**
 * Store Studio settings schema.
 *
 * Lives in a dependency-free module so the seller workspace (server fns),
 * the studio UI, and the public storefront can all share the same
 * allowlists. All seller-authored text is stored and rendered as PLAIN TEXT —
 * never HTML. Accents are allowlisted design tokens, never free hex values.
 */

export const STORE_ACCENT_IDS = ["ink", "clay", "olive", "sand", "slate", "plum"] as const;
export type StoreAccentId = (typeof STORE_ACCENT_IDS)[number];

export interface StoreAccent {
  id: StoreAccentId;
  /** Curated display name shown in the swatch picker. */
  label: string;
  /** Swatch / background color. */
  swatch: string;
  /** Text color to use on top of the swatch. */
  ink: string;
}

export const STORE_ACCENTS: [StoreAccent, ...StoreAccent[]] = [
  { id: "ink", label: "Ink", swatch: "#23211d", ink: "#faf9f7" },
  { id: "clay", label: "Clay", swatch: "#b4563a", ink: "#ffffff" },
  { id: "olive", label: "Olive", swatch: "#6d7c3f", ink: "#ffffff" },
  { id: "sand", label: "Sand", swatch: "#d9b47f", ink: "#2a241a" },
  { id: "slate", label: "Slate", swatch: "#4b5a6a", ink: "#ffffff" },
  { id: "plum", label: "Plum", swatch: "#7a4e6e", ink: "#ffffff" },
];

export function accentById(id: string | null | undefined): StoreAccent {
  return STORE_ACCENTS.find((accent) => accent.id === id) ?? STORE_ACCENTS[0];
}

export const STORE_SECTION_KINDS = ["featured", "categories", "offers", "new", "best"] as const;
export type StoreSectionKind = (typeof STORE_SECTION_KINDS)[number];

export interface TrilingualText {
  fr: string;
  en: string;
  ar: string;
}

export interface StoreSectionConfig {
  id: string;
  kind: StoreSectionKind;
  title: TrilingualText;
  enabled: boolean;
}

export interface StoreCollectionConfig {
  id: string;
  title: TrilingualText;
  subtitle: TrilingualText;
  product_ids: string[];
  enabled: boolean;
}

export interface StoreSocialLinks {
  instagram: string;
  facebook: string;
  tiktok: string;
  website: string;
}

export interface StoreSeo {
  title: TrilingualText;
  description: TrilingualText;
}

export interface StoreSettings {
  accent: StoreAccentId;
  featured_product_ids: string[];
  featured_category_ids: string[];
  sections: StoreSectionConfig[];
  announcement: TrilingualText;
  /** Admin-curated collections for the official store (plain text only). */
  official_collections: StoreCollectionConfig[];
  /** Seller-curated collections for third-party storefronts (plain text only). */
  seller_collections: StoreCollectionConfig[];
  /** Seller social profiles / website. Empty string = not set. */
  social_links: StoreSocialLinks;
  /** Optional seller-authored SEO overrides (plain text only). */
  seo: StoreSeo;
  /** Primary business category of the store (categories.id), or null. */
  category_id: string | null;
  /**
   * Trilingual main store description (plain text only). The legacy
   * `stores.description` text column remains the read fallback for stores
   * that never edited it (V8 #231).
   */
  description: TrilingualText;
}

export const storeAccentSchema = z.enum(STORE_ACCENT_IDS);

const trilingualSchema = (max: number) =>
  z.object({
    fr: z.string().trim().max(max).default(""),
    en: z.string().trim().max(max).default(""),
    ar: z.string().trim().max(max).default(""),
  });

export const storeSectionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: z.enum(STORE_SECTION_KINDS),
  title: trilingualSchema(80),
  enabled: z.boolean(),
});

export const storeCollectionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: trilingualSchema(120),
  subtitle: trilingualSchema(160),
  product_ids: z.array(z.string().uuid()).max(60),
  enabled: z.boolean(),
});

/** Social links: http(s) URLs only, empty string = not set. */
export const storeSocialLinksSchema = z.object({
  instagram: z.string().trim().max(300).default(""),
  facebook: z.string().trim().max(300).default(""),
  tiktok: z.string().trim().max(300).default(""),
  website: z.string().trim().max(300).default(""),
});

/** Seller-authored SEO overrides (plain text; rendered escaped by the SEO helpers). */
export const storeSeoSchema = z.object({
  title: trilingualSchema(70),
  description: trilingualSchema(160),
});

export const storeSettingsSchema = z.object({
  accent: storeAccentSchema.optional(),
  featured_product_ids: z.array(z.string().uuid()).max(50).optional(),
  featured_category_ids: z.array(z.string().uuid()).max(24).optional(),
  sections: z.array(storeSectionSchema).max(12).optional(),
  announcement: trilingualSchema(120).optional(),
  official_collections: z.array(storeCollectionSchema).max(20).optional(),
  seller_collections: z.array(storeCollectionSchema).max(20).optional(),
  social_links: storeSocialLinksSchema.optional(),
  seo: storeSeoSchema.optional(),
  category_id: z.string().uuid().nullable().optional(),
  description: trilingualSchema(2000).optional(),
});

export function defaultStoreSettings(): StoreSettings {
  return {
    accent: "ink",
    featured_product_ids: [],
    featured_category_ids: [],
    sections: [
      { id: "featured", kind: "featured", title: { fr: "Sélection", en: "Featured picks", ar: "مختارات" }, enabled: true },
      { id: "categories", kind: "categories", title: { fr: "Catégories", en: "Categories", ar: "الفئات" }, enabled: true },
      { id: "new", kind: "new", title: { fr: "Nouveautés", en: "New arrivals", ar: "وصل حديثاً" }, enabled: true },
      { id: "offers", kind: "offers", title: { fr: "Offres", en: "Special offers", ar: "العروض" }, enabled: false },
      { id: "best", kind: "best", title: { fr: "Meilleures ventes", en: "Best sellers", ar: "الأكثر مبيعاً" }, enabled: false },
    ],
    announcement: { fr: "", en: "", ar: "" },
    official_collections: [],
    seller_collections: [],
    social_links: { instagram: "", facebook: "", tiktok: "", website: "" },
    seo: { title: { fr: "", en: "", ar: "" }, description: { fr: "", en: "", ar: "" } },
    category_id: null,
    description: { fr: "", en: "", ar: "" },
  };
}

/** Normalize whatever is stored in `stores.settings` into a complete, valid settings object. */
export function normalizeStoreSettings(raw: unknown): StoreSettings {
  const defaults = defaultStoreSettings();
  const parsed = storeSettingsSchema.safeParse(raw);
  if (!parsed.success) return defaults;
  const data = parsed.data;
  return {
    accent: data.accent ?? defaults.accent,
    featured_product_ids: data.featured_product_ids ?? defaults.featured_product_ids,
    featured_category_ids: data.featured_category_ids ?? defaults.featured_category_ids,
    sections: data.sections ?? defaults.sections,
    announcement: data.announcement ?? defaults.announcement,
    official_collections: data.official_collections ?? defaults.official_collections,
    seller_collections: data.seller_collections ?? defaults.seller_collections,
    social_links: data.social_links ?? defaults.social_links,
    seo: data.seo ?? defaults.seo,
    category_id: data.category_id ?? defaults.category_id,
    description: data.description ?? defaults.description,
  };
}

/** Pick the best trilingual string for a locale; falls back to fr → en → ar → fallback. */
export function localizeText(value: TrilingualText | null | undefined, locale: string, fallback = ""): string {
  if (!value) return fallback;
  const primary = (value as unknown as Record<string, string | undefined>)[locale];
  if (primary && primary.trim()) return primary;
  for (const key of ["fr", "en", "ar"] as const) {
    const candidate = value[key];
    if (candidate && candidate.trim()) return candidate;
  }
  return fallback;
}
