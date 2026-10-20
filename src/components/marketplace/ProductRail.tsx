/**
 * Horizontal product rail — Amazon/AliExpress-style carousel.
 * Desktop: arrows. Mobile: swipe. No page overflow.
 *
 * Variants:
 *  - "standard": uniform cards.
 *  - "featured": magazine opening — the first product becomes a large
 *    editorial tile (split hero-tile) followed by standard cards.
 *
 * Cards stagger in once when the rail first enters the viewport
 * (see useEntranceStagger); the animation fires a single time and is
 * fully disabled under prefers-reduced-motion.
 */
import { useRef, useState, useEffect, type CSSProperties, type RefObject } from "react";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ProductCard } from "@/components/marketplace/discovery";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { formatPrice } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Staggered entrance                                                  */
/* ------------------------------------------------------------------ */

/**
 * One-shot entrance trigger: `entered` flips true the first time the
 * observed element scrolls into view (immediately for reduced-motion
 * users and when IntersectionObserver is unavailable). Never re-fires.
 */
export function useEntranceStagger<T extends HTMLElement = HTMLDivElement>(): {
  ref: RefObject<T | null>;
  entered: boolean;
  reduced: boolean;
} {
  const ref = useRef<T | null>(null);
  const [entered, setEntered] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setReduced(true);
      setEntered(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setEntered(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setEntered(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, entered, reduced };
}

/** Inline style for one staggered item: 55ms steps, capped at 330ms. */
export function staggerStyle(entered: boolean, index: number, reduced = false): CSSProperties {
  if (reduced) return {};
  return {
    opacity: entered ? 1 : 0,
    transform: entered ? "translateY(0px)" : "translateY(16px)",
    transitionProperty: "opacity, transform, box-shadow",
    transitionDuration: "520ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    transitionDelay: entered ? `${Math.min(index * 55, 330)}ms` : "0ms",
  };
}

/* ------------------------------------------------------------------ */
/* Featured editorial tile (first product of a "featured" rail)        */
/* ------------------------------------------------------------------ */

function discountPercent(price: number, compareAtPrice: number | null | undefined): number | null {
  if (compareAtPrice == null || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

function FeaturedTile({
  product,
  locale,
  style,
}: {
  product: CatalogProduct;
  locale: "fr" | "en" | "ar";
  style?: CSSProperties;
}) {
  const sale = discountPercent(product.price, product.compareAtPrice);
  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      search={{ locale }}
      aria-label={product.name}
      style={style}
      className="group relative block h-full min-h-[320px] overflow-hidden rounded-2xl bg-neutral-950 text-white sm:min-h-[400px]"
    >
      {product.imagePath ? (
        <img
          src={product.imagePath}
          alt={product.imageAlt || product.name}
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-neutral-900" aria-hidden>
          <span className="font-display text-7xl font-semibold text-white/10">
            {product.name.slice(0, 1).toUpperCase()}
          </span>
        </span>
      )}
      <span
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
        aria-hidden
      />
      {sale != null ? (
        <span className="absolute start-4 top-4 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold tabular-nums text-white">
          −{sale}%
        </span>
      ) : null}
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6">
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-medium uppercase tracking-[0.2em] text-white/60">
            {product.storeName}
          </span>
          <span className="mt-1.5 line-clamp-2 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
            {product.name}
          </span>
          <span className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-lg font-bold tabular-nums sm:text-xl">
              {formatPrice(product.price, locale)}
            </span>
            {sale != null && product.compareAtPrice ? (
              <span className="text-sm tabular-nums text-white/55 line-through">
                {formatPrice(product.compareAtPrice, locale)}
              </span>
            ) : null}
          </span>
        </span>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-neutral-950 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none">
          <ArrowUpRight className="size-5 rtl:-scale-x-100" />
        </span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Rail                                                                */
/* ------------------------------------------------------------------ */

export function ProductRail({
  title,
  eyebrow,
  subtitle,
  products,
  locale,
  viewAllTo = "/shop",
  viewAllLabel,
  variant = "standard",
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  products: any[];
  locale: "fr" | "en" | "ar";
  viewAllTo?: string;
  viewAllLabel?: string;
  /** "featured": first product renders as a large editorial tile. */
  variant?: "standard" | "featured";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const entrance = useEntranceStagger<HTMLDivElement>();

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, []);

  const scroll = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8 * dir;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  if (!products.length) return null;

  const showFeatured = variant === "featured" && products.length >= 4;
  const [first, ...rest] = products as CatalogProduct[];
  const standardProducts = showFeatured ? rest : (products as CatalogProduct[]);

  return (
    <section aria-label={title} className="relative">
      <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {eyebrow ?? "Discover"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem] sm:leading-[1.1]">{title}</h2>
          {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {viewAllLabel ? (
          <Link
            to={viewAllTo as any}
            search={{ locale } as any}
            className="group inline-flex shrink-0 items-center gap-1.5 pb-1 text-[13px] font-semibold text-foreground transition-all hover:gap-2.5"
          >
            {viewAllLabel}
            <ArrowRight className="size-3.5 transition-transform rtl:rotate-180" />
          </Link>
        ) : null}
      </div>

      <div className="group/rail relative">
        {/* Left arrow — desktop only */}
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scroll(-1)}
          disabled={!canLeft}
          className={cn(
            "absolute -start-5 top-[38%] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-border/70 bg-background/95 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-background disabled:opacity-0 md:grid md:group-hover/rail:opacity-100",
            canLeft && "md:opacity-0"
          )}
          style={canLeft ? undefined : { pointerEvents: "none" }}
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </button>

        {/* Rail */}
        <div
          ref={(el) => {
            scrollRef.current = el;
            entrance.ref.current = el;
          }}
          onScroll={updateArrows}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {showFeatured && first ? (
            <div
              className="basis-[85%] shrink-0 snap-start self-stretch sm:basis-[470px] lg:basis-[540px]"
              style={staggerStyle(entrance.entered, 0, entrance.reduced)}
            >
              <FeaturedTile product={first} locale={locale} />
            </div>
          ) : null}
          {standardProducts.map((product, i) => (
            <div
              key={product.id}
              className="basis-[160px] shrink-0 snap-start sm:basis-[220px]"
              style={staggerStyle(entrance.entered, showFeatured ? i + 1 : i, entrance.reduced)}
            >
              <ProductCard product={product} locale={locale} />
            </div>
          ))}
        </div>

        {/* Right arrow — desktop only */}
        <button
          type="button"
          aria-label="Next"
          onClick={() => scroll(1)}
          disabled={!canRight}
          className={cn(
            "absolute -end-5 top-[38%] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-border/70 bg-background/95 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-background disabled:opacity-0 md:grid md:group-hover/rail:opacity-100"
          )}
          style={canRight ? undefined : { pointerEvents: "none" }}
        >
          <ChevronRight className="size-5 rtl:rotate-180" />
        </button>
      </div>
    </section>
  );
}
