import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  Apple,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  MapPin,
  Play,
  Smartphone,
  Star,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceTier } from "@/hooks/use-device-tier";
import { DiscoverySkeleton, ProductCard } from "@/components/marketplace/discovery";
import { OfficialStoreBadge, VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { useReveal } from "@/hooks/use-reveal";
import { useParallax } from "@/hooks/use-parallax";
import { Magnetic, Marquee, TextReveal, ImageReveal } from "@/components/motion";
import {
  getDiscoveryData,
  type CatalogProduct,
  type CatalogStore,
  type HomepageSection,
} from "@/lib/catalog.functions";
import { pageHead, siteMeta, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { subscribeNewsletter } from "@/lib/engagement.functions";
import { getBestsellers, getTrendingProducts } from "@/lib/analytics.functions";
import { getFeaturedReviews, type FeaturedReview } from "@/lib/reviews.functions";
import { getRecentlyViewed, track } from "@/lib/analytics";
import { getLocale, getTranslations, localeDirections, type Translation } from "@/lib/i18n";
import { formatPrice } from "@/lib/i18n/format";
import type { SupportedLocale } from "@/config/platform";

const HeroScene = lazy(() =>
  import("@/components/commerce/HeroScene").then((m) => ({ default: m.HeroScene })),
);

const homeQuery = (locale: string) =>
  queryOptions({
    queryKey: ["discovery", locale],
    queryFn: () => getDiscoveryData({ data: { locale } }),
  });

type HomeCopy = Translation["home"];

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(homeQuery(deps.locale)),
  pendingComponent: DiscoverySkeleton,
  errorComponent: HomeError,
  notFoundComponent: HomeNotFound,
  head: (context) => {
    const rawSearch = (context as unknown as { search?: Record<string, unknown> }).search ?? {};
    const locale = getLocale(typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined);
    const meta = siteMeta(locale);
    return pageHead({
      title: meta.title,
      description: meta.description,
      path: "/",
      jsonLd: [organizationJsonLd(), websiteJsonLd()],
    });
  },
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

/** Reads structured JSON from a homepage section's `content` field (defensive: may be a JSON string). */
function sectionContent(section: HomepageSection | undefined): Record<string, unknown> {
  const raw = section?.content;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw))
    return raw as Record<string, unknown>;
  return {};
}

function contentText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function contentDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function contentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("https://") || trimmed.startsWith("http://"))
    return trimmed;
  return null;
}

/** Brief cinematic brand entrance. Skipped entirely under reduced-motion. */
function BrandEntrance() {
  const [done, setDone] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReducedMotion(true);
      return;
    }
    const id = window.setTimeout(() => setDone(true), 1250);
    return () => window.clearTimeout(id);
  }, []);

  if (done || reducedMotion) return null;
  return (
    <div aria-hidden className="brand-entrance fixed inset-0 z-50 grid place-items-center bg-ink">
      <p className="brand-entrance-word font-display text-4xl font-semibold tracking-[0.35em] text-white sm:text-5xl">
        {"MODALIA".split("").map((letter, index) => (
          <span key={index}>{letter}</span>
        ))}
      </p>
    </div>
  );
}

/** Cinematic hero: editorial split — massive staggered typography beside a real
    featured product. WebGL scene on capable devices; quiet textured fallback otherwise. */
