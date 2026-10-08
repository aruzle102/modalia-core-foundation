/**
 * Modalia Hero — premium editorial hero for the homepage.
 * Compact, cinematic but clean. Fashion + Sports + Lifestyle.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ModaliaHero() {
  const locale = getLocale();
  const t = getTranslations(locale);

  return (
    <section
      aria-label="Hero"
      className="relative overflow-hidden bg-neutral-950 text-white"
    >
      {/* Subtle gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 70% 30%, rgba(255,255,255,0.08), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          {/* Eyebrow */}
          <p
            className={cn(
              "mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60",
              "motion-safe:animate-[fadeUp_0.6s_ease-out]"
            )}
          >
            t.home.heroEyebrow
          </p>

          {/* Headline */}
          <h1
            className={cn(
              "text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl",
              "motion-safe:animate-[fadeUp_0.6s_ease-out_0.1s_both]"
            )}
          >
            t.home.heroTitle
          </h1>

          {/* Subtext */}
          <p
            className={cn(
              "mt-4 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg",
              "motion-safe:animate-[fadeUp_0.6s_ease-out_0.2s_both]"
            )}
          >
            t.home.heroSubtitle
          </p>

          {/* CTA */}
          <div
            className={cn(
              "mt-8",
              "motion-safe:animate-[fadeUp_0.6s_ease-out_0.3s_both]"
            )}
          >
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-neutral-950 transition-all hover:bg-white/90 hover:gap-3 active:scale-[0.98]"
            >
              t.home.heroCta
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom fade into content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"
      />

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[fadeUp_0\\.6s_ease-out\\],
          .motion-safe\\:animate-\\[fadeUp_0\\.6s_ease-out_0\\.1s_both\\],
          .motion-safe\\:animate-\\[fadeUp_0\\.6s_ease-out_0\\.2s_both\\],
          .motion-safe\\:animate-\\[fadeUp_0\\.6s_ease-out_0\\.3s_both\\] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
