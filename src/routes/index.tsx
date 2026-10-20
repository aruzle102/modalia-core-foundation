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
import { browseCatalog } from "@/lib/catalog.functions";

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

/* ---------- Image URLs (replaceable) ---------- */
const IMG = {
  heroMain: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&q=80",
  /* Hero backdrop: luxury fashion atelier — clothing racks, elegant fabrics */
  heroBackdrop: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80",
  fashion: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&q=80",
  sport: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=1200&q=80",
  lifestyle: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200&q=80",
  marketplace: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80",
  /* Hero category mosaic tiles */
  catFashion: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&q=80",
  catShoes: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
  catSports: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80",
  catAccessories: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&q=80",
};

/* Hero category tiles — trilingual labels, link to the shopping entry (/home).
   Category slugs are admin-managed, so tiles navigate to /home rather than
   guessing slugs that may not exist. */
const HERO_CATS = [
  { key: "fashion", img: "catFashion", label: { ar: "أزياء", fr: "Mode", en: "Fashion" }, tall: true },
  { key: "shoes", img: "catShoes", label: { ar: "أحذية", fr: "Chaussures", en: "Shoes" } },
  { key: "sports", img: "catSports", label: { ar: "رياضة", fr: "Sport", en: "Sports" } },
  { key: "accessories", img: "catAccessories", label: { ar: "إكسسوارات", fr: "Accessoires", en: "Accessories" }, wide: true },
] as const;

const HERO_BOUTIQUES_CTA = { ar: "اكتشف المتاجر", fr: "Découvrir les boutiques", en: "Discover boutiques" };

/* ---------- Dynamic Accessories Tile ----------
   Fetches real accessories products and rotates their images.
   Falls back to the static image if none available. */
function DynamicAccessoriesTile({
  locale,
  label,
}: {
  locale: "ar" | "fr" | "en";
  label: string;
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
      to="/home"
      search={{ locale }}
      aria-label={label}
      className="group relative col-span-2 min-h-[140px] overflow-hidden rounded-3xl sm:min-h-[180px]"
    >
      <img
        src={src}
        alt={label}
        loading="lazy"
        key={src}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />
      <span className="absolute bottom-4 start-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-white/25">
        {label}
        <ArrowRight className="size-4 rtl:rotate-180" />
      </span>
    </Link>
  );
}

/* ---------- Landing ---------- */
const SCROLL_LABEL = { ar: "مرّر", fr: "Défiler", en: "Scroll" };

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

        {/* ===== OPENING — editorial split hero ===== */}
        <section className="relative overflow-hidden bg-neutral-950">
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
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-10 select-none overflow-hidden">
            <p className="whitespace-nowrap text-center text-[24vw] font-black leading-none tracking-tighter text-white/[0.035]">
              MODALIA
            </p>
          </div>

          <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-14 lg:px-8 lg:pb-24 lg:pt-32">
            {/* Copy */}
            <div>
              <Reveal>
                <p className="flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.45em] text-white/60">
                  <span aria-hidden="true" className="h-px w-10 bg-white/40" />
                  Modalia
                </p>
              </Reveal>
              <Reveal delay={100}>
                <h1 className="mt-6 max-w-xl text-5xl font-black leading-[1.0] tracking-tighter text-white sm:text-7xl lg:text-[5.25rem]">
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

            {/* Category mosaic — the multi-category marketplace, visible */}
            <Reveal delay={200}>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {HERO_CATS.map((cat) =>
                  cat.key === "accessories" ? (
                    <DynamicAccessoriesTile
                      key={cat.key}
                      locale={locale}
                      label={cat.label[locale] ?? cat.label.en}
                    />
                  ) : (
                    <Link
                      key={cat.key}
                      to="/home"
                      search={{ locale }}
                      aria-label={cat.label[locale] ?? cat.label.en}
                      className={[
                        "group relative overflow-hidden rounded-3xl",
                        "tall" in cat && cat.tall ? "row-span-2 min-h-[340px] sm:min-h-[440px] lg:min-h-[540px]" : "",
                        "wide" in cat && cat.wide
                          ? "col-span-2 min-h-[140px] sm:min-h-[180px]"
                          : "tall" in cat && cat.tall
                            ? ""
                            : "min-h-[164px] sm:min-h-[212px] lg:min-h-[262px]",
                      ].join(" ")}
                    >
                      <img
                        src={IMG[cat.img]}
                        alt={cat.label[locale] ?? cat.label.en}
                        loading={cat.key === "fashion" ? "eager" : "lazy"}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
                      />
                      <span className="absolute bottom-4 start-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-white/25">
                        {cat.label[locale] ?? cat.label.en}
                        <ArrowRight className="size-4 rtl:rotate-180" />
                      </span>
                    </Link>
                  ),
                )}
              </div>
            </Reveal>
          </div>

          {/* Soft fade into the next (light) section */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-neutral-950 to-transparent"
          />
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
              <Link to="/home" search={{ locale }} className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/85 transition-all hover:gap-4 hover:text-white">
                Explore fashion <ArrowRight className="size-4 rtl:rotate-180" />
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
                <Link to="/home" search={{ locale }} className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold transition-all hover:gap-4">
                  Explore sport <ArrowRight className="size-4 rtl:rotate-180" />
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
                <Link to="/home" search={{ locale }} className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/85 transition-all hover:gap-4 hover:text-white">
                  Explore lifestyle <ArrowRight className="size-4 rtl:rotate-180" />
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
                search={{ locale }}
                className="group mt-10 inline-flex items-center gap-3 rounded-full bg-white px-12 py-5 text-base font-semibold text-neutral-950 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                {heroCta}
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1 rtl:rotate-180" />
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
