/**
 * Modalia Landing — "/" brand experience.
 * Editorial visual storytelling: imagery + typography + motion.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowDown } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

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
      ([e]) => {
        if (e.isIntersecting) {
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

/* ---------- Image URLs (replaceable) ---------- */
const IMG = {
  heroMain: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&q=80",
  heroSecondary: "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&q=80",
  fashion: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&q=80",
  sport: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200&q=80",
  lifestyle: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200&q=80",
  marketplace: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80",
};

/* ---------- Landing ---------- */
function LandingPage() {
  const locale = getLocale();
  const t = getTranslations(locale);
  const heroTitle = (t.home as any).heroTitle || "Discover What Moves You";
  const heroSubtitle =
    (t.home as any).heroSubtitle || "Explore fashion, sports and everyday essentials — all in one place.";
  const heroCta = (t.home as any).heroCta || "Enter Modalia";

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-neutral-950 text-white antialiased">
      <main id="main-content">

        {/* ===== OPENING — cinematic image hero ===== */}
        <section className="relative flex min-h-[92vh] items-center overflow-hidden">
          {/* Background image */}
          <div className="absolute inset-0">
            <img
              src={IMG.heroMain}
              alt="Modalia fashion campaign"
              className="h-full w-full object-cover object-center motion-safe:animate-[heroZoom_20s_ease-in-out_infinite_alternate]"
              loading="eager"
            />
          </div>
          {/* Cinematic dark overlay */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

          <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-6 text-[12px] font-bold uppercase tracking-[0.45em] text-white/60">Modalia</p>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight text-white drop-shadow-lg sm:text-7xl lg:text-8xl">
                {heroTitle}
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 drop-shadow sm:text-xl">{heroSubtitle}</p>
            </Reveal>
            <Reveal delay={300}>
              <Link
                to="/home"
                className="group mt-10 inline-flex w-fit items-center gap-3 rounded-full bg-white px-10 py-4 text-sm font-semibold text-neutral-950 shadow-2xl transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                {heroCta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Reveal>
            <Reveal delay={400}>
              <div className="mt-14 flex items-center gap-3 text-white/50">
                <ArrowDown className="size-4 animate-bounce" />
                <span className="text-[11px] uppercase tracking-[0.25em]">Scroll</span>
              </div>
            </Reveal>
          </div>

          <style>{`
            @keyframes heroZoom {
              from { transform: scale(1); }
              to { transform: scale(1.08); }
            }
            @media (prefers-reduced-motion: reduce) {
              .motion-safe\:animate-\[heroZoom_20s_ease-in-out_infinite_alternate\] {
                animation: none !important;
              }
            }
          `}</style>
        </section>

        {/* ===== DISCOVER — image expansion ===== */}
        <section className="relative bg-white py-24 text-neutral-950 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-400">Discover</p>
              <h2 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                One place.<br />Endless ways to discover.
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <div className="mt-12 overflow-hidden rounded-3xl">
                <ParallaxImage src={IMG.marketplace} alt="Modalia marketplace" className="aspect-[21/9]" speed={70} />
              </div>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-8 max-w-2xl text-lg leading-relaxed text-neutral-600">
                Fashion, sport, lifestyle and independent stores — brought together
                in one marketplace, curated for modern everyday life.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== FASHION — full-bleed visual moment ===== */}
        <section className="relative overflow-hidden bg-neutral-950">
          <ParallaxImage src={IMG.fashion} alt="Fashion" className="absolute inset-0 opacity-60" speed={90} />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-neutral-950/70" />
          <div className="relative mx-auto flex min-h-[80vh] max-w-7xl flex-col justify-end px-4 pb-20 pt-32 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Fashion</p>
              <h2 className="max-w-2xl text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
                Find your<br />next statement.
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <Link to="/home" className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/85 transition-all hover:gap-4 hover:text-white">
                Explore fashion <ArrowRight className="size-4" />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ===== SPORT — alternating visual moment ===== */}
        <section className="relative overflow-hidden bg-white text-neutral-950">
          <div className="grid lg:grid-cols-2">
            <div className="relative min-h-[50vh] overflow-hidden lg:min-h-[80vh]">
              <ParallaxImage src={IMG.sport} alt="Sport" className="absolute inset-0" speed={80} />
            </div>
            <div className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-16">
              <Reveal>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.35em] text-neutral-400">Sport</p>
                <h2 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                  Move<br />your way.
                </h2>
              </Reveal>
              <Reveal delay={150}>
                <p className="mt-6 max-w-md text-lg leading-relaxed text-neutral-600">
                  Performance gear, sneakers and sportswear — built for how you move.
                </p>
                <Link to="/home" className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold transition-all hover:gap-4">
                  Explore sport <ArrowRight className="size-4" />
                </Link>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ===== LIFESTYLE — visual moment ===== */}
        <section className="relative overflow-hidden bg-neutral-950">
          <div className="grid lg:grid-cols-2">
            <div className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-16 order-2 lg:order-1">
              <Reveal>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/50">Lifestyle</p>
                <h2 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                  Everyday,<br />elevated.
                </h2>
              </Reveal>
              <Reveal delay={150}>
                <p className="mt-6 max-w-md text-lg leading-relaxed text-white/60">
                  Essentials for modern living — thoughtfully selected.
                </p>
                <Link to="/home" className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/85 transition-all hover:gap-4 hover:text-white">
                  Explore lifestyle <ArrowRight className="size-4" />
                </Link>
              </Reveal>
            </div>
            <div className="relative min-h-[50vh] overflow-hidden lg:min-h-[80vh] order-1 lg:order-2">
              <ParallaxImage src={IMG.lifestyle} alt="Lifestyle" className="absolute inset-0" speed={80} />
            </div>
          </div>
        </section>

        {/* ===== MARKETPLACE ===== */}
        <section className="bg-white py-24 text-neutral-950 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-400">Marketplace</p>
                <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                  Not just one store.<br />A marketplace.
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-neutral-600">
                  Independent boutiques, brands and creators — all in one place,
                  all verified, all ready to discover.
                </p>
                <div className="mt-8 flex flex-wrap gap-6 text-sm">
                  {["Products", "Boutiques", "Discovery"].map((w) => (
                    <span key={w} className="rounded-full border border-neutral-200 px-5 py-2.5 font-medium">{w}</span>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={150}>
                <div className="overflow-hidden rounded-3xl">
                  <ParallaxImage src={IMG.marketplace} alt="Boutiques" className="aspect-[4/3]" speed={60} />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="relative overflow-hidden bg-neutral-950 py-32 sm:py-44">
          <ParallaxImage src={IMG.heroMain} alt="" className="absolute inset-0 opacity-25" speed={100} />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-neutral-950" />
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <Reveal>
              <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
                Everything you're looking for.<br />One place.
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <Link
                to="/home"
                className="group mt-10 inline-flex items-center gap-3 rounded-full bg-white px-12 py-5 text-base font-semibold text-neutral-950 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                {heroCta}
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
