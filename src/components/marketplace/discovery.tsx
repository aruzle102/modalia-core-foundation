import { useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Heart, Search, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/i18n/format";
import { getTranslations } from "@/lib/i18n";
import { useCart } from "@/lib/cart-store";
import { isWishlisted, toggleWishlist } from "@/lib/wishlist-store";
import type { CatalogCategory, CatalogProduct, CatalogStore } from "@/lib/catalog.functions";
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
}: {
  product: CatalogProduct;
  locale: SupportedLocale;
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
    setWishlisted(
      toggleWishlist({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.imagePath,
        storeName: product.storeName,
      }),
    );
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
    window.setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <article className="group relative min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_28px_56px_-24px_rgba(0,0,0,0.35)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
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
              className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
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
          {product.imagePath && product.secondImagePath ? (
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
        <div className="pointer-events-none absolute start-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {sale != null ? (
            <span className="rounded-full bg-destructive px-2.5 py-1 text-caption font-semibold text-destructive-foreground">
              −{sale}%
            </span>
          ) : null}
          {fresh ? (
            <span className="rounded-full bg-foreground px-2.5 py-1 text-caption font-semibold text-background">
              {t.new}
            </span>
          ) : null}
          {lowStock ? (
            <span className="rounded-full bg-background/90 px-2.5 py-1 text-caption font-medium text-foreground shadow-sm backdrop-blur-sm">
              {t.onlyLeft(stock as number)}
            </span>
          ) : null}
          {soldOut ? (
            <span className="rounded-full bg-background/90 px-2.5 py-1 text-caption font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
              {t.soldOut}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleWishlist}
          aria-pressed={wishlisted}
          aria-label={t.wishlist(product.name)}
          className={`card-action ${wishlisted ? "is-active" : ""} absolute end-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm hover:bg-background`}
        >
          <Heart
            className={`size-4 transition-colors ${wishlisted ? "fill-destructive text-destructive" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={handleQuickAdd}
          disabled={soldOut}
          aria-live="polite"
          className="card-action absolute inset-x-3 bottom-3 z-10 flex h-10 items-center justify-center gap-2 rounded-lg bg-background/90 text-small font-medium text-foreground shadow-lg backdrop-blur-md hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {soldOut ? (
            t.soldOut
          ) : justAdded ? (
            <>
              <Check className="size-4" />
              {t.added}
            </>
          ) : (
            <>
              <ShoppingBag className="size-4" />
              {t.quickAdd}
            </>
          )}
        </button>
      </div>
      <div className="mt-3 px-0.5">
        <p className="text-caption text-muted-foreground">{product.storeName}</p>
        <h3 className="mt-1 line-clamp-1 text-body font-medium text-foreground">
          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            search={{ locale }}
            className="transition-colors hover:text-foreground/65"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-price text-foreground">{formatPrice(product.price, locale)}</span>
          {sale != null && product.compareAtPrice ? (
            <span className="text-small text-muted-foreground line-through">
              {formatPrice(product.compareAtPrice, locale)}
            </span>
          ) : null}
        </p>
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

export function StoreRail({ stores, locale }: { stores: CatalogStore[]; locale: SupportedLocale }) {
  const t = getTranslations(locale).card;
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {stores.map((store) => (
        <Link
          key={store.id}
          to="/store/$slug"
          params={{ slug: store.slug }}
          search={{ locale }}
          className="group min-h-48 bg-background p-5 transition-colors duration-300 hover:bg-muted/60"
        >
          <div className="flex items-center gap-3">
            {store.logoPath ? (
              <img
                src={store.logoPath}
                alt=""
                className="size-10 rounded-full object-cover ring-1 ring-border"
                loading="lazy"
              />
            ) : (
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-small font-semibold ring-1 ring-border">
                {store.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-h3 text-foreground">{store.name}</h3>
              <p className="text-caption text-muted-foreground">
                {t.productsCount(store.productCount)}
              </p>
            </div>
          </div>
          {store.description ? (
            <p className="mt-6 line-clamp-2 text-small text-muted-foreground">
              {store.description}
            </p>
          ) : null}
          <ArrowRight className="mt-6 size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 motion-reduce:transition-none" />
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
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

export function SearchEmpty({ query, locale }: { query: string; locale: SupportedLocale }) {
  const t = getTranslations(locale).card;
  return (
    <section className="py-16 text-center">
      <Search className="mx-auto size-6 text-muted-foreground" />
      <h1 className="mt-4 text-display text-foreground">{t.searchTitle(query)}</h1>
      <p className="mx-auto mt-3 max-w-sm text-body text-muted-foreground">{t.searchText}</p>
    </section>
  );
}
