/**
 * CommerceHero — commercial discovery hero for /home.
 * NOT the landing hero. Editorial commerce composition: imagery + typography,
 * compact, with subtle scroll parallax. Communicates FASHION / SPORT / LIFESTYLE.
 */
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";
import { cn } from "@/lib/utils";

/** Hero imagery — curated commerce photography, easy to replace. */
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&q=80",
  "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=1200&q=80",
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200&q=80",
];

export function CommerceHero({
  locale,
  eyebrow,
  title,
  subtitle,
  ctaLabel,
}: {
  locale: SupportedLocale;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
}) {
  const t = getTranslations(locale);
  const ref = useRef<HTMLDivElement | null>(null);

  // Subtle scroll parallax — transform-based, reduced-motion safe.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, 1 - rect.bottom / (window.innerHeight + rect.height)));
        const img = el.querySelector("[data-hero-img]") as HTMLElement | null;
        if (img) img.style.transform = `translateY(${progress * 48}px) scale(${1 + progress * 0.04})`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const heading = title ?? t.home.commerceHeroTitle;
  const sub = subtitle ?? t.home.commerceHeroSubtitle;
  const cta = ctaLabel ?? t.home.shopNow;

  return (
    <section aria-label="Featured" className="relative overflow-hidden bg-neutral-950 text-white">
      <div ref={ref} className="relative">
        {/* Layered editorial imagery */}
        <div className="absolute inset-0" aria-hidden="true">
          <img
            data-hero-img
            src={HERO_IMAGES[0]}
            alt=""
            loading="eager"
            className="h-full w-full object-cover object-center will-change-transform"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25" />
        </div>

        <div className="relative mx-auto flex min-h-[52vh] max-w-7xl flex-col justify-center px-4 py-14 sm:min-h-[58vh] sm:px-6 lg:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
            {eyebrow ?? t.home.commerceHeroEyebrow}
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-bold leading-[1.04] tracking-tight drop-shadow-md sm:text-5xl lg:text-6xl">
            {heading}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/75 sm:text-lg">{sub}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/shop"
              search={{ locale } as any}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-neutral-950 shadow-xl transition-all hover:gap-3 hover:bg-white/90 active:scale-[0.98]"
            >
              {cta}
              <ArrowRight className="size-4 transition-transform" />
            </Link>
            <Link
              to={"/stores" as any}
              search={{ locale } as any}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10"
            >
              {t.home.commerceHeroStores}
            </Link>
          </div>

          {/* Category quick chips */}
          <div className="mt-8 flex flex-wrap gap-2" aria-label="Popular">
            {t.home.commerceHeroTags.map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white/80 backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
