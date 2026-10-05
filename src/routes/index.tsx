import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Banknote, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceTier } from "@/hooks/use-device-tier";
import {
  CategoryRail,
  DiscoverySkeleton,
  ProductCard,
  ProductGrid,
  StoreRail,
} from "@/components/marketplace/discovery";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { useReveal } from "@/hooks/use-reveal";
import { getDiscoveryData, type HomepageSection } from "@/lib/catalog.functions";
import { subscribeNewsletter } from "@/lib/engagement.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

const HeroScene = lazy(() =>
  import("@/components/commerce/HeroScene").then((m) => ({ default: m.HeroScene })),
);

const homeQuery = (locale: string) =>
  queryOptions({
    queryKey: ["discovery", locale],
    queryFn: () => getDiscoveryData({ data: { locale } }),
  });

type HomeCopy = {
  heroEyebrow: string;
  heroFallbackTitle: string;
  heroFallbackSubtitle: string;
  exploreEyebrow: string;
  browseCategories: string;
  trendingEyebrow: string;
  trendingTitle: string;
  editorialEyebrow: string;
  freshEyebrow: string;
  newArrivals: string;
  flashEyebrow: string;
  endsIn: string;
  startsIn: string;
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  independentEyebrow: string;
  storesToDiscover: string;
  recsEyebrow: string;
  recsTitle: string;
  trustEyebrow: string;
  trustTitle: string;
  trust: { icon: "cash" | "map" | "store"; label: string }[];
  newsletterTitle: string;
  newsletterText: string;
  newArrivalsEmptyTitle: string;
  newArrivalsEmptyText: string;
};

