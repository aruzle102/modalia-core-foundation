/**
 * Horizontal product rail — Amazon/AliExpress-style carousel.
 * Desktop: arrows. Mobile: swipe. No page overflow.
 */
import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ProductCard } from "@/components/marketplace/discovery";
import { cn } from "@/lib/utils";

export function ProductRail({
  title,
  eyebrow,
  subtitle,
  products,
  locale,
  viewAllTo = "/shop",
  viewAllLabel,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  products: any[];
  locale: "fr" | "en" | "ar";
  viewAllTo?: string;
  viewAllLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

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

  return (
    <section aria-label={title} className="relative">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">
            {eyebrow ?? "Discover"}
          </p>
          <h2 className="truncate text-2xl font-bold tracking-tight sm:text-[26px]">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {viewAllLabel ? (
          <Link
            to={viewAllTo as any}
            search={{ locale } as any}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-4 py-2 text-[13px] font-semibold text-foreground transition-all hover:gap-2.5 hover:border-foreground/30 hover:bg-secondary/60"
          >
            {viewAllLabel}
            <ChevronRight className="size-3.5 transition-transform rtl:rotate-180" />
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
            "absolute -left-5 top-[38%] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-border/70 bg-background/95 text-foreground opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-background hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)] disabled:opacity-0 md:grid md:group-hover/rail:opacity-100",
            canLeft && "md:opacity-0"
          )}
          style={canLeft ? undefined : { pointerEvents: "none" }}
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </button>

        {/* Rail */}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:gap-4 md:mx-0 md:px-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="w-36 shrink-0 snap-start sm:w-40 md:w-44 lg:w-48"
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
            "absolute -right-5 top-[38%] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-border/70 bg-background/95 text-foreground opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-background hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)] disabled:opacity-0 md:grid md:group-hover/rail:opacity-100"
          )}
          style={canRight ? undefined : { pointerEvents: "none" }}
        >
          <ChevronRight className="size-5 rtl:rotate-180" />
        </button>
      </div>
    </section>
  );
}
