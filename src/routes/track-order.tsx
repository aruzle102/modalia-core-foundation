import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { formatDate, formatPrice } from "@/lib/i18n/format";
import { trackGuestOrder, type GuestOrderHistoryEvent } from "@/lib/orders.functions";
import { pageHead, pageHeadCopy } from "@/lib/seo";

export const Route = createFileRoute("/track-order")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: (context) => {
    const rawSearch = (context as unknown as { search?: Record<string, unknown> }).search ?? {};
    const locale = getLocale(typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined);
    const copy = pageHeadCopy(locale, "trackOrder");
    return pageHead({
      title: copy.title,
      description: copy.description,
      path: "/track-order",
      robots: "noindex,nofollow",
    });
  },
  component: TrackOrderPage,
  errorComponent: TrackOrderError,
});

function TrackOrderError() {
  const { locale } = Route.useSearch();
  return <div role="alert" className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).common.loadError}</div>;
}

/** Ordered journey steps; each entry is the canonical order_status value. */
const JOURNEY = [
  "received",
  "preparing",
  "ready_for_shipping",
  "handed_to_courier",
  "in_transit",
  "delivered",
] as const;

/** Legacy / synonym statuses mapped onto the nearest journey step index. */
const STATUS_STEP: Record<string, number> = {
  received: 0,
  pending: 0,
  confirmed: 0,
  preparing: 1,
  processing: 1,
  ready_for_shipping: 2,
  handed_to_courier: 3,
  in_transit: 4,
  shipped: 4,
  delivered: 5,
};

/** Terminal statuses that end the journey outside the happy path. */
const TERMINAL = new Set(["delivered", "returned", "failed_delivery", "cancelled", "refunded"]);

