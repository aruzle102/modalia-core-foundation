/**
 * Partner advertising banner for /home.
 * Premium billboard: ONE wide banner image in a rounded-2xl frame
 * (150px mobile → 190px desktop, object-cover), no text block, no button.
 * Uses real active banners from the Admin-controlled system.
 * Carousel when multiple banners are active (dots + optional arrows).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActivePartnerBanners } from "@/lib/partner-banners.functions";

export function PartnerBannerCarousel() {
  const { data: banners } = useQuery({
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
  if (!banner || imgError || !banner.imageUrl) return null;

  const goTo = (dir: number) => {
    setImgError(false);
    setIndex((i) => (i + dir + list.length) % list.length);
  };

  const inner = (
    <img
      src={banner.imageUrl}
      alt={banner.title || "Partner"}
      loading="lazy"
      onError={() => setImgError(true)}
      className="block h-[150px] w-full object-cover sm:h-[170px] lg:h-[190px]"
    />
  );

  return (
    <section aria-label="Partners" className="mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6 sm:pb-14 lg:px-10">
      <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-muted">
        {banner.linkUrl ? (
          <a
            href={banner.linkUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block"
          >
            {inner}
          </a>
        ) : (
          inner
        )}
        {/* Legibility gradient for the carousel dots */}
        {list.length > 1 ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/30 to-transparent"
            aria-hidden
          />
        ) : null}

        {/* Carousel controls */}
        {list.length > 1 && (
          <>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {list.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Banner ${i + 1}`}
                  onClick={() => {
                    setImgError(false);
                    setIndex(i);
                  }}
                  className={`size-1.5 rounded-full transition-all ${
                    i === index % list.length ? "w-5 bg-white" : "bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => goTo(-1)}
              className="absolute start-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/60 group-hover:opacity-100 md:block"
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => goTo(1)}
              className="absolute end-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/60 group-hover:opacity-100 md:block"
            >
              <ChevronRight className="size-4 rtl:rotate-180" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
