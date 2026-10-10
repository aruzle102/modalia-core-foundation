import { Link } from "@tanstack/react-router";
import { Fragment, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  getPublicSiteButtons,
  type PublicSiteButton,
} from "@/lib/admin-buttons.functions";
import type { SupportedLocale } from "@/config/platform";

/**
 * Storefront renderer for Admin > Button Control (Section 60).
 *
 * Renders ACTIVE buttons for one placement, ordered by the admin's sort
 * order, filtered to the current locale (null locale = all locales).
 * Every destination is re-validated here at render time — defense in depth
 * on top of the server-side validation at write time. Unsafe or
 * unresolvable destinations render nothing, never a dead/broken link.
 */

export type ButtonPlacement =
  | "hero_primary"
  | "hero_secondary"
  | "header"
  | "footer"
  | "category_cta"
  | "product_cta"
  | "banner_cta";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function resolveButtonHref(button: PublicSiteButton): {
  href: string;
  external: boolean;
} | null {
  const dest = button.destination.trim();
  switch (button.action_type) {
    case "link_internal":
      if (!dest.startsWith("/") || /^javascript:/i.test(dest)) return null;
      return { href: dest, external: false };
    case "link_external":
      if (!/^https:\/\//i.test(dest)) return null;
      return { href: dest, external: true };
    case "link_category":
      if (!SLUG_PATTERN.test(dest)) return null;
      return { href: `/category/${encodeURIComponent(dest)}`, external: false };
    case "link_store":
      if (!SLUG_PATTERN.test(dest)) return null;
      return { href: `/store/${encodeURIComponent(dest)}`, external: false };
    case "link_product":
      if (!SLUG_PATTERN.test(dest)) return null;
      return { href: `/product/${encodeURIComponent(dest)}`, external: false };
    case "link_collection":
      // No public collection page exists (collections live inside
      // stores.settings); never render a dead link. Registry #174.
      return null;
    default:
      return null;
  }
}

const BUTTON_VARIANT: Record<PublicSiteButton["style"], "default" | "secondary" | "ghost" | "link"> = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
  link: "link",
};

export function useSiteButtons(placement: ButtonPlacement) {
  return useQuery({
    queryKey: ["site-buttons", placement],
    queryFn: () => getPublicSiteButtons({ data: { placement } }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useVisibleSiteButtons(
  placement: ButtonPlacement,
  locale: SupportedLocale,
): PublicSiteButton[] {
  const { data } = useSiteButtons(placement);
  return useMemo(
    () =>
      (data?.buttons ?? []).filter(
        (button) => (!button.locale || button.locale === locale) && resolveButtonHref(button) !== null,
      ),
    [data, locale],
  );
}

function InternalButtonLink({
  href,
  locale,
  label,
  className,
  onNavigate,
}: {
  href: string;
  locale: SupportedLocale;
  label: string;
  className: string | undefined;
  onNavigate: (() => void) | undefined;
}) {
  // Preserve the current locale across the navigation (site convention).
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query ?? "");
  if (!params.has("locale")) params.set("locale", locale);
  return (
    <Link
      to={path || "/"}
      search={Object.fromEntries(params.entries())}
      className={className}
      onClick={onNavigate}
    >
      {label}
    </Link>
  );
}

export function SiteButtons({
  placement,
  locale,
  variant = "link",
  itemClassName,
  buttonClassName,
  onNavigate,
  listItemClassName,
  size = "default",
}: {
  placement: ButtonPlacement;
  locale: SupportedLocale;
  /** "link" = plain link (header/footer/hero-secondary); "button" = Button chrome. */
  variant?: "link" | "button";
  itemClassName?: string;
  buttonClassName?: string;
  /** Called when a button is activated (e.g. close the mobile drawer). */
  onNavigate?: () => void;
  /** When set, each item is wrapped in <li className={listItemClassName}>. */
  listItemClassName?: string;
  /** Button size for variant="button". */
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const buttons = useVisibleSiteButtons(placement, locale);
  if (buttons.length === 0) return null;

  const wrap = (key: string, node: ReactNode) =>
    listItemClassName !== undefined ? (
      <li key={key} className={listItemClassName || undefined}>
        {node}
      </li>
    ) : (
      <Fragment key={key}>{node}</Fragment>
    );

  return (
    <>
      {buttons.map((button, index) => {
        const resolved = resolveButtonHref(button);
        if (!resolved) return null;
        const key = `${button.label}-${index}`;
        if (variant === "button") {
          const inner = resolved.external ? (
            <a
              href={resolved.href}
              target="_blank"
              rel="noreferrer"
              className={buttonClassName}
              onClick={onNavigate}
            >
              {button.label}
            </a>
          ) : (
            <InternalButtonLink
              href={resolved.href}
              locale={locale}
              label={button.label}
              className={buttonClassName}
              onNavigate={onNavigate}
            />
          );
          return wrap(
            key,
            <Button asChild variant={BUTTON_VARIANT[button.style]} size={size}>
              {inner}
            </Button>,
          );
        }
        return wrap(
          key,
          resolved.external ? (
            <a
              href={resolved.href}
              target="_blank"
              rel="noreferrer"
              className={itemClassName}
              onClick={onNavigate}
            >
              {button.label}
            </a>
          ) : (
            <InternalButtonLink
              href={resolved.href}
              locale={locale}
              label={button.label}
              className={itemClassName}
              onNavigate={onNavigate}
            />
          ),
        );
      })}
    </>
  );
}