function Hero({
  locale,
  hero,
  copy,
  products,
}: {
  locale: SupportedLocale;
  hero: HomepageSection | undefined;
  copy: HomeCopy;
  products: CatalogProduct[];
}) {
  const t = getTranslations(locale);
  const title = hero?.title || copy.heroFallbackTitle;
  const subtitle = hero?.subtitle || copy.heroFallbackSubtitle;
  const { tier, webgl, reducedMotion } = useDeviceTier();
  // Tier-adaptive hero: high gets full WebGL, mid gets the lite scene,
  // everything else keeps the quiet editorial fallback.
  const showWebGL = (tier === "high" || tier === "mid") && webgl && !reducedMotion;
  const featured = products.find((p) => p.imagePath);
  // Real product imagery for the 3D showcase: first 4 products with images.
  const showcaseProducts = products
    .filter((p) => p.imagePath)
    .slice(0, 4)
    .map((p) => ({ imagePath: p.imagePath as string, name: p.name, slug: p.slug }));
  const shopSearch: ShopSearch = { locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "", brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false };
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      {showWebGL ? (
        <Suspense fallback={null}>
          <HeroScene
            className="absolute inset-0"
            locale={locale}
            quality={tier === "high" ? "full" : "lite"}
            products={showcaseProducts}
          />
        </Suspense>
      ) : (
        <div className="hero-fallback" aria-hidden />
      )}
      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:py-20">
        <div className="lg:col-span-7">
          <p
            className="hero-line flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="h-px w-10 bg-brand" aria-hidden />
            {copy.heroEyebrow}
          </p>
          <h1
            className="hero-line mt-6 font-display text-[clamp(2.9rem,7.5vw,6rem)] font-semibold leading-[1.02] tracking-[-0.02em] text-white"
            style={{ animationDelay: "0.18s" }}
          >
            {title}
          </h1>
          <p
            className="hero-line mt-6 max-w-xl text-lg leading-relaxed text-white/70"
            style={{ animationDelay: "0.32s" }}
          >
            {subtitle}
          </p>
          <div
            className="hero-line mt-10 flex flex-wrap items-center gap-x-8 gap-y-4"
            style={{ animationDelay: "0.46s" }}
          >
            <Magnetic strength={0.25}>
              <Button
                asChild
                size="lg"
                className="border-0 bg-white px-8 text-neutral-900 hover:bg-neutral-200"
              >
                <Link to="/shop" search={shopSearch}>
                  {t.shell.explore}
                  <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
            </Magnetic>
            <Link
              to="/shop"
              search={{ ...shopSearch, onSale: true }}
              className="group inline-flex items-center gap-2 text-[15px] font-medium text-white/85 transition-colors hover:text-white"
            >
              {copy.offersTitle}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 motion-reduce:transition-none" />
            </Link>
          </div>
        </div>
        {featured?.imagePath ? (
          <div className="hero-line lg:col-span-5" style={{ animationDelay: "0.6s" }}>
            <Link
              to="/product/$slug"
              params={{ slug: featured.slug }}
              search={{ locale }}
              className="group mx-auto block max-w-sm lg:ms-auto lg:max-w-none"
              aria-label={featured.name}
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-white/5">
                <img
                  src={featured.imagePath}
                  alt={featured.name}
                  loading="eager"
                  className="size-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <p className="truncate font-display text-lg font-medium text-white">
                  {featured.name}
                </p>
                <p className="shrink-0 text-[15px] font-medium tabular-nums text-white/75">
                  {formatPrice(featured.price, locale)}
                </p>
              </div>
              {featured.storeName ? (
                <p className="mt-1 text-[13px] uppercase tracking-[0.12em] text-white/45">
                  {featured.storeName}
                </p>
              ) : null}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

type ShopSearch = {
  locale: SupportedLocale;
  q: string;
  category: string;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
  focus: string;
  view: "" | "categories" | "stores";
  brands: string[];
  stores: string[];
  colors: string[];
  sizes: string[];
  inStock: boolean;
  onSale: boolean;
};

/** Editorial section heading: eyebrow, large display title, view-all.
    Tones vary the rhythm so repeated rails never read as copies. */
function SectionHeading({
  eyebrow,
  title,
  href,
  search,
  viewAll,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  href: "/shop";
  search: ShopSearch;
  viewAll: string;
  tone?: "default" | "rule" | "minimal";
}) {
  if (tone === "rule") {
    return (
      <div className="mb-7 sm:mb-9">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
          <Link
            to={href}
            search={search}
            className="group inline-flex shrink-0 items-center gap-2 text-small font-medium text-foreground"
          >
            {viewAll}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        </div>
        <h2 className="mt-3 max-w-2xl font-display text-[clamp(1.9rem,4.5vw,3rem)] font-semibold leading-[1.06] tracking-tight text-foreground">
          {title}
        </h2>
        <div className="mt-5 h-px bg-border" aria-hidden />
      </div>
    );
  }
  if (tone === "minimal") {
    return (
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          <span className="me-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </span>
          {title}
        </h2>
        <Link
          to={href}
          search={search}
          className="group inline-flex shrink-0 items-center gap-1.5 text-small font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {viewAll}
          <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </div>
    );
  }
  return (
    <div className="mb-7 flex items-end justify-between gap-4 sm:mb-9">
      <div>
        <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-2 font-display text-[clamp(1.6rem,4vw,2.5rem)] font-semibold leading-[1.08] tracking-tight text-foreground">
          {title}
        </h2>
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

/** Slim trust strip directly under the hero: real service facts only. */
function TrustStrip({ copy }: { copy: HomeCopy }) {
  const icons = { cash: Banknote, map: MapPin, store: Store } as const;
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 overflow-x-auto px-4 py-4 sm:px-6 lg:px-8">
        {copy.trust.map((item) => {
          const Icon = icons[item.icon];
          return (
            <p
              key={item.label}
              className="flex shrink-0 items-center gap-2.5 text-small font-medium text-foreground"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {item.label}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/** Scrolling brand-values ticker: the same real trust facts as the static
    strip below, in an editorial display treatment. No invented claims. */
function TrustMarquee({ copy }: { copy: HomeCopy }) {
  return (
    <div className="overflow-hidden border-b border-white/10 bg-ink py-5">
      <Marquee speed="slow">
        {copy.trust.map((item) => (
          <span
            key={item.label}
            className="mx-7 inline-flex items-center gap-7 whitespace-nowrap font-display text-xl font-semibold tracking-tight text-white/85 sm:text-2xl"
          >
            {item.label}
            <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
          </span>
        ))}
      </Marquee>
    </div>
  );
}

/** Editorial category discovery: asymmetric typographic grid, mobile-first. */
function CategoryGrid({
  categories,
  locale,
  copy,
  viewAll,
  shopSearch,
}: {
  categories: { id: string; slug: string; name: string; productCount: number }[];
  locale: SupportedLocale;
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const t = getTranslations(locale).card;
  const tileClass = (index: number): string => {
    const base =
      "group relative flex min-h-44 flex-col justify-between overflow-hidden border p-5 transition-colors duration-300 motion-reduce:transition-none sm:p-6";
    if (index === 0)
      return `${base} col-span-2 min-h-64 border-transparent bg-ink text-white sm:min-h-80 lg:col-span-7 lg:row-span-2 lg:min-h-[30rem]`;
    if (index === 1 || index === 2) return `${base} border-border bg-card hover:bg-secondary/60 lg:col-span-5 lg:min-h-60`;
    if (index >= 3 && index <= 5) return `${base} border-border bg-card hover:bg-secondary/60 lg:col-span-4 lg:min-h-56`;
    return `${base} border-border bg-card hover:bg-secondary/60 lg:col-span-6 lg:min-h-52`;
  };
  return (
    <Reveal>
      <SectionHeading
        eyebrow={copy.exploreEyebrow}
        title={copy.browseCategories}
        href="/shop"
        search={shopSearch}
        viewAll={viewAll}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
        {categories.slice(0, 9).map((category, index) => {
          const featured = index === 0;
          return (
            <Link
              key={category.id}
              to="/category/$slug"
              params={{ slug: category.slug }}
              search={{ locale }}
              className={tileClass(index)}
            >
              {featured ? (
                <div className="hero-orb hero-orb-b pointer-events-none" aria-hidden />
              ) : null}
              <p
                aria-hidden
                className={
                  featured
                    ? "relative font-display text-sm font-semibold tabular-nums text-white/40"
                    : "font-display text-sm font-semibold tabular-nums text-muted-foreground/60"
                }
              >
                {String(index + 1).padStart(2, "0")}
              </p>
              <div className="relative">
                <p
                  className={
                    featured
                      ? "font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-tight"
                      : "text-h3 text-foreground"
                  }
                >
                  {category.name}
                </p>
                <p
                  className={
                    featured
                      ? "mt-2 text-small text-white/60"
                      : "mt-1 text-caption text-muted-foreground"
                  }
                >
                  {t.productsCount(category.productCount)}
                </p>
                <ArrowRight
                  className={`${featured ? "text-white/60" : "text-muted-foreground"} mt-4 size-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 motion-reduce:transition-none`}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </Reveal>
  );
}

/** Editorial campaign: full-bleed visual storytelling from the section's real content. */
function EditorialSection({
  section,
  copy,
}: {
  section: HomepageSection;
  copy: HomeCopy;
}) {
  const content = sectionContent(section);
  const image = contentText(content["image"]);
  const imageAlt = contentText(content["image_alt"]);
  const ctaLabel = contentText(content["cta_label"]);
  const ctaHref = contentUrl(content["cta_href"]);
  return (
    <Reveal>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        {image ? (
          <section className="relative flex min-h-[70svh] items-end overflow-hidden bg-ink">
            <ImageReveal
              src={image}
              alt={imageAlt || section.title || ""}
              aspect=""
              className="absolute inset-0"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
              aria-hidden
            />
            <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
              <p className="flex items-center gap-3 text-eyebrow tracking-[0.18em] text-white/60">
                <span className="h-px w-8 bg-white/40" aria-hidden />
                {copy.editorialEyebrow}
              </p>
              <TextReveal
                as="h2"
                text={section.title || ""}
                className="mt-4 max-w-3xl font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.05] tracking-tight text-white"
              />
              {section.subtitle ? (
                <p className="mt-4 max-w-xl text-body leading-relaxed text-white/75">
                  {section.subtitle}
                </p>
              ) : null}
              {ctaLabel && ctaHref ? (
                <div className="mt-8">
                  <Button asChild size="lg" className="border-0 bg-white text-neutral-900 hover:bg-neutral-200">
                    <a href={ctaHref}>{ctaLabel}</a>
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="border-y border-border bg-card px-4 py-16 text-center sm:py-20">
            <p className="text-eyebrow text-muted-foreground">{copy.editorialEyebrow}</p>
            <TextReveal
              as="h2"
              text={section.title || ""}
              className="mx-auto mt-3 max-w-3xl font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.05] tracking-tight text-foreground"
            />
            {section.subtitle ? (
              <p className="mx-auto mt-4 max-w-xl text-body leading-relaxed text-muted-foreground">
                {section.subtitle}
              </p>
            ) : null}
            {ctaLabel && ctaHref ? (
              <div className="mt-8">
                <Button asChild size="lg">
                  <a href={ctaHref}>{ctaLabel}</a>
                </Button>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </Reveal>
  );
}

/** Trending: editorial horizontal rail of real products. */
function TrendingSection({
  locale,
  section,
  products,
  copy,
  viewAll,
  shopSearch,
}: {
  locale: SupportedLocale;
  section: HomepageSection;
  products: CatalogProduct[];
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  return (
    <Reveal>
      <SectionHeading
        eyebrow={copy.trendingEyebrow}
        title={section.title || copy.trendingTitle}
        href="/shop"
        search={shopSearch}
        viewAll={viewAll}
      />
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:pb-0">
        {products.slice(0, 6).map((product) => (
          <div key={product.id} className="w-52 shrink-0 snap-start sm:w-60">
            <ProductCard product={product} locale={locale} />
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/**
 * "Best sellers" ranked by real sold quantity across non-cancelled orders.
 * Renders nothing until real sales exist — never a fabricated ranking.
 */
function BestsellersSection({
  locale,
  copy,
  viewAll,
  shopSearch,
}: {
  locale: SupportedLocale;
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const { data } = useQuery({
    queryKey: ["bestsellers", locale],
    queryFn: () => getBestsellers({ data: { limit: 8, locale } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data?.hasData || data.products.length === 0) return null;
  return (
    <Reveal>
      <SectionHeading
        eyebrow={copy.bestsellersEyebrow}
        title={copy.bestsellersTitle}
        href="/shop"
        search={shopSearch}
        viewAll={viewAll}
        tone="rule"
      />
      <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 lg:pb-0">
        {data.products.map((product, index) => (
          <div key={product.id} className="w-52 shrink-0 snap-start sm:w-60">
            <p
              aria-hidden
              className="mb-2 font-display text-3xl font-semibold tabular-nums text-muted-foreground/45"
            >
              {String(index + 1).padStart(2, "0")}
            </p>
            <ProductCard product={product} locale={locale} />
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/**
 * "Most viewed this week" from genuine product_view events. Renders nothing
 * until real data exists -- never a fabricated ranking.
 */
function PopularNow({
  locale,
  copy,
  viewAll,
  shopSearch,
}: {
  locale: SupportedLocale;
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const { data } = useQuery({
    queryKey: ["trending-products", locale],
    queryFn: () => getTrendingProducts({ data: { days: 7, limit: 8, locale } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data?.hasData || data.products.length === 0) return null;
  return (
    <Reveal>
      <SectionHeading
        eyebrow={copy.popularEyebrow}
        title={copy.popularTitle}
        href="/shop"
        search={shopSearch}
        viewAll={viewAll}
        tone="minimal"
      />
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:pb-0">
        {data.products.map((product) => (
          <div key={product.id} className="w-52 shrink-0 snap-start sm:w-60">
            <ProductCard product={product} locale={locale} />
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/** New arrivals: newest published products first, asymmetric rail rhythm. */
function NewArrivalsSection({
  locale,
  products,
  title,
  copy,
  viewAll,
  shopSearch,
}: {
  locale: SupportedLocale;
  products: CatalogProduct[];
  title: string;
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const newest = [...products]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
  if (!newest.length) return null;
  return (
    <Reveal>
      <SectionHeading
        eyebrow={copy.freshEyebrow}
        title={title}
        href="/shop"
        search={shopSearch}
        viewAll={viewAll}
        tone="rule"
      />
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:pb-0">
        {newest.map((product, index) => (
          <div
            key={product.id}
            className={`shrink-0 snap-start ${index % 2 === 0 ? "w-52 sm:w-60" : "w-60 sm:w-72"}`}
          >
            <ProductCard product={product} locale={locale} />
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/** Offers: real compare-at discounts only, in a dark sale band that breaks the
    page rhythm. Hidden when none. */
function OffersSection({
  locale,
  products,
  copy,
  viewAll,
  shopSearch,
}: {
  locale: SupportedLocale;
  products: CatalogProduct[];
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const offers = products
    .filter((p) => p.compareAtPrice != null && p.compareAtPrice > p.price)
    .sort(
      (a, b) =>
        (b.compareAtPrice as number) / b.price - (a.compareAtPrice as number) / a.price,
    )
    .slice(0, 8);
  if (!offers.length) return null;
  return (
    <Reveal>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <section className="bg-ink text-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
              <div>
                <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">
                  <span className="h-px w-8 bg-brand" aria-hidden />
                  {copy.offersEyebrow}
                </p>
                <h2 className="mt-3 font-display text-[clamp(1.9rem,4.5vw,3rem)] font-semibold leading-[1.06] tracking-tight text-white">
                  {copy.offersTitle}
                </h2>
              </div>
              <Link
                to="/shop"
                search={{ ...shopSearch, onSale: true }}
                className="group inline-flex shrink-0 items-center gap-2 text-small font-medium text-white/85 transition-colors hover:text-white"
              >
                {viewAll}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </div>
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:pb-0">
              {offers.map((product) => (
                <div key={product.id} className="w-52 shrink-0 snap-start sm:w-60">
                  <ProductCard product={product} locale={locale} dark />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Reveal>
  );
}

/** Flash sale: real countdown from the section content's starts_at/ends_at. Counter hidden when dates are absent. */
function FlashSaleSection({
  locale,
  section,
  products,
  copy,
  viewAll,
  shopSearch,
}: {
  locale: SupportedLocale;
  section: HomepageSection;
  products: CatalogProduct[];
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const content = sectionContent(section);
  const startsAt = contentDate(content["starts_at"]);
  const endsAt = contentDate(content["ends_at"]);
  const [now, setNow] = useState(() => Date.now());
  // Subtle scroll parallax on the sale band background.
  const bandRef = useParallax<HTMLElement>(0.15);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!endsAt || endsAt <= now) return null;

  const target = startsAt && now < startsAt ? startsAt : endsAt;
  const label = target === startsAt ? copy.startsIn : copy.endsIn;
  const diff = Math.max(0, target - now);
  const units = [
    { value: Math.floor(diff / 86_400_000), label: copy.days },
    { value: Math.floor(diff / 3_600_000) % 24, label: copy.hours },
    { value: Math.floor(diff / 60_000) % 60, label: copy.minutes },
    { value: Math.floor(diff / 1000) % 60, label: copy.seconds },
  ];

  return (
    <Reveal>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <section ref={bandRef} className="overflow-hidden bg-ink text-primary-foreground">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8 lg:py-20">
            <div>
              <p className="flex items-center gap-3 text-eyebrow tracking-[0.18em] text-white/50">
                <span className="h-px w-8 bg-white/40" aria-hidden />
                {copy.flashEyebrow}
              </p>
              <h2 className="mt-4 font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.05] tracking-tight text-white">
                {section.title || copy.flashEyebrow}
              </h2>
              {section.subtitle ? (
                <p className="mt-4 max-w-md text-body leading-relaxed text-white/70">
                  {section.subtitle}
                </p>
              ) : null}
              <div className="mt-8" role="timer" aria-live="off">
                <p className="text-caption uppercase tracking-[0.14em] text-white/50">{label}</p>
                <div className="mt-3 flex gap-2" dir="ltr">
                  {units.map((unit) => (
                    <div
                      key={unit.label}
                      className="grid min-w-14 place-items-center bg-white/8 px-2 py-2.5 backdrop-blur-sm sm:min-w-16 sm:px-3"
                    >
                      <span className="font-display text-2xl font-semibold tabular-nums text-white">
                        {String(unit.value).padStart(2, "0")}
                      </span>
                      <span className="mt-0.5 text-caption text-white/55">{unit.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                to="/shop"
                search={shopSearch}
                className="group mt-8 inline-flex items-center gap-2 text-small font-medium text-white"
              >
                {viewAll}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </div>
            {products.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {products.slice(0, 4).map((product) => (
                  <div key={product.id} className="w-36 shrink-0 sm:w-40">
                    <ProductCard product={product} locale={locale} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Reveal>
  );
}

/**
 * Featured stores as brands: real banner, logo, verification, product preview.
 * Hidden when no stores exist.
 */
function BrandStores({
  stores,
  products,
  locale,
  title,
  copy,
  viewAll,
  shopSearch,
}: {
  stores: CatalogStore[];
  products: CatalogProduct[];
  locale: SupportedLocale;
  title: string;
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const storeT = getTranslations(locale).store;
  const cardT = getTranslations(locale).card;
  return (
    <Reveal>
      <SectionHeading
        eyebrow={copy.independentEyebrow}
        title={title}
        href="/shop"
        search={shopSearch}
        viewAll={viewAll}
      />
      <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {stores.slice(0, 6).map((store) => {
          const featured = products.find((p) => p.storeName === store.name && p.imagePath);
          return (
            <Link
              key={store.id}
              to="/store/$slug"
              params={{ slug: store.slug }}
              search={{ locale }}
              className="group block min-w-0"
              aria-label={store.name}
            >
              <div className="relative">
                {store.bannerPath ? (
                  <div className="aspect-[21/9] overflow-hidden bg-muted">
                    <img
                      src={store.bannerPath}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  </div>
                ) : (
                  <div
                    className="flex aspect-[21/9] items-center justify-center bg-muted"
                    aria-hidden
                  >
                    <span className="font-display text-5xl font-semibold tracking-tight text-foreground/10">
                      {store.name.slice(0, 1)}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-0 start-6 translate-y-1/2">
                  {store.logoPath ? (
                    <img
                      src={store.logoPath}
                      alt=""
                      loading="lazy"
                      className="size-16 shrink-0 rounded-full bg-background object-cover ring-2 ring-background"
                    />
                  ) : (
                    <div
                      className="grid size-16 shrink-0 place-items-center rounded-full bg-secondary font-display text-xl font-semibold text-foreground ring-2 ring-background"
                      aria-hidden
                    >
                      {store.name.slice(0, 1)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-10 flex items-start justify-between gap-4 px-1">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-display text-xl font-semibold leading-snug text-foreground">
                    <span className="truncate transition-colors group-hover:text-foreground/70">
                      {store.name}
                    </span>
                    {store.slug === "modalia" ? (
                      <OfficialStoreBadge label={storeT.officialStore} />
                    ) : (
                      <VerifiedSellerBadge verified={store.verified} label={storeT.verifiedStore} />
                    )}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {cardT.productsCount(store.productCount)}
                  </p>
                </div>
                {featured?.imagePath ? (
                  <img
                    src={featured.imagePath as string}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="size-16 shrink-0 rounded-lg bg-muted object-cover"
                  />
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </Reveal>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <p className="flex gap-0.5" aria-label={`${rating}/5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden
          className={`size-3.5 ${index < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35"}`}
        />
      ))}
    </p>
  );
}

function ReviewCard({ review, locale }: { review: FeaturedReview; locale: SupportedLocale }) {
  return (
    <figure className="w-80 shrink-0 snap-start sm:w-[26rem]">
      <Stars rating={review.rating} />
      <blockquote className="mt-5 font-display text-[clamp(1.25rem,2.5vw,1.75rem)] font-medium leading-[1.3] tracking-tight text-foreground">
        &ldquo;{review.body}&rdquo;
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-2 text-small text-muted-foreground">
        <span className="font-semibold text-foreground">{review.reviewerName}</span>
        {review.verifiedPurchase ? (
          <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
        ) : null}
        <span aria-hidden>·</span>
        <Link
          to="/product/$slug"
          params={{ slug: review.productSlug }}
          search={{ locale }}
          className="truncate transition-colors hover:text-foreground"
        >
          {review.productName}
        </Link>
      </figcaption>
    </figure>
  );
}

/**
 * Customer reviews: latest admin-approved reviews with written bodies.
 * Hidden until real approved reviews exist — never invented quotes.
 */
function TestimonialsSection({
  locale,
  copy,
}: {
  locale: SupportedLocale;
  copy: HomeCopy;
}) {
  const { data } = useQuery({
    queryKey: ["featured-reviews", locale],
    queryFn: () => getFeaturedReviews({ data: { limit: 8, locale } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data?.hasData || data.reviews.length === 0) return null;
  return (
    <Reveal>
      <div className="mb-8 sm:mb-10">
        <p className="text-eyebrow text-muted-foreground">{copy.reviewsEyebrow}</p>
        <h2 className="mt-2 max-w-2xl font-display text-[clamp(1.9rem,4.5vw,3rem)] font-semibold leading-[1.06] tracking-tight text-foreground">
          {copy.reviewsTitle}
        </h2>
      </div>
      <div className="flex snap-x snap-mandatory gap-10 overflow-x-auto pb-2 sm:gap-16 lg:pb-0">
        {data.reviews.map((review) => (
          <ReviewCard key={review.id} review={review} locale={locale} />
        ))}
      </div>
    </Reveal>
  );
}

/**
 * "Recently viewed" from first-party localStorage only. No network, no
 * tracking -- purely the visitor's own device history.
 */
function RecentlyViewed({
  locale,
  copy,
  viewAll,
  shopSearch,
}: {
  locale: SupportedLocale;
  copy: HomeCopy;
  viewAll: string;
  shopSearch: ShopSearch;
}) {
  const [items, setItems] = useState<CatalogProduct[]>(() =>
    getRecentlyViewed().map(
      (p): CatalogProduct => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        storeName: "",
        categorySlug: null,
        imagePath: p.image,
        imageAlt: p.name,
        createdAt: "",
      }),
    ),
  );
  if (items.length === 0) return null;
  return (
    <Reveal>
      <SectionHeading
        eyebrow={copy.recentEyebrow}
        title={copy.recentTitle}
        href="/shop"
        search={shopSearch}
        viewAll={viewAll}
        tone="minimal"
      />
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:pb-0">
        {items.map((product) => (
          <div key={product.id} className="w-52 shrink-0 snap-start sm:w-60">
            <ProductCard product={product} locale={locale} />
          </div>
        ))}
      </div>
    </Reveal>
  );
}

type BlogPost = {
  title: string;
  excerpt: string;
  image: string | null;
  href: string | null;
};

/**
 * Journal: renders only real posts configured in the section content
 * (Admin → Homepage → Blog). Hidden when none exist.
 */
function BlogSection({
  section,
  copy,
}: {
  section: HomepageSection;
  copy: HomeCopy;
}) {
  const content = sectionContent(section);
  const raw = content["posts"];
  const posts: BlogPost[] = Array.isArray(raw)
    ? raw
        .map((item): BlogPost | null => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const title = contentText(record["title"]);
          if (!title) return null;
          return {
            title,
            excerpt: contentText(record["excerpt"]),
            image: contentText(record["image"]) || null,
            href: contentUrl(record["href"]),
          };
        })
        .filter((post): post is BlogPost => post !== null)
    : [];
  if (!posts.length) return null;
  const first = posts[0] as BlogPost;
  const rest = posts.slice(1);
  return (
    <Reveal>
      <div className="mb-7 sm:mb-9">
        <p className="text-eyebrow text-muted-foreground">{copy.blogEyebrow}</p>
        <h2 className="mt-2 font-display text-[clamp(1.6rem,4vw,2.5rem)] font-semibold leading-[1.08] tracking-tight text-foreground">
          {section.title || copy.blogTitle}
        </h2>
      </div>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <PostCard post={first} featured />
        {rest.slice(0, 2).map((post) => (
          <PostCard key={post.title} post={post} />
        ))}
      </div>
    </Reveal>
  );
}

function PostCard({ post, featured }: { post: BlogPost; featured?: boolean }) {
  const inner = (
    <>
      {post.image ? (
        <div
          className={`relative overflow-hidden bg-muted ${featured ? "aspect-[16/10]" : "aspect-[16/9]"}`}
        >
          <img
            src={post.image}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>
      ) : null}
      <div className={featured ? "mt-5" : "mt-4"}>
        <h3
          className={`font-display font-semibold tracking-tight text-foreground ${
            featured ? "text-[clamp(1.4rem,3vw,2rem)]" : "text-h3"
          }`}
        >
          {post.title}
        </h3>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-2 text-small leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        ) : null}
        <p className="mt-3 inline-flex items-center gap-1.5 text-small font-medium text-foreground">
          <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
        </p>
      </div>
    </>
  );
  const className = `group block ${featured ? "lg:col-span-2" : ""}`;
  return post.href ? (
    <a href={post.href} className={className}>
      {inner}
    </a>
  ) : (
    <article className={className}>{inner}</article>
  );
}

/**
 * App banner: renders only when the section content carries at least one
 * real store URL. Hidden otherwise — no invented "coming soon" claims.
 */
function AppBannerSection({
  section,
  copy,
}: {
  section: HomepageSection;
  copy: HomeCopy;
}) {
  const content = sectionContent(section);
  const iosUrl = contentUrl(content["ios_url"]);
  const androidUrl = contentUrl(content["android_url"]);
  if (!iosUrl && !androidUrl) return null;
  const image = contentText(content["image"]);
  return (
    <Reveal>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <section className="overflow-hidden bg-ink text-primary-foreground">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20">
            <div>
              <p className="flex items-center gap-3 text-eyebrow tracking-[0.18em] text-white/50">
                <Smartphone className="size-4" aria-hidden />
                Modalia
              </p>
              <h2 className="mt-4 font-display text-[clamp(1.9rem,4.5vw,3.25rem)] font-semibold leading-[1.06] tracking-tight text-white">
                {section.title || copy.appTitle}
              </h2>
              <p className="mt-4 max-w-md text-body leading-relaxed text-white/70">
                {section.subtitle || copy.appText}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {iosUrl ? (
                  <Button
                    asChild
                    size="lg"
                    className="border-0 bg-white text-neutral-900 hover:bg-neutral-200"
                  >
                    <a href={iosUrl} rel="noopener">
                      <Apple className="size-5" aria-hidden />
                      {copy.appStoreLabel}
                    </a>
                  </Button>
                ) : null}
                {androidUrl ? (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/25 bg-white/5 text-white backdrop-blur-sm hover:bg-white/15 hover:text-white"
                  >
                    <a href={androidUrl} rel="noopener">
                      <Play className="size-5" aria-hidden />
                      {copy.playLabel}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
            {image ? (
              <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
                <img src={image} alt="" loading="lazy" className="w-full object-cover" />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Reveal>
  );
}

/** Newsletter band using the existing subscribeNewsletter server function. */
function NewsletterBand({ locale, copy }: { locale: SupportedLocale; copy: HomeCopy }) {
  const t = getTranslations(locale);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const value = email.trim();
    if (!value) return;
    setPending(true);
    setStatus("idle");
    try {
      await subscribeNewsletter({ data: { email: value, locale } });
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Reveal>
      <section className="border-y border-border px-4 py-16 text-center sm:py-20">
        <h2 className="mx-auto mt-3 max-w-xl font-display text-[clamp(1.6rem,4vw,2.5rem)] font-semibold tracking-tight text-foreground">
          {copy.newsletterTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-body text-muted-foreground">{copy.newsletterText}</p>
        <form onSubmit={onSubmit} className="mx-auto mt-6 flex max-w-md gap-2">
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t.footer.newsletterPlaceholder}
            aria-label={t.footer.newsletterTitle}
            disabled={pending}
            className="h-11 min-w-0 flex-1"
          />
          <Button type="submit" className="h-11 shrink-0" disabled={pending}>
            {pending ? t.common.loading : t.footer.newsletterButton}
          </Button>
        </form>
        {status === "success" ? (
          <p role="status" className="mt-3 text-small text-emerald-600">
            {t.footer.newsletterSuccess}
          </p>
        ) : null}
        {status === "error" ? (
          <p role="alert" className="mt-3 text-small text-destructive">
            {t.footer.newsletterError}
          </p>
        ) : null}
      </section>
    </Reveal>
  );
}

function HomeError() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      {t.home.loadError}
    </div>
  );
}

function HomeNotFound() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return <div className="px-6 py-24 text-center text-muted-foreground">{t.home.nothingYet}</div>;
}

function HomePage() {
  const { locale } = Route.useSearch();
  const { data } = useSuspenseQuery(homeQuery(locale));
  const t = getTranslations(locale);
  const copy = t.home;

  const sectionByKind = (kind: string) => data.sections.find((section) => section.kind === kind);
  const hero = sectionByKind("hero");
  const trending = sectionByKind("trending");
  const editorial = sectionByKind("editorial");
  const recommendations = sectionByKind("recommendations");
  const blog = sectionByKind("blog");
  const appBanner = sectionByKind("app_banner");

  const shopSearch: ShopSearch = {
    locale,
    q: "",
    category: "",
    sort: "newest",
    page: 1,
    focus: "",
    view: "",
    brands: [],
    stores: [],
    colors: [],
    sizes: [],
    inStock: false,
    onSale: false,
  };

  const flash = sectionByKind("flash_sale");
  const flashContent = sectionContent(flash);
  const flashEndsAt = contentDate(flashContent["ends_at"]);
  const flashActive = flash && flashEndsAt !== null;

  useEffect(() => {
    track("page_view", { metadata: { page: "home" } });
  }, []);

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <BrandEntrance />
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1}>
        <Hero locale={locale} hero={hero} copy={copy} products={data.products} />
        <TrustMarquee copy={copy} />
        <TrustStrip copy={copy} />

        <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:space-y-24 sm:px-6 sm:py-20 lg:px-8">
          {data.categories.length ? (
            <CategoryGrid
              categories={data.categories}
              locale={locale}
              copy={copy}
              viewAll={t.common.viewAll}
              shopSearch={shopSearch}
            />
          ) : null}

          {trending && data.products.length ? (
            <TrendingSection
              locale={locale}
              section={trending}
              products={data.products}
              copy={copy}
              viewAll={t.common.viewAll}
              shopSearch={shopSearch}
            />
          ) : null}

          <BestsellersSection
            locale={locale}
            copy={copy}
            viewAll={t.common.viewAll}
            shopSearch={shopSearch}
          />

          <PopularNow locale={locale} copy={copy} viewAll={t.common.viewAll} shopSearch={shopSearch} />

          {data.products.length ? (
            <NewArrivalsSection
              locale={locale}
              products={data.products}
              title={sectionByKind("new_arrivals")?.title || copy.newArrivals}
              copy={copy}
              viewAll={t.common.viewAll}
              shopSearch={shopSearch}
            />
          ) : null}

          {editorial ? <EditorialSection section={editorial} copy={copy} /> : null}

          {flashActive ? (
            <FlashSaleSection
              locale={locale}
              section={flash!}
              products={data.products}
              copy={copy}
              viewAll={t.common.viewAll}
              shopSearch={shopSearch}
            />
          ) : null}

          <OffersSection
            locale={locale}
            products={data.products}
            copy={copy}
            viewAll={t.common.viewAll}
            shopSearch={shopSearch}
          />

          {recommendations && data.products.length > 8 ? (
            <Reveal>
              <SectionHeading
                eyebrow={copy.recsEyebrow}
                title={recommendations.title || copy.recsTitle}
                href="/shop"
                search={shopSearch}
                viewAll={t.common.viewAll}
              />
              {/* Editorial grid — not another rail. */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 lg:grid-cols-4">
                {data.products.slice(8, 16).map((product) => (
                  <ProductCard key={product.id} product={product} locale={locale} />
                ))}
              </div>
            </Reveal>
          ) : null}

          {data.stores.length ? (
            <BrandStores
              stores={data.stores}
              products={data.products}
              locale={locale}
              title={sectionByKind("stores")?.title || copy.storesToDiscover}
              copy={copy}
              viewAll={t.common.viewAll}
              shopSearch={shopSearch}
            />
          ) : null}

          <TestimonialsSection locale={locale} copy={copy} />

          <RecentlyViewed locale={locale} copy={copy} viewAll={t.common.viewAll} shopSearch={shopSearch} />

          {blog ? <BlogSection section={blog} copy={copy} /> : null}

          <NewsletterBand locale={locale} copy={copy} />

          {appBanner ? <AppBannerSection section={appBanner} copy={copy} /> : null}
        </div>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
