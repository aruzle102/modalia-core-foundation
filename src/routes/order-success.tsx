import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { pageHead } from "@/lib/seo";

export const Route=createFileRoute("/order-success")({
  head: () => pageHead({
      title: "Order received — Modalia",
      description: "Your Modalia cash-on-delivery order has been received.",
      path: "/order-success",
      robots: "noindex,nofollow",
    }),validateSearch:(search:Record<string,unknown>)=>({locale:getLocale(typeof search["locale"] === "string"?search["locale"]:undefined),order:typeof search["order"] === "string"?search["order"]:""}),component:OrderSuccessPage});
function OrderSuccessPage(){const {locale,order}=Route.useSearch();const t=getTranslations(locale);const to=t.orderSuccess;const [copied,setCopied]=useState(false);useEffect(()=>{const meta=order?{order_code:order}:undefined;track("checkout_completed",{metadata:meta});track("purchase",{metadata:meta});},[order]);async function copy(){if(!order)return;await navigator.clipboard?.writeText(order);setCopied(true);setTimeout(()=>setCopied(false),1600)}return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t}/><main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-3xl items-center px-4 py-10"><div className="w-full text-center"><div className="success-orbit mx-auto grid size-24 place-items-center rounded-full bg-zinc-950 text-white"><Check className="size-10"/></div><p className="mt-8 text-eyebrow text-muted-foreground">{to.eyebrow}</p><h1 className="mt-3 text-display">{to.heading}</h1><p className="mx-auto mt-5 max-w-xl text-body text-muted-foreground">{to.text}</p>{order?<div className="mx-auto mt-8 flex max-w-sm items-center justify-between rounded-2xl border border-border bg-card p-2 ps-5"><span className="font-mono text-lg font-semibold tracking-widest">{order}</span><Button variant="ghost" size="sm" onClick={copy}>{copied?<Check/>:<Copy/>}{copied?to.copied:to.copy}</Button></div>:null}<div className="mt-8 flex flex-wrap justify-center gap-3"><Button asChild><Link to="/shop" search={{locale,q:"",category:"",sort:"newest",page:1,focus:"",view:"", brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}>{t.cart.continueShopping}</Link></Button><Button asChild variant="outline"><Link to="/track-order" search={{locale}}>{t.nav.trackOrder}</Link></Button><Button asChild variant="outline"><Link to="/auth" search={{locale}}>{to.createSignIn}</Link></Button></div><div className="mt-10 flex items-center justify-center gap-2 text-caption text-muted-foreground"><Sparkles className="size-3.5"/> {to.codNote}</div></div></main><SiteFooter locale={locale} t={t}/></div>}
