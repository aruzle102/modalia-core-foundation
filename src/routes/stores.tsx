/**
 * Stores directory — premium storefront discovery.
 * Editorial header, name search + verified filter, and uniform cards with
 * banner, overlapping logo, verification badge and a real product preview
 * strip per store. Data: getStoreDirectory (stores) + browseCatalog
 * (per-store published products) — no mock data.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Search, SearchX, Store as StoreIcon, X } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/layout/site-shell";
import { VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import {
  browseCatalog,
  getStoreDirectory,
  type CatalogProduct,
  type CatalogStore,
} from "@/lib/catalog.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

/** Cap the per-store preview fan-out so the directory stays fast. */
const PREVIEW_STORE_LIMIT = 24;
const PREVIEW_COUNT = 4;

export const Route = createFileRoute("/stores")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(storesQuery(deps.locale));
  },
  pendingComponent: StoresLoading,
  component: StoresPage,
});

const storesQuery = (locale: string) =>
  queryOptions({
    queryKey: ["store-directory", locale],
    queryFn: () => getStoreDirectory({ data: { locale } }),
    staleTime: 5 * 60 * 1000,
  });

/**
 * Latest published products per store, for the card preview strip.
 * One browseCatalog call per store (store-slug filter), images only,
 * failures degrade to an empty strip for that store.
 */
function useStorePreviews(stores: CatalogStore[], locale: SupportedLocale) {
  const slugs = stores.slice(0, PREVIEW_STORE_LIMIT).map((store) => store.slug);
  return useQuery({
    queryKey: ["store-previews", locale, slugs.join(",")],
    enabled: stores.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, CatalogProduct[]>> => {
      const entries = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const result = await browseCatalog({
              data: { locale, stores: [slug], pageSize: PREVIEW_COUNT + 4, inStock: true },
            });
            const withImages = result.products
              .filter((product) => product.imagePath)
              .slice(0, PREVIEW_COUNT);
            return [slug, withImages] as const;
          } catch {
            return [slug, []] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  });
}

function StoreCard({
  store,
  locale,
  previews,
  previewsLoading,
}: {
  store: CatalogStore;
  locale: SupportedLocale;
  previews: CatalogProduct[] | undefined;
  previewsLoading: boolean;
}) {
  const t = getTranslations(locale);
  const initial = store.name.trim().charAt(0).toUpperCase() || "M";
  const showStrip = previewsLoading || (previews !== undefined && previews.length > 0);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-[0_24px_48px_-20px_rgba(0,0,0,0.28)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {/* Stretched link — the whole card navigates to the store. */}
      <Link
        to="/store/$slug"
        params={{ slug: store.slug }}
        search={{ locale }}
        aria-label={store.name}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      {/* Banner — fixed aspect; logo overlaps its bottom edge */}
      <div className="relative shrink-0">
        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
          {store.bannerPath ? (
            <>
              <img
                src={store.bannerPath}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"
              />
            </>
          ) : (
            <div
              aria-hidden
              className="grid size-full place-items-center bg-gradient-to-br from-secondary via-muted to-primary/15"
            >
              <span className="select-none text-[96px] font-semibold leading-none tracking-tight text-foreground/10">
                {initial}
              </span>
            </div>
          )}
        </div>
        <div className="absolute -bottom-8 start-5 z-[1]">
          <span className="grid size-16 place-items-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg ring-1 ring-black/5">
            {store.logoPath ? (
              <img src={store.logoPath} alt="" loading="lazy" className="size-full object-contain" />
            ) : (
              <StoreIcon className="size-7 text-muted-foreground" />
            )}
          </span>
        </div>
      </div>
      {/* Body — top padding clears the overlapping logo */}
      <div className="flex min-w-0 flex-1 flex-col px-5 pb-5 pt-11">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">
            {store.name}
          </h2>
          {store.verified ? (
            <VerifiedSellerBadge
              verified={store.verified}
              tone={store.verificationBadge}
              label={t.store.verifiedStore}
            />
          ) : null}
        </div>
        <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-sm leading-relaxed text-muted-foreground">
          {store.description ?? t.store.independent}
        </p>

        {showStrip ? (
          <div className="relative z-10 mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t.store.latestProducts}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {previewsLoading
                ? Array.from({ length: PREVIEW_COUNT }, (_, i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
                  ))
                : (previews ?? []).map((product) => (
                    <Link
                      key={product.id}
                      to="/product/$slug"
                      params={{ slug: product.slug }}
                      search={{ locale }}
                      title={product.name}
                      className="group/thumb relative block aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-border/50 transition hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <img
                        src={product.imagePath ?? ""}
                        alt={product.imageAlt}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover/thumb:scale-105 motion-reduce:transition-none"
                      />
                    </Link>
                  ))}
            </div>
          </div>
        ) : null}

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {store.productCount} {store.productCount === 1 ? t.store.product : t.store.products}
            </p>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground">
              {t.store.visitStore}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function StoreCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="aspect-[16/9] animate-pulse bg-muted" />
      <div className="px-5 pb-5 pt-11">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-2.5 h-4 w-full animate-pulse rounded bg-muted" />
        <div className="mt-1.5 h-4 w-4/5 animate-pulse rounded bg-muted" />
        <div className="mt-4 grid grid-cols-4 gap-2">
          {Array.from({ length: PREVIEW_COUNT }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="mt-5 border-t border-border/50 pt-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function StoresLoading() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10" aria-busy="true">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
        <div className="mt-8 h-11 w-full max-w-md animate-pulse rounded-full bg-muted" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <StoreCardSkeleton key={i} />
          ))}
        </div>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}

