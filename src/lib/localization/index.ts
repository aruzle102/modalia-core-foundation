import { platformConfig, type SupportedLocale } from "@/config/platform";
export function formatPrice(amount: number, locale: SupportedLocale = platformConfig.market.defaultLanguage) { return new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`, { style: "currency", currency: platformConfig.market.currency, maximumFractionDigits: 2 }).format(amount); }
export function phonePattern(countryCode = platformConfig.market.countryCode) { return countryCode === "DZ" ? /^(\+213|0)[5-7][0-9]{8}$/ : /^\+?[1-9]\d{6,14}$/; }
