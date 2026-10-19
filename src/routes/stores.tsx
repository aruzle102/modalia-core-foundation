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
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_16px_36px_-14px_rgba(0,0,0,0.22)]"
    >
      {/* Cover — fixed aspect ratio, logo overlays the bottom edge */}
      <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-muted">
        {store.bannerPath ? (
          <>
            <img
              src={store.bannerPath}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
          </>
        ) : (
          <span className="grid size-full place-items-center bg-gradient-to-br from-muted to-secondary">
            <StoreIcon className="size-8 text-muted-foreground/50" />
          </span>
        )}
        <div className="absolute -bottom-7 start-4">
          <span className="grid size-14 place-items-center overflow-hidden rounded-full border-2 border-card bg-white p-1.5 shadow-md">
            {store.logoPath ? (
              <img src={store.logoPath} alt="" loading="lazy" className="size-full object-contain" />
            ) : (
              <StoreIcon className="size-6 text-muted-foreground" />
            )}
          </span>
        </div>
        {store.verified ? (
          <span className="absolute end-3 top-3">
            <VerifiedSellerBadge verified={store.verified} tone={store.verificationBadge} label={t.store.verifiedStore} />
          </span>
        ) : null}
      </div>
      {/* Body — top padding clears the overlapping logo */}
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-9">
        <h2 className="truncate text-base font-semibold text-foreground">{store.name}</h2>
        {store.description ? (
          <p className="mt-1 line-clamp-2 min-h-[2.5em] text-sm leading-snug text-muted-foreground">
            {store.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <p className="text-xs tabular-nums text-muted-foreground">
            {store.productCount} {store.productCount === 1 ? t.store.product : t.store.products}
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-foreground">
            {t.store.visitStore}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </span>
        </div>
      </div>
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
