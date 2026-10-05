import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { ProductDetailView } from "@/components/marketplace/product-detail";
import { getProductDetail } from "@/lib/product.functions";
import {
  breadcrumbJsonLd,
  canonicalUrl,
  formatPriceForMeta,
  pageHead,
  productJsonLd,
  truncateForMeta,
} from "@/lib/seo";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

const productQuery = (slug: string, locale: string) => queryOptions({ queryKey: ["product", slug, locale], queryFn: () => getProductDetail({ data: { slug, locale } }) });
function ProductLoading() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).product.loading}</div>; }
function ProductError() { const { locale } = Route.useSearch(); return <div role="alert" className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).product.loadError}</div>; }
function ProductNotFound() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).product.notAvailable}</div>; }
export const Route = createFileRoute("/product/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, deps, params }) => context.queryClient.ensureQueryData(productQuery(params.slug, deps.locale)),
  pendingComponent: ProductLoading,
  errorComponent: ProductError,
  notFoundComponent: ProductNotFound,
  head: ({ params, loaderData }) => {
    const product = loaderData;
    const path = `/product/${params.slug}`;
    const url = canonicalUrl(path);
    if (!product) {
      return pageHead({
        title: `${params.slug} — Modalia`,
        description: "Explore this product on Modalia.",
        path,
      });
    }
    const storeName = product.store?.name ?? "Modalia";
    const title = `${product.name} — ${storeName} — Modalia`;
    const priceLabel = formatPriceForMeta(product.price, product.currency, "fr");
    const description =
      product.shortDescription ??
      (product.description ? truncateForMeta(product.description) : null) ??
      `${product.name} sold by ${storeName} for ${priceLabel}. Cash on delivery across Algeria.`;
    const image =
      product.media.find((item) => item.isPrimary)?.url ?? product.media[0]?.url ?? null;
    const breadcrumbs = [
      { name: "Home", url: canonicalUrl("/") },
      ...(product.category
        ? [
            {
              name: product.category.name,
              url: canonicalUrl(`/category/${product.category.slug}`),
            },
          ]
        : []),
      { name: product.name, url },
    ];
    return pageHead({
      title,
      description,
      path,
      ogType: "product",
      image,
      jsonLd: [productJsonLd(product, url), breadcrumbJsonLd(breadcrumbs)],
    });
  },
  component: ProductPage,
});
function ProductPage() { const { slug } = Route.useParams(); const { locale } = Route.useSearch(); const { data: product } = useSuspenseQuery(productQuery(slug, locale)); const t = getTranslations(locale); if (!product) return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main id="main-content" tabIndex={-1} className="px-6 py-24 text-center"><h1 className="text-display text-foreground">{t.product.unavailableTitle}</h1><p className="mt-3 text-body text-muted-foreground">{t.product.unavailableText}</p><Button asChild variant="outline" className="mt-7"><Link to="/shop" search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" }}>{t.product.backToShop}</Link></Button></main><SiteFooter locale={locale} t={t} /></div>; return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><ProductDetailView product={product} locale={locale} /><SiteFooter locale={locale} t={t} /></div>; }