function chipClass(active: boolean) {
  return `h-9 shrink-0 rounded-full border px-4 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border/70 bg-card text-foreground/70 hover:border-foreground/40 hover:text-foreground"
  }`;
}

function StoresPage() {
  const { locale } = Route.useSearch();
  const { data: stores } = useSuspenseQuery(storesQuery(locale));
  const t = getTranslations(locale);
  const copy = t.home;

  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const previewsQuery = useStorePreviews(stores, locale);

  const hasVerified = useMemo(() => stores.some((store) => store.verified), [stores]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter(
      (store) =>
        (!verifiedOnly || store.verified) && (q === "" || store.name.toLowerCase().includes(q)),
    );
  }, [stores, query, verifiedOnly]);
  const hasFilters = query.trim() !== "" || verifiedOnly;

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10"
      >
        {/* Editorial header */}
        <header className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {copy.storesEyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            {copy.storesTitle}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{copy.storesText}</p>
          {stores.length > 0 ? (
            <p className="mt-4 text-sm font-medium tabular-nums text-foreground/70">
              {t.store.directoryCount(stores.length)}
            </p>
          ) : null}
        </header>

        {stores.length === 0 ? (
          <div className="mt-12 flex flex-col items-center rounded-2xl border border-border/60 bg-card px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-muted">
              <StoreIcon className="size-6 text-muted-foreground" />
            </span>
            <p className="mt-4 max-w-sm text-muted-foreground">{t.home.emptySection}</p>
          </div>
        ) : (
          <>
            {/* Search + filters */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t.store.searchPlaceholder}
                  aria-label={t.store.searchPlaceholder}
                  className="h-11 w-full rounded-full border border-border/70 bg-card ps-11 pe-11 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-2 focus:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t.search.clearAll}
                    className="absolute end-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {hasVerified ? (
                <div className="flex items-center gap-2" role="group" aria-label={t.search.filters}>
                  <button
                    type="button"
                    onClick={() => setVerifiedOnly(false)}
                    aria-pressed={!verifiedOnly}
                    className={chipClass(!verifiedOnly)}
                  >
                    {t.store.filterAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerifiedOnly(true)}
                    aria-pressed={verifiedOnly}
                    className={chipClass(verifiedOnly)}
                  >
                    {t.store.verifiedOnly}
                  </button>
                </div>
              ) : null}
            </div>

            {hasFilters ? (
              <p className="mt-6 text-sm tabular-nums text-muted-foreground" aria-live="polite">
                {t.search.resultCount(filtered.length)}
              </p>
            ) : null}

            {filtered.length === 0 ? (
              <div className="mt-6 flex flex-col items-center rounded-2xl border border-border/60 bg-card px-6 py-16 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-muted">
                  <SearchX className="size-6 text-muted-foreground" />
                </span>
                <h2 className="mt-4 text-lg font-semibold tracking-tight">
                  {t.search.noResultsTitle}
                </h2>
                <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                  {t.search.noResultsText}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setVerifiedOnly(false);
                  }}
                  className="mt-5 h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t.search.clearAll}
                </button>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                {filtered.map((store) => (
                  <StoreCard
                    key={store.id}
                    store={store}
                    locale={locale}
                    previews={previewsQuery.data?.[store.slug]}
                    previewsLoading={previewsQuery.isLoading}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
