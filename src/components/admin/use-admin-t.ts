import { getTranslations } from "@/lib/i18n";
import { useAdminLocale } from "@/components/admin/useAdminLocale";

/**
 * Admin-side translations for the interfaces added in Phase 3/8.
 * Resolves the admin locale (route `?locale=` param, then the persisted
 * storefront locale, then English) and returns the `admin` dictionary
 * section in ar/fr/en.
 */
export function useAdminT() {
  const locale = useAdminLocale();
  return getTranslations(locale).admin;
}
