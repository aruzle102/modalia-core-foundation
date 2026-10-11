import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { useCart, type CartLine } from "@/lib/cart-store";
import { formatPrice } from "@/lib/i18n/format";
import { getLocale, getTranslations, localeDirections, type Translation } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { useEffect, useMemo } from "react";
import type { SupportedLocale } from "@/config/platform";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Cart — Modalia" }, { name: "description", content: "Review items from multiple Modalia stores before checkout." }, { property: "og:title", content: "Cart — Modalia" }, { property: "og:description", content: "Review items from multiple Modalia stores before checkout." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  errorComponent: CartError,
  component: CartPage,
});

function CartError() {
  const { locale } = Route.useSearch();
  return <div role="alert" className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).common.loadError}</div>;
}

type StoreGroup = {
  key: string;
  storeId: string | null;
  storeName: string;
  /** Store slug when a cart line carried it (product page / buy-now). Null = unknown, render plain text. */
  storeSlug: string | null;
  items: CartLine[];
  subtotal: number;
};

function groupItemsByStore(items: CartLine[], storeFallback: string): StoreGroup[] {
  const map = new Map<string, StoreGroup>();
  for (const item of items) {
    const key = item.storeId ?? "unknown";
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        storeId: item.storeId ?? null,
        storeName: item.storeName ?? storeFallback,
        storeSlug: item.storeSlug ?? null,
        items: [],
        subtotal: 0,
      };
      map.set(key, group);
    }
    group.items.push(item);
    group.subtotal += item.price * item.quantity;
  }
  return [...map.values()];
}

function CartItemRow({
  item,
  locale,
  tc,
  cart,
}: {
  item: CartLine;
  locale: SupportedLocale;
  tc: Translation["cart"];
  cart: ReturnType<typeof useCart>;
}) {
  return (
    <article className="grid grid-cols-[88px_1fr_auto] gap-3 p-4 sm:grid-cols-[104px_1fr_auto] sm:gap-4 sm:p-5">
      <Link
        to="/product/$slug"
        params={{ slug: item.slug }}
        search={{ locale }}
        className="aspect-square overflow-hidden rounded-xl bg-muted"
      >
        {item.image ? <img src={item.image} alt={item.name} className="size-full object-cover" /> : null}
      </Link>
      <div className="min-w-0">
        <Link
          to="/product/$slug"
          params={{ slug: item.slug }}
          search={{ locale }}
          className="block line-clamp-2 font-medium text-foreground"
        >
          {item.name}
        </Link>
        {item.options ? (
          <p className="mt-1 text-caption text-muted-foreground">{Object.values(item.options).join(" · ")}</p>
        ) : null}
        <p className="mt-1.5 text-small text-muted-foreground tabular-nums">{formatPrice(item.price, locale)}</p>
        <div className="mt-3 inline-flex h-10 items-center rounded-lg border border-input bg-background">
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => cart.setQuantity(item.variantId, item.quantity - 1)}
            aria-label={tc.decreaseQty}
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-8 text-center text-small tabular-nums" aria-live="polite">
            {item.quantity}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => cart.setQuantity(item.variantId, item.quantity + 1)}
            aria-label={tc.increaseQty}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:text-destructive"
          onClick={() => cart.removeItem(item.variantId)}
          aria-label={tc.removeItem(item.name)}
        >
          <Trash2 className="size-4" />
        </Button>
        <p className="font-semibold text-foreground tabular-nums">{formatPrice(item.price * item.quantity, locale)}</p>
      </div>
    </article>
  );
}

function CartPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const tc = t.cart;
  const cart = useCart();
  useEffect(() => { track("page_view", { metadata: { page: "cart" } }); }, []);
  const groups = useMemo(() => groupItemsByStore(cart.items, tc.storeFallback), [cart.items, tc.storeFallback]);
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-eyebrow text-muted-foreground">Modalia</p>
            <h1 className="mt-2 text-display text-foreground">{tc.title}</h1>
            <p className="mt-2 text-body text-muted-foreground">
              {tc.itemsCount(cart.count)} · {tc.storesCount(groups.length)}
            </p>
            <p className="mt-1 text-small text-muted-foreground">{tc.splitNote}</p>
          </div>
          <Link
            to="/shop"
            search={{ locale, q:"", category:"", sort:"newest", page:1, focus:"", view:"" , brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}
            className="shrink-0 text-small font-medium text-foreground underline underline-offset-4"
          >
            {tc.continueShopping}
          </Link>
        </div>
        {!cart.items.length ? (
          <section className="rounded-xl border border-border bg-card p-10 text-center sm:p-14">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <ShoppingBag className="size-6" aria-hidden />
            </div>
            <h2 className="mt-5 text-h3 text-foreground">{tc.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-small text-muted-foreground">{tc.emptyText}</p>
            <Button asChild className="mt-7 h-11 px-6">
              <Link
                to="/shop"
                search={{ locale, q:"", category:"", sort:"newest", page:1, focus:"", view:"" , brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}
              >
                {tc.exploreProducts}
              </Link>
            </Button>
          </section>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <section className="min-w-0 space-y-6" aria-label={tc.title}>
              {groups.map((group) => (
                <section key={group.key} className="overflow-hidden rounded-xl border border-border bg-card">
                  {/* Seller group header — links to the store when the cart line
                      carried its slug; plain text otherwise (never a dead link). */}
                  <div className="border-b border-border px-4 py-3 sm:px-5">
                    <h2 className="truncate text-nav font-semibold text-foreground">
                      {group.storeSlug ? (
                        <Link
                          to="/store/$slug"
                          params={{ slug: group.storeSlug }}
                          search={{ locale }}
                          className="underline-offset-4 hover:underline"
                        >
                          {group.storeName}
                        </Link>
                      ) : (
                        group.storeName
                      )}
                    </h2>
                    <p className="mt-0.5 text-caption text-muted-foreground">{tc.itemsCount(group.items.length)}</p>
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((item) => (
                      <CartItemRow key={item.variantId} item={item} locale={locale} tc={tc} cart={cart} />
                    ))}
                  </div>
                  {/* Honest shipping note: shipping is computed at checkout — never a fake number. */}
                  <div className="space-y-2 border-t border-border bg-muted/50 px-4 py-3 sm:px-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-small font-semibold text-foreground">{tc.groupSubtotal(group.storeName)}</p>
                      <p className="text-small font-semibold text-foreground tabular-nums">
                        {formatPrice(group.subtotal, locale)}
                      </p>
                    </div>
                    <p className="inline-flex items-center gap-2 text-caption text-muted-foreground">
                      <Truck className="size-4 shrink-0" aria-hidden="true" />
                      {tc.groupShipping}
                    </p>
                  </div>
                </section>
              ))}
            </section>
            <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24">
              <p className="text-eyebrow text-muted-foreground">{tc.orderSummary}</p>
              <dl className="mt-6 space-y-3 text-small">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{tc.subtotal}</dt>
                  <dd className="text-foreground tabular-nums">{formatPrice(cart.subtotal, locale)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{tc.delivery}</dt>
                  <dd className="text-muted-foreground">{tc.deliveryAtCheckout}</dd>
                </div>
              </dl>
              <div className="my-6 border-t border-border" />
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-base font-semibold text-foreground">{tc.estimatedTotal}</p>
                <p className="text-base font-semibold text-foreground tabular-nums">{formatPrice(cart.subtotal, locale)}</p>
              </div>
              <Button asChild className="mt-6 h-12 w-full">
                <Link to="/checkout" search={{ locale, intent: undefined }}>
                  {tc.checkoutCta}
                </Link>
              </Button>
              <p className="mt-4 text-center text-caption text-muted-foreground">{tc.codNote}</p>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
