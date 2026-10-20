/**
 * Modalia Landing — "/" brand experience.
 * Editorial layout: dark hero with an asymmetric image stack, a real
 * category-discovery band, curated product collections (newest, on sale),
 * a featured-boutiques strip and a closing CTA. All product/store data is
 * real catalog data; imagery is editorial only.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowDown,
  Banknote,
  Heart,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Store as StoreIcon,
  User,
} from "lucide-react";
import { SiteFooter } from "@/components/layout/site-shell";
import { ProductCard } from "@/components/marketplace/discovery";
import { VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";
import { cn } from "@/lib/utils";
import {
  browseCatalog,
  getHeaderCategories,
  getStoreDirectory,
  type CatalogCategory,
  type CatalogProduct,
  type CatalogStore,
} from "@/lib/catalog.functions";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

type Locale = SupportedLocale;
type Translations = ReturnType<typeof getTranslations>;

/* ---------- Shared layout ---------- */
const CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10";
const VIEW_ALL_CLASS =
  "group inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground transition-all hover:gap-3";

/* Full /shop search object (mirrors the shop route's validated shape). */
type ShopSearch = {
  locale: Locale;
  q: string;
  category: string;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
  view: "" | "categories" | "stores";
  focus: string;
  brands: string[];
  stores: string[];
  colors: string[];
  sizes: string[];
  inStock: boolean;
  onSale: boolean;
};
function shopSearch(locale: Locale, overrides: Partial<ShopSearch> = {}): ShopSearch {
  return {
    locale,
    q: "",
    category: "",
    sort: "newest",
    page: 1,
    view: "",
    focus: "",
    brands: [],
    stores: [],
    colors: [],
    sizes: [],
    inStock: false,
    onSale: false,
    ...overrides,
  };
}

