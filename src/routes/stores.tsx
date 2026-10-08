/**
 * Stores directory — lightweight store discovery page.
 * Logo, name, verification badge, product count, visit CTA.
 * No giant product grids: this page is for discovering stores as brands.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Store as StoreIcon } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/layout/site-shell";
import { VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import { getStoreDirectory, type CatalogStore } from "@/lib/catalog.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

export const Route = createFileRoute("/stores")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(storesQuery(deps.locale));
  },
  component: StoresPage,
});

const storesQuery = (locale: string) =>
  queryOptions({
    queryKey: ["store-directory", locale],
    queryFn: () => getStoreDirectory({ data: { locale } }),
    staleTime: 5 * 60 * 1000,
  });

function StoreCard({ store, locale }: { store: CatalogStore; locale: SupportedLocale }) {
  const t = getTranslations(locale);
  return (
    <Link
      to="/store/$slug"
      params={{ slug: store.slug }}
      search={{ locale }}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/25 hover:bg-secondary/40 sm:p-5"
    >
      {store.logoPath ? (
        <img
          src={store.logoPath}
          alt=""
          loading="lazy"
          className="size-14 shrink-0 rounded-xl object-cover sm:size-16"
        />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted sm:size-16">
          <StoreIcon className="size-6 text-muted-foreground" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold">{store.name}</h2>
          <VerifiedSellerBadge verified={store.verified} label={t.store.verifiedStore} />
        </div>
        {store.description ? (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{store.description}</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {store.productCount} {store.productCount === 1 ? t.store.product : t.store.products}
        </p>
      </div>
      <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
    </Link>
  );
}

function StoresPage() {
  const { locale } = Route.useSearch();
  const { data: stores } = useSuspenseQuery(storesQuery(locale));
  const t = getTranslations(locale);
  const copy = t.home;

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {copy.storesEyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{copy.storesTitle}</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">{copy.storesText}</p>

        {stores.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">{t.home.emptySection}</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} locale={locale} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
