import { useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Heart, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/i18n/format";
import { getTranslations } from "@/lib/i18n";
import { useCart } from "@/lib/cart-store";
import { isWishlisted, toggleWishlist } from "@/lib/wishlist-store";
import { microAnimationClass, replayAnimation } from "@/lib/motion";
import type { CatalogCategory, CatalogProduct, CatalogStore } from "@/lib/catalog.functions";
import { OfficialStoreBadge, VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import type { SupportedLocale } from "@/config/platform";

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
  dark = false,
}: {
  product: CatalogProduct;
  locale: SupportedLocale;
  /** Rendered on a dark surface: info text switches to light tones. */
  dark?: boolean;
}) {
  const { addItem } = useCart();
  const [wishlisted, setWishlisted] = useState(() => isWishlisted(product.id));
  const [justAdded, setJustAdded] = useState(false);
  const t = getTranslations(locale).card;

  // Badges come from real data only: discount from compareAtPrice,
  // low stock from summed variant inventory, "new" from createdAt.
  const sale = discountPercent(product.price, product.compareAtPrice);
  const fresh = isNewProduct(product.createdAt);
  const stock = product.totalStock;
  const soldOut = stock === 0;
  const lowStock = stock != null && stock > 0 && stock <= LOW_STOCK_THRESHOLD;

  const handleWishlist = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const added = toggleWishlist({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.imagePath,
      storeName: product.storeName,
    });
    setWishlisted(added);
    // Commerce micro-feedback: pop the heart when the item is saved.
    if (added) replayAnimation(event.currentTarget, microAnimationClass.wishlistPop);
  };

  const handleQuickAdd = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (soldOut) return;
    addItem({
      productId: product.id,
      variantId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: product.imagePath,
      storeName: product.storeName,
    });
    setJustAdded(true);
    // Commerce micro-feedback: nudge confirms the item landed in the cart.
    replayAnimation(event.currentTarget, microAnimationClass.cartNudge);
    window.setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <article className="group relative min-w-0">
      {/* Image first — 4:5, minimal radius, no shadow, no lift. Hover = image scale only. */}
      <div
        className={`relative aspect-[4/5] overflow-hidden rounded-sm bg-muted ${soldOut ? "saturate-50" : ""}`}
      >
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          search={{ locale }}
          className="block size-full"
          aria-label={product.name}
        >
          {product.imagePath ? (
            <img
              src={product.imagePath}
              alt={product.imageAlt || product.name}
              loading="lazy"
              sizes="(min-width: 1024px) 25vw, 50vw"
              className={`size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${soldOut ? "opacity-75" : ""}`}
            />
          ) : product.secondImagePath ? (
            <img
              src={product.secondImagePath}
              alt={product.secondImageAlt || product.name}
              loading="lazy"
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-end p-5 text-small text-muted-foreground">
              Modalia
              <br />
              {product.name}
            </div>
          )}
          {product.imagePath && product.secondImagePath && !soldOut ? (
            <img
              src={product.secondImagePath}
              alt=""
              aria-hidden
              loading="lazy"
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:opacity-0"
            />
          ) : null}
        </Link>

        {/* Minimal badges — small uppercase text tags, never pills with gradients. */}
        <div className="pointer-events-none absolute start-0 top-4 z-10 flex flex-col items-start gap-1">
          {sale != null ? (
            <span className="bg-background px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-destructive">
              Sale
            </span>
          ) : fresh ? (
            <span className="bg-foreground px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-background">
              {t.new}
            </span>
          ) : null}
        </div>

        {/* Wishlist — appears on hover/focus, always visible on touch and when active. */}
        <button
          type="button"
          onClick={handleWishlist}
          aria-pressed={wishlisted}
          aria-label={t.wishlist(product.name)}
          className={`card-action ${wishlisted ? "is-active" : ""} absolute end-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:bg-background`}
        >
          <Heart
            className={`size-4 ${wishlisted ? "fill-destructive text-destructive" : ""}`}
            aria-hidden="true"
          />
        </button>

        {/* Quick add — full-bleed bar fading in on hover/focus, always on touch. */}
        <div className="absolute inset-x-0 bottom-0 z-10">
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={soldOut}
            aria-live="polite"
            className="card-action flex h-11 w-full items-center justify-center gap-2 bg-background/95 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-70"
          >
            {soldOut ? (
              t.soldOut
            ) : justAdded ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                {t.added}
              </>
            ) : (
              <>
                <ShoppingBag className="size-4" aria-hidden="true" />
                {t.quickAdd}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info — generous negative space, minimal type hierarchy. */}
      <div className="mt-4 space-y-1 px-0.5">
        <p
          className={`truncate text-[11px] uppercase tracking-[0.14em] ${dark ? "text-white/50" : "text-muted-foreground"}`}
        >
          {product.storeName}
        </p>
        <h3
          className={`truncate text-[15px] font-medium leading-snug ${dark ? "text-white" : "text-foreground"}`}
        >
          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            search={{ locale }}
            className={`transition-colors ${dark ? "hover:text-white/60" : "hover:text-foreground/60"}`}
          >
            {product.name}
          </Link>
        </h3>
        <p className="flex items-baseline gap-2 pt-0.5">
          <span
            className={`text-base font-semibold ${dark ? "text-white" : "text-foreground"}`}
          >
            {formatPrice(product.price, locale)}
          </span>
          {sale != null && product.compareAtPrice ? (
            <span
              className={`text-sm line-through ${dark ? "text-white/45" : "text-muted-foreground"}`}
            >
              {formatPrice(product.compareAtPrice, locale)}
            </span>
          ) : null}
        </p>
        {lowStock ? (
          <p className="pt-0.5 text-xs font-medium text-destructive">
            {t.onlyLeft(stock as number)}
          </p>
        ) : null}
        {soldOut ? (
          <p className={`pt-0.5 text-xs ${dark ? "text-white/50" : "text-muted-foreground"}`}>
            {t.soldOut}
          </p>
        ) : null}
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
                : "group flex min-h-40 w-40 shrink-0 flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.3)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:w-auto lg:min-w-0"
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
                className={`${featured ? "text-primary-foreground/70" : "text-muted-foreground"} mt-5 size-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 motion-reduce:transition-none`}
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
            <div className="aspect-[21/9] overflow-hidden bg-muted">
              {store.bannerPath ? (
                <img
                  src={store.bannerPath}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
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
            <div className="absolute bottom-0 left-6 translate-y-1/2">
              {store.logoPath ? (
                <img
                  src={store.logoPath}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="size-16 shrink-0 rounded-full bg-background object-cover ring-2 ring-background"
                />
              ) : (
                <div
                  aria-hidden
                  className="grid size-16 shrink-0 place-items-center rounded-full bg-secondary font-display text-xl font-semibold text-foreground ring-2 ring-background"
                >
                  {store.name.slice(0, 1)}
                </div>
              )}
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
                <VerifiedSellerBadge verified={store.verified} label={storeT.verifiedStore} />
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
      <section className="border-y border-border py-16 text-center">
        <ShoppingBag className="mx-auto size-6 text-muted-foreground" />
        <h2 className="mt-4 text-h3 text-foreground">{emptyTitle ?? t.emptyTitle}</h2>
        <p className="mx-auto mt-2 max-w-sm text-small text-muted-foreground">{emptyText ?? t.emptyText}</p>
      </section>
    );
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
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
      <div className="mt-16 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
