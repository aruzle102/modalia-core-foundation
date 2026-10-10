import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, MapPin, Pencil, ShieldCheck, TicketPercent, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { formatPrice } from "@/lib/i18n/format";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { useCart } from "@/lib/cart-store";
import type { CartLine } from "@/lib/cart-store";
import { consumeBuyNowIntent, readBuyNowIntent } from "@/lib/buy-now";
import { createGuestOrder, getCheckoutMeta } from "@/lib/checkout.functions";
import { getCheckoutQuote, type CheckoutQuote, type CouponReason } from "@/lib/checkout-quote.functions";
import { AsyncButton } from "@/components/motion/AsyncButton";
import { Stagger } from "@/components/motion/Stagger";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Checkout — Modalia" }, { name: "description", content: "Complete your secure cash-on-delivery order with verified delivery details." }, { property: "og:title", content: "Checkout — Modalia" }, { property: "og:description", content: "Complete your secure cash-on-delivery order with verified delivery details." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined), intent: typeof search["intent"] === "string" && search["intent"] ? search["intent"] : undefined }),
  component: CheckoutPage,
});

function text(value: unknown, locale: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const v = value as Record<string, unknown>;
  return String(v[locale] ?? v["fr"] ?? v["en"] ?? v["ar"] ?? "");
}

const PHONE_RE = /^(0[5-7][0-9]{8}|\+213[5-7][0-9]{8})$/;

type StepId = 1 | 2 | 3 | 4 | 5;
const STEPS: StepId[] = [1, 2, 3, 4, 5];

