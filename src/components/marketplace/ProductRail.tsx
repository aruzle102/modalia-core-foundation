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
  subtitle,
  products,
  locale,
  viewAllTo = "/shop",
  viewAllLabel,
}: {
  title: string;
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
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {viewAllLabel ? (
          <Link
            to={viewAllTo as any}
            search={{ locale } as any}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
          >
            {viewAllLabel}
          </Link>
        ) : null}
      </div>

      <div className="relative">
        {/* Left arrow — desktop only */}
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scroll(-1)}
          disabled={!canLeft}
          className={cn(
            "absolute -left-4 top-1/3 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border bg-background shadow-md transition-all hover:shadow-lg disabled:opacity-30 md:grid",
            !canLeft && "pointer-events-none"
          )}
        >
          <ChevronLeft className="size-5" />
        </button>

        {/* Rail */}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-none md:gap-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="w-40 shrink-0 snap-start sm:w-44 md:w-48 lg:w-52"
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
            "absolute -right-4 top-1/3 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border bg-background shadow-md transition-all hover:shadow-lg disabled:opacity-30 md:grid",
            !canRight && "pointer-events-none"
          )}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </section>
  );
}
