import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { formatPrice } from "@/lib/i18n/format";
import { track } from "@/lib/analytics";
import { pageHead, pageHeadCopy } from "@/lib/seo";

export const Route=createFileRoute("/order-success")({
  head: (context) => {
      const rawSearch = (context as unknown as { search?: Record<string, unknown> }).search ?? {};
      const locale = getLocale(typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined);
      const copy = pageHeadCopy(locale, "orderSuccess");
      return pageHead({
        title: copy.title,
        description: copy.description,
        path: "/order-success",
        robots: "noindex,nofollow",
      });
    },validateSearch:(search:Record<string,unknown>)=>({locale:getLocale(typeof search["locale"] === "string"?search["locale"]:undefined),order:typeof search["order"] === "string"?search["order"]:""}),component:OrderSuccessPage});

/**
 * Shape of the one-time checkout receipt written by the checkout success
 * handler (`order-receipt:<orderNumber>` in sessionStorage, SERVER-returned
 * values). Consumed on first read; never persisted here, never reconstructed.
 */
type OrderReceipt = {
  orderNumber: string;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  grandTotal: number;
  deliveryMethod: string | null;
  itemCount: number;
  currency?: string | undefined;
};

const RECEIPT_NUMBERS = ["subtotal", "shippingTotal", "discountTotal", "grandTotal", "itemCount"] as const;

/** Read + validate the one-time receipt. Returns null when absent (direct visit) or malformed — never invent totals. */
function readReceipt(order: string): OrderReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(`order-receipt:${order}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed["orderNumber"] !== order) return null;
    const num = (key: (typeof RECEIPT_NUMBERS)[number]): number | null => {
      const v = parsed[key];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const subtotal = num("subtotal");
    const shippingTotal = num("shippingTotal");
    const discountTotal = num("discountTotal");
    const grandTotal = num("grandTotal");
    const itemCount = num("itemCount");
    if (subtotal === null || shippingTotal === null || discountTotal === null || grandTotal === null || itemCount === null) return null;
    const currency = typeof parsed["currency"] === "string" && parsed["currency"].length >= 3 ? parsed["currency"] : undefined;
    return {
      orderNumber: order,
      subtotal,
      shippingTotal,
      discountTotal,
      grandTotal,
      deliveryMethod: typeof parsed["deliveryMethod"] === "string" ? parsed["deliveryMethod"] : null,
      itemCount,
      currency,
    };
  } catch {
    return null;
  }
}

function OrderSuccessPage(){const {locale,order}=Route.useSearch();const t=getTranslations(locale);const to=t.orderSuccess;const [copied,setCopied]=useState(false);const [receipt,setReceipt]=useState<OrderReceipt|null>(null);useEffect(()=>{const meta=order?{order_code:order}:undefined;track("checkout_completed",{metadata:meta});track("purchase",{metadata:meta});},[order]);useEffect(()=>{if(!order)return;setReceipt(readReceipt(order));/* Consume the one-time receipt — totals exist only here. */try{window.sessionStorage.removeItem(`order-receipt:${order}`)}catch{/* storage unavailable */}},[order]);async function copy(){if(!order)return;await navigator.clipboard?.writeText(order);setCopied(true);setTimeout(()=>setCopied(false),1600)}return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t}/><main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-3xl items-center px-4 py-10"><div className="w-full text-center"><div className="success-orbit mx-auto grid size-24 place-items-center rounded-full bg-zinc-950 text-white"><Check className="size-10"/></div><p className="mt-8 text-eyebrow text-muted-foreground">{to.eyebrow}</p><h1 className="mt-3 text-display">{to.heading}</h1><p className="mx-auto mt-5 max-w-xl text-body text-muted-foreground">{to.text}</p>{order?<div className="mx-auto mt-8 flex max-w-sm items-center justify-between rounded-lg border border-border bg-card p-2 ps-5"><span className="font-mono text-lg font-semibold tracking-widest">{order}</span><Button variant="ghost" size="sm" onClick={copy}>{copied?<Check/>:<Copy/>}{copied?to.copied:to.copy}</Button></div>:null}{receipt?<section aria-label={to.summaryTitle} className="mx-auto mt-8 max-w-sm rounded-lg border border-border bg-card p-6 text-start"><h2 className="text-nav text-foreground">{to.summaryTitle}</h2><p className="mt-1 text-caption text-muted-foreground">{t.orders.itemsCount(Math.round(receipt.itemCount))}</p><dl className="mt-4 space-y-2.5 text-small"><div className="flex items-baseline justify-between gap-4"><dt className="text-muted-foreground">{to.sumSubtotal}</dt><dd className="text-price">{formatPrice(receipt.subtotal, locale, receipt.currency)}</dd></div><div className="flex items-baseline justify-between gap-4"><dt className="text-muted-foreground">{to.sumShipping}</dt><dd className="text-price">{formatPrice(receipt.shippingTotal, locale, receipt.currency)}</dd></div>{receipt.discountTotal>0?<div className="flex items-baseline justify-between gap-4"><dt className="text-muted-foreground">{to.sumDiscount}</dt><dd className="text-price">−{formatPrice(receipt.discountTotal, locale, receipt.currency)}</dd></div>:null}<div className="flex items-baseline justify-between gap-4 border-t border-border pt-3"><dt className="font-semibold text-foreground">{to.sumTotal}</dt><dd className="text-price font-semibold">{formatPrice(receipt.grandTotal, locale, receipt.currency)}</dd></div></dl></section>:null}<div className="mt-8 flex flex-wrap justify-center gap-3"><Button asChild><Link to="/track-order" search={{locale}}>{t.nav.trackOrder}</Link></Button><Button asChild variant="outline"><Link to="/shop" search={{locale,q:"",category:"",sort:"newest",page:1,focus:"",view:"", brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}>{t.cart.continueShopping}</Link></Button></div><div className="mt-10 flex items-center justify-center gap-2 text-caption text-muted-foreground"><Sparkles className="size-3.5"/> {to.codNote}</div></div></main><SiteFooter locale={locale} t={t}/></div>}
