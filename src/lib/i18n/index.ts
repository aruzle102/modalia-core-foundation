import { platformConfig, type SupportedLocale } from "@/config/platform";

export type { SupportedLocale };

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

import { ar } from "./ar";
import { fr } from "./fr";
import { en } from "./en";

const translations = { ar, fr, en } as const;

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
