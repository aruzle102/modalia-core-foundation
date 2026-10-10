/**
 * Partner advertising banner for /home.
 * Pure image billboard: ONE horizontal banner image, no card, no text block,
 * no button. Wide + short (150-190px mobile, 140-180px desktop).
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
      className="h-[150px] w-full rounded-[14px] object-cover md:h-[170px]"
    />
  );

  return (
    <section aria-label="Partners" className="mx-auto max-w-7xl px-4 pt-2 sm:px-6 lg:px-8">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#666666]">
        NOS PARTENAIRES
      </p>
      <div className="group relative">
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
              className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/60 group-hover:opacity-100 md:block"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => goTo(1)}
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/60 group-hover:opacity-100 md:block"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
