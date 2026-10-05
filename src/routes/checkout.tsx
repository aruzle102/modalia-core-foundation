import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { formatPrice } from "@/lib/i18n/format";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { useCart } from "@/lib/cart-store";
import { createGuestOrder, getCheckoutMeta } from "@/lib/checkout.functions";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Modalia" }, { name: "description", content: "Complete your secure cash-on-delivery order with verified delivery details." }, { property: "og:title", content: "Checkout — Modalia" }, { property: "og:description", content: "Complete your secure cash-on-delivery order with verified delivery details." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  component: CheckoutPage,
});

function text(value: unknown, locale: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const v = value as Record<string, unknown>;
  return String(v[locale] ?? v["fr"] ?? v["en"] ?? v["ar"] ?? "");
}

function CheckoutPage() {
  const { locale } = Route.useSearch(); const t = getTranslations(locale); const tc = t.checkout; const cart = useCart(); const navigate = useNavigate();
  const [meta, setMeta] = useState<{wilayas:any[];communes:any[]}|null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [form, setForm] = useState({firstName:"",lastName:"",phone:"",wilayaId:"",communeId:"",address:"",deliveryMethod:"home" as "home"|"office",note:""});
  useEffect(() => { getCheckoutMeta().then(setMeta).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!cart.items.length) return;
    // Global signal for the platform funnel, plus one per-product event so
    // each seller's store-scoped analytics sees checkouts of their own listings.
    track("checkout_started", { metadata: { item_count: cart.items.length, subtotal: Math.round(cart.subtotal) } });
    for (const item of cart.items.slice(0, 25)) {
      track("checkout_started", {
        entityType: "product",
        entityId: item.productId,
        metadata: { quantity: item.quantity },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const communes = useMemo(() => meta?.communes.filter((c) => c.wilaya_id === form.wilayaId) ?? [], [meta, form.wilayaId]);
  const valid = cart.items.length > 0 && form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && /^(0[5-7][0-9]{8}|\+213[5-7][0-9]{8})$/.test(form.phone) && !!form.wilayaId && !!form.communeId && form.address.trim().length >= 4;
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(""); if (!valid) { setError(tc.errorFillFields); return; } setLoading(true); try { const result = await createGuestOrder({ data: { items: cart.items.map((i) => ({ variantId:i.variantId, quantity:i.quantity })), ...form, idempotencyKey: crypto.randomUUID() } }); cart.clear(); navigate({ to:"/order-success", search:{ locale, order: result.orderNumber } }); } catch (e) { setError(e instanceof Error ? e.message : tc.errorCheckout); } finally { setLoading(false); } }
  if (!cart.items.length) return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t}/><main className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-display">{tc.emptyCartTitle}</h1><Button asChild className="mt-7"><Link to="/shop" search={{locale,q:"",category:"",sort:"newest",page:1,focus:"",view:""}}>{tc.backToShop}</Link></Button></main><SiteFooter locale={locale} t={t}/></div>;
  return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t}/><main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><Link to="/cart" search={{locale}} className="inline-flex items-center gap-2 text-small text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 rtl:rotate-180"/>{tc.backToCart}</Link><div className="mt-5 grid gap-8 lg:grid-cols-[1fr_380px]"><form onSubmit={submit} className="rounded-3xl border border-border bg-card p-5 sm:p-8"><div><p className="text-eyebrow text-muted-foreground">{tc.step1}</p><h1 className="mt-2 text-display">{tc.title}</h1><p className="mt-3 text-body text-muted-foreground">{tc.intro}</p></div><div className="mt-8 grid gap-4 sm:grid-cols-2"><label className="text-small">{tc.firstName}<input required value={form.firstName} onChange={(e)=>setForm({...form,firstName:e.target.value})} className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3"/></label><label className="text-small">{tc.lastName}<input required value={form.lastName} onChange={(e)=>setForm({...form,lastName:e.target.value})} className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3"/></label></div><label className="mt-4 block text-small">{tc.phone}<input required inputMode="tel" placeholder="0550123456" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value.replace(/\s/g,"")})} className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3"/></label><div className="mt-8 grid gap-4 sm:grid-cols-2"><label className="text-small">{tc.wilaya}<select required value={form.wilayaId} onChange={(e)=>setForm({...form,wilayaId:e.target.value,communeId:""})} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">{tc.chooseWilaya}</option>{meta?.wilayas.map((w)=><option key={w.id} value={w.id}>{w.code} · {text(w.name,locale)}</option>)}</select></label><label className="text-small">{tc.commune}<select required value={form.communeId} onChange={(e)=>setForm({...form,communeId:e.target.value})} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">{tc.chooseCommune}</option>{communes.map((c)=><option key={c.id} value={c.id}>{text(c.name,locale)}</option>)}</select></label></div><label className="mt-4 block text-small">{tc.fullAddress} <span className="text-caption text-muted-foreground">· {tc.addressHint}</span><textarea required value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} className="mt-2 min-h-28 w-full rounded-xl border border-input bg-background px-3 py-3" placeholder={tc.addressPlaceholder}/></label><fieldset className="mt-7"><legend className="text-small font-medium">{tc.deliveryMethod}</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>setForm({...form,deliveryMethod:"home"})} className={`rounded-2xl border p-4 text-start ${form.deliveryMethod === "home" ? "border-foreground bg-muted" : "border-border"}`}><MapPin className="size-5"/><span className="mt-3 block font-medium">{tc.homeDelivery}</span><span className="mt-1 block text-caption text-muted-foreground">{tc.homeDeliveryHint}</span></button><button type="button" onClick={()=>setForm({...form,deliveryMethod:"office"})} className={`rounded-2xl border p-4 text-start ${form.deliveryMethod === "office" ? "border-foreground bg-muted" : "border-border"}`}><Check className="size-5"/><span className="mt-3 block font-medium">{tc.officePickup}</span><span className="mt-1 block text-caption text-muted-foreground">{tc.officePickupHint}</span></button></div></fieldset><label className="mt-7 block text-small">{tc.orderNote} <span className="text-muted-foreground">({tc.optional})</span><Input value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} className="mt-2" placeholder={tc.notePlaceholder}/></label>{error ? <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-small text-destructive">{error}</p> : null}<Button type="submit" disabled={loading || !valid} className="mt-7 h-12 w-full rounded-full">{loading ? <><Loader2 className="animate-spin"/>{tc.creatingOrder}</> : tc.confirmOrder}</Button><div className="mt-4 flex items-center justify-center gap-2 text-caption text-muted-foreground"><ShieldCheck className="size-4"/>{tc.verifiedNote}</div></form><aside className="h-fit rounded-3xl bg-zinc-950 p-6 text-white lg:sticky lg:top-24"><p className="text-eyebrow text-white/45">{tc.step2}</p><div className="mt-5 space-y-4">{cart.items.map((item)=><div key={item.variantId} className="flex gap-3"><div className="size-16 shrink-0 overflow-hidden rounded-xl bg-white/10">{item.image?<img src={item.image} alt="" className="size-full object-cover"/>:null}</div><div className="min-w-0 flex-1"><p className="line-clamp-2 text-small">{item.name}</p><p className="mt-1 text-caption text-white/45">× {item.quantity}</p></div><p className="text-small font-medium">{formatPrice(item.price*item.quantity,locale)}</p></div>)}</div><div className="my-6 border-t border-white/10"/><div className="flex justify-between text-small text-white/60"><span>{tc.products}</span><span>{formatPrice(cart.subtotal,locale)}</span></div><div className="mt-3 flex justify-between text-small text-white/60"><span>{tc.shipping}</span><span>{tc.shippingCalculated}</span></div><div className="mt-5 flex justify-between text-lg font-semibold"><span>{tc.dueOnDelivery}</span><span>{formatPrice(cart.subtotal,locale)}+</span></div><p className="mt-5 text-caption leading-5 text-white/40">{tc.summaryNote}</p></aside></div></main><SiteFooter locale={locale} t={t}/></div>;
}
