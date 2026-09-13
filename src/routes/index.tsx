import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryRail, DiscoverySkeleton, ProductGrid, StoreRail } from "@/components/marketplace/discovery";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getDiscoveryData } from "@/lib/catalog.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

const homeQuery = (locale: string) => queryOptions({ queryKey: ["discovery", locale], queryFn: () => getDiscoveryData({ data: { locale } }) });

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(homeQuery(deps.locale)),
  pendingComponent: DiscoverySkeleton,
  errorComponent: () => <div role="alert" className="px-6 py-24 text-center text-muted-foreground">The marketplace could not be loaded. Please try again.</div>,
  notFoundComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">Nothing to discover yet.</div>,
  head: () => ({ meta: [{ title: "Modalia — Curated marketplace" }, { name: "description", content: "Discover considered products and independent stores on Modalia." }, { property: "og:title", content: "Modalia — Curated marketplace" }, { property: "og:description", content: "Discover considered products and independent stores on Modalia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/" }] }),
  component: HomePage,
});

function HomePage() {
  const { locale } = Route.useSearch(); const { data } = useSuspenseQuery(homeQuery(locale)); const t = getTranslations(locale); const hero = data.sections.find((section) => section.kind === "hero");
  const heroTitle = hero?.title || "A considered place for what matters."; const heroSubtitle = hero?.subtitle || "Discover products and stores selected for modern everyday life.";
  return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main><section className="relative overflow-hidden border-b border-border"><div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-end px-4 py-14 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:px-8 lg:py-20"><div className="relative z-10 max-w-3xl pb-5"><p className="text-eyebrow text-muted-foreground">Modalia</p><h1 className="mt-5 text-display text-foreground sm:text-6xl">{heroTitle}</h1><p className="mt-6 max-w-xl text-body text-muted-foreground">{heroSubtitle}</p><div className="mt-9 flex flex-wrap gap-3"><Button asChild size="lg"><Link to="/shop" search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" }}>{t.shell.explore}<ArrowRight /></Link></Button><Button asChild variant="outline" size="lg"><Link to="/become-a-seller">{t.nav.sellers}</Link></Button></div></div><div className="relative mt-10 aspect-[4/5] overflow-hidden bg-secondary lg:mt-0"><div className="absolute inset-x-0 bottom-0 border-t border-border p-5"><p className="text-eyebrow text-muted-foreground">Curated for now</p><p className="mt-2 text-h3 text-foreground">Products and stores appear here when they are approved.</p></div></div></div></section><DiscoverySections data={data} locale={locale} /></main><SiteFooter t={t} /></div>;
}

function DiscoverySections({ data, locale }: { data: Awaited<ReturnType<typeof getDiscoveryData>>; locale: ReturnType<typeof getLocale> }) { return <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6 lg:px-8"><section><SectionHeading eyebrow="Explore" title="Browse by category" href="/shop" locale={locale} /><CategoryRail categories={data.categories} locale={locale} /></section><section><SectionHeading eyebrow="Fresh selection" title="New arrivals" href="/shop" locale={locale} /><ProductGrid products={data.products.slice(0, 8)} locale={locale} emptyTitle="New arrivals will appear here" emptyText="Approved products automatically join this collection when they become available." /></section><section><SectionHeading eyebrow="Independent by design" title="Stores to discover" href="/shop" locale={locale} /><StoreRail stores={data.stores} /></section></div>; }
function SectionHeading({ eyebrow, title, href, locale }: { eyebrow: string; title: string; href: "/shop"; locale: ReturnType<typeof getLocale> }) { return <div className="mb-7 flex items-end justify-between gap-4"><div><p className="text-eyebrow text-muted-foreground">{eyebrow}</p><h2 className="mt-2 text-h3 text-foreground sm:text-2xl">{title}</h2></div><Link to={href} search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" }} className="inline-flex items-center gap-2 text-small font-medium text-foreground">View all <ArrowRight className="size-4" /></Link></div>; }