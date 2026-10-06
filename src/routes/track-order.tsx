import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { formatDate, formatPrice } from "@/lib/i18n/format";
import { trackGuestOrder } from "@/lib/orders.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/track-order")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () =>
    pageHead({
      title: "Track order — Modalia",
      description: "Check the latest status of your Modalia order.",
      path: "/track-order",
      robots: "noindex,nofollow",
    }),
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
      <ol className="flex items-start" aria-label={timelineCurrent}>
        {JOURNEY.map((step, index) => {
          const done = currentStep >= 0 && index < currentStep;
          const current = index === currentStep;
          return (
            <li key={step} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <span
                aria-hidden
                className={`grid size-8 place-items-center rounded-full border text-caption font-semibold transition-colors ${
                  current
                    ? "border-foreground bg-foreground text-background"
                    : done
                      ? "border-foreground bg-foreground/10 text-foreground"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-4" /> : <span>{index + 1}</span>}
              </span>
              <span
                className={`text-caption leading-tight ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                aria-current={current ? "step" : undefined}
              >
                {steps[index] ?? statusLabel(step)}
              </span>
              {index < JOURNEY.length - 1 ? (
                <span
                  aria-hidden
                  className={`mt-1 hidden h-px w-full ${done || current ? "bg-foreground" : "bg-border"} sm:block`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {terminal && status !== "delivered" ? (
        <p className="mt-5 rounded-2xl border border-border bg-muted/60 p-4 text-small text-muted-foreground">
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
  const lookup = useMutation({ mutationFn: () => trackGuestOrder({ data: { orderNumber, phone } }) });

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
          className="mt-8 rounded-3xl border border-border bg-card p-6"
        >
          <label className="block text-small">
            {tt.orderCode}
            <Input
              className="mt-2"
              value={orderNumber}
              placeholder="ORD-ABC123"
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              required
            />
          </label>
          <label className="mt-4 block text-small">
            {tt.mobileNumber}
            <Input
              className="mt-2"
              value={phone}
              placeholder="+213551234567"
              onChange={(e) => setPhone(e.target.value)}
              required
              dir="ltr"
            />
          </label>
          <Button className="mt-6 h-11 w-full rounded-full" disabled={lookup.isPending}>
            {lookup.isPending ? tt.checking : t.nav.trackOrder}
          </Button>
        </form>
        {lookup.isError ? (
          <p className="mt-5 text-small text-destructive">
            {lookup.error instanceof Error ? lookup.error.message : tt.lookupFailed}
          </p>
        ) : null}
        {lookup.isSuccess && !lookup.data ? (
          <p className="mt-5 border border-border p-4 text-small text-muted-foreground">{tt.noMatch}</p>
        ) : null}
        {lookup.data ? (
          <section className="mt-6 rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-caption text-muted-foreground">{lookup.data.orderNumber}</p>
                <h2 className="mt-1 text-h3">{t.orders.statusLabel(lookup.data.status)}</h2>
              </div>
              <p className="text-price">{formatPrice(lookup.data.total, locale, lookup.data.currency)}</p>
            </div>
            <p className="mt-4 text-small text-muted-foreground">
              {lookup.data.deliveryMethod === "office" ? tt.officeDelivery : tt.homeDelivery} · {tt.placed}{" "}
              {formatDate(lookup.data.createdAt, locale)}
            </p>

            <h3 className="mt-6 text-nav text-foreground">{tt.timelineTitle}</h3>
            <OrderTimeline
              status={lookup.data.status}
              steps={tt.steps}
              statusLabel={t.orders.statusLabel}
              timelineCurrent={tt.timelineCurrent}
              terminalNotice={tt.terminalNotice}
            />

            <div className="mt-6 divide-y divide-border">
              {lookup.data.sellerOrders.map((sellerOrder: { storeName: string; status: string }) => (
                <div
                  key={`${sellerOrder.storeName}-${sellerOrder.status}`}
                  className="flex justify-between py-3 text-small"
                >
                  <span>{sellerOrder.storeName}</span>
                  <span className="capitalize text-muted-foreground">{t.orders.statusLabel(sellerOrder.status)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
