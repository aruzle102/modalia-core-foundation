import { platformConfig, type SupportedLocale } from "@/config/platform";

/**
 * BCP 47 tag used for Intl formatting per locale.
 * DZD pricing and Algerian dates/numbers are shown with Arabic-Indic digits
 * only in Arabic (ar-DZ); fr-DZ and en use Latin digits, as is standard
 * for commerce in Algeria.
 */
export function localeTag(locale: SupportedLocale): string {
  switch (locale) {
    case "ar":
      return "ar-DZ";
    case "fr":
      return "fr-DZ";
    default:
      return "en";
  }
}

/** Localized DZD price, e.g. «1 500,00 د.ج.» (ar) / «1 500,00 DZD» (fr) / «DZD 1,500.00» (en). */
export function formatPrice(
  amount: number,
  locale: SupportedLocale = platformConfig.market.defaultLanguage,
  currency: string = platformConfig.market.currency,
): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Localized date, defaulting to a medium date style. */
export function formatDate(
  value: Date | string | number,
  locale: SupportedLocale = platformConfig.market.defaultLanguage,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat(localeTag(locale), options).format(new Date(value));
}

/** Localized plain number. */
export function formatNumber(
  value: number,
  locale: SupportedLocale = platformConfig.market.defaultLanguage,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}
