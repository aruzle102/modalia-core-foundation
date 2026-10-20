/**
 * Horizontal product rail — Amazon/AliExpress-style carousel.
 * Desktop: arrows. Mobile: swipe. No page overflow.
 */
import { useRef, useState, useEffect } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
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
          ref={scrollRef}
          onScroll={updateArrows}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="basis-[160px] shrink-0 snap-start sm:basis-[220px]"
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
