/**
 * Modalia Landing — "/" brand experience.
 * Cinematic editorial entry: MODALIA → DISCOVER → FASHION → SPORT → LIFESTYLE → MARKETPLACE → ENTER.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowDown } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

/* ---------- Scroll reveal hook ---------- */
function useReveal<T extends HTMLElement>(threshold = 0.15) {
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
        if (entry.isIntersecting) {
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
        "transition-all duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ---------- Parallax image ---------- */
function ParallaxImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
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
        const progress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
        const clamped = Math.max(0, Math.min(1, progress));
        const img = el.querySelector("img");
        if (img) img.style.transform = `translateY(${(clamped - 0.5) * 60}px) scale(1.1)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className={cn("overflow-hidden", className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover will-change-transform"
      />
    </div>
  );
}

/* ---------- Main landing page ---------- */
function LandingPage() {
  const locale = getLocale();
  const t = getTranslations(locale);

  const heroTitle = (t.home as any).heroTitle || "Discover What Moves You";
  const heroSubtitle =
    (t.home as any).heroSubtitle ||
    "Explore fashion, sports and everyday essentials — all in one place.";
  const heroCta = (t.home as any).heroCta || "Enter Modalia";

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-neutral-950 text-white">
      <SiteHeader locale={locale} t={t} />

      <main id="main-content">
        {/* SECTION 1 — OPENING */}
        <section className="relative flex min-h-[92vh] items-center overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black"
          />
          <div aria-hidden="true" className="absolute inset-0 opacity-40">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-white/5 to-transparent" />
          </div>

          <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-6 text-[12px] font-bold uppercase tracking-[0.4em] text-white/50">
                Modalia
              </p>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl">
                {heroTitle}
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70 sm:text-xl">
                {heroSubtitle}
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-10">
                <Link
                  to="/home"
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-10 py-4 text-sm font-semibold text-neutral-950 transition-all hover:bg-white/90 active:scale-[0.98]"
                >
                  {heroCta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>

            <Reveal delay={400}>
              <div className="mt-16 flex items-center gap-3 text-white/40">
                <ArrowDown className="size-4 animate-bounce" />
                <span className="text-xs uppercase tracking-[0.2em]">Scroll</span>
              </div>
            </Reveal>
          </div>
        </section>

        {/* SECTION 2 — DISCOVER */}
        <section className="relative bg-white py-24 text-neutral-950 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
                Discover
              </p>
              <h2 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                One place.
                <br />
                Endless ways to discover.
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
                Modalia brings together fashion, sport, lifestyle and independent
                stores in one marketplace — curated for modern everyday life.
              </p>
            </Reveal>
          </div>
        </section>

        {/* SECTION 3 — FASHION / SPORT / LIFESTYLE */}
        <section className="bg-neutral-950 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-12 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
                Worlds
              </p>
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { title: "Fashion", desc: "Curated style for every day.", img: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80" },
                { title: "Sport", desc: "Performance meets lifestyle.", img: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80" },
                { title: "Lifestyle", desc: "Essentials for modern living.", img: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=800&q=80" },
              ].map((world, i) => (
                <Reveal key={world.title} delay={i * 100}>
                  <Link
                    to="/home"
                    className="group block overflow-hidden rounded-2xl bg-neutral-900"
                  >
                    <ParallaxImage
                      src={world.img}
                      alt={world.title}
                      className="aspect-[4/5]"
                    />
                    <div className="p-6">
                      <h3 className="text-2xl font-bold">{world.title}</h3>
                      <p className="mt-2 text-sm text-white/60">{world.desc}</p>
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-white/80 transition-all group-hover:gap-3 group-hover:text-white">
                        Explore <ArrowRight className="size-4" />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4 — MARKETPLACE */}
        <section className="bg-white py-24 text-neutral-950 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  Marketplace
                </p>
                <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                  Not just one store.
                  <br />A marketplace.
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-neutral-600">
                  Independent boutiques, brands and creators — all in one place,
                  all verified, all ready to discover.
                </p>
                <Link
                  to="/home"
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-neutral-800"
                >
                  Start exploring <ArrowRight className="size-4" />
                </Link>
              </Reveal>
              <Reveal delay={150}>
                <ParallaxImage
                  src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1000&q=80"
                  alt="Marketplace"
                  className="aspect-[4/3] rounded-2xl"
                />
              </Reveal>
            </div>
          </div>
        </section>

        {/* SECTION 5 — FINAL CTA */}
        <section className="relative overflow-hidden bg-neutral-950 py-32 sm:py-40">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black via-neutral-950 to-neutral-900"
          />
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <Reveal>
              <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
                Everything you're looking for.
                <br />
                One place.
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <div className="mt-10">
                <Link
                  to="/home"
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-12 py-5 text-base font-semibold text-neutral-950 transition-all hover:bg-white/90 active:scale-[0.98]"
                >
                  {heroCta}
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
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
