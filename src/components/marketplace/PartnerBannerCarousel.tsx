/**
 * Partner advertising section for /home — placed below the hero.
 * Premium composition: white background, 1px #E5E5E5 border, 20px radius.
 * Content side carries the advertiser message + "Devenir partenaire" CTA
 * (→ /partnership). Visual side shows the real active partner banners from
 * the Admin-controlled system (rotating when several are active), or a
 * clean "MODALIA — ESPACE PUBLICITAIRE" placeholder when none exist.
 * Backend (Admin → Partner Banners) is untouched.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { getActivePartnerBanners } from "@/lib/partner-banners.functions";
import { getLocale, getTranslations, type Translation } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

export function PartnerBannerCarousel() {
  const locale: SupportedLocale = getLocale();
  const t: Translation = getTranslations(locale);
  const copy = t.home;
  const { data: banners, isPending } = useQuery({
    queryKey: ["partner-banners"],
    queryFn: () => getActivePartnerBanners(),
    staleTime: 60_000,
  });
  const [index, setIndex] = useState(0);
  const [imgError, setImgError] = useState(false);

  const list = banners ?? [];
  useEffect(() => {
    if (list.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
      setImgError(false);
    }, 6000);
    return () => clearInterval(timer);
  }, [list.length]);

  const banner = list.length > 0 ? list[index % list.length] : null;

  return (
    <section aria-label={copy.sfPartnersLabel} className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[20px] border border-[#E5E5E5] bg-white">
        <div className="grid md:grid-cols-2">
          {/* Content side */}
          <div className="flex flex-col items-start justify-center gap-4 p-6 sm:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#666666]">
              {copy.sfPartnersLabel}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-[#0A0A0A] sm:text-3xl">
              {copy.sfPartnersTitle}
            </h2>
            <p className="max-w-sm text-[15px] leading-relaxed text-[#666666]">
              {copy.sfPartnersText}
            </p>
            <Link
              to={"/partnership" as any}
              search={{ locale } as any}
              className="group mt-1 inline-flex items-center gap-2 rounded-[10px] bg-[#0A0A0A] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-black active:scale-[0.98]"
            >
              {copy.sfPartnersCta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
            </Link>
          </div>

          {/* Visual side — real active banner, or clean placeholder */}
          <div className="relative min-h-[220px] bg-[#F6F6F4] md:min-h-[280px]">
            {isPending ? (
              <div className="absolute inset-0 animate-pulse bg-[#E5E5E5]/60" />
            ) : banner && !imgError ? (
              <a
                key={banner.id}
                href={banner.linkUrl}
                target={banner.linkUrl.startsWith("http") ? "_blank" : undefined}
                rel={banner.linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                className="absolute inset-0 block"
                aria-label={banner.title}
              >
                <img
                  src={banner.imageUrl}
                  alt={banner.title}
                  loading="lazy"
                  onError={() => setImgError(true)}
                  className="size-full object-cover"
                />
              </a>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#0A0A0A]">
                  Modalia
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#666666]">
                  Espace publicitaire
                </p>
              </div>
            )}

            {/* Carousel controls — only when several real banners */}
            {list.length > 1 && banner && !imgError ? (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => {
                    setIndex((i) => (i - 1 + list.length) % list.length);
                    setImgError(false);
                  }}
                  className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => {
                    setIndex((i) => (i + 1) % list.length);
                    setImgError(false);
                  }}
                  className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
                >
                  <ChevronRight className="size-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {list.map((b, i) => (
                    <button
                      key={b.id}
                      type="button"
                      aria-label={b.title}
                      onClick={() => {
                        setIndex(i);
                        setImgError(false);
                      }}
                      className={`size-2 rounded-full transition-colors ${i === index % list.length ? "bg-white" : "bg-white/50"}`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
