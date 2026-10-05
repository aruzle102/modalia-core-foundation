import { platformConfig, type SupportedLocale } from "@/config/platform";

export type TextDirection = "ltr" | "rtl";
export const localeDirections: Record<SupportedLocale, TextDirection> = {
  ar: "rtl",
  fr: "ltr",
  en: "ltr",
};
export const localeLabels: Record<SupportedLocale, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
};
export const LOCALE_STORAGE_KEY = "modalia-locale";

const translations = {
  ar: {
    nav: {
      home: "الرئيسية",
      shop: "تسوّق",
      categories: "التصنيفات",
      stores: "المتاجر",
      sellers: "بيع على موداليا",
      search: "بحث",
      cart: "السلة",
      wishlist: "المفضلة",
      account: "الحساب",
      menu: "القائمة",
      trackOrder: "تتبّع الطلب",
    },
    shell: {
      catalog: "الكتالوج قيد الإعداد",
      catalogDescription:
        "يتم إعداد تجربة موداليا بعناية. ستتوفر المنتجات والمتاجر المعتمدة قريبًا.",
      explore: "استكشف موداليا",
      back: "العودة للرئيسية",
    },
    footer: {
      statement: "تسوق موثوق، مصمم للغد.",
      newsletter: "تابع آخر أخبار موداليا",
      columns: { shop: "تسوّق", support: "الدعم", contact: "تواصل معنا" },
      links: {
        about: "من نحن",
        help: "المساعدة",
        shipping: "الشحن والتوصيل",
        returns: "الإرجاع",
        becomeSeller: "بِع على موداليا",
        contact: "اتصل بنا",
        privacy: "سياسة الخصوصية",
        terms: "الشروط والأحكام",
        trackOrder: "تتبّع الطلب",
      },
      newsletterTitle: "النشرة البريدية",
      newsletterPlaceholder: "بريدك الإلكتروني",
      newsletterButton: "اشترك",
      newsletterSuccess: "تم اشتراكك بنجاح. أهلًا بك في موداليا.",
      newsletterError: "تعذّر الاشتراك. حاول مجددًا.",
      contactEmail: "البريد الإلكتروني",
      contactPhone: "الهاتف",
      contactAddress: "العنوان",
      rights: "جميع الحقوق محفوظة.",
      contactSoon: "معلومات الاتصال قريبًا.",
      cashOnDelivery: "الدفع عند الاستلام",
    },
    common: {
      loading: "جارٍ التحميل…",
      retry: "حاول مجددًا",
      backHome: "العودة للرئيسية",
      viewAll: "عرض الكل",
      close: "إغلاق",
      notFoundTitle: "الصفحة غير موجودة",
      notFoundText: "الصفحة التي تبحث عنها غير موجودة أو تم نقلها.",
    },
  },
  fr: {
    nav: {
      home: "Accueil",
      shop: "Boutique",
      categories: "Catégories",
      stores: "Boutiques",
      sellers: "Vendre sur Modalia",
      search: "Rechercher",
      cart: "Panier",
      wishlist: "Favoris",
      account: "Compte",
      menu: "Menu",
      trackOrder: "Suivre ma commande",
    },
    shell: {
      catalog: "Le catalogue se prépare",
      catalogDescription:
        "L’expérience Modalia est conçue avec soin. Les produits et boutiques approuvés arrivent bientôt.",
      explore: "Découvrir Modalia",
      back: "Retour à l’accueil",
    },
    footer: {
      statement: "Le commerce de confiance, pensé pour demain.",
      newsletter: "Suivre les actualités Modalia",
      columns: { shop: "Boutique", support: "Assistance", contact: "Contact" },
      links: {
        about: "À propos",
        help: "Aide / FAQ",
        shipping: "Livraison",
        returns: "Retours",
        becomeSeller: "Vendre sur Modalia",
        contact: "Contact",
        privacy: "Confidentialité",
        terms: "Conditions d’utilisation",
        trackOrder: "Suivre ma commande",
      },
      newsletterTitle: "Newsletter",
      newsletterPlaceholder: "Votre adresse e-mail",
      newsletterButton: "S’inscrire",
      newsletterSuccess: "Inscription confirmée. Bienvenue sur Modalia.",
      newsletterError: "Inscription impossible. Veuillez réessayer.",
      contactEmail: "E-mail",
      contactPhone: "Téléphone",
      contactAddress: "Adresse",
      rights: "Tous droits réservés.",
      contactSoon: "Coordonnées bientôt disponibles.",
      cashOnDelivery: "Paiement à la livraison",
    },
    common: {
      loading: "Chargement…",
      retry: "Réessayer",
      backHome: "Retour à l’accueil",
      viewAll: "Tout voir",
      close: "Fermer",
      notFoundTitle: "Page introuvable",
      notFoundText: "La page que vous cherchez n'existe pas ou a été déplacée.",
    },
  },
  en: {
    nav: {
      home: "Home",
      shop: "Shop",
      categories: "Categories",
      stores: "Stores",
      sellers: "Sell on Modalia",
      search: "Search",
      cart: "Cart",
      wishlist: "Wishlist",
      account: "Account",
      menu: "Menu",
      trackOrder: "Track order",
    },
    shell: {
      catalog: "The catalogue is taking shape",
      catalogDescription:
        "The Modalia experience is being crafted with care. Approved products and stores are coming soon.",
      explore: "Discover Modalia",
      back: "Back to home",
    },
    footer: {
      statement: "Trusted commerce, shaped for tomorrow.",
      newsletter: "Get Modalia updates",
      columns: { shop: "Shop", support: "Support", contact: "Contact" },
      links: {
        about: "About",
        help: "Help / FAQ",
        shipping: "Shipping",
        returns: "Returns",
        becomeSeller: "Become a seller",
        contact: "Contact",
        privacy: "Privacy policy",
        terms: "Terms of use",
        trackOrder: "Track order",
      },
      newsletterTitle: "Newsletter",
      newsletterPlaceholder: "Your email address",
      newsletterButton: "Subscribe",
      newsletterSuccess: "Subscribed. Welcome to Modalia.",
      newsletterError: "Couldn't subscribe. Please try again.",
      contactEmail: "Email",
      contactPhone: "Phone",
      contactAddress: "Address",
      rights: "All rights reserved.",
      contactSoon: "Contact info coming soon.",
      cashOnDelivery: "Cash on delivery",
    },
    common: {
      loading: "Loading…",
      retry: "Try again",
      backHome: "Back to home",
      viewAll: "View all",
      close: "Close",
      notFoundTitle: "Page not found",
      notFoundText: "The page you're looking for doesn't exist or has been moved.",
    },
  },
} as const;

export type Translation = (typeof translations)[SupportedLocale];

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return platformConfig.market.languages.includes(value as SupportedLocale);
}

/**
 * Resolve the active locale: explicit URL param first, then the saved
 * preference from localStorage, then the platform default.
 */
export function resolveLocale(searchParam?: string): SupportedLocale {
  if (isSupportedLocale(searchParam)) return searchParam;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isSupportedLocale(stored)) return stored;
    } catch {
      /* storage unavailable — fall through to the default */
    }
  }
  return platformConfig.market.defaultLanguage;
}

/** Persist the user's locale choice for future visits. */
export function persistLocale(locale: SupportedLocale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage unavailable — locale param still works per page */
  }
}

export function getLocale(value?: string): SupportedLocale {
  if (isSupportedLocale(value)) return value;
  return resolveLocale();
}

export function getTranslations(locale: SupportedLocale): Translation {
  return translations[locale];
}
