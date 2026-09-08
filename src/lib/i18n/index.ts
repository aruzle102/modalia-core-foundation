import { platformConfig, type SupportedLocale } from "@/config/platform";

export type TextDirection = "ltr" | "rtl";
export const localeDirections: Record<SupportedLocale, TextDirection> = { ar: "rtl", fr: "ltr", en: "ltr" };
export const localeLabels: Record<SupportedLocale, string> = { ar: "العربية", fr: "Français", en: "English" };

const translations = {
  ar: { nav: { shop: "تسوّق", sellers: "بيع على موداليا", search: "بحث", cart: "السلة", wishlist: "المفضلة", account: "الحساب", menu: "القائمة" }, shell: { catalog: "الكتالوج قيد الإعداد", catalogDescription: "يتم إعداد تجربة موداليا بعناية. ستتوفر المنتجات والمتاجر المعتمدة قريبًا.", explore: "استكشف موداليا", back: "العودة للرئيسية" }, footer: { statement: "تسوق موثوق، مصمم للغد.", newsletter: "تابع آخر أخبار موداليا" } },
  fr: { nav: { shop: "Boutique", sellers: "Vendre sur Modalia", search: "Rechercher", cart: "Panier", wishlist: "Favoris", account: "Compte", menu: "Menu" }, shell: { catalog: "Le catalogue se prépare", catalogDescription: "L’expérience Modalia est conçue avec soin. Les produits et boutiques approuvés arrivent bientôt.", explore: "Découvrir Modalia", back: "Retour à l’accueil" }, footer: { statement: "Le commerce de confiance, pensé pour demain.", newsletter: "Suivre les actualités Modalia" } },
  en: { nav: { shop: "Shop", sellers: "Sell on Modalia", search: "Search", cart: "Cart", wishlist: "Wishlist", account: "Account", menu: "Menu" }, shell: { catalog: "The catalogue is taking shape", catalogDescription: "The Modalia experience is being crafted with care. Approved products and stores are coming soon.", explore: "Discover Modalia", back: "Back to home" }, footer: { statement: "Trusted commerce, shaped for tomorrow.", newsletter: "Get Modalia updates" } },
} as const;

export type Translation = (typeof translations)[SupportedLocale];
export function getLocale(value?: string): SupportedLocale { return platformConfig.market.languages.includes(value as SupportedLocale) ? value as SupportedLocale : platformConfig.market.defaultLanguage; }
export function getTranslations(locale: SupportedLocale): Translation { return translations[locale]; }
