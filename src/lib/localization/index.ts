import { platformConfig, type SupportedLocale } from "@/config/platform";
import { formatPrice as formatPriceI18n } from "@/lib/i18n/format";

/** Backwards-compatible wrapper: customer UI should import from "@/lib/i18n/format" instead. */
export function formatPrice(amount: number, locale: SupportedLocale = platformConfig.market.defaultLanguage) {
  return formatPriceI18n(amount, locale);
}
export { formatDate, formatNumber, localeTag } from "@/lib/i18n/format";

export function phonePattern(countryCode = platformConfig.market.countryCode) { return countryCode === "DZ" ? /^(\+213|0)[5-7][0-9]{8}$/ : /^\+?[1-9]\d{6,14}$/; }