function OrderTimeline({
  status,
  steps,
  statusLabel,
  timelineCurrent,
  terminalNotice,
}: {
  status: string;
  steps: readonly string[];
  statusLabel: (status: string) => string;
  timelineCurrent: string;
  terminalNotice: string;
}) {
  const terminal = TERMINAL.has(status);
  const currentStep =
    status === "delivered" ? JOURNEY.length - 1 : terminal ? -1 : (STATUS_STEP[status] ?? -1);

  return (
    <div className="mt-6">
      <ol className="flex" aria-label={timelineCurrent}>
        {JOURNEY.map((step, index) => {
          const done = currentStep >= 0 && index < currentStep;
          const current = index === currentStep;
          const reached = done || current;
          return (
            <li key={step} className="relative min-w-0 flex-1">
              {/* Connector from the previous step — logical edges keep RTL correct. */}
              {index > 0 ? (
                <span
                  aria-hidden
                  className={`absolute start-0 top-4 h-px w-1/2 transition-colors ${
                    reached ? "bg-foreground" : "bg-border"
                  }`}
                />
              ) : null}
              <span
                aria-hidden
                className={`relative z-10 mx-auto grid size-8 place-items-center rounded-full border text-caption font-semibold transition-colors ${
                  done
                    ? "border-foreground bg-foreground text-background"
                    : current
                      ? "border-foreground bg-background text-foreground ring-2 ring-foreground/25"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-4" /> : <span>{index + 1}</span>}
              </span>
              <span
                className={`mt-2 block px-1 text-center text-caption leading-tight ${
                  current ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
                aria-current={current ? "step" : undefined}
              >
                {steps[index] ?? statusLabel(step)}
              </span>
            </li>
          );
        })}
      </ol>
      {terminal && status !== "delivered" ? (
        <p className="mt-5 rounded-xl border border-border bg-muted/50 p-4 text-small text-muted-foreground">
          {terminalNotice}
        </p>
      ) : null}
    </div>
  );
}

function TrackOrderPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const tt = t.trackOrder;
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const lookup = useMutation({
    mutationFn: () => {
      const on = orderNumber.trim();
      const ph = phone.trim();
      if (!on && !ph) {
        setFormError(tt.provideOne || "Enter an order code or phone number.");
        throw new Error("validation");
      }
      setFormError("");
      return trackGuestOrder({ data: {
        ...(on ? { orderNumber: on } : {}),
        ...(ph ? { phone: ph } : {}),
      } });
    },
  });

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <p className="text-eyebrow text-muted-foreground">{tt.eyebrow}</p>
        <h1 className="mt-2 text-display">{tt.title}</h1>
        <p className="mt-4 text-body text-muted-foreground">{tt.intro}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup.mutate();
          }}
          className="mt-8 rounded-xl border border-border bg-card p-5 sm:p-6"
        >
          <label className="block text-small">
            {tt.orderCode}
            <Input
              className="mt-2"
              value={orderNumber}
              placeholder="ORD-ABC123"
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            />
          </label>
          <label className="mt-4 block text-small">
            {tt.mobileNumber}
            <Input
              className="mt-2"
              value={phone}
              placeholder="+213551234567"
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
            />
            <p className="mt-1 text-caption text-muted-foreground">
              {tt.phoneOptional || "Optional — use if you forgot your order code to see all your orders."}
            </p>
          </label>
          {formError ? (
            <p role="alert" className="mt-3 text-small text-destructive">{formError}</p>
          ) : null}
          <Button className="mt-6 h-11 w-full rounded-[10px]" disabled={lookup.isPending}>
            {lookup.isPending ? tt.checking : t.nav.trackOrder}
          </Button>
        </form>
        {lookup.isError ? (
          <p role="alert" className="mt-5 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-small text-destructive">
            {lookup.error instanceof Error ? lookup.error.message : tt.lookupFailed}
          </p>
        ) : null}
        {lookup.isSuccess && (!lookup.data || lookup.data.orders.length === 0) ? (
          <p className="mt-5 rounded-xl border border-border bg-card p-4 text-small text-muted-foreground">{tt.noMatch}</p>
        ) : null}
        {lookup.data && lookup.data.orders.length > 0 ? (
          <div className="mt-6 space-y-4">
            {lookup.data.orders.map((order) => (
          <section key={order.orderNumber} className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-caption text-muted-foreground">{order.orderNumber}</p>
                <h2 className="mt-1 text-h3 text-foreground">{t.orders.statusLabel(order.status)}</h2>
              </div>
              <p className="text-price tabular-nums">{formatPrice(order.total, locale, order.currency)}</p>
            </div>
            <p className="mt-4 text-small text-muted-foreground">
              {order.deliveryMethod === "office" ? tt.officeDelivery : tt.homeDelivery} · {tt.placed}{" "}
              {formatDate(order.createdAt, locale)}
            </p>

            {lookup.data.orders.length === 1 ? (
              <>
            <h3 className="mt-6 text-nav text-foreground">{tt.timelineTitle}</h3>
            <OrderTimeline
              status={order.status}
              steps={tt.steps}
              statusLabel={t.orders.statusLabel}
              timelineCurrent={tt.timelineCurrent}
              terminalNotice={tt.terminalNotice}
            />

            <h3 className="mt-6 text-nav text-foreground">{tt.historyTitle}</h3>
            {lookup.data.history.length > 0 ? (
              <ol className="mt-3 space-y-3">
                {lookup.data.history.map((event: GuestOrderHistoryEvent) => (
                  <li
                    key={`${event.at}-${event.status}`}
                    className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4"
                  >
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground" />
                    <div className="min-w-0">
                      <p className="text-small font-semibold text-foreground">
                        {t.orders.statusLabel(event.status)}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {formatDate(event.at, locale, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      {event.note ? (
                        <p className="mt-1 text-small text-muted-foreground">{event.note}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-small text-muted-foreground">{tt.historyEmpty}</p>
            )}

            <div className="mt-6 divide-y divide-border">
              {order.sellerOrders.map((sellerOrder: { storeName: string; status: string }) => (
                <div
                  key={`${sellerOrder.storeName}-${sellerOrder.status}`}
                  className="flex justify-between py-3 text-small"
                >
                  <span>{sellerOrder.storeName}</span>
                  <span className="capitalize text-muted-foreground">{t.orders.statusLabel(sellerOrder.status)}</span>
                </div>
              ))}
            </div>
              </>
            ) : null}
          </section>
            ))}
          </div>
        ) : null}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
