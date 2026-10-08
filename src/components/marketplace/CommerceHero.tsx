/**
 * CommerceHero — commercial discovery hero for /home.
 * NOT the landing hero. Editorial commerce composition: layered imagery,
 * staggered entrance, compact, subtle scroll parallax. Communicates
 * FASHION / SPORT / LIFESTYLE discovery.
 */
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

/** Hero imagery — curated commerce photography, easy to replace. */
const HERO_MAIN = "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=80";
const HERO_FLOAT = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80";

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
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        const progress = Math.max(0, Math.min(1, 1 - rect.bottom / (window.innerHeight + rect.height)));
        const img = el.querySelector("[data-hero-img]") as HTMLElement | null;
        if (img) img.style.transform = `translateY(${progress * 56}px) scale(${1 + progress * 0.05})`;
        const float = el.querySelector("[data-hero-float]") as HTMLElement | null;
        if (float) float.style.transform = `translateY(${-progress * 36}px) rotate(2deg)`;
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
      <style>{`
        @keyframes heroRise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes heroFloat { 0%,100% { transform: translateY(0) rotate(2deg); } 50% { transform: translateY(-12px) rotate(2deg); } }
      `}</style>
      <div ref={ref} className="relative">
        {/* Layered editorial imagery */}
        <div className="absolute inset-0" aria-hidden="true">
          <img
            data-hero-img
            src={HERO_MAIN}
            alt=""
            loading="eager"
            className="h-full w-full scale-105 object-cover object-center will-change-transform"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/30" />
        </div>

        <div className="relative mx-auto grid min-h-[54vh] max-w-7xl items-center gap-8 px-4 py-14 sm:min-h-[60vh] sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-7">
            <p
              className="inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/65 motion-safe:animate-[heroRise_0.7s_ease-out_both]"
              style={{ animationDelay: "0.05s" }}
            >
              <span className="h-px w-10 bg-white/70" aria-hidden />
              {eyebrow ?? t.home.commerceHeroEyebrow}
            </p>
            <h1
              className="mt-5 max-w-xl text-[2.6rem] font-bold leading-[1.02] tracking-tight drop-shadow-lg sm:text-6xl lg:text-[4.2rem] motion-safe:animate-[heroRise_0.7s_ease-out_both]"
              style={{ animationDelay: "0.15s" }}
            >
              {heading}
            </h1>
            <p
              className="mt-4 max-w-md text-base leading-relaxed text-white/75 sm:text-lg motion-safe:animate-[heroRise_0.7s_ease-out_both]"
              style={{ animationDelay: "0.25s" }}
            >
              {sub}
            </p>
            <div
              className="mt-8 flex flex-wrap items-center gap-3 motion-safe:animate-[heroRise_0.7s_ease-out_both]"
              style={{ animationDelay: "0.35s" }}
            >
              <Link
                to="/shop"
                search={{ locale } as any}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-neutral-950 shadow-[0_12px_36px_rgba(0,0,0,0.4)] transition-all hover:gap-3 hover:bg-white/90 active:scale-[0.98]"
              >
                {cta}
                <ArrowRight className="size-4 transition-transform rtl:rotate-180" />
              </Link>
              <Link
                to={"/stores" as any}
                search={{ locale } as any}
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10 active:scale-[0.98]"
              >
                {t.home.commerceHeroStores}
              </Link>
            </div>

            {/* Category quick chips */}
            <div
              className="mt-8 flex flex-wrap gap-2 motion-safe:animate-[heroRise_0.7s_ease-out_both]"
              style={{ animationDelay: "0.45s" }}
              aria-label="Popular"
            >
              {t.home.commerceHeroTags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-white/85 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Floating editorial card — desktop depth layer */}
          <div className="relative hidden lg:col-span-5 lg:block" aria-hidden="true">
            <div
              data-hero-float
              className="relative ml-auto w-64 overflow-hidden rounded-3xl border border-white/20 shadow-[0_32px_80px_rgba(0,0,0,0.5)] motion-safe:animate-[heroFloat_7s_ease-in-out_infinite]"
            >
              <img src={HERO_FLOAT} alt="" loading="eager" className="aspect-[3/4] w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <p className="absolute bottom-4 start-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                {t.home.commerceHeroEyebrow}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
