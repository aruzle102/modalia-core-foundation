/**
 * CommerceHero — the single commercial hero for /home.
 * NOT the landing hero. Editorial full-width campaign composition:
 * fashion imagery, subtle dark overlay, French campaign copy,
 * primary/secondary CTAs and compact category shortcut links.
 * No carousel. No red borders. Reduced-motion safe.
 */
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { SupportedLocale } from "@/config/platform";

export type HeroShortcut = {
  label: string;
  /** Route path, e.g. "/category/sport" or "/shop". */
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
};

/** Hero imagery — curated commerce photography, easy to replace. */
const HERO_MAIN = "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=80";

export function CommerceHero({
  locale,
  eyebrow,
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  shortcuts,
}: {
  locale: SupportedLocale;
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
  shortcuts: HeroShortcut[];
}) {
  const ref = useRef<HTMLElement | null>(null);

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
        if (img) img.style.transform = `translateY(${progress * 48}px) scale(${1 + progress * 0.04})`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={ref}
      aria-label="Nouveautés"
      className="relative flex min-h-[600px] items-center overflow-hidden bg-[#0A0A0A] text-white lg:min-h-[560px]"
    >
      {/* Full-width campaign image */}
      <div className="absolute inset-0" aria-hidden="true">
        <img
          data-hero-img
          src={HERO_MAIN}
          alt=""
          loading="eager"
          className="h-full w-full scale-105 object-cover object-center will-change-transform"
        />
        {/* Subtle dark overlay for readability */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70">
          {eyebrow}
        </p>
        <h1 className="mt-5 max-w-2xl text-[40px] font-bold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
          {subtitle}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/shop"
            search={{ locale } as any}
            className="group inline-flex items-center gap-2 rounded-[10px] bg-white px-7 py-3.5 text-sm font-semibold text-[#0A0A0A] transition-all hover:bg-white/90 active:scale-[0.98]"
          >
            {primaryLabel}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
          </Link>
          <Link
            to={"/stores" as any}
            search={{ locale } as any}
            className="inline-flex items-center gap-2 rounded-[10px] border border-white/40 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:border-white hover:bg-white/10 active:scale-[0.98]"
          >
            {secondaryLabel}
          </Link>
        </div>

        {/* Category shortcuts — compact text links, not pills */}
        {shortcuts.length > 0 ? (
          <nav aria-label="Catégories" className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
            {shortcuts.map((s) => (
              <Link
                key={s.label}
                to={s.to as any}
                params={s.params as any}
                search={{ locale, ...(s.search ?? {}) } as any}
                className="group inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.22em] text-white/75 transition-colors hover:text-white"
              >
                {s.label}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
