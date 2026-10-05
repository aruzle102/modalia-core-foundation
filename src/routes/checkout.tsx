import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, MapPin, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { formatPrice } from "@/lib/i18n/format";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { useCart } from "@/lib/cart-store";
import { createGuestOrder, getCheckoutMeta } from "@/lib/checkout.functions";
import { track } from "@/lib/analytics";
import type { SupportedLocale } from "@/config/platform";

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

type Step = "info" | "confirm";

function CheckoutPage() {
  const { locale } = Route.useSearch(); const t = getTranslations(locale); const tc = t.checkout; const cart = useCart(); const navigate = useNavigate();
  const [meta, setMeta] = useState<{wilayas:any[];communes:any[]}|null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("info");
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
  const wilaya = useMemo(() => meta?.wilayas.find((w) => w.id === form.wilayaId) ?? null, [meta, form.wilayaId]);
  const commune = useMemo(() => communes.find((c) => c.id === form.communeId) ?? null, [communes, form.communeId]);
  const valid = cart.items.length > 0 && form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && /^(0[5-7][0-9]{8}|\+213[5-7][0-9]{8})$/.test(form.phone) && !!form.wilayaId && !!form.communeId && form.address.trim().length >= 4;
  function goToStep(next: Step) { setError(""); setStep(next); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }
  function proceedToReview(event: React.FormEvent) { event.preventDefault(); setError(""); if (!valid) { setError(tc.errorFillFields); return; } goToStep("confirm"); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); if (!valid) { setError(tc.errorFillFields); return; } setLoading(true);
    try {
      const result = await createGuestOrder({ data: { items: cart.items.map((i) => ({ variantId:i.variantId, quantity:i.quantity })), ...form, idempotencyKey: crypto.randomUUID() } });
      cart.clear(); navigate({ to:"/order-success", search:{ locale, order: result.orderNumber } });
    } catch (e) { setError(e instanceof Error ? e.message : tc.errorCheckout); }
    finally { setLoading(false); }
  }
  if (!cart.items.length) return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t}/><main className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-display">{tc.emptyCartTitle}</h1><Button asChild className="mt-7"><Link to="/shop" search={{locale,q:"",category:"",sort:"newest",page:1,focus:"",view:"", brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}>{tc.backToShop}</Link></Button></main><SiteFooter locale={locale} t={t}/></div>;

  const steps = [
    { id: "cart", label: tc.stepCart, done: true, href: "/cart" as const },
    { id: "info", label: tc.stepInfo, current: step === "info" },
    { id: "confirm", label: tc.stepConfirm, current: step === "confirm" },
  ];

  return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
    <SiteHeader locale={locale} t={t}/>
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to="/cart" search={{locale}} className="inline-flex items-center gap-2 text-small text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 rtl:rotate-180"/>{tc.backToCart}</Link>

      {/* ——— Premium stepper: cart → info → confirm ——— */}
      <nav aria-label={tc.title} className="mt-8">
        <ol className="flex items-center gap-2 sm:gap-4">
          {steps.map((s, index) => (
            <li key={s.id} className="flex items-center gap-2 sm:gap-4">
              {index > 0 ? <span aria-hidden className="h-px w-8 bg-border sm:w-16" /> : null}
              {"href" in s && s.href ? (
                <Link to={s.href} search={{locale}} className="group flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-full border border-border text-small text-muted-foreground transition-colors group-hover:border-foreground group-hover:text-foreground">{index + 1}</span>
                  <span className="text-small text-muted-foreground transition-colors group-hover:text-foreground">{s.label}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-2.5" aria-current={s.current ? "step" : undefined}>
                  <span className={`grid size-8 place-items-center rounded-full text-small font-medium ${s.current ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}>{index + 1}</span>
                  <span className={`text-small ${s.current ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {step === "info" ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <form onSubmit={proceedToReview} className="rounded-3xl border border-border bg-card p-5 sm:p-8">
            <div>
              <p className="text-eyebrow text-muted-foreground">02 · {tc.stepInfo}</p>
              <h1 className="mt-2 text-display">{tc.title}</h1>
              <p className="mt-3 text-body text-muted-foreground">{tc.intro}</p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2"><label className="text-small">{tc.firstName}<input required value={form.firstName} onChange={(e)=>setForm({...form,firstName:e.target.value})} className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3"/></label><label className="text-small">{tc.lastName}<input required value={form.lastName} onChange={(e)=>setForm({...form,lastName:e.target.value})} className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3"/></label></div>
            <label className="mt-4 block text-small">{tc.phone}<input required inputMode="tel" placeholder="0550123456" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value.replace(/\s/g,"")})} className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3"/></label>
            <div className="mt-8 grid gap-4 sm:grid-cols-2"><label className="text-small">{tc.wilaya}<select required value={form.wilayaId} onChange={(e)=>setForm({...form,wilayaId:e.target.value,communeId:""})} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">{tc.chooseWilaya}</option>{meta?.wilayas.map((w)=><option key={w.id} value={w.id}>{w.code} · {text(w.name,locale)}</option>)}</select></label><label className="text-small">{tc.commune}<select required value={form.communeId} onChange={(e)=>setForm({...form,communeId:e.target.value})} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">{tc.chooseCommune}</option>{communes.map((c)=><option key={c.id} value={c.id}>{text(c.name,locale)}</option>)}</select></label></div>
            <label className="mt-4 block text-small">{tc.fullAddress} <span className="text-caption text-muted-foreground">· {tc.addressHint}</span><textarea required value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} className="mt-2 min-h-28 w-full rounded-xl border border-input bg-background px-3 py-3" placeholder={tc.addressPlaceholder}/></label>
            <fieldset className="mt-7"><legend className="text-small font-medium">{tc.deliveryMethod}</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>setForm({...form,deliveryMethod:"home"})} className={`rounded-2xl border p-4 text-start ${form.deliveryMethod === "home" ? "border-foreground bg-muted" : "border-border"}`}><MapPin className="size-5"/><span className="mt-3 block font-medium">{tc.homeDelivery}</span><span className="mt-1 block text-caption text-muted-foreground">{tc.homeDeliveryHint}</span></button><button type="button" onClick={()=>setForm({...form,deliveryMethod:"office"})} className={`rounded-2xl border p-4 text-start ${form.deliveryMethod === "office" ? "border-foreground bg-muted" : "border-border"}`}><Check className="size-5"/><span className="mt-3 block font-medium">{tc.officePickup}</span><span className="mt-1 block text-caption text-muted-foreground">{tc.officePickupHint}</span></button></div></fieldset>
            <label className="mt-7 block text-small">{tc.orderNote} <span className="text-muted-foreground">({tc.optional})</span><Input value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} className="mt-2" placeholder={tc.notePlaceholder}/></label>
            {error ? <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-small text-destructive">{error}</p> : null}
            <Button type="submit" disabled={!valid} className="mt-7 h-12 w-full rounded-full">{tc.continueToReview}</Button>
            <div className="mt-4 flex items-center justify-center gap-2 text-caption text-muted-foreground"><ShieldCheck className="size-4"/>{tc.verifiedNote}</div>
          </form>
          <OrderSummaryAside tc={tc} locale={locale} />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <div>
              <p className="text-eyebrow text-muted-foreground">{tc.step3}</p>
              <h1 className="mt-2 text-display">{tc.reviewTitle}</h1>
              <p className="mt-3 text-body text-muted-foreground">{tc.reviewIntro}</p>
            </div>

            <section aria-label={tc.products} className="mt-8 rounded-3xl border border-border bg-card p-5 sm:p-8">
              <div className="space-y-5">
                {cart.items.map((item) => (
                  <div key={item.variantId} className="flex gap-4">
                    <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                      {item.image ? <img src={item.image} alt="" loading="lazy" className="size-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-small font-medium text-foreground">{item.name}</p>
                      {item.storeName ? <p className="mt-1 text-caption text-muted-foreground">{item.storeName}</p> : null}
                      <p className="mt-1 text-caption text-muted-foreground">× {item.quantity}</p>
                    </div>
                    <p className="text-small font-semibold text-foreground">{formatPrice(item.price * item.quantity, locale)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section aria-label={tc.deliveryDetails} className="mt-6 rounded-3xl border border-border bg-card p-5 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-h3 text-foreground">{tc.deliveryDetails}</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => goToStep("info")} className="rounded-full">
                  <Pencil className="size-3.5" />{tc.editInfo}
                </Button>
              </div>
              <dl className="mt-5 grid gap-x-8 gap-y-3 text-small sm:grid-cols-2">
                <div><dt className="text-caption text-muted-foreground">{tc.firstName} {tc.lastName}</dt><dd className="mt-1 text-foreground">{form.firstName} {form.lastName}</dd></div>
                <div><dt className="text-caption text-muted-foreground">{tc.phone}</dt><dd className="mt-1 text-foreground" dir="ltr">{form.phone}</dd></div>
                <div><dt className="text-caption text-muted-foreground">{tc.wilaya}</dt><dd className="mt-1 text-foreground">{wilaya ? `${wilaya.code} · ${text(wilaya.name, locale)}` : "—"}</dd></div>
                <div><dt className="text-caption text-muted-foreground">{tc.commune}</dt><dd className="mt-1 text-foreground">{commune ? text(commune.name, locale) : "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-caption text-muted-foreground">{tc.fullAddress}</dt><dd className="mt-1 text-foreground">{form.address}</dd></div>
                <div><dt className="text-caption text-muted-foreground">{tc.deliveryMethod}</dt><dd className="mt-1 text-foreground">{form.deliveryMethod === "home" ? tc.homeDelivery : tc.officePickup}</dd></div>
                {form.note.trim() ? <div><dt className="text-caption text-muted-foreground">{tc.orderNote}</dt><dd className="mt-1 text-foreground">{form.note}</dd></div> : null}
              </dl>
            </section>

            <Button type="button" variant="ghost" onClick={() => goToStep("info")} className="mt-6 rounded-full">
              <ArrowLeft className="size-4 rtl:rotate-180" />{tc.backToInfo}
            </Button>
          </div>
          <form onSubmit={submit}>
            <OrderSummaryAside tc={tc} locale={locale} confirm={{
              loading,
              disabled: loading || !valid,
              label: tc.confirmOrder,
              loadingLabel: tc.creatingOrder,
              hint: tc.confirmHint,
              verifiedNote: tc.verifiedNote,
            }} />
            {error ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-small text-destructive">{error}</p> : null}
          </form>
        </div>
      )}
    </main>
    <SiteFooter locale={locale} t={t}/>
  </div>;
}

function OrderSummaryAside({
  tc,
  locale,
  confirm,
}: {
  tc: ReturnType<typeof getTranslations>["checkout"];
  locale: SupportedLocale;
  confirm?: { loading: boolean; disabled: boolean; label: string; loadingLabel: string; hint: string; verifiedNote: string };
}) {
  const cart = useCart();
  return (
    <aside className="h-fit rounded-3xl bg-zinc-950 p-6 text-white lg:sticky lg:top-24">
      <p className="text-eyebrow text-white/45">{tc.step2}</p>
      <div className="mt-5 space-y-4">
        {cart.items.map((item) => (
          <div key={item.variantId} className="flex gap-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-white/10">
              {item.image ? <img src={item.image} alt="" className="size-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-small">{item.name}</p>
              <p className="mt-1 text-caption text-white/45">× {item.quantity}</p>
            </div>
            <p className="text-small font-medium">{formatPrice(item.price * item.quantity, locale)}</p>
          </div>
        ))}
      </div>
      <div className="my-6 border-t border-white/10" />
      <div className="flex justify-between text-small text-white/60"><span>{tc.products}</span><span>{formatPrice(cart.subtotal, locale)}</span></div>
      <div className="mt-3 flex justify-between text-small text-white/60"><span>{tc.shipping}</span><span>{tc.shippingCalculated}</span></div>
      <div className="mt-5 flex justify-between text-lg font-semibold"><span>{tc.dueOnDelivery}</span><span>{formatPrice(cart.subtotal, locale)}+</span></div>
      {confirm ? (
        <>
          <Button type="submit" disabled={confirm.disabled} className="mt-6 h-12 w-full rounded-full bg-white text-black hover:bg-white/90">
            {confirm.loading ? <><Loader2 className="animate-spin" />{confirm.loadingLabel}</> : confirm.label}
          </Button>
          <p className="mt-4 text-caption leading-5 text-white/45">{confirm.hint}</p>
          <p className="mt-3 flex items-center justify-center gap-2 text-caption text-white/45"><ShieldCheck className="size-4" />{confirm.verifiedNote}</p>
        </>
      ) : (
        <p className="mt-5 text-caption leading-5 text-white/40">{tc.summaryNote}</p>
      )}
    </aside>
  );
}
