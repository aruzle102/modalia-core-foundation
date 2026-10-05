import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/marketplace/discovery";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { browseCatalog } from "@/lib/catalog.functions";
import { breadcrumbJsonLd, canonicalUrl, pageHead } from "@/lib/seo";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { track } from "@/lib/analytics";

const categoryQuery = (slug: string) => queryOptions({ queryKey: ["category", slug], queryFn: () => browseCatalog({ data: { category: slug, sort: "newest", page: 1 } }) });
function CategoryLoading() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).category.loading}</div>; }
function CategoryError() { const { locale } = Route.useSearch(); return <div role="alert" className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).category.loadError}</div>; }
function CategoryNotFound() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).category.notAvailable}</div>; }
export const Route = createFileRoute("/category/$slug")({ validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }), loaderDeps: ({ search }) => ({ locale: search.locale }), loader: ({ context, deps, params }) => context.queryClient.ensureQueryData(categoryQuery(params.slug)), pendingComponent: CategoryLoading, errorComponent: CategoryError, notFoundComponent: CategoryNotFound, head: ({ params, loaderData }) => {
      const path = `/category/${params.slug}`;
      const category = loaderData?.categories.find((item) => item.slug === params.slug);
      const name = category?.name ?? params.slug;
      const count = category?.productCount ?? loaderData?.products.length ?? 0;
      return pageHead({
        title: `${name} — Modalia`,
        description: count > 0
          ? `Shop ${count} approved ${name} products from verified independent stores on Modalia. Cash on delivery across Algeria.`
          : `Browse ${name} on Modalia — a premium marketplace of verified independent stores.`,
        path,
        jsonLd: [
          breadcrumbJsonLd([
            { name: "Home", url: canonicalUrl("/") },
            { name: name, url: canonicalUrl(path) },
          ]),
        ],
      });
    }, component: CategoryPage });
function CategoryPage() { const { slug } = Route.useParams(); const { locale } = Route.useSearch(); const { data } = useSuspenseQuery(categoryQuery(slug)); const category = data.categories.find((item) => item.slug === slug); const t = getTranslations(locale); const categoryId = category?.id; useEffect(() => { if (categoryId) track("category_view", { entityType: "category", entityId: categoryId, metadata: { slug } }); }, [categoryId]); return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><p className="text-eyebrow text-muted-foreground">{t.category.eyebrow}</p><h1 className="mt-2 text-display text-foreground">{category?.name ?? slug}</h1><p className="mt-4 max-w-xl text-body text-muted-foreground">{t.category.subtitle}</p><div className="mt-10"><ProductGrid products={data.products} locale={locale} emptyTitle={t.category.emptyTitle} emptyText={t.category.emptyText} /></div><div className="mt-12"><Button asChild variant="outline"><Link to="/shop" search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" }}>{t.category.browseAll}</Link></Button></div></main><SiteFooter locale={locale} t={t} /></div>; }