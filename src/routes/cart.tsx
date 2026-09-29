import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { useCart } from "@/lib/cart-store";
import { formatPrice } from "@/lib/localization";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Cart — Modalia" }, { name: "description", content: "Review items from multiple Modalia stores before checkout." }, { property: "og:title", content: "Cart — Modalia" }, { property: "og:description", content: "Review items from multiple Modalia stores before checkout." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  component: CartPage,
});

function CartPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const cart = useCart();
  const stores = Array.from(new Set(cart.items.map((item) => item.storeId ?? "unknown")));
  return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <div className="flex items-end justify-between gap-5"><div><p className="text-eyebrow text-muted-foreground">Modalia</p><h1 className="mt-2 text-display">Your cart</h1><p className="mt-2 text-body text-muted-foreground">{cart.count} item{cart.count === 1 ? "" : "s"} · {stores.length} store{stores.length === 1 ? "" : "s"}</p></div><Link to="/shop" search={{ locale, q:"", category:"", sort:"newest", page:1, focus:"", view:"" }} className="text-small font-medium underline underline-offset-4">Continue shopping</Link></div>
    {!cart.items.length ? <section className="mt-12 rounded-[32px] border border-border bg-card p-12 text-center"><ShoppingBag className="mx-auto size-8" /><h2 className="mt-5 text-h3">Your cart is empty</h2><p className="mx-auto mt-2 max-w-md text-small text-muted-foreground">Add something you love. You can buy from multiple Modalia stores in one checkout.</p><Button asChild className="mt-7"><Link to="/shop" search={{ locale, q:"", category:"", sort:"newest", page:1, focus:"", view:"" }}>Explore products</Link></Button></section> : <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">{cart.items.map((item) => <article key={item.variantId} className="grid grid-cols-[96px_1fr_auto] gap-4 rounded-[24px] border border-border bg-card p-3 sm:grid-cols-[120px_1fr_auto] sm:p-4"><Link to="/product/$slug" params={{ slug:item.slug }} search={{ locale }} className="aspect-square overflow-hidden rounded-[18px] bg-muted">{item.image ? <img src={item.image} alt={item.name} className="size-full object-cover" /> : null}</Link><div className="min-w-0 py-1"><p className="text-caption text-muted-foreground">{item.storeName ?? "Modalia store"}</p><Link to="/product/$slug" params={{ slug:item.slug }} search={{ locale }} className="mt-1 block line-clamp-2 font-medium">{item.name}</Link>{item.options ? <p className="mt-1 text-caption text-muted-foreground">{Object.values(item.options).join(" · ")}</p> : null}<p className="mt-3 font-semibold">{formatPrice(item.price, locale)}</p><div className="mt-3 inline-flex h-9 items-center rounded-full border border-border"><Button variant="ghost" size="icon" className="size-8" onClick={() => cart.setQuantity(item.variantId, item.quantity - 1)} aria-label="Decrease quantity"><Minus /></Button><span className="w-8 text-center text-small">{item.quantity}</span><Button variant="ghost" size="icon" className="size-8" onClick={() => cart.setQuantity(item.variantId, item.quantity + 1)} aria-label="Increase quantity"><Plus /></Button></div></div><Button variant="ghost" size="icon" onClick={() => cart.removeItem(item.variantId)} aria-label={`Remove ${item.name}`}><Trash2 /></Button></article>)}</section>
      <aside className="h-fit rounded-[28px] bg-zinc-950 p-6 text-white lg:sticky lg:top-24"><p className="text-eyebrow text-white/50">Order summary</p><div className="mt-6 flex justify-between text-small text-white/70"><span>Subtotal</span><span>{formatPrice(cart.subtotal, locale)}</span></div><div className="mt-3 flex justify-between text-small text-white/70"><span>Delivery</span><span>Calculated at checkout</span></div><div className="my-6 border-t border-white/10" /><div className="flex justify-between text-lg font-semibold"><span>Estimated total</span><span>{formatPrice(cart.subtotal, locale)}</span></div><Button asChild className="mt-6 h-12 w-full rounded-full bg-white text-black hover:bg-white/90"><Link to="/checkout" search={{ locale }}>Checkout · COD</Link></Button><p className="mt-4 text-center text-caption text-white/45">Cash on Delivery · Seller shipping calculated separately</p></aside>
    </div>}
  </main><SiteFooter t={t} /></div>;
}
