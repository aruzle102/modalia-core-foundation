import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { PageHeader, EmptyState, ErrorState } from "@/components/dashboard";
import { formatPrice } from "@/lib/i18n/format";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { readWishlist, toggleWishlist, type WishlistItem } from "@/lib/wishlist-store";
import { getWishlistLivePrices, type WishlistLivePrice } from "@/lib/product.functions";
import { pageHead } from "@/lib/seo";
import { motionTw } from "@/lib/motion-tokens";

export const Route = createFileRoute("/wishlist")({
  head: () =>
    pageHead({
      title: "Wishlist — Modalia",
      description: "Saved Modalia products ready to revisit.",
      path: "/wishlist",
      robots: "noindex,nofollow",
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  errorComponent: WishlistError,
  component: WishlistPage,
});

function WishlistError() {
  const { locale } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={getTranslations(locale)} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <ErrorState title={getTranslations(locale).common.loadError} />
      </main>
      <SiteFooter locale={locale} t={getTranslations(locale)} />
    </div>
  );
}

function WishlistPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const tw = t.wishlist;
  const [items, setItems] = useState<WishlistItem[]>(() => readWishlist());
  function remove(item: WishlistItem) {
    toggleWishlist(item);
    setItems(readWishlist());
  }

  const productIds = useMemo(() => items.map((item) => item.productId), [items]);
  // Live prices/availability: wishlist entries are localStorage snapshots, so
  // refresh them to surface current prices, sale (compare-at) offers and
  // out-of-stock state instead of stale saved values.
  const liveQuery = useQuery({
    queryKey: ["wishlist-live", productIds],
    queryFn: () => getWishlistLivePrices({ data: { productIds, locale } }),
    enabled: productIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const liveById = useMemo(() => {
    const map = new Map<string, WishlistLivePrice>();
    for (const entry of liveQuery.data?.items ?? []) map.set(entry.productId, entry);
    return map;
  }, [liveQuery.data]);

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader eyebrow={tw.eyebrow} title={t.nav.wishlist} description={tw.text} />
        {!items.length ? (
          <section className="mt-2">
            <EmptyState
              icon={<Heart className="h-5 w-5" />}
              title={tw.emptyTitle}
              action={
                <Button asChild>
                  <Link
                    to="/shop"
                    search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" , brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}
                  >
                    {tw.discoverProducts}
                  </Link>
                </Button>
              }
            />
          </section>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => {
              const live = liveById.get(item.productId);
              const known = liveQuery.data ? Boolean(live) : true;
              const price = live?.price ?? item.price;
              const compareAt = live?.compareAtPrice ?? null;
              const sale =
                compareAt != null && compareAt > price
                  ? Math.round(((compareAt - price) / compareAt) * 100)
                  : null;
              const unavailable = liveQuery.data != null && (!live || !live.available);
              return (
                <article
                  key={item.productId}
                  className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
                >
                  <Link
                    to="/product/$slug"
                    params={{ slug: live?.slug ?? item.slug }}
                    search={{ locale }}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          loading="lazy"
                          className={`size-full object-cover ${motionTw.transition.transform} ${motionTw.duration.cinematic} group-hover:scale-[1.03]`}
                        />
                      ) : null}
                      {sale != null ? (
                        <span className="absolute start-2 top-2 rounded-md bg-[#E53935] px-2 py-1 text-caption font-semibold text-white">
                          {tw.onSale} −{sale}%
                        </span>
                      ) : null}
                      {unavailable ? (
                        <span className="absolute start-2 top-2 rounded-md bg-muted px-2 py-1 text-caption font-medium text-muted-foreground">
                          {tw.unavailable}
                        </span>
                      ) : null}
                    </div>
                    <div className="p-3">
                      <p className="text-caption text-muted-foreground">{item.storeName}</p>
                      <h3 className="mt-1 line-clamp-2 text-small font-medium text-foreground">{item.name}</h3>
                      <p className="mt-2 flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold tabular-nums text-foreground">{formatPrice(price, locale)}</span>
                        {compareAt != null && compareAt > price ? (
                          <span className="text-caption text-muted-foreground line-through">
                            {formatPrice(compareAt, locale)}
                          </span>
                        ) : null}
                      </p>
                      {!known ? (
                        <p className="mt-1 text-caption text-muted-foreground">{tw.unavailable}</p>
                      ) : null}
                    </div>
                  </Link>
                  <div className="border-t border-border px-2 py-1.5">
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-destructive" onClick={() => remove(item)}>
                      <Trash2 />
                      {tw.remove}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
