import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { StoreFront } from "@/components/store/StoreFront";
import { getStoreDetail } from "@/lib/store.functions";
import { breadcrumbJsonLd, canonicalUrl, fillSeoTemplate, onlineStoreJsonLd, pageHead, prefetchSeoSettings, seoRobotsFromHeadCtx, storeHeadCopy } from "@/lib/seo";
import { RouteError, RoutePending } from "@/components/routing/route-states";
import { getLocale, getTranslations, localeDirections, resolveLocale } from "@/lib/i18n";
import { track } from "@/lib/analytics";

const storeQuery = (slug: string, locale: string) =>
  queryOptions({
    queryKey: ["store", slug, locale],
    queryFn: () => getStoreDetail({ data: { slug, locale } }),
  });

export const Route = createFileRoute("/store/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, params, deps }) => {
    void prefetchSeoSettings(context.queryClient);
    return context.queryClient.ensureQueryData(storeQuery(params.slug, deps.locale));
  },
  pendingComponent: () => <RoutePending label={getTranslations(resolveLocale()).store.loadingStore} />,
  errorComponent: ({ reset }) => (
    <RouteError
      message={getTranslations(resolveLocale()).store.loadError}
      reset={reset}
    />
  ),
  head: (context) => {
    const { params, loaderData } = context;
    const rawSearch = (context as unknown as { search?: Record<string, unknown> }).search ?? {};
    const locale = getLocale(typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined);
    const copy = storeHeadCopy(locale);
    const path = `/store/${params.slug}`;
    const store = loaderData;
    const name = store?.name ?? params.slug;
    return pageHead({
      robots: seoRobotsFromHeadCtx(context),
      title: store?.seoTitle ?? `${name} — Modalia`,
      description:
        store?.seoDescription ??
        (store?.description
          ? fillSeoTemplate(copy.descriptionWithBlurb, { name, blurb: store.description })
          : fillSeoTemplate(copy.descriptionFallback, { name })),
      path,
      image: store?.logoUrl ?? store?.bannerUrl ?? null,
      jsonLd: store
        ? [
            onlineStoreJsonLd(store, canonicalUrl(path)),
            breadcrumbJsonLd([
              { name: "Home", url: canonicalUrl("/") },
              { name: name, url: canonicalUrl(path) },
            ]),
          ]
        : [],
    });
  },
  component: StorePage,
});

function StorePage() {
  const { slug } = Route.useParams();
  const { locale } = Route.useSearch();
  const { data: store } = useSuspenseQuery(storeQuery(slug, locale));
  const t = getTranslations(locale);
  const storeId = store?.id;
  useEffect(() => {
    if (storeId) track("store_view", { entityType: "store", entityId: storeId, metadata: { slug } });
  }, [storeId, slug]);
  if (!store)
    return (
      <div dir={localeDirections[locale]} className="min-h-screen bg-background">
        <SiteHeader locale={locale} t={t} />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-16 text-center">
          <h1 className="text-display">{t.store.unavailableTitle}</h1>
          <p className="mt-3 text-body text-muted-foreground">{t.store.unavailableText}</p>
        </main>
        <SiteFooter locale={locale} t={t} />
      </div>
    );
  return <StoreFront store={store} locale={locale} t={t} />;
}
