import { useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight, Heart, ShoppingBag, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/i18n/format";
import { getTranslations } from "@/lib/i18n";
import { isWishlisted, toggleWishlist } from "@/lib/wishlist-store";
import { microAnimationClass, replayAnimation } from "@/lib/motion";
import { startBuyNow } from "@/components/marketplace/buy-now";
import type { CatalogCategory, CatalogProduct, CatalogStore } from "@/lib/catalog.functions";
import { OfficialStoreBadge, VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import type { SupportedLocale } from "@/config/platform";
import { motionTw } from "@/lib/motion-tokens";

const NEW_BADGE_DAYS = 14;
const LOW_STOCK_THRESHOLD = 5;

function isNewProduct(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

function discountPercent(price: number, compareAtPrice: number | null | undefined): number | null {
  if (compareAtPrice == null || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

export function ProductCard({
  product,
  locale,
}: {
  product: CatalogProduct;
  locale: SupportedLocale;
}) {
  const [wishlisted, setWishlisted] = useState(() => isWishlisted(product.id));
  // Image carousel (Product Card 1 reference): arrows + indicators
  const images = [product.imagePath, product.secondImagePath].filter(Boolean) as string[];
  const [imgIndex, setImgIndex] = useState(0);
  const t = getTranslations(locale).card;

  // Badges come from real data only: discount from compareAtPrice,
  // "new" from createdAt, low stock from summed variant inventory.
  const sale = discountPercent(product.price, product.compareAtPrice);
  const fresh = isNewProduct(product.createdAt);
  const stock = product.totalStock;
  const soldOut = stock === 0;
  const showArrows = images.length > 1 && !soldOut;
  const lowStock = stock != null && stock > 0 && stock <= LOW_STOCK_THRESHOLD;

  // Honest quick-add: raise a mode:"add" request for the catalog card.
  // BuyNowHost fetches real variant data server-side — default-variant
  // products go straight to the cart with a toast; products with required
  // options open the variant sheet instead of guessing. Never a fake line.
  const handleQuickAdd = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    startBuyNow(
      locale,
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.imagePath,
        storeName: product.storeName,
      },
      { mode: "add", quantity: 1 },
    );
  };

  const handleBuyNow = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    startBuyNow(
      locale,
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.imagePath,
        storeName: product.storeName,
      },
      { mode: "buy", quantity: 1 },
    );
  };

  const handleWishlist = (event: any) => {
    event.stopPropagation();
    const added = toggleWishlist({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.imagePath,
      storeName: product.storeName,
    });
    setWishlisted(added);
    if (added) replayAnimation(event.currentTarget, microAnimationClass.wishlistPop);
  };


  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-[0_20px_45px_-18px_rgba(0,0,0,0.25)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {/* Image carousel — arrows + indicators.
          Arrows stopPropagation so they don't trigger the product link. */}
      <div className="relative">
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          search={{ locale }}
          className="block"
          aria-label={product.name}
        >
          <div className={`relative aspect-[4/5] overflow-hidden bg-muted ${soldOut ? "saturate-50" : ""}`}>
            {images.length > 0 ? (
              <img
                key={imgIndex}
                src={images[imgIndex]}
                alt={product.imageAlt || product.name}
                loading="lazy"
                decoding="async"
                sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className={`size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${soldOut ? "opacity-75 saturate-50" : ""}`}
              />
            ) : (
              <div className="flex size-full items-end p-5 text-sm text-muted-foreground">
                Modalia
                <br />
                {product.name}
              </div>
            )}
            {/* Subtle bottom gradient for legibility + premium depth */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            {soldOut ? (
              <div className="absolute inset-0 grid place-items-center bg-background/45 backdrop-blur-[1px]">
                <span className="rounded-full bg-foreground px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-background">
                  {t.soldOut}
                </span>
              </div>
            ) : null}
          </div>
        </Link>
        {showArrows ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setImgIndex((i) => (i - 1 + images.length) % images.length); }}
              className="absolute start-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-800 opacity-0 shadow-md backdrop-blur-sm transition-all group-hover:opacity-100 hover:scale-105 hover:bg-white focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setImgIndex((i) => (i + 1) % images.length); }}
              className="absolute end-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-800 opacity-0 shadow-md backdrop-blur-sm transition-all group-hover:opacity-100 hover:scale-105 hover:bg-white focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
            <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rtl:translate-x-1/2" aria-hidden="true">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* Badges — real data only, refined pills top-start */}
        <div className="pointer-events-none absolute start-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {sale != null ? (
            <span className="rounded-full bg-destructive/95 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-white shadow-md ring-1 ring-black/10 backdrop-blur-sm">
              -{sale}%
            </span>
          ) : null}
          {fresh ? (
            <span className="rounded-full bg-emerald-600/95 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-md ring-1 ring-black/10 backdrop-blur-sm">
              {t.new}
            </span>
          ) : null}
        </div>

        {/* Wishlist — frosted circle top-end, heart fills red when active */}
        <button
          type="button"
          onClick={handleWishlist}
          aria-pressed={wishlisted}
          aria-label={t.wishlist(product.name)}
          className="absolute end-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-white/90 text-neutral-900 shadow-md backdrop-blur-sm transition-all hover:scale-110 hover:bg-white active:scale-95 touch-manipulation dark:bg-neutral-900/90 dark:text-white"
        >
          <Heart className={`size-4 transition-colors ${wishlisted ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {/* Info — store, name, price, then actions */}
      <div className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-3.5">
        {product.storeName ? (
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {product.storeName}
          </p>
        ) : null}
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          search={{ locale }}
          className="block"
          aria-label={product.name}
        >
          <h3 className="line-clamp-2 min-h-[2.5em] text-[14px] font-semibold leading-snug text-foreground transition-colors group-hover:text-foreground/80">
            {product.name}
          </h3>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-foreground">
              {formatPrice(product.price, locale)}
            </span>
            {sale != null && product.compareAtPrice ? (
              <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice, locale)}
              </span>
            ) : null}
          </p>
        </Link>
        {lowStock ? (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
            {t.onlyLeft(stock as number)}
          </p>
        ) : null}
        <div className="mt-auto flex gap-2 pt-3.5">
          <button
            type="button"
            onClick={handleBuyNow}
            disabled={soldOut}
            aria-label={soldOut ? t.soldOut : t.buyNow}
            title={soldOut ? t.soldOut : t.buyNow}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-neutral-700 hover:shadow active:scale-[0.98] active:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none touch-manipulation dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:active:bg-neutral-300"
          >
            <Zap className="size-4" aria-hidden="true" />
            {t.buyNow}
          </button>
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={soldOut}
            aria-label={soldOut ? t.soldOut : t.quickAdd}
            title={soldOut ? t.soldOut : t.quickAdd}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground shadow-sm transition-all hover:border-foreground/30 hover:bg-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function CategoryRail({
  categories,
  locale,
}: {
  categories: CatalogCategory[];
  locale: SupportedLocale;
}) {
  const t = getTranslations(locale).card;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-6 lg:overflow-visible lg:pb-0">
      {categories.map((category, index) => {
        const featured = index === 0;
        return (
          <Link
            key={category.id}
            to="/category/$slug"
            params={{ slug: category.slug }}
            search={{ locale }}
            className={
              featured
                ? "group relative flex min-h-72 w-64 shrink-0 flex-col justify-end overflow-hidden rounded-xl bg-ink p-6 text-primary-foreground sm:w-72 lg:col-span-2 lg:row-span-2 lg:w-auto"
                : `group flex min-h-40 w-40 shrink-0 flex-col justify-between rounded-xl border border-border bg-card p-5 ${motionTw.transition.interactive} ${motionTw.duration.feedback} hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.3)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:w-auto lg:min-w-0`
            }
          >
            {featured ? (
              <div
                className="hero-orb hero-orb-b pointer-events-none"
                aria-hidden
                style={{
                  width: "16rem",
                  height: "16rem",
                  left: "auto",
                  insetInlineEnd: "-5rem",
                  bottom: "-6rem",
                }}
              />
            ) : null}
            <div className="relative">
              <p
                className={
                  featured
                    ? "font-display text-2xl font-semibold leading-tight tracking-tight"
                    : "text-h3 text-foreground"
                }
              >
                {category.name}
              </p>
              <p
                className={
                  featured
                    ? "mt-2 text-small text-primary-foreground/65"
                    : "mt-1 text-caption text-muted-foreground"
                }
              >
                {t.productsCount(category.productCount)}
              </p>
              <ArrowRight
                className={`${featured ? "text-primary-foreground/70" : "text-muted-foreground"} mt-5 size-4 ${motionTw.transition.transform} ${motionTw.duration.feedback} group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 motion-reduce:transition-none`}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Store cards as brands — an editorial brand moment, not a generic card.
 * Wide 21:9 banner, circular logo overlapping the banner's bottom-left,
 * Manrope store name with the verification badge, and a muted meta line.
 * The whole card is the link; no buttons.
 */
export function StoreRail({ stores, locale }: { stores: CatalogStore[]; locale: SupportedLocale }) {
  const t = getTranslations(locale).card;
  const storeT = getTranslations(locale).store;
  return (
    <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {stores.map((store) => (
        <Link
          key={store.id}
          to="/store/$slug"
          params={{ slug: store.slug }}
          search={{ locale }}
          className="group block min-w-0"
          aria-label={store.name}
        >
          <div className="relative">
            <div className="aspect-[21/9] overflow-hidden rounded-2xl bg-muted ring-1 ring-border/40 transition-shadow duration-300 group-hover:shadow-[0_16px_36px_-14px_rgba(0,0,0,0.22)]">
              {store.bannerPath ? (
                <img
                  src={store.bannerPath}
                  alt=""
                  aria-hidden
                  loading="lazy"

                  className={`size-full object-cover ${motionTw.transition.transform} ${motionTw.duration.cinematic} ${motionTw.ease.out} group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
                />
              ) : (
                <div
                  aria-hidden
                  className="flex size-full items-center justify-center bg-muted"
                >
                  <span className="font-display text-6xl font-semibold tracking-tight text-foreground/10">
                    {store.name.slice(0, 1)}
                  </span>
                </div>
              )}
            </div>
            <div className="absolute bottom-0 start-6 translate-y-1/2">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white p-1.5 ring-2 ring-background shadow-md">
                {store.logoPath ? (
                  <img
                    src={store.logoPath}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="size-full object-contain"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-full place-items-center rounded-full bg-secondary font-display text-xl font-semibold text-foreground"
                  >
                    {store.name.slice(0, 1)}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="mt-10 px-1">
            <h3 className="flex items-center gap-2 font-display text-xl font-semibold leading-snug text-foreground">
              <span className="truncate transition-colors group-hover:text-foreground/70">
                {store.name}
              </span>
              {store.slug === "modalia" ? (
                <OfficialStoreBadge label={storeT.officialStore} />
              ) : (
                <VerifiedSellerBadge verified={store.verified} tone={store.verificationBadge} label={storeT.verifiedStore} />
              )}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.productsCount(store.productCount)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ProductGrid({
  products,
  locale,
  emptyTitle,
  emptyText,
}: {
  products: CatalogProduct[];
  locale: SupportedLocale;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const t = getTranslations(locale).card;
  if (!products.length)
    return (
      <section className="rounded-2xl border border-border bg-card py-16 text-center">
        <ShoppingBag className="mx-auto size-6 text-muted-foreground" />
        <h2 className="mt-4 text-h3 text-foreground">{emptyTitle ?? t.emptyTitle}</h2>
        <p className="mx-auto mt-2 max-w-sm text-small text-muted-foreground">{emptyText ?? t.emptyText}</p>
      </section>
    );
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-10 xl:grid-cols-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} locale={locale} />
      ))}
    </div>
  );
}

export function DiscoverySkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Skeleton className="h-[28rem] w-full" />
      <div className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