const homeCopy: Record<SupportedLocale, HomeCopy> = {
  ar: {
    heroEyebrow: "موداليا · الجزائر",
    heroFallbackTitle: "وجهة مدروسة لكل ما يهمّك.",
    heroFallbackSubtitle: "اكتشف منتجات ومتاجر مختارة بعناية للحياة اليومية العصرية.",
    exploreEyebrow: "استكشف",
    browseCategories: "تصفّح حسب الفئة",
    trendingEyebrow: "رائج الآن",
    trendingTitle: "الأكثر طلبًا",
    editorialEyebrow: "افتتاحية",
    freshEyebrow: "مختارات طازجة",
    newArrivals: "وصل حديثًا",
    flashEyebrow: "عرض خاطف",
    endsIn: "ينتهي خلال",
    startsIn: "يبدأ خلال",
    days: "أيام",
    hours: "ساعات",
    minutes: "دقائق",
    seconds: "ثوانٍ",
    independentEyebrow: "مستقلّة بالتصميم",
    storesToDiscover: "متاجر تستحق الاكتشاف",
    recsEyebrow: "مختارات لك",
    recsTitle: "قد يعجبك أيضًا",
    trustEyebrow: "لماذا موداليا",
    trustTitle: "تسوّق بثقة",
    trust: [
      { icon: "cash", label: "الدفع عند الاستلام" },
      { icon: "map", label: "التوصيل إلى 58 ولاية" },
      { icon: "store", label: "متاجر مستقلة" },
    ],
    newsletterTitle: "انضم إلى النشرة",
    newsletterText: "جديد المنتجات والمتاجر، مرة في الشهر. بلا إزعاج.",
    newArrivalsEmptyTitle: "المنتجات الجديدة ستظهر هنا",
    newArrivalsEmptyText: "المنتجات المعتمدة تنضم تلقائيًا إلى هذه المجموعة فور توفرها.",
  },
  fr: {
    heroEyebrow: "Modalia · Algérie",
    heroFallbackTitle: "Une destination pensée pour l’essentiel.",
    heroFallbackSubtitle:
      "Découvrez des produits et des boutiques sélectionnés avec soin pour le quotidien moderne.",
    exploreEyebrow: "Explorer",
    browseCategories: "Parcourir par catégorie",
    trendingEyebrow: "En ce moment",
    trendingTitle: "Les plus demandés",
    editorialEyebrow: "Éditorial",
    freshEyebrow: "Sélection fraîche",
    newArrivals: "Nouveautés",
    flashEyebrow: "Vente flash",
    endsIn: "Se termine dans",
    startsIn: "Commence dans",
    days: "jours",
    hours: "heures",
    minutes: "minutes",
    seconds: "secondes",
    independentEyebrow: "Indépendant par design",
    storesToDiscover: "Des boutiques à découvrir",
    recsEyebrow: "Pour vous",
    recsTitle: "Vous aimerez aussi",
    trustEyebrow: "Pourquoi Modalia",
    trustTitle: "Achetez en confiance",
    trust: [
      { icon: "cash", label: "Paiement à la livraison" },
      { icon: "map", label: "Livraison vers 58 wilayas" },
      { icon: "store", label: "Boutiques indépendantes" },
    ],
    newsletterTitle: "Rejoignez la newsletter",
    newsletterText: "Nouveautés et boutiques, une fois par mois. Sans spam.",
    newArrivalsEmptyTitle: "Les nouveautés apparaîtront ici",
    newArrivalsEmptyText:
      "Les produits approuvés rejoignent automatiquement cette collection dès leur disponibilité.",
  },
  en: {
    heroEyebrow: "Modalia · Algeria",
    heroFallbackTitle: "A considered place for what matters.",
    heroFallbackSubtitle: "Discover products and stores selected for modern everyday life.",
    exploreEyebrow: "Explore",
    browseCategories: "Browse by category",
    trendingEyebrow: "Right now",
    trendingTitle: "Most wanted",
    editorialEyebrow: "Editorial",
    freshEyebrow: "Fresh selection",
    newArrivals: "New arrivals",
    flashEyebrow: "Flash sale",
    endsIn: "Ends in",
    startsIn: "Starts in",
    days: "days",
    hours: "hours",
    minutes: "minutes",
    seconds: "seconds",
    independentEyebrow: "Independent by design",
    storesToDiscover: "Stores to discover",
    recsEyebrow: "Picked for you",
    recsTitle: "You may also like",
    trustEyebrow: "Why Modalia",
    trustTitle: "Shop with confidence",
    trust: [
      { icon: "cash", label: "Cash on delivery" },
      { icon: "map", label: "Delivery to 58 wilayas" },
      { icon: "store", label: "Independent stores" },
    ],
    newsletterTitle: "Join the newsletter",
    newsletterText: "New products and stores, once a month. No spam.",
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

/** Cinematic hero: huge clamp typography over the existing 2.5D scene. */
function Hero({
  locale,
  hero,
  copy,
}: {
  locale: SupportedLocale;
  hero: HomepageSection | undefined;
  copy: HomeCopy;
}) {
  const t = getTranslations(locale);
  const title = hero?.title || copy.heroFallbackTitle;
  const subtitle = hero?.subtitle || copy.heroFallbackSubtitle;
  const { tier, webgl, reducedMotion } = useDeviceTier();
  const showWebGL = tier === "high" && webgl && !reducedMotion;
  const shopSearch = { locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" } as const;
  return (
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
      {/* Real interactive WebGL scene (high-tier devices only); the 2.5D CSS
          scene above remains as the guaranteed fallback for all other devices. */}
      {showWebGL ? (
        <Suspense fallback={null}>
          <HeroScene className="absolute inset-0" />
        </Suspense>
      ) : null}
      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-end px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="hero-copy max-w-4xl pb-5">
          <p className="flex items-center gap-3 text-eyebrow tracking-[0.18em] text-white/50">
            <span className="h-px w-8 bg-white/40" aria-hidden />
            {copy.heroEyebrow}
          </p>
          <h1 className="mt-5 font-display text-[clamp(2.75rem,8vw,6.5rem)] font-semibold leading-[1.02] tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">{subtitle}</p>
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
  );
}

type ShopSearch = {
  locale: SupportedLocale;
  q: string;
  category: string;
  sort: string;
  page: number;
  focus: string;
  view: string;
};

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
  search: ShopSearch;
  viewAll: string;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-2 font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold tracking-tight text-foreground">
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

/** Trending: editorial horizontal rail of real products. */
function TrendingSection({
  locale,
  section,
  products,
  copy,
  viewAll,
}: {
  locale: SupportedLocale;
  section: HomepageSection;
  products: Parameters<typeof ProductGrid>[0]["products"];
  copy: HomeCopy;
  viewAll: string;
}) {
  const shopSearch = { locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" } as const;
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

/** Editorial / campaign: big image + text from the section's title/subtitle/content. */
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
  const ctaHref = contentText(content["cta_href"]);
  return (
    <Reveal>
      <section className="grid overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-2">
        {image ? (
          <div className="relative min-h-64 lg:min-h-96">
            <img
              src={image}
              alt={imageAlt}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ) : null}
        <div
          className={
            image
              ? "flex flex-col justify-center p-8 sm:p-12"
              : "col-span-full flex flex-col justify-center p-8 text-center sm:p-14"
          }
        >
          <p className="text-eyebrow text-muted-foreground">{copy.editorialEyebrow}</p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-tight text-foreground">
            {section.title}
          </h2>
          {section.subtitle ? (
            <p className="mt-4 max-w-md text-body leading-relaxed text-muted-foreground">
              {section.subtitle}
            </p>
          ) : null}
          {ctaLabel && ctaHref ? (
            <div className="mt-7">
              <Button asChild size="lg">
                <a href={ctaHref}>{ctaLabel}</a>
              </Button>
            </div>
          ) : null}
        </div>
      </section>
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
}: {
  locale: SupportedLocale;
  section: HomepageSection;
  products: Parameters<typeof ProductGrid>[0]["products"];
  copy: HomeCopy;
  viewAll: string;
}) {
  const content = sectionContent(section);
  const startsAt = contentDate(content["starts_at"]);
  const endsAt = contentDate(content["ends_at"]);
  const [now, setNow] = useState(() => Date.now());

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
  const shopSearch = { locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" } as const;

  return (
    <Reveal>
      <section className="overflow-hidden rounded-2xl border border-border bg-ink text-primary-foreground">
        <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
          <div>
            <p className="text-eyebrow text-white/50">{copy.flashEyebrow}</p>
            <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-tight text-white">
              {section.title || copy.flashEyebrow}
            </h2>
            {section.subtitle ? (
              <p className="mt-3 max-w-md text-body leading-relaxed text-white/70">{section.subtitle}</p>
            ) : null}
            <div className="mt-6" role="timer" aria-live="off">
              <p className="text-caption uppercase tracking-[0.14em] text-white/50">{label}</p>
              <div className="mt-3 flex gap-2" dir="ltr">
                {units.map((unit) => (
                  <div
                    key={unit.label}
                    className="grid min-w-16 place-items-center rounded-xl bg-white/8 px-3 py-2.5 backdrop-blur-sm"
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
              className="group mt-7 inline-flex items-center gap-2 text-small font-medium text-white"
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
    </Reveal>
  );
}

/** Honest trust block: real service facts only, no invented stats. */
function TrustSection({ copy }: { copy: HomeCopy }) {
  const icons = { cash: Banknote, map: MapPin, store: Store } as const;
  return (
    <Reveal>
      <section className="rounded-2xl border border-border bg-card p-8 sm:p-10">
        <p className="text-eyebrow text-muted-foreground">{copy.trustEyebrow}</p>
        <h2 className="mt-2 font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold tracking-tight text-foreground">
          {copy.trustTitle}
        </h2>
        <div className="mt-7 grid gap-6 sm:grid-cols-3">
          {copy.trust.map((item) => {
            const Icon = icons[item.icon];
            return (
              <div key={item.label} className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-foreground">
                  <Icon className="size-5" />
                </span>
                <p className="pt-2 text-body font-medium text-foreground">{item.label}</p>
              </div>
            );
          })}
        </div>
      </section>
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
      <section className="rounded-2xl border border-border bg-card p-8 text-center sm:p-12">
        <h2 className="font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold tracking-tight text-foreground">
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

function HomePage() {
  const { locale } = Route.useSearch();
  const { data } = useSuspenseQuery(homeQuery(locale));
  const t = getTranslations(locale);
  const copy = homeCopy[locale];

  const sectionByKind = (kind: string) => data.sections.find((section) => section.kind === kind);
  const hero = sectionByKind("hero");
  const trending = sectionByKind("trending");
  const editorial = sectionByKind("editorial");
  const recommendations = sectionByKind("recommendations");

  const shopSearch: ShopSearch = {
    locale,
    q: "",
    category: "",
    sort: "newest",
    page: 1,
    focus: "",
    view: "",
  };

  const flash = sectionByKind("flash_sale");
  const flashContent = sectionContent(flash);
  const flashEndsAt = contentDate(flashContent["ends_at"]);
  const flashActive = flash && flashEndsAt !== null;

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <BrandEntrance />
      <SiteHeader locale={locale} t={t} />
      <main>
        <Hero locale={locale} hero={hero} copy={copy} />

        <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:space-y-20 sm:px-6 sm:py-16 lg:px-8">
          {data.categories.length ? (
            <Reveal>
              <SectionHeading
                eyebrow={copy.exploreEyebrow}
                title={copy.browseCategories}
                href="/shop"
                search={shopSearch}
                viewAll={t.common.viewAll}
              />
              <CategoryRail categories={data.categories} locale={locale} />
            </Reveal>
          ) : null}

          {trending && data.products.length ? (
            <TrendingSection
              locale={locale}
              section={trending}
              products={data.products}
              copy={copy}
              viewAll={t.common.viewAll}
            />
          ) : null}

          {editorial ? <EditorialSection section={editorial} copy={copy} /> : null}

          {data.products.length ? (
            <Reveal>
              <SectionHeading
                eyebrow={copy.freshEyebrow}
                title={sectionByKind("new_arrivals")?.title || copy.newArrivals}
                href="/shop"
                search={shopSearch}
                viewAll={t.common.viewAll}
              />
              <ProductGrid
                products={data.products.slice(0, 8)}
                locale={locale}
                emptyTitle={copy.newArrivalsEmptyTitle}
                emptyText={copy.newArrivalsEmptyText}
              />
            </Reveal>
          ) : null}

          {flashActive ? (
            <FlashSaleSection
              locale={locale}
              section={flash!}
              products={data.products}
              copy={copy}
              viewAll={t.common.viewAll}
            />
          ) : null}

          {data.stores.length ? (
            <Reveal>
              <SectionHeading
                eyebrow={copy.independentEyebrow}
                title={sectionByKind("featured_stores")?.title || copy.storesToDiscover}
                href="/shop"
                search={shopSearch}
                viewAll={t.common.viewAll}
              />
              <StoreRail stores={data.stores} locale={locale} />
            </Reveal>
          ) : null}

          {recommendations && data.products.length > 8 ? (
            <Reveal>
              <SectionHeading
                eyebrow={copy.recsEyebrow}
                title={recommendations.title || copy.recsTitle}
                href="/shop"
                search={shopSearch}
                viewAll={t.common.viewAll}
              />
              <ProductGrid
                products={data.products.slice(8, 16)}
                locale={locale}
                emptyTitle={copy.newArrivalsEmptyTitle}
                emptyText={copy.newArrivalsEmptyText}
              />
            </Reveal>
          ) : null}

          <TrustSection copy={copy} />
          <NewsletterBand locale={locale} copy={copy} />
        </div>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