function CheckoutPage() {
  const { locale, intent } = Route.useSearch();
  const t = getTranslations(locale);
  const tc = t.checkout;
  const cart = useCart();
  const navigate = useNavigate();

  // Buy-now express mode: a single-use intent (sessionStorage, 30-min TTL)
  // replaces the cart. The global cart is never touched in express mode.
  const intentItems = useMemo<CartLine[] | null>(() => (intent ? readBuyNowIntent(intent) : null), [intent]);
  const isExpress = !!intent;
  const intentExpired = isExpress && !intentItems;
  const items: CartLine[] = isExpress ? (intentItems ?? []) : cart.items;

  const [step, setStep] = useState<StepId>(1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    wilayaId: "",
    communeId: "",
    communeName: "",
    address: "",
    note: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [methods, setMethods] = useState<Record<string, "home" | "office">>({});
  const [officeIds, setOfficeIds] = useState<Record<string, string>>({});
  const [couponDraft, setCouponDraft] = useState("");
  const [couponCode, setCouponCode] = useState<string | undefined>(undefined);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<"idle" | "loading" | "error">("idle");
  const [meta, setMeta] = useState<{ wilayas: Array<{ id: string; code: string; name: unknown }>; communes: Array<{ id: string; wilaya_id: string; code: string; name: unknown }> } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [error, setError] = useState("");
  const quoteRequestId = useRef(0);

  useEffect(() => {
    getCheckoutMeta()
      .then(setMeta)
      .catch((e) => setError(e instanceof Error ? e.message : tc.errorCheckout))
      .finally(() => setMetaLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!items.length) return;
    track("checkout_started", { metadata: { item_count: items.length, express: isExpress } });
    for (const item of items.slice(0, 25)) {
      track("checkout_started", {
        entityType: "product",
        entityId: item.productId,
        metadata: { quantity: item.quantity },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const communesInWilaya = useMemo(
    () => meta?.communes.filter((c) => c.wilaya_id === form.wilayaId) ?? [],
    [meta, form.wilayaId],
  );
  // A wilaya with zero ACTIVE communes falls back to a manual name input —
  // communes are never invented on the client.
  const manualCommune = !!meta && !!form.wilayaId && communesInWilaya.length === 0;
  const wilaya = useMemo(() => meta?.wilayas.find((w) => w.id === form.wilayaId) ?? null, [meta, form.wilayaId]);
  const commune = useMemo(() => communesInWilaya.find((c) => c.id === form.communeId) ?? null, [communesInWilaya, form.communeId]);

  // ---- server quote (all money is server-computed, debounced) ----
  const quotePayload = useMemo(
    () => ({
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      wilayaId: form.wilayaId,
      communeId: form.communeId || null,
      methods,
      officeIds,
      ...(couponCode ? { couponCode } : {}),
    }),
    [items, form.wilayaId, form.communeId, methods, officeIds, couponCode],
  );

  useEffect(() => {
    if (!form.wilayaId || items.length === 0) {
      setQuote(null);
      setQuoteStatus("idle");
      return;
    }
    setQuoteStatus("loading");
    const requestId = ++quoteRequestId.current;
    const timer = window.setTimeout(() => {
      getCheckoutQuote({ data: quotePayload })
        .then((result) => {
          if (quoteRequestId.current !== requestId) return;
          setQuote(result);
          setQuoteStatus("idle");
        })
        .catch(() => {
          if (quoteRequestId.current !== requestId) return;
          setQuote(null);
          setQuoteStatus("error");
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [quotePayload, form.wilayaId, items.length]);

  // ---- step validation ----
  const contactValid =
    form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && PHONE_RE.test(form.phone);
  const deliveryValid =
    !!form.wilayaId &&
    (manualCommune ? form.communeName.trim().length >= 2 : !!form.communeId) &&
    form.address.trim().length >= 4;

  function sellerMethodState(sellerId: string): "home" | "office" {
    return methods[sellerId] ?? "home";
  }
  const shippingValid =
    !!quote &&
    quoteStatus !== "error" &&
    quote.sellers.length > 0 &&
    quote.sellers.every((s) => {
      const method = sellerMethodState(s.sellerId);
      if (method === "home") return s.shipping.home !== null;
      const office = s.shipping.office;
      if (!office) return false;
      const chosen = officeIds[s.sellerId];
      return !!chosen && office.offices.some((o) => o.id === chosen);
    });

  const mark = (key: string) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  const markAll = (keys: string[]) =>
    setTouched((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = true;
      return next;
    });

  function goStep(next: StepId) {
    setError("");
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  // Idempotency: stable per payload — retries reuse the key, changed payloads
  // get a new one (fixes the per-submit UUID bug).
  const itemsSignature = useMemo(() => items.map((i) => `${i.variantId}:${i.quantity}`).sort().join("|"), [items]);
  const formSignature = useMemo(
    () => JSON.stringify({ f: form, m: methods, o: officeIds, c: couponCode }),
    [form, methods, officeIds, couponCode],
  );
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [itemsSignature, formSignature]);

  async function submitOrder() {
    setError("");
    const result = await createGuestOrder({
      data: {
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone,
        wilayaId: form.wilayaId,
        communeId: form.communeId || null,
        ...(manualCommune && form.communeName.trim() ? { communeName: form.communeName.trim() } : {}),
        address: form.address.trim(),
        sellerMethods: methods,
        officeIds,
        ...(couponCode ? { couponCode } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
        idempotencyKey,
      },
    });
    // One-time receipt from the SERVER response, then clear the source.
    const receipt = {
      orderNumber: result.orderNumber,
      subtotal: result.subtotal,
      shippingTotal: result.shippingTotal,
      discountTotal: result.discountTotal,
      grandTotal: result.grandTotal,
      deliveryMethod: result.deliveryMethod,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      currency: result.currency,
    };
    try {
      sessionStorage.setItem(`order-receipt:${result.orderNumber}`, JSON.stringify(receipt));
    } catch {
      /* storage unavailable — order-success still works from the URL */
    }
    if (isExpress && intent) consumeBuyNowIntent(intent);
    else cart.clear();
    await navigate({ to: "/order-success", search: { locale, order: result.orderNumber } });
  }

  if (intentExpired) {
    return (
      <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
        <SiteHeader locale={locale} t={t} />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-display">{tc.expiredTitle}</h1>
          <p className="mt-4 text-body text-muted-foreground">{tc.expiredHint}</p>
          <Button asChild className="mt-7">
            <Link to="/shop" search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "", brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}>
              {tc.backToShop}
            </Link>
          </Button>
        </main>
        <SiteFooter locale={locale} t={t} />
      </div>
    );
  }
  if (!items.length) {
    return (
      <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
        <SiteHeader locale={locale} t={t} />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-display">{tc.emptyCartTitle}</h1>
          <Button asChild className="mt-7">
            <Link to="/shop" search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "", brands: [], stores: [], colors: [], sizes: [], inStock: false, onSale: false }}>
              {tc.backToShop}
            </Link>
          </Button>
        </main>
        <SiteFooter locale={locale} t={t} />
      </div>
    );
  }

  const stepLabels = [tc.stepContact, tc.stepDelivery, tc.stepShipping, tc.stepReview, tc.stepConfirm];
  const canContinue =
    step === 1 ? contactValid : step === 2 ? deliveryValid : step === 3 ? shippingValid : true;
  const itemsBySeller = new Map<string, CartLine[]>();
  for (const item of items) {
    const key = item.sellerId ?? "unknown";
    const list = itemsBySeller.get(key) ?? [];
    list.push(item);
    itemsBySeller.set(key, list);
  }
  const storeNameOf = (sellerId: string) =>
    quote?.sellers.find((s) => s.sellerId === sellerId)?.storeName || t.cart.storeFallback;

  const couponReasonMessage: Record<CouponReason, string> = {
    not_found: tc.couponReasonNotFound,
    inactive: tc.couponReasonInactive,
    expired: tc.couponReasonExpired,
    usage_limit: tc.couponReasonUsageLimit,
    min_not_met: tc.couponReasonMinNotMet,
    not_applicable: tc.couponReasonNotApplicable,
  };

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/cart" search={{ locale }} className="inline-flex items-center gap-2 text-small text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {tc.backToCart}
        </Link>

        {/* ——— 5-step stepper: completed steps are clickable, state preserved ——— */}
        <nav aria-label={tc.title} className="mt-6">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-4">
            {STEPS.map((id, index) => {
              const done = id < step;
              const current = id === step;
              return (
                <li key={id} className="flex items-center gap-2 sm:gap-4">
                  {index > 0 ? <span aria-hidden className="h-px w-6 bg-border sm:w-12" /> : null}
                  {done ? (
                    <button
                      type="button"
                      onClick={() => goStep(id)}
                      className="group flex items-center gap-2.5"
                      aria-label={`${stepLabels[index]} — ${tc.backStep}`}
                    >
                      <span className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-foreground group-hover:text-foreground">
                        <Check className="size-4" />
                      </span>
                      <span className="hidden text-small text-muted-foreground transition-colors group-hover:text-foreground sm:inline">
                        {stepLabels[index]}
                      </span>
                    </button>
                  ) : (
                    <span className="flex items-center gap-2.5" aria-current={current ? "step" : undefined}>
                      <span
                        className={`grid size-8 place-items-center rounded-full text-small font-medium ${
                          current ? "bg-foreground text-background" : "border border-border text-muted-foreground"
                        }`}
                      >
                        {id}
                      </span>
                      <span className={`text-small ${current ? "font-medium text-foreground" : "text-muted-foreground"} ${current ? "" : "hidden sm:inline"}`}>
                        {stepLabels[index]}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            {error ? (
              <p role="alert" className="mb-6 rounded-xl bg-destructive/10 p-3 text-small text-destructive">
                {error}
              </p>
            ) : null}

            {/* ═══ STEP 1 — Contact ═══ */}
            {step === 1 ? (
              <section aria-label={tc.stepContact}>
                <p className="text-eyebrow text-muted-foreground">01 · {tc.stepContact}</p>
                <h1 className="mt-2 text-display">{tc.title}</h1>
                <p className="mt-3 text-body text-muted-foreground">{tc.intro}</p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <label className="block text-small">
                    {tc.firstName}
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      onBlur={() => mark("firstName")}
                      aria-invalid={touched["firstName"] && form.firstName.trim().length < 2}
                      className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3"
                    />
                    {touched["firstName"] && form.firstName.trim().length < 2 ? (
                      <span className="mt-1 block text-caption text-destructive">{tc.fieldRequired}</span>
                    ) : null}
                  </label>
                  <label className="block text-small">
                    {tc.lastName}
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      onBlur={() => mark("lastName")}
                      aria-invalid={touched["lastName"] && form.lastName.trim().length < 2}
                      className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3"
                    />
                    {touched["lastName"] && form.lastName.trim().length < 2 ? (
                      <span className="mt-1 block text-caption text-destructive">{tc.fieldRequired}</span>
                    ) : null}
                  </label>
                </div>
                <label className="mt-4 block text-small">
                  {tc.phone}
                  <input
                    inputMode="tel"
                    dir="ltr"
                    placeholder="0550123456"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\s/g, "") })}
                    onBlur={() => mark("phone")}
                    aria-invalid={touched["phone"] && !PHONE_RE.test(form.phone)}
                    className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-start"
                  />
                  {touched["phone"] && !PHONE_RE.test(form.phone) ? (
                    <span className="mt-1 block text-caption text-destructive">{tc.phoneInvalid}</span>
                  ) : null}
                </label>
                <Button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => {
                    markAll(["firstName", "lastName", "phone"]);
                    if (contactValid) goStep(2);
                  }}
                  className="mt-8 h-12 w-full"
                >
                  {tc.continueStep}
                </Button>
              </section>
            ) : null}

            {/* ═══ STEP 2 — Delivery ═══ */}
            {step === 2 ? (
              <section aria-label={tc.stepDelivery}>
                <p className="text-eyebrow text-muted-foreground">02 · {tc.stepDelivery}</p>
                <h1 className="mt-2 text-display">{tc.stepDelivery}</h1>
                {metaLoading ? (
                  <p className="mt-6 flex items-center gap-2 text-small text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {tc.wilayasLoading}
                  </p>
                ) : (
                  <>
                    <div className="mt-8 grid gap-4 sm:grid-cols-2">
                      <label className="block text-small">
                        {tc.wilaya}
                        <select
                          value={form.wilayaId}
                          onChange={(e) => setForm({ ...form, wilayaId: e.target.value, communeId: "", communeName: "" })}
                          className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
                        >
                          <option value="">{tc.chooseWilaya}</option>
                          {meta?.wilayas.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.code} · {text(w.name, locale)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {manualCommune ? (
                        <div>
                          <label className="block text-small">
                            {tc.communeNameManual}
                            <input
                              value={form.communeName}
                              onChange={(e) => setForm({ ...form, communeName: e.target.value })}
                              onBlur={() => mark("communeName")}
                              aria-invalid={touched["communeName"] && form.communeName.trim().length < 2}
                              aria-describedby="commune-manual-hint"
                              className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3"
                            />
                          </label>
                          <p id="commune-manual-hint" className="mt-1 text-caption text-muted-foreground">
                            {tc.noCommunesInWilaya} {tc.communeNameHint}
                          </p>
                          {touched["communeName"] && form.communeName.trim().length < 2 ? (
                            <span className="mt-1 block text-caption text-destructive">{tc.fieldRequired}</span>
                          ) : null}
                        </div>
                      ) : (
                        <label className="block text-small">
                          {tc.commune}
                          <select
                            value={form.communeId}
                            disabled={!form.wilayaId}
                            onChange={(e) => setForm({ ...form, communeId: e.target.value })}
                            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 disabled:opacity-50"
                          >
                            <option value="">{tc.chooseCommune}</option>
                            {communesInWilaya.map((c) => (
                              <option key={c.id} value={c.id}>
                                {text(c.name, locale)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <label className="mt-4 block text-small">
                      {tc.fullAddress}{" "}
                      <span className="text-caption text-muted-foreground">· {tc.addressHint}</span>
                      <textarea
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        onBlur={() => mark("address")}
                        aria-invalid={touched["address"] && form.address.trim().length < 4}
                        className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-3"
                        placeholder={tc.addressPlaceholder}
                      />
                      {touched["address"] && form.address.trim().length < 4 ? (
                        <span className="mt-1 block text-caption text-destructive">{tc.fieldRequired}</span>
                      ) : null}
                    </label>
                    <label className="mt-4 block text-small">
                      {tc.orderNote} <span className="text-muted-foreground">({tc.optional})</span>
                      <Input
                        value={form.note}
                        onChange={(e) => setForm({ ...form, note: e.target.value })}
                        className="mt-2"
                        placeholder={tc.notePlaceholder}
                      />
                    </label>
                  </>
                )}
                <div className="mt-8 flex gap-3">
                  <Button type="button" variant="outline" onClick={() => goStep(1)} className="h-12">
                    {tc.backStep}
                  </Button>
                  <Button
                    type="button"
                    disabled={!canContinue || metaLoading}
                    onClick={() => {
                      markAll(["address", "communeName"]);
                      if (deliveryValid) goStep(3);
                    }}
                    className="h-12 flex-1"
                  >
                    {tc.continueToShipping}
                  </Button>
                </div>
              </section>
            ) : null}

            {/* ═══ STEP 3 — Shipping (per seller, server-priced) ═══ */}
            {step === 3 ? (
              <section aria-label={tc.stepShipping}>
                <p className="text-eyebrow text-muted-foreground">03 · {tc.stepShipping}</p>
                <h1 className="mt-2 text-display">{tc.perSellerShipping}</h1>
                <p className="mt-3 text-body text-muted-foreground">{tc.shippingNote}</p>

                {quoteStatus === "loading" && !quote ? (
                  <p className="mt-8 flex items-center gap-2 text-small text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {tc.quoteLoading}
                  </p>
                ) : null}
                {quoteStatus === "error" ? (
                  <p role="alert" className="mt-8 rounded-xl bg-destructive/10 p-4 text-small text-destructive">
                    {tc.quoteFailed}
                  </p>
                ) : null}

                {quote ? (
                  <div className="mt-8 space-y-5">
                  <Stagger stepMs={50} maxMs={300}>
                    {quote.sellers.map((seller) => {
                      const method = sellerMethodState(seller.sellerId);
                      const lines = itemsBySeller.get(seller.sellerId) ?? [];
                      const office = seller.shipping.office;
                      const storeName = seller.storeName || t.cart.storeFallback;
                      return (
                        <div key={seller.sellerId} className="rounded-xl border border-border bg-card p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h2 className="text-h3 text-foreground">{storeName}</h2>
                              <p className="mt-1 text-caption text-muted-foreground">
                                {seller.itemCount} · {formatPrice(seller.subtotal, locale)}
                              </p>
                            </div>
                            {quoteStatus === "loading" ? (
                              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                            ) : null}
                          </div>

                          <ul className="mt-4 space-y-3">
                            {lines.map((item) => (
                              <li key={item.variantId} className="flex items-center gap-3">
                                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                                  {item.image ? <img src={item.image} alt="" loading="lazy" className="size-full object-cover" /> : null}
                                </div>
                                <p className="line-clamp-2 min-w-0 flex-1 text-small text-foreground">{item.name}</p>
                                <p className="shrink-0 text-caption text-muted-foreground">× {item.quantity}</p>
                              </li>
                            ))}
                          </ul>

                          <fieldset className="mt-5">
                            <legend className="text-small font-medium text-foreground">{tc.deliveryMethod}</legend>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label
                                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                                  method === "home" ? "border-foreground bg-muted" : "border-border"
                                } ${seller.shipping.home === null ? "cursor-not-allowed opacity-60" : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={`method-${seller.sellerId}`}
                                  checked={method === "home"}
                                  disabled={seller.shipping.home === null}
                                  onChange={() => setMethods({ ...methods, [seller.sellerId]: "home" })}
                                  className="mt-1"
                                />
                                <span>
                                  <span className="flex items-center gap-2 font-medium text-foreground">
                                    <Truck className="size-4" aria-hidden />
                                    {tc.homeDelivery}
                                  </span>
                                  <span className="mt-1 block text-caption text-muted-foreground">
                                    {seller.shipping.home !== null ? formatPrice(seller.shipping.home, locale) : tc.shippingUnavailable}
                                  </span>
                                </span>
                              </label>
                              <label
                                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                                  method === "office" ? "border-foreground bg-muted" : "border-border"
                                } ${!office ? "cursor-not-allowed opacity-60" : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={`method-${seller.sellerId}`}
                                  checked={method === "office"}
                                  disabled={!office}
                                  onChange={() => setMethods({ ...methods, [seller.sellerId]: "office" })}
                                  className="mt-1"
                                />
                                <span>
                                  <span className="flex items-center gap-2 font-medium text-foreground">
                                    <MapPin className="size-4" aria-hidden />
                                    {tc.officePickup}
                                  </span>
                                  <span className="mt-1 block text-caption text-muted-foreground">
                                    {office ? formatPrice(office.price, locale) : tc.officeUnavailableHint}
                                  </span>
                                </span>
                              </label>
                            </div>
                          </fieldset>

                          {method === "office" && office ? (
                            <label className="mt-4 block text-small">
                              {tc.chooseOffice}
                              <select
                                value={officeIds[seller.sellerId] ?? ""}
                                onChange={(e) => setOfficeIds({ ...officeIds, [seller.sellerId]: e.target.value })}
                                className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
                              >
                                <option value="">{tc.chooseOffice}</option>
                                {office.offices.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                    {o.address ? ` — ${o.address}` : ""}
                                  </option>
                                ))}
                              </select>
                              {touched[`office-${seller.sellerId}`] && !officeIds[seller.sellerId] ? (
                                <span className="mt-1 block text-caption text-destructive">{tc.selectOfficeFirst}</span>
                              ) : null}
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </Stagger>
                  </div>
                ) : null}

                <div className="mt-8 flex gap-3">
                  <Button type="button" variant="outline" onClick={() => goStep(2)} className="h-12">
                    {tc.backStep}
                  </Button>
                  <Button
                    type="button"
                    disabled={!canContinue}
                    onClick={() => {
                      markAll(quote?.sellers.map((s) => `office-${s.sellerId}`) ?? []);
                      if (shippingValid) goStep(4);
                    }}
                    className="h-12 flex-1"
                  >
                    {tc.continueToReview}
                  </Button>
                </div>
              </section>
            ) : null}

            {/* ═══ STEP 4 — Review ═══ */}
            {step === 4 ? (
              <section aria-label={tc.stepReview}>
                <p className="text-eyebrow text-muted-foreground">04 · {tc.stepReview}</p>
                <h1 className="mt-2 text-display">{tc.reviewTitle}</h1>
                <p className="mt-3 text-body text-muted-foreground">{tc.reviewIntro}</p>

                {quote ? (
                  <div className="mt-8 space-y-5">
                    <Stagger stepMs={50} maxMs={300}>
                      {quote.sellers.map((seller) => {
                        const method = sellerMethodState(seller.sellerId);
                        const lines = itemsBySeller.get(seller.sellerId) ?? [];
                        const storeName = seller.storeName || t.cart.storeFallback;
                        const shipPrice = method === "home" ? seller.shipping.home : (seller.shipping.office?.price ?? null);
                        const officeName =
                          method === "office"
                            ? seller.shipping.office?.offices.find((o) => o.id === officeIds[seller.sellerId])?.name
                            : null;
                        return (
                          <div key={seller.sellerId} className="rounded-xl border border-border bg-card p-5">
                            <h2 className="text-h3 text-foreground">{storeName}</h2>
                            <ul className="mt-4 space-y-3">
                              {lines.map((item) => (
                                <li key={item.variantId} className="flex items-center gap-3">
                                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                                    {item.image ? <img src={item.image} alt="" loading="lazy" className="size-full object-cover" /> : null}
                                  </div>
                                  <p className="line-clamp-2 min-w-0 flex-1 text-small text-foreground">{item.name}</p>
                                  <p className="shrink-0 text-caption text-muted-foreground">× {item.quantity}</p>
                                </li>
                              ))}
                            </ul>
                            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-small">
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">{tc.products}</dt>
                                <dd className="text-foreground">{formatPrice(seller.subtotal, locale)}</dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">
                                  {tc.shipping} · {method === "home" ? tc.homeDelivery : tc.officePickup}
                                  {officeName ? ` — ${officeName}` : ""}
                                </dt>
                                <dd className="text-foreground">
                                  {shipPrice !== null ? formatPrice(shipPrice, locale) : "—"}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        );
                      })}
                    </Stagger>

                    {/* Coupon */}
                    <div className="rounded-xl border border-border bg-card p-5">
                      <h2 className="flex items-center gap-2 text-h3 text-foreground">
                        <TicketPercent className="size-4" aria-hidden />
                        {tc.couponCode}
                      </h2>
                      {quote.coupon ? (
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-small text-foreground">
                            <Check className="me-2 inline size-4 text-verified" aria-hidden />
                            {tc.couponApplied}: <span className="font-medium" dir="ltr">{quote.coupon.code}</span>
                            {" — "}−{formatPrice(quote.coupon.discountAmount, locale)}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCouponCode(undefined);
                              setCouponDraft("");
                            }}
                          >
                            {tc.removeCoupon}
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <div className="flex gap-2">
                            <Input
                              value={couponDraft}
                              onChange={(e) => setCouponDraft(e.target.value)}
                              placeholder={tc.couponPlaceholder}
                              dir="ltr"
                              className="text-start"
                              aria-label={tc.couponCode}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!couponDraft.trim() || quoteStatus === "loading"}
                              onClick={() => setCouponCode(couponDraft.trim())}
                            >
                              {quoteStatus === "loading" && couponCode ? tc.applyingCoupon : tc.applyCoupon}
                            </Button>
                          </div>
                          {quote.couponError ? (
                            <p role="alert" className="mt-2 text-caption text-destructive">
                              {tc.couponError} {couponReasonMessage[quote.couponError.reason]}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Totals — all server-computed */}
                    <div className="rounded-xl border border-border bg-card p-5">
                      <dl className="space-y-2 text-small">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">{tc.products}</dt>
                          <dd className="text-foreground">{formatPrice(quote.totals.subtotal, locale)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">{tc.shipping}</dt>
                          <dd className="text-foreground">
                            {quote.totals.shipping !== null ? formatPrice(quote.totals.shipping, locale) : "—"}
                          </dd>
                        </div>
                        {quote.totals.discount > 0 ? (
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">{tc.discount}</dt>
                            <dd className="text-verified">−{formatPrice(quote.totals.discount, locale)}</dd>
                          </div>
                        ) : null}
                        <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                          <dt className="text-foreground">{tc.totalDue}</dt>
                          <dd className="text-foreground">
                            {quote.totals.total !== null ? formatPrice(quote.totals.total, locale) : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Delivery recap with per-section Edit */}
                    <div className="rounded-xl border border-border bg-card p-5">
                      <h2 className="text-h3 text-foreground">{tc.deliveryDetails}</h2>
                      <div className="mt-4 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <dl className="grid gap-x-8 gap-y-2 text-small sm:grid-cols-2">
                            <div>
                              <dt className="text-caption text-muted-foreground">{tc.stepContact}</dt>
                              <dd className="mt-0.5 text-foreground">
                                {form.firstName} {form.lastName} · <span dir="ltr">{form.phone}</span>
                              </dd>
                            </div>
                          </dl>
                          <Button type="button" variant="outline" size="sm" onClick={() => goStep(1)}>
                            <Pencil className="size-3.5" aria-hidden />
                            {tc.editInfo}
                          </Button>
                        </div>
                        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
                          <dl className="grid gap-x-8 gap-y-2 text-small sm:grid-cols-2">
                            <div>
                              <dt className="text-caption text-muted-foreground">{tc.stepDelivery}</dt>
                              <dd className="mt-0.5 text-foreground">
                                {wilaya ? `${wilaya.code} · ${text(wilaya.name, locale)}` : "—"}
                                {commune ? ` · ${text(commune.name, locale)}` : manualCommune ? ` · ${form.communeName}` : ""}
                                <span className="block text-caption text-muted-foreground">{form.address}</span>
                              </dd>
                            </div>
                          </dl>
                          <Button type="button" variant="outline" size="sm" onClick={() => goStep(2)}>
                            <Pencil className="size-3.5" aria-hidden />
                            {tc.editInfo}
                          </Button>
                        </div>
                        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
                          <dl className="text-small">
                            <div>
                              <dt className="text-caption text-muted-foreground">{tc.stepShipping}</dt>
                              <dd className="mt-0.5 text-foreground">
                                {quote.sellers.map((s) => {
                                  const m = sellerMethodState(s.sellerId);
                                  return (
                                    <span key={s.sellerId} className="block">
                                      {s.storeName || t.cart.storeFallback}:{" "}
                                      {m === "home" ? tc.homeDelivery : tc.officePickup}
                                    </span>
                                  );
                                })}
                              </dd>
                            </div>
                          </dl>
                          <Button type="button" variant="outline" size="sm" onClick={() => goStep(3)}>
                            <Pencil className="size-3.5" aria-hidden />
                            {tc.editInfo}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : quoteStatus === "error" ? (
                  <p role="alert" className="mt-8 rounded-xl bg-destructive/10 p-4 text-small text-destructive">
                    {tc.quoteFailed}
                  </p>
                ) : (
                  <p className="mt-8 flex items-center gap-2 text-small text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {tc.quoteLoading}
                  </p>
                )}

                <div className="mt-8 flex gap-3">
                  <Button type="button" variant="outline" onClick={() => goStep(3)} className="h-12">
                    {tc.backStep}
                  </Button>
                  <Button
                    type="button"
                    disabled={!quote || quote.totals.total === null}
                    onClick={() => goStep(5)}
                    className="h-12 flex-1"
                  >
                    {tc.continueStep}
                  </Button>
                </div>
              </section>
            ) : null}

            {/* ═══ STEP 5 — COD confirm ═══ */}
            {step === 5 ? (
              <section aria-label={tc.stepConfirm}>
                <p className="text-eyebrow text-muted-foreground">05 · {tc.stepConfirm}</p>
                <h1 className="mt-2 text-display">{tc.codTitle}</h1>

                <div className="mt-6 flex items-start gap-4 rounded-xl border border-verified/40 bg-verified/10 p-5">
                  <ShieldCheck className="mt-0.5 size-6 shrink-0 text-verified" aria-hidden />
                  <div>
                    <p className="font-semibold text-foreground">{tc.codTitle}</p>
                    <p className="mt-1 text-small text-muted-foreground">{tc.codText}</p>
                  </div>
                </div>

                {quote ? (
                  <dl className="mt-6 space-y-2 rounded-xl border border-border bg-card p-5 text-small">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{tc.products}</dt>
                      <dd className="text-foreground">{formatPrice(quote.totals.subtotal, locale)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{tc.shipping}</dt>
                      <dd className="text-foreground">
                        {quote.totals.shipping !== null ? formatPrice(quote.totals.shipping, locale) : "—"}
                      </dd>
                    </div>
                    {quote.totals.discount > 0 ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{tc.discount}</dt>
                        <dd className="text-verified">−{formatPrice(quote.totals.discount, locale)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                      <dt className="text-foreground">{tc.totalDue}</dt>
                      <dd className="text-foreground">
                        {quote.totals.total !== null ? formatPrice(quote.totals.total, locale) : "—"}
                      </dd>
                    </div>
                  </dl>
                ) : null}

                <p className="mt-5 text-caption leading-5 text-muted-foreground">{tc.confirmHint}</p>
                <div className="mt-6 flex gap-3">
                  <Button type="button" variant="outline" onClick={() => goStep(4)} className="h-12">
                    {tc.backStep}
                  </Button>
                  <AsyncButton
                    onAction={submitOrder}
                    onError={(e) => setError(e instanceof Error ? e.message : tc.errorCheckout)}
                    loadingLabel={tc.creatingOrder}
                    disabled={!quote || quote.totals.total === null}
                    className="h-12 flex-1"
                  >
                    {tc.confirmCodOrder}
                  </AsyncButton>
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 text-caption text-muted-foreground">
                  <ShieldCheck className="size-4" aria-hidden />
                  {tc.verifiedNote}
                </div>
              </section>
            ) : null}
          </div>

          {/* ——— Persistent summary aside: COD visible throughout, quote money only ——— */}
          <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24">
            <p className="flex items-center gap-2 text-eyebrow text-muted-foreground">
              <ShieldCheck className="size-4 text-verified" aria-hidden />
              {tc.codTitle}
            </p>
            <p className="mt-3 text-small text-muted-foreground">
              {items.reduce((s, i) => s + i.quantity, 0)} · {tc.products}
            </p>
            {quote ? (
              <dl className="mt-4 space-y-2 border-t border-border pt-4 text-small">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{tc.products}</dt>
                  <dd className="text-foreground">{formatPrice(quote.totals.subtotal, locale)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{tc.shipping}</dt>
                  <dd className="text-foreground">
                    {quoteStatus === "loading" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : quote.totals.shipping !== null ? (
                      formatPrice(quote.totals.shipping, locale)
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                {quote.totals.discount > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{tc.discount}</dt>
                    <dd className="text-verified">−{formatPrice(quote.totals.discount, locale)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-border pt-3 font-semibold">
                  <dt className="text-foreground">{tc.totalDue}</dt>
                  <dd className="text-foreground">
                    {quote.totals.total !== null ? formatPrice(quote.totals.total, locale) : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 border-t border-border pt-4 text-caption leading-5 text-muted-foreground">
                {tc.summaryNote}
              </p>
            )}
            <p className="mt-4 flex items-center gap-2 text-caption text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden />
              {tc.verifiedNote}
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