/* ---------- Hooks ---------- */
function useReveal<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform",
        visible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function ParallaxImage({
  src,
  alt,
  className,
  speed = 60,
}: {
  src: string;
  alt: string;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const p = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
        const c = Math.max(0, Math.min(1, p));
        const img = el.querySelector("img");
        if (img) img.style.transform = `translateY(${(c - 0.5) * speed}px) scale(1.12)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed]);
  return (
    <div ref={ref} className={cn("overflow-hidden", className)}>
      <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover will-change-transform" />
    </div>
  );
}

/* ---------- Image URLs (editorial, replaceable) ---------- */
const IMG = {
  heroMain: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&q=80",
  /* Hero backdrop: luxury fashion atelier — clothing racks, elegant fabrics */
  heroBackdrop: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80",
  fashion: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&q=80",
  sport: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=1200&q=80",
  lifestyle: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200&q=80",
  marketplace: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80",
  /* Hero stack + category fallback tiles */
  catFashion: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&q=80",
  catShoes: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
  catSports: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80",
  catAccessories: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&q=80",
};

const STACK_LABELS = {
  fashion: { ar: "أزياء", fr: "Mode", en: "Fashion" },
  shoes: { ar: "أحذية", fr: "Chaussures", en: "Shoes" },
  sports: { ar: "رياضة", fr: "Sport", en: "Sports" },
  accessories: { ar: "إكسسوارات", fr: "Accessoires", en: "Accessories" },
} as const;

const HERO_BOUTIQUES_CTA = { ar: "اكتشف المتاجر", fr: "Découvrir les boutiques", en: "Discover boutiques" };
const SCROLL_LABEL = { ar: "مرّر", fr: "Défiler", en: "Scroll" };

/* Editorial fallback image for a real category that has no image of its own. */
function categoryFallbackImage(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes("chauss") || s.includes("shoe")) return IMG.catShoes;
  if (s.includes("sport")) return IMG.sport;
  if (s.includes("accessoire")) return IMG.catAccessories;
  if (s.includes("mode") || s.includes("fashion") || s.includes("vetement")) return IMG.fashion;
  return IMG.marketplace;
}

/* ---------- Section header (shared pattern) ---------- */
function SectionHeader({
  overline,
  title,
  subtitle,
  viewAll,
}: {
  overline?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  viewAll?: React.ReactNode;
}) {
  return (
    <Reveal>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-12">
        <div className="max-w-2xl">
          {overline ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {overline}
            </p>
          ) : null}
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h2>
          {subtitle ? <p className="mt-3 text-base leading-relaxed text-muted-foreground">{subtitle}</p> : null}
        </div>
        {viewAll}
      </div>
    </Reveal>
  );
}

/* ---------- Dynamic Accessories Tile ----------
   Fetches real accessories products and rotates their images.
   Falls back to the static image if none available. */
function DynamicAccessoriesTile({
  locale,
  label,
  className,
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Fetch real accessories products on mount
  useEffect(() => {
    let cancelled = false;
    browseCatalog({
      data: { locale, category: "accessoires", pageSize: 12, inStock: true },
    })
      .then((result) => {
        if (cancelled) return;
        const imgs = (result.products || [])
          .map((p: any) => p.imagePath)
          .filter((src: string) => src && src.length > 0);
        // Deduplicate
        const unique = [...new Set(imgs)];
        setImages(unique);
        // Start at a random position for variety on each visit
        if (unique.length > 1) {
          setIndex(Math.floor(Math.random() * unique.length));
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Rotate every 30 seconds (gentle, non-intrusive)
  useEffect(() => {
    if (images.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, 30000);
    return () => window.clearInterval(id);
  }, [images.length]);

  const src = images.length > 0 ? images[index] : IMG.catAccessories;

  return (
    <Link
      to="/shop"
      search={shopSearch(locale, { category: "accessoires" })}
      aria-label={label}
      className={cn("group relative block h-full w-full overflow-hidden rounded-2xl", className)}
    >
      <img
        src={src}
        alt={label}
        loading="lazy"
        key={src}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />
      <span className="absolute end-4 top-4 grid size-8 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors group-hover:bg-white/30">
        <ArrowRight className="size-4 rtl:rotate-180" />
      </span>
      <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="block text-base font-semibold text-white sm:text-lg">{label}</span>
      </span>
    </Link>
  );
}

/* ---------- Category tile ---------- */
function CategoryTile({
  name,
  countLabel,
  image,
  search,
  className,
}: {
  name: string;
  countLabel?: string;
  image: string;
  search: ShopSearch;
  className?: string;
}) {
  return (
    <Link
      to="/shop"
      search={search}
      aria-label={name}
      className={cn("group relative block h-full w-full overflow-hidden rounded-2xl", className)}
    >
      <img
        src={image}
        alt={name}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />
      <span className="absolute end-4 top-4 grid size-8 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors group-hover:bg-white/30">
        <ArrowRight className="size-4 rtl:rotate-180" />
      </span>
      <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="block text-base font-semibold text-white sm:text-lg">{name}</span>
        {countLabel ? <span className="mt-0.5 block text-xs text-white/70">{countLabel}</span> : null}
      </span>
    </Link>
  );
}

/* Editorial fallback tile (static imagery, links to the shopping home) —
   used only when the live category list yields nothing usable. */
function StaticTile({
  locale,
  label,
  image,
  className,
}: {
  locale: Locale;
  label: string;
  image: string;
  className?: string;
}) {
  return (
    <Link
      to="/home"
      search={{ locale }}
      aria-label={label}
      className={cn("group relative block h-full w-full overflow-hidden rounded-2xl", className)}
    >
      <img
        src={image}
        alt={label}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />
      <span className="absolute end-4 top-4 grid size-8 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors group-hover:bg-white/30">
        <ArrowRight className="size-4 rtl:rotate-180" />
      </span>
      <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="block text-base font-semibold text-white sm:text-lg">{label}</span>
      </span>
    </Link>
  );
}

/* ---------- Category discovery band ---------- */
const TILE_SPANS = ["col-span-2 row-span-2", "col-span-2", "", ""];

function CategoryBand({ locale, t }: { locale: Locale; t: Translations }) {
  const home = t.home as any;
  const [categories, setCategories] = useState<CatalogCategory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHeaderCategories({ data: { locale } })
      .then((result) => {
        if (!cancelled) setCategories(result.categories);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const usable = (categories ?? [])
    .filter((c) => c.productCount > 0 && c.slug !== "accessoires")
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.productCount - a.productCount)
    .slice(0, 4);

  const accessoriesLabel = STACK_LABELS.accessories[locale] ?? STACK_LABELS.accessories.en;

  return (
    <section className="bg-background py-14 sm:py-20">
      <div className={CONTAINER}>
        <SectionHeader
          overline={home.exploreEyebrow}
          title={home.sfCatTitle}
          subtitle={home.sfCatSubtitle}
          viewAll={
            <Link to="/shop" search={shopSearch(locale)} className={VIEW_ALL_CLASS}>
              {t.common.viewAll}
              <ArrowRight className="size-4 rtl:rotate-180" />
            </Link>
          }
        />
        <Reveal delay={120}>
          <div className="grid auto-rows-[150px] grid-cols-2 gap-3 [grid-auto-flow:dense] sm:auto-rows-[190px] sm:gap-4 lg:auto-rows-[220px] lg:grid-cols-4">
            {categories === null ? (
              <>
                {TILE_SPANS.map((span, i) => (
                  <div key={i} className={cn("animate-pulse rounded-2xl bg-muted", span)} />
                ))}
                <div className="col-span-2 animate-pulse rounded-2xl bg-muted" />
              </>
            ) : usable.length > 0 ? (
              <>
                {usable.map((cat, i) => (
                  <CategoryTile
                    key={cat.id}
                    name={cat.name}
                    countLabel={`${cat.productCount} ${cat.productCount === 1 ? t.store.product : t.store.products}`}
                    image={cat.imageUrl ?? categoryFallbackImage(cat.slug)}
                    search={shopSearch(locale, { category: cat.slug })}
                    className={TILE_SPANS[i] ?? ""}
                  />
                ))}
                <DynamicAccessoriesTile locale={locale} label={accessoriesLabel} className="col-span-2" />
              </>
            ) : (
              <>
                <StaticTile
                  locale={locale}
                  label={STACK_LABELS.fashion[locale] ?? STACK_LABELS.fashion.en}
                  image={IMG.fashion}
                  className="col-span-2 row-span-2"
                />
                <StaticTile
                  locale={locale}
                  label={STACK_LABELS.shoes[locale] ?? STACK_LABELS.shoes.en}
                  image={IMG.catShoes}
                  className="col-span-2"
                />
                <StaticTile
                  locale={locale}
                  label={STACK_LABELS.sports[locale] ?? STACK_LABELS.sports.en}
                  image={IMG.sport}
                />
                <DynamicAccessoriesTile locale={locale} label={accessoriesLabel} className="col-span-2" />
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Curated product collection ---------- */
function CollectionSection({
  locale,
  band,
  overline,
  title,
  subtitle,
  viewAll,
  load,
  excludeIds,
  onLoaded,
}: {
  locale: Locale;
  band?: string | undefined;
  overline?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  viewAll: React.ReactNode;
  load: () => Promise<CatalogProduct[]>;
  excludeIds?: ReadonlySet<string>;
  onLoaded?: (products: CatalogProduct[]) => void;
}) {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((ps) => {
        if (cancelled) return;
        setProducts(ps);
        onLoaded?.(ps);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // `load` closes over `locale`; refetch only when the locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  if (failed) return null;

  const seen = new Set<string>();
  const visible = (products ?? [])
    .filter((p) => {
      if (seen.has(p.id) || excludeIds?.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 8);

  // Loaded but nothing to show (after dedupe) — hide the section entirely.
  if (products !== null && visible.length === 0) return null;

  return (
    <section className={cn("py-14 sm:py-20", band ?? "bg-background")}>
      <div className={CONTAINER}>
        <SectionHeader overline={overline} title={title} subtitle={subtitle} viewAll={viewAll} />
        {products === null ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border/60">
                <div className="aspect-[4/5] animate-pulse bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Reveal delay={100}>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ---------- Featured boutiques strip ---------- */
function LandingStoreCard({ store, locale, t }: { store: CatalogStore; locale: Locale; t: Translations }) {
  return (
    <Link
      to="/store/$slug"
      params={{ slug: store.slug }}
      search={{ locale }}
      className="group flex w-[270px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-20px_rgba(0,0,0,0.28)] lg:w-auto"
    >
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-muted">
        {store.bannerPath ? (
          <>
            <img
              src={store.bannerPath}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
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
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-9">
        <h3 className="truncate text-base font-semibold text-foreground">{store.name}</h3>
        {store.description ? (
          <p className="mt-1 line-clamp-2 min-h-[2.5em] text-sm leading-snug text-muted-foreground">
            {store.description}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span className="text-xs font-medium text-muted-foreground">
            {store.productCount} {store.productCount === 1 ? t.store.product : t.store.products}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-all group-hover:gap-2.5">
            {t.store.visitStore}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function StoresStrip({ locale, t }: { locale: Locale; t: Translations }) {
  const home = t.home as any;
  const [stores, setStores] = useState<CatalogStore[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStoreDirectory({ data: { locale } })
      .then((result) => {
        if (!cancelled) setStores(result);
      })
      .catch(() => {
        if (!cancelled) setStores([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const visible = (stores ?? []).filter((s) => s.productCount > 0).slice(0, 8);
  if (stores !== null && visible.length === 0) return null;

  return (
    <section className="bg-background py-14 sm:py-20">
      <div className={CONTAINER}>
        <SectionHeader
          overline={home.storesEyebrow}
          title={home.storesTitle}
          subtitle={home.storesText}
          viewAll={
            <Link to="/stores" search={{ locale }} className={VIEW_ALL_CLASS}>
              {home.sfStoresCta ?? t.common.viewAll}
              <ArrowRight className="size-4 rtl:rotate-180" />
            </Link>
          }
        />
        {stores === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border/60">
                <div className="aspect-[16/10] animate-pulse bg-muted" />
                <div className="space-y-2 p-4 pt-9">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Reveal delay={100}>
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
              {visible.map((store) => (
                <LandingStoreCard key={store.id} store={store} locale={locale} t={t} />
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ---------- Hero ---------- */
const TRUST_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  map: MapPin,
  store: StoreIcon,
};

function Hero({ locale, t }: { locale: Locale; t: Translations }) {
  const home = t.home as any;
  const heroTitle: string = home.heroTitle || "Discover What Moves You";
  const heroSubtitle: string =
    home.heroSubtitle || "Explore fashion, sports and everyday essentials — all in one place.";
  const heroCta: string = home.heroCta || "Shop Now";
  const trust: Array<{ icon: string; label: string }> = Array.isArray(home.trust) ? home.trust : [];

  const iconLinkClass =
    "grid size-10 place-items-center rounded-full border border-white/15 text-white/85 transition-colors hover:bg-white/10 hover:text-white";

  return (
    <section className="relative overflow-hidden bg-neutral-950 text-white">
      {/* Fashion backdrop: luxury atelier imagery behind the black hero */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <img
          src={IMG.heroBackdrop}
          alt=""
          loading="eager"
          className="h-full w-full object-cover object-center opacity-40"
        />
        {/* Black gradient overlays: keep white text readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/80 via-neutral-950/60 to-neutral-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/70 via-transparent to-neutral-950/40" />
      </div>
      {/* Ambient glow + ghost wordmark */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 start-1/4 h-[420px] w-[420px] rounded-full bg-white/[0.07] blur-[120px]" />
        <div className="absolute -bottom-24 end-[10%] h-[320px] w-[320px] rounded-full bg-white/[0.05] blur-[100px]" />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-16 select-none overflow-hidden">
        <p className="whitespace-nowrap text-center text-[24vw] font-black leading-none tracking-tighter text-white/[0.035]">
          MODALIA
        </p>
      </div>

      {/* Minimal top bar — brand + primary navigation */}
      <header className="relative z-20">
        <div className={cn(CONTAINER, "flex items-center justify-between gap-4 py-5")}>
          <Link
            to="/"
            search={{ locale }}
            aria-label={t.nav.homeLabel}
            className="text-xl font-black tracking-[0.18em] text-white"
          >
            MODALIA
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-white/75 md:flex" aria-label={t.nav.mainNavigation}>
            <Link to="/home" search={{ locale }} className="transition-colors hover:text-white">
              {t.nav.menuDiscover}
            </Link>
            <Link to="/shop" search={shopSearch(locale)} className="transition-colors hover:text-white">
              {t.nav.shop}
            </Link>
            <Link to="/stores" search={{ locale }} className="transition-colors hover:text-white">
              {t.nav.stores}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/wishlist" search={{ locale }} aria-label={t.nav.wishlist} className={iconLinkClass}>
              <Heart className="size-[18px]" />
            </Link>
            <Link to="/cart" search={{ locale }} aria-label={t.nav.cart} className={iconLinkClass}>
              <ShoppingBag className="size-[18px]" />
            </Link>
            <Link to="/auth" search={{ locale }} aria-label={t.nav.account} className={iconLinkClass}>
              <User className="size-[18px]" />
            </Link>
          </div>
        </div>
      </header>

      <div className={cn(CONTAINER, "relative z-10 grid gap-12 pb-16 pt-10 sm:pt-14 lg:grid-cols-12 lg:items-center lg:gap-14 lg:pb-20")}>
        {/* Copy */}
        <div className="lg:col-span-7">
          <Reveal>
            <p className="flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.45em] text-white/60">
              <span aria-hidden="true" className="h-px w-10 bg-white/40" />
              {home.heroEyebrow || "Modalia"}
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="mt-6 max-w-2xl text-5xl font-black leading-[0.98] tracking-tighter text-white sm:text-7xl lg:text-[5.5rem]">
              {heroTitle}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-white/70">{heroSubtitle}</p>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/home"
                search={{ locale }}
                className="group inline-flex items-center gap-3 rounded-full bg-white px-9 py-4 text-sm font-semibold text-neutral-950 shadow-2xl transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                {heroCta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180" />
              </Link>
              <Link
                to="/stores"
                search={{ locale }}
                className="group inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-4 text-sm font-semibold text-white/85 transition-all hover:border-white/60 hover:text-white active:scale-[0.98]"
              >
                {HERO_BOUTIQUES_CTA[locale] ?? HERO_BOUTIQUES_CTA.en}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180" />
              </Link>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <div className="mt-14 flex items-center gap-3 text-white/50">
              <ArrowDown className="size-4 animate-bounce" />
              <span className="text-[11px] uppercase tracking-[0.25em]">
                {SCROLL_LABEL[locale] ?? SCROLL_LABEL.en}
              </span>
            </div>
          </Reveal>
        </div>

        {/* Curated image stack — varied heights, editorial asymmetry */}
        <Reveal delay={200} className="lg:col-span-5">
          <div className="grid grid-cols-2 gap-3 pb-6 sm:gap-4">
            <Link
              to="/home"
              search={{ locale }}
              aria-label={STACK_LABELS.fashion[locale] ?? STACK_LABELS.fashion.en}
              className="group relative col-span-2 aspect-[16/9] overflow-hidden rounded-2xl lg:aspect-[16/8]"
            >
              <img
                src={IMG.catFashion}
                alt={STACK_LABELS.fashion[locale] ?? STACK_LABELS.fashion.en}
                loading="eager"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-white/25 sm:bottom-4 sm:start-4">
                {STACK_LABELS.fashion[locale] ?? STACK_LABELS.fashion.en}
                <ArrowRight className="size-3.5 rtl:rotate-180" />
              </span>
            </Link>
            <Link
              to="/home"
              search={{ locale }}
              aria-label={STACK_LABELS.shoes[locale] ?? STACK_LABELS.shoes.en}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl"
            >
              <img
                src={IMG.catShoes}
                alt={STACK_LABELS.shoes[locale] ?? STACK_LABELS.shoes.en}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-white/25">
                {STACK_LABELS.shoes[locale] ?? STACK_LABELS.shoes.en}
                <ArrowRight className="size-3.5 rtl:rotate-180" />
              </span>
            </Link>
            <Link
              to="/home"
              search={{ locale }}
              aria-label={STACK_LABELS.sports[locale] ?? STACK_LABELS.sports.en}
              className="group relative aspect-[4/5] translate-y-6 overflow-hidden rounded-2xl"
            >
              <img
                src={IMG.sport}
                alt={STACK_LABELS.sports[locale] ?? STACK_LABELS.sports.en}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-white/25">
                {STACK_LABELS.sports[locale] ?? STACK_LABELS.sports.en}
                <ArrowRight className="size-3.5 rtl:rotate-180" />
              </span>
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Trust strip — real brand statements from i18n */}
      {trust.length > 0 ? (
        <div className="relative z-10 border-t border-white/10">
          <div className={cn(CONTAINER, "flex flex-wrap items-center gap-x-10 gap-y-3 py-5")}>
            {trust.map((item) => {
              const Icon = TRUST_ICONS[item.icon] ?? ShieldCheck;
              return (
                <span key={item.label} className="inline-flex items-center gap-2.5 text-sm text-white/75">
                  <Icon className="size-4 text-white/60" aria-hidden="true" />
                  {item.label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ---------- Landing ---------- */
function LandingPage() {
  const locale: Locale = getLocale();
  const t = getTranslations(locale);
  const home = t.home as any;
  const [newestIds, setNewestIds] = useState<ReadonlySet<string>>(new Set());

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background text-foreground antialiased">
      <main id="main-content">
        <Hero locale={locale} t={t} />

        <CategoryBand locale={locale} t={t} />

        {/* Curated collection — newest */}
        <CollectionSection
          locale={locale}
          band="bg-muted/40"
          overline={home.freshEyebrow}
          title={home.sfNewTitle}
          subtitle={home.sfNewSubtitle}
          viewAll={
            <Link to="/shop" search={shopSearch(locale)} className={VIEW_ALL_CLASS}>
              {t.common.viewAll}
              <ArrowRight className="size-4 rtl:rotate-180" />
            </Link>
          }
          load={() =>
            browseCatalog({ data: { locale, sort: "newest", pageSize: 8, inStock: true } }).then(
              (r) => r.products
            )
          }
          onLoaded={(ps) => setNewestIds(new Set(ps.map((p) => p.id)))}
        />

        {/* ===== FASHION — full-bleed editorial moment ===== */}
        <section className="relative overflow-hidden bg-neutral-950 text-white">
          <ParallaxImage src={IMG.fashion} alt="Fashion" className="absolute inset-0 opacity-60" speed={90} />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-neutral-950/70" />
          <div className={cn(CONTAINER, "relative flex min-h-[70vh] flex-col justify-end pb-16 pt-28 sm:pb-20")}>
            <Reveal>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Fashion</p>
              <h2 className="max-w-2xl text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
                {home.sfFashionTitle}
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <Link
                to="/shop"
                search={shopSearch(locale)}
                className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/85 transition-all hover:gap-4 hover:text-white"
              >
                {home.sfFashionCta} <ArrowRight className="size-4 rtl:rotate-180" />
              </Link>
            </Reveal>
          </div>
        </section>

        <StoresStrip locale={locale} t={t} />

        {/* Curated collection — best deals (deduped against newest) */}
        <CollectionSection
          locale={locale}
          band="bg-muted/40"
          overline={home.offersEyebrow}
          title={home.sfDealsTitle}
          subtitle={home.sfDealsSubtitle}
          viewAll={
            <Link to="/shop" search={shopSearch(locale, { onSale: true })} className={VIEW_ALL_CLASS}>
              {t.common.viewAll}
              <ArrowRight className="size-4 rtl:rotate-180" />
            </Link>
          }
          load={() =>
            browseCatalog({ data: { locale, onSale: true, pageSize: 8, inStock: true } }).then(
              (r) => r.products
            )
          }
          excludeIds={newestIds}
        />

        {/* ===== FINAL CTA ===== */}
        <section className="relative overflow-hidden bg-neutral-950 py-24 text-white sm:py-36">
          <ParallaxImage src={IMG.heroMain} alt="" className="absolute inset-0 opacity-25" speed={100} />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-neutral-950" />
          <div className={cn(CONTAINER, "relative text-center")}>
            <Reveal>
              <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
                {home.sfFinalTitle}
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/65">{home.sfFinalText}</p>
            </Reveal>
            <Reveal delay={150}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/home"
                  search={{ locale }}
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-10 py-4 text-sm font-semibold text-neutral-950 transition-all hover:bg-white/90 active:scale-[0.98]"
                >
                  {home.sfFinalPrimary}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180" />
                </Link>
                <Link
                  to="/stores"
                  search={{ locale }}
                  className="group inline-flex items-center gap-2 rounded-full border border-white/25 px-8 py-4 text-sm font-semibold text-white/85 transition-all hover:border-white/60 hover:text-white active:scale-[0.98]"
                >
                  {home.sfFinalSecondary}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
