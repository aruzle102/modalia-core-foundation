/**
 * Partner banner carousel — rectangular rotating ads at top of homepage.
 * Managed from /admin/banners. Each banner links to the partner URL.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActivePartnerBanners } from "@/lib/partner-banners.functions";

export function PartnerBannerCarousel() {
  const { data: banners, isPending, isError } = useQuery({
    queryKey: ["partner-banners"],
    queryFn: () => getActivePartnerBanners(),
    staleTime: 60_000,
  });
  const [index, setIndex] = useState(0);
  const [imgError, setImgError] = useState(false);

  const list = banners ?? [];
  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % list.length), 5000);
    return () => clearInterval(t);
  }, [list.length]);

  // Loading: show skeleton so the space is reserved
  if (isPending) {
    return (
      <section aria-label="Partners" className="mx-auto max-w-7xl px-4 pt-6">
        <div className="h-32 animate-pulse rounded-2xl bg-muted sm:h-40" />
      </section>
    );
  }

  // Error or empty: don't render (admin can add banners)
  if (isError || list.length === 0) return null;
  const banner = list[index % list.length];
  if (!banner) return null;

  return (
    <section aria-label="Partners" className="mx-auto max-w-7xl px-4 pt-6">
      <div className="relative overflow-hidden rounded-2xl">
        <a
          href={banner.linkUrl}
          target={banner.linkUrl.startsWith("http") ? "_blank" : undefined}
          rel={banner.linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
          className="block"
        >
          {!imgError ? (
            <img
              src={banner.imageUrl}
              alt={banner.title}
              className="h-32 w-full object-cover sm:h-40"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-32 items-center justify-center bg-muted sm:h-40">
              <span className="text-lg font-semibold text-muted-foreground">{banner.title}</span>
            </div>
          )}
        </a>
        {list.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
              className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setIndex((i) => (i + 1) % list.length)}
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {list.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  aria-label={`Go to ${b.title}`}
                  onClick={() => setIndex(i)}
                  className={`size-2 rounded-full transition-colors ${i === index % list.length ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
