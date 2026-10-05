import type { CSSProperties, ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CategoryRail,
  DiscoverySkeleton,
  ProductGrid,
  StoreRail,
} from "@/components/marketplace/discovery";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { useReveal } from "@/hooks/use-reveal";
import { getDiscoveryData } from "@/lib/catalog.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

const homeQuery = (locale: string) =>
  queryOptions({
    queryKey: ["discovery", locale],
    queryFn: () => getDiscoveryData({ data: { locale } }),
  });

type HomeCopy = {
  heroEyebrow: string;
  heroFallbackTitle: string;
  heroFallbackSubtitle: string;
  trust: string[];
  exploreEyebrow: string;
  browseCategories: string;
  freshEyebrow: string;
  newArrivals: string;
  independentEyebrow: string;
  storesToDiscover: string;
  newArrivalsEmptyTitle: string;
  newArrivalsEmptyText: string;
};

const homeCopy: Record<SupportedLocale, HomeCopy> = {
  ar: {
    heroEyebrow: "موداليا · الجزائر",
    heroFallbackTitle: "وجهة مدروسة لكل ما يهمّك.",
    heroFallbackSubtitle: "اكتشف منتجات ومتاجر مختارة بعناية للحياة اليومية العصرية.",
    trust: ["الدفع عند الاستلام", "التوصيل إلى 58 ولاية", "متاجر مستقلة"],
    exploreEyebrow: "استكشف",
    browseCategories: "تصفّح حسب الفئة",
    freshEyebrow: "مختارات طازجة",
    newArrivals: "وصل حديثًا",
    independentEyebrow: "مستقلّة بالتصميم",
    storesToDiscover: "متاجر تستحق الاكتشاف",
    newArrivalsEmptyTitle: "المنتجات الجديدة ستظهر هنا",
    newArrivalsEmptyText: "المنتجات المعتمدة تنضم تلقائيًا إلى هذه المجموعة فور توفرها.",
  },
  fr: {
    heroEyebrow: "Modalia · Algérie",
    heroFallbackTitle: "Une destination pensée pour l’essentiel.",
    heroFallbackSubtitle:
      "Découvrez des produits et des boutiques sélectionnés avec soin pour le quotidien moderne.",
    trust: ["Paiement à la livraison", "Livraison vers 58 wilayas", "Boutiques indépendantes"],
    exploreEyebrow: "Explorer",
    browseCategories: "Parcourir par catégorie",
    freshEyebrow: "Sélection fraîche",
    newArrivals: "Nouveautés",
    independentEyebrow: "Indépendant par design",
    storesToDiscover: "Des boutiques à découvrir",
    newArrivalsEmptyTitle: "Les nouveautés apparaîtront ici",
    newArrivalsEmptyText:
      "Les produits approuvés rejoignent automatiquement cette collection dès leur disponibilité.",
  },
  en: {
    heroEyebrow: "Modalia · Algeria",
    heroFallbackTitle: "A considered place for what matters.",
    heroFallbackSubtitle: "Discover products and stores selected for modern everyday life.",
    trust: ["Cash on delivery", "58 wilayas", "Independent stores"],
    exploreEyebrow: "Explore",
    browseCategories: "Browse by category",
    freshEyebrow: "Fresh selection",
    newArrivals: "New arrivals",
    independentEyebrow: "Independent by design",
    storesToDiscover: "Stores to discover",
    newArrivalsEmptyTitle: "New arrivals will appear here",
    newArrivalsEmptyText:
      "Approved products automatically join this collection when they become available.",
  },
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(homeQuery(deps.locale)),
  pendingComponent: DiscoverySkeleton,
  errorComponent: () => (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      The marketplace could not be loaded. Please try again.
    </div>
  ),
  notFoundComponent: () => (
    <div className="px-6 py-24 text-center text-muted-foreground">Nothing to discover yet.</div>
  ),
  head: () => ({
    meta: [
      { title: "Modalia — Curated marketplace" },
      {
        name: "description",
        content: "Discover considered products and independent stores on Modalia.",
      },
      { property: "og:title", content: "Modalia — Curated marketplace" },
      {
        property: "og:description",
        content: "Discover considered products and independent stores on Modalia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section
      ref={ref}
      className="reveal"
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </section>
  );
}

function HomePage() {
  const { locale } = Route.useSearch();
  const { data } = useSuspenseQuery(homeQuery(locale));
  const t = getTranslations(locale);
  const copy = homeCopy[locale];
  const hero = data.sections.find((section) => section.kind === "hero");
  const heroTitle = hero?.title || copy.heroFallbackTitle;
  const heroSubtitle = hero?.subtitle || copy.heroFallbackSubtitle;
  const shopSearch = {
    locale,
    q: "",
    category: "",
    sort: "newest",
    page: 1,
    focus: "",
    view: "",
  } as const;
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main>
        <section className="hero-scene overflow-hidden border-b border-border bg-ink text-primary-foreground">
          <div className="hero-grid" />
          <div className="hero-orb hero-orb-a" />
          <div className="hero-orb hero-orb-b" />
          <div className="hero-ring hero-ring-a" />
          <div className="hero-ring hero-ring-b" />
          <div className="hero-product hero-product-a" aria-hidden>
            <span className="hero-product-inner">M</span>
          </div>
          <div className="hero-product hero-product-b" aria-hidden>
            <span className="hero-product-inner text-3xl">M</span>
          </div>
          <div className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-end px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <div className="hero-copy max-w-3xl pb-5">
              <p className="flex items-center gap-3 text-eyebrow tracking-[0.18em] text-white/50">
                <span className="h-px w-8 bg-white/40" aria-hidden />
                {copy.heroEyebrow}
              </p>
              <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
                {heroTitle}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">{heroSubtitle}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="border-0 bg-white text-neutral-900 shadow-xl hover:bg-neutral-200"
                >
                  <Link to="/shop" search={shopSearch}>
                    {t.shell.explore}
                    <ArrowRight className="rtl:rotate-180" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-white/25 bg-white/5 text-white backdrop-blur-sm hover:bg-white/15 hover:text-white"
                >
                  <Link to="/become-a-seller" search={{ locale }}>
                    {t.nav.sellers}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
        <div className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6 lg:px-8">
            {copy.trust.map((item, index) => (
              <span
                key={item}
                className="flex items-center gap-4 text-caption font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                {index > 0 ? <span className="size-1 rounded-full bg-border" aria-hidden /> : null}
                {item}
              </span>
            ))}
          </div>
        </div>
        <DiscoverySections data={data} locale={locale} copy={copy} viewAll={t.common.viewAll} />
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}

function DiscoverySections({
  data,
  locale,
  copy,
  viewAll,
}: {
  data: Awaited<ReturnType<typeof getDiscoveryData>>;
  locale: SupportedLocale;
  copy: HomeCopy;
  viewAll: string;
}) {
  const shopSearch = {
    locale,
    q: "",
    category: "",
    sort: "newest",
    page: 1,
    focus: "",
    view: "",
  } as const;
  return (
    <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6 lg:px-8">
      <Reveal>
        <SectionHeading
          eyebrow={copy.exploreEyebrow}
          title={copy.browseCategories}
          href="/shop"
          search={shopSearch}
          viewAll={viewAll}
        />
        <CategoryRail categories={data.categories} locale={locale} />
      </Reveal>
      <Reveal delay={80}>
        <SectionHeading
          eyebrow={copy.freshEyebrow}
          title={copy.newArrivals}
          href="/shop"
          search={shopSearch}
          viewAll={viewAll}
        />
        <ProductGrid
          products={data.products.slice(0, 8)}
          locale={locale}
          emptyTitle={copy.newArrivalsEmptyTitle}
          emptyText={copy.newArrivalsEmptyText}
        />
      </Reveal>
      <Reveal delay={120}>
        <SectionHeading
          eyebrow={copy.independentEyebrow}
          title={copy.storesToDiscover}
          href="/shop"
          search={shopSearch}
          viewAll={viewAll}
        />
        <StoreRail stores={data.stores} locale={locale} />
      </Reveal>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
  search,
  viewAll,
}: {
  eyebrow: string;
  title: string;
  href: "/shop";
  search: {
    locale: SupportedLocale;
    q: string;
    category: string;
    sort: string;
    page: number;
    focus: string;
    view: string;
  };
  viewAll: string;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-2 text-h3 text-foreground sm:text-2xl">{title}</h2>
      </div>
      <Link
        to={href}
        search={search}
        className="group inline-flex shrink-0 items-center gap-2 text-small font-medium text-foreground"
      >
        {viewAll}
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" />
      </Link>
    </div>
  );
}
