import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { ProductDetailView } from "@/components/marketplace/product-detail";
import { getProductDetail } from "@/lib/product.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

const productQuery = (slug: string, locale: string) => queryOptions({ queryKey: ["product", slug, locale], queryFn: () => getProductDetail({ data: { slug, locale } }) });
export const Route = createFileRoute("/product/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loaderDeps: ({ params, search }) => ({ slug: params.slug, locale: search.locale }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(productQuery(deps.slug, deps.locale)),
  pendingComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">Loading product…</div>,
  errorComponent: () => <div role="alert" className="px-6 py-24 text-center text-muted-foreground">This product could not be loaded. Please try again.</div>,
  notFoundComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">This product is not available.</div>,
  head: ({ params, loaderData }) => { const product = loaderData; const title = product ? `${product.name} — Modalia` : `${params.slug} — Modalia`; const description = product?.shortDescription ?? product?.description ?? "Explore this product on Modalia."; const image = product?.media.find((item) => item.isPrimary)?.url ?? product?.media[0]?.url; return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "product" }, { name: "twitter:card", content: "summary_large_image" }, ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : [])], links: [{ rel: "canonical", href: `https://modalia-core-foundation.lovable.app/product/${params.slug}` }], scripts: product ? [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description ?? product.shortDescription, image: product.media.filter((item) => item.url).map((item) => item.url), sku: product.slug, offers: { "@type": "Offer", price: product.price, priceCurrency: product.currency, availability: product.variants.some((item) => item.available) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } }) }] : [] }; },
  component: ProductPage,
});
function ProductPage() { const { slug } = Route.useParams(); const { locale } = Route.useSearch(); const { data: product } = useSuspenseQuery(productQuery(slug, locale)); const t = getTranslations(locale); if (!product) return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main className="px-6 py-24 text-center"><h1 className="text-display text-foreground">Product unavailable</h1><p className="mt-3 text-body text-muted-foreground">This product is no longer available in the marketplace.</p><Button asChild variant="outline" className="mt-7"><Link to="/shop" search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" }}>Back to shop</Link></Button></main><SiteFooter t={t} /></div>; return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><ProductDetailView product={product} locale={locale} /><SiteFooter t={t} /></div>; }
