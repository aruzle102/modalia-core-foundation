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

// Single-page checkout: all sections visible at once, validated together on submit.

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

  const [submitAttempted, setSubmitAttempted] = useState(false);
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

  function scrollToSection(id: string) {
    setError("");
    if (typeof document !== "undefined") {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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

  async function handleSubmit() {
    setSubmitAttempted(true);
    setError("");
    markAll(["firstName", "lastName", "phone", "address", "communeName"]);
    if (quote?.sellers) {
      markAll(quote.sellers.map((s) => `office-${s.sellerId}`));
    }
    if (!contactValid) {
      scrollToSection("checkout-contact");
      return;
    }
    if (!deliveryValid) {
      scrollToSection("checkout-address");
      return;
    }
    if (!shippingValid) {
      scrollToSection("checkout-shipping");
      return;
    }
    if (!quote || quote.totals.total === null || (quoteStatus as string) === "error") {
      setError(tc.quoteFailed);
      return;
    }
    await submitOrder();
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

  // Single-page validation: everything is checked together when the user confirms.
  const allValid = contactValid && deliveryValid && shippingValid && !!quote && quote.totals.total !== null;
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

        <h1 className="mt-4 text-display">{tc.title}</h1>
        <p className="mt-2 text-body text-muted-foreground">{tc.intro}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-6">
            {error ? (
              <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-small text-destructive">
                {error}
              </p>
            ) : null}

            {/* ═══ SECTION 1 — Your items ═══ */}
            <section id="checkout-items" aria-label={tc.products} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="flex items-center gap-3 text-h3 text-foreground">
                <span className="grid size-8 place-items-center rounded-full bg-foreground text-small font-semibold text-background">1</span>
                {tc.products}
                <span className="text-caption font-normal text-muted-foreground tabular-nums">
                  {items.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </h2>
              <ul className="mt-4 space-y-3">
                {items.map((item) => (
                  <li key={item.variantId} className="flex items-center gap-3">
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {item.image ? <img src={item.image} alt="" loading="lazy" className="size-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-small font-medium text-foreground">{item.name}</p>
                      <p className="mt-0.5 text-caption text-muted-foreground">× {item.quantity}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* ═══ SECTION 2 — Contact ═══ */}
            <section id="checkout-contact" aria-label={tc.stepContact} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="flex items-center gap-3 text-h3 text-foreground">
                <span className="grid size-8 place-items-center rounded-full bg-foreground text-small font-semibold text-background">2</span>
                {tc.stepContact}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-small">
                  {tc.firstName}
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    onBlur={() => mark("firstName")}
                    aria-invalid={(touched["firstName"] || submitAttempted) && form.firstName.trim().length < 2}
                    className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3"
                  />
                  {(touched["firstName"] || submitAttempted) && form.firstName.trim().length < 2 ? (
                    <span className="mt-1 block text-caption text-destructive">{tc.fieldRequired}</span>
                  ) : null}
                </label>
                <label className="block text-small">
                  {tc.lastName}
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    onBlur={() => mark("lastName")}
                    aria-invalid={(touched["lastName"] || submitAttempted) && form.lastName.trim().length < 2}
                    className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3"
                  />
                  {(touched["lastName"] || submitAttempted) && form.lastName.trim().length < 2 ? (
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
                  aria-invalid={(touched["phone"] || submitAttempted) && !PHONE_RE.test(form.phone)}
                  className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-start"
                />
                {(touched["phone"] || submitAttempted) && !PHONE_RE.test(form.phone) ? (
                  <span className="mt-1 block text-caption text-destructive">{tc.phoneInvalid}</span>
                ) : null}
              </label>
            </section>

            {/* ═══ SECTION 3 — Delivery address ═══ */}
            <section id="checkout-address" aria-label={tc.stepDelivery} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="flex items-center gap-3 text-h3 text-foreground">
                <span className="grid size-8 place-items-center rounded-full bg-foreground text-small font-semibold text-background">3</span>
                {tc.stepDelivery}
              </h2>
              {metaLoading ? (
                <p className="mt-4 flex items-center gap-2 text-small text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {tc.wilayasLoading}
                </p>
              ) : (
                <div className="mt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
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
                      {submitAttempted && !form.wilayaId ? (
                        <span className="mt-1 block text-caption text-destructive">{tc.fieldRequired}</span>
                      ) : null}
                    </label>
                    {manualCommune ? (
                      <div>
                        <label className="block text-small">
                          {tc.communeNameManual}
                          <input
                            value={form.communeName}
                            onChange={(e) => setForm({ ...form, communeName: e.target.value })}
                            onBlur={() => mark("communeName")}
                            aria-invalid={(touched["communeName"] || submitAttempted) && form.communeName.trim().length < 2}
                            className="mt-2 flex h-11 w-full rounded-lg border border-input bg-background px-3"
                          />
                        </label>
                        {(touched["communeName"] || submitAttempted) && form.communeName.trim().length < 2 ? (
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
                        {submitAttempted && form.wilayaId && !form.communeId && !manualCommune ? (
                          <span className="mt-1 block text-caption text-destructive">{tc.fieldRequired}</span>
                        ) : null}
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
                      aria-invalid={(touched["address"] || submitAttempted) && form.address.trim().length < 4}
                      className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-3"
                      placeholder={tc.addressPlaceholder}
                    />
                    {(touched["address"] || submitAttempted) && form.address.trim().length < 4 ? (
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
                </div>
              )}
            </section>

            {/* ═══ SECTION 4 — Delivery method (per seller) ═══ */}
            <section id="checkout-shipping" aria-label={tc.stepShipping} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="flex items-center gap-3 text-h3 text-foreground">
                <span className="grid size-8 place-items-center rounded-full bg-foreground text-small font-semibold text-background">4</span>
                {tc.stepShipping}
              </h2>
              <p className="mt-2 text-small text-muted-foreground">{tc.shippingNote}</p>
              {!form.wilayaId ? (
                <p className="mt-4 rounded-lg bg-muted p-4 text-small text-muted-foreground">{tc.chooseWilaya}</p>
              ) : quoteStatus === "loading" && !quote ? (
                <p className="mt-4 flex items-center gap-2 text-small text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {tc.quoteLoading}
                </p>
              ) : quoteStatus === "error" ? (
                <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-small text-destructive">
                  {tc.quoteFailed}
                </p>
              ) : quote ? (
                <div className="mt-4 space-y-4">
                  {quote.sellers.map((seller) => {
                    const method = sellerMethodState(seller.sellerId);
                    const office = seller.shipping.office;
                    const storeName = seller.storeName || t.cart.storeFallback;
                    return (
                      <div key={seller.sellerId} className="rounded-xl border border-border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium text-foreground">{storeName}</h3>
                            <p className="mt-0.5 text-caption text-muted-foreground tabular-nums">
                              {seller.itemCount} · {formatPrice(seller.subtotal, locale)}
                            </p>
                          </div>
                          {quoteStatus === "loading" ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                          ) : null}
                        </div>
                        <fieldset className="mt-3">
                          <legend className="sr-only">{tc.deliveryMethod}</legend>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label
                              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                                method === "home" ? "border-foreground bg-muted" : "border-border"
                              } ${seller.shipping.home === null ? "cursor-not-allowed opacity-60" : ""}`}
                            >
                              <input
                                type="radio"
                                name={`method-${seller.sellerId}`}
                                checked={method === "home"}
                                disabled={seller.shipping.home === null}
                                onChange={() => setMethods({ ...methods, [seller.sellerId]: "home" })}
                              />
                              <span className="flex-1">
                                <span className="flex items-center gap-2 text-small font-medium text-foreground">
                                  <Truck className="size-4" aria-hidden />
                                  {tc.homeDelivery}
                                </span>
                                <span className="mt-0.5 block text-caption text-muted-foreground tabular-nums">
                                  {seller.shipping.home !== null ? formatPrice(seller.shipping.home, locale) : tc.shippingUnavailable}
                                </span>
                              </span>
                            </label>
                            <label
                              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                                method === "office" ? "border-foreground bg-muted" : "border-border"
                              } ${!office ? "cursor-not-allowed opacity-60" : ""}`}
                            >
                              <input
                                type="radio"
                                name={`method-${seller.sellerId}`}
                                checked={method === "office"}
                                disabled={!office}
                                onChange={() => setMethods({ ...methods, [seller.sellerId]: "office" })}
                              />
                              <span className="flex-1">
                                <span className="flex items-center gap-2 text-small font-medium text-foreground">
                                  <MapPin className="size-4" aria-hidden />
                                  {tc.officePickup}
                                </span>
                                <span className="mt-0.5 block text-caption text-muted-foreground tabular-nums">
                                  {office ? formatPrice(office.price, locale) : tc.officeUnavailableHint}
                                </span>
                              </span>
                            </label>
                          </div>
                        </fieldset>
                        {method === "office" && office ? (
                          <label className="mt-3 block text-small">
                            {tc.chooseOffice}
                            <select
                              value={officeIds[seller.sellerId] ?? ""}
                              onChange={(e) => setOfficeIds({ ...officeIds, [seller.sellerId]: e.target.value })}
                              onBlur={() => mark(`office-${seller.sellerId}`)}
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
                            {(touched[`office-${seller.sellerId}`] || submitAttempted) && !officeIds[seller.sellerId] ? (
                              <span className="mt-1 block text-caption text-destructive">{tc.selectOfficeFirst}</span>
                            ) : null}
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>

            {/* ═══ SECTION 5 — Coupon (optional) ═══ */}
            <section aria-label={tc.couponCode} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-h3 text-foreground">
                <TicketPercent className="size-4" aria-hidden />
                {tc.couponCode}
                <span className="text-caption font-normal text-muted-foreground">({tc.optional})</span>
              </h2>
              {quote?.coupon ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-small text-foreground tabular-nums">
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
                  {quote?.couponError ? (
                    <p role="alert" className="mt-2 text-caption text-destructive">
                      {tc.couponError} {couponReasonMessage[quote.couponError.reason]}
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            {/* ═══ SECTION 6 — Payment (COD) ═══ */}
            <section aria-label={tc.stepConfirm} className="rounded-2xl border border-verified/40 bg-verified/10 p-5 sm:p-6">
              <h2 className="flex items-center gap-3 text-h3 text-foreground">
                <span className="grid size-8 place-items-center rounded-full bg-foreground text-small font-semibold text-background">5</span>
                {tc.codTitle}
              </h2>
              <div className="mt-3 flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-verified" aria-hidden />
                <p className="text-small text-muted-foreground">{tc.codText}</p>
              </div>
              <p className="mt-3 text-caption leading-5 text-muted-foreground">{tc.confirmHint}</p>
            </section>
          </div>

          {/* ——— Sticky summary aside with confirm ——— */}
          <aside className="h-fit rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-24">
            <p className="flex items-center gap-2 text-eyebrow text-muted-foreground">
              <ShieldCheck className="size-4 text-verified" aria-hidden />
              {tc.codTitle}
            </p>
            <p className="mt-3 text-small text-muted-foreground tabular-nums">
              {items.reduce((s, i) => s + i.quantity, 0)} · {tc.products}
            </p>
            {quote ? (
              <dl className="mt-4 space-y-2 border-t border-border pt-4 text-small">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{tc.products}</dt>
                  <dd className="tabular-nums text-foreground">{formatPrice(quote.totals.subtotal, locale)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{tc.shipping}</dt>
                  <dd className="tabular-nums text-foreground">
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
                    <dd className="tabular-nums text-verified">−{formatPrice(quote.totals.discount, locale)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                  <dt className="text-foreground">{tc.totalDue}</dt>
                  <dd className="tabular-nums text-foreground">
                    {quote.totals.total !== null ? formatPrice(quote.totals.total, locale) : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 border-t border-border pt-4 text-caption leading-5 text-muted-foreground">
                {tc.summaryNote}
              </p>
            )}
            <AsyncButton
              onAction={handleSubmit}
              onError={(e) => setError(e instanceof Error ? e.message : tc.errorCheckout)}
              loadingLabel={tc.creatingOrder}
              disabled={!allValid}
              className="mt-6 h-12 w-full"
            >
              {tc.confirmCodOrder}
            </AsyncButton>
            <p className="mt-3 flex items-center justify-center gap-2 text-caption text-muted-foreground">
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
