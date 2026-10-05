import { useSearch } from "@tanstack/react-router";
import { getLocale, type SupportedLocale } from "@/lib/i18n";

/**
 * Resolve the admin UI locale: current route's `locale` search param wins,
 * then the persisted choice, then the platform default.
 *
 * The admin shell is rendered by every admin page, so components that live in
 * the shell (CommandBar, QuickCreate) cannot rely on a single route's
 * `validateSearch`. `useSearch({ strict: false })` reads the merged search of
 * the matched routes instead. This mirrors the shell's own locale resolution.
 */
export function useAdminLocale(): SupportedLocale {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const param = typeof search["locale"] === "string" ? search["locale"] : undefined;
  return getLocale(param);
}
