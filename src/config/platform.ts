export const platformConfig = {
  brand: { name: "Modalia", description: "A premium multi-vendor marketplace." },
  market: { countryCode: "DZ", currency: "DZD", languages: ["ar", "fr", "en"] as const, defaultLanguage: "fr" as const },
  commerce: { guestCheckout: true, multiSellerCart: true },
} as const;

export type SupportedLocale = (typeof platformConfig.market.languages)[number];
