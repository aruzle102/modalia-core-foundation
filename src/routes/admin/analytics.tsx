import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  SegmentedControl,
  Stat,
  TableSkeleton,
  fmtMoney,
} from "@/components/admin/ui";
import {
  getCommerceOverview,
  getCommerceTimeseries,
  getCommerceBySeller,
  getCommissionBreakdown,
  type TimeseriesBucket,
} from "@/lib/admin-analytics.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { strParam, useUrlState } from "@/hooks/use-url-state";

type RangeKey = "today" | "7" | "30" | "90" | "custom";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "custom", label: "Custom" },
];

export const Route = createFileRoute("/admin/analytics")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    range: (["today", "7", "30", "90", "custom"] as const).includes(search["range"] as RangeKey)
      ? (search["range"] as RangeKey)
      : ("30" as RangeKey),
    from: strParam(search["from"]),
    to: strParam(search["to"]),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Commerce Analytics — Admin — Modalia" },
      { name: "description", content: "Real marketplace analytics: GMV, orders, commission and seller performance from commerce data." },
      { property: "og:title", content: "Commerce Analytics — Admin — Modalia" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAnalyticsPage,
});

function toISO(d: Date): string {
  return d.toISOString();
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Resolve the selected range to [start, end) ISO strings. */
function resolveRange(
  range: RangeKey,
  from: string,
  to: string,
): { start: string; end: string; valid: boolean } {
  const now = new Date();
  if (range === "today") {
    return { start: toISO(startOfDay(now)), end: toISO(now), valid: true };
  }
  if (range !== "custom") {
    const days = Number(range);
    return { start: toISO(new Date(now.getTime() - days * 86400_000)), end: toISO(now), valid: true };
  }
  const f = new Date(from);
  const t = new Date(to);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f >= t) {
    return { start: "", end: "", valid: false };
  }
  // Include the whole "to" day.
  const tEnd = new Date(t);
  tEnd.setDate(tEnd.getDate() + 1);
  return { start: toISO(f), end: toISO(tEnd), valid: true };
}

/** Simple SVG bar chart for GMV over time. */
function SalesBars({ data }: { data: TimeseriesBucket[] }) {
  const W = 720;
  const H = 220;
  const PAD = 8;
  const innerH = H - PAD * 2 - 24;
  const max = Math.max(1, ...data.map((d) => d.gmv));
  const bw = (W - PAD * 2) / Math.max(1, data.length);
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));
  return (
    <figure dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sales over time">
        {data.map((d, i) => {
          const h = (d.gmv / max) * innerH;
          return (
            <g key={d.bucket}>
              <rect
                x={PAD + i * bw + bw * 0.15}
                y={PAD + innerH - h}
                width={Math.max(1, bw * 0.7)}
                height={Math.max(h, d.gmv > 0 ? 2 : 0)}
                rx={2}
                fill="var(--chart-1)"
                opacity={d.gmv > 0 ? 0.9 : 0.15}
              />
              {i % labelEvery === 0 ? (
                <text
                  x={PAD + i * bw + bw / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  className="text-muted-foreground"
                >
                  {d.bucket.slice(0, 10).slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Could not load analytics data.
      </span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1 h-3 w-3" /> Retry
      </Button>
    </div>
  );
}

function AdminAnalyticsPage() {
  const { locale, range, from, to } = Route.useSearch();
  const t = getTranslations(locale);
  const ta = t.admin.analytics;
  const url = useUrlState({ range: "30", from: "", to: "" });
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const setRange = (r: RangeKey) => url.set({ range: r });
  const applyCustom = () => url.set({ range: "custom", from: customFrom, to: customTo });

  const { start, end, valid } = useMemo(
    () => resolveRange(range, from, to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, from, to],
  );
  const granularity = range === "90" ? "week" : "day";

  const overviewQ = useQuery({
    queryKey: ["commerce-overview", start, end],
    queryFn: () => getCommerceOverview({ data: { start, end } }),
    enabled: valid,
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const seriesQ = useQuery({
    queryKey: ["commerce-timeseries", start, end, granularity],
    queryFn: () => getCommerceTimeseries({ data: { start, end, granularity } }),
    enabled: valid,
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const bySellerQ = useQuery({
    queryKey: ["commerce-by-seller", start, end],
    queryFn: () => getCommerceBySeller({ data: { start, end } }),
    enabled: valid,
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const commissionQ = useQuery({
    queryKey: ["commission-breakdown", start, end],
    queryFn: () => getCommissionBreakdown({ data: { start, end } }),
    enabled: valid,
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const o = overviewQ.data;
  const hasOrders = o != null && o.orders_placed > 0;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <AdminGate>
      <AdminShell
        title="Commerce Analytics"
        subtitle="Real marketplace performance from commerce data — GMV, orders, commission and seller earnings."
        breadcrumbs={[{ label: t.adminNav.items.analytics }]}
        actions={
          <SegmentedControl
            ariaLabel={t.common.dateRange}
            value={range}
            onChange={(v) => setRange(v as RangeKey)}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
        }
      >
        {range === "custom" ? (
          <AdminCard title="Custom range">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">From</span>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">To</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
              <Button size="sm" onClick={applyCustom} disabled={!customFrom || !customTo}>
                Apply
              </Button>
            </div>
            {!valid ? (
              <p className="mt-2 text-sm text-destructive">Pick a valid date range (from before to).</p>
            ) : null}
          </AdminCard>
        ) : null}

        {!valid ? (
          <div className="mt-6">
            <AdminCard title="Invalid range">
              <EmptyState title="Choose a valid date range" text="The custom range needs a start date before the end date." />
            </AdminCard>
          </div>
        ) : overviewQ.isPending ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-md bg-muted/60" />
            ))}
          </div>
        ) : overviewQ.isError || !o ? (
          <div className="mt-6">
            <QueryError onRetry={() => void overviewQ.refetch()} />
          </div>
        ) : !hasOrders ? (
          <div className="mt-6">
            <AdminCard title="No orders yet">
              <EmptyState
                title="No commerce data in this range"
                text="Analytics appear here once customers place orders. All numbers come from real order rows — nothing is simulated."
              />
            </AdminCard>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <section aria-label="Key metrics" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Stat label="GMV" value={fmtMoney(o.gmv, "DZD", locale)} hint={`${o.orders_live} live orders`} />
              <Stat label="Orders" value={String(o.orders_placed)} hint={`${o.delivered_orders} delivered · ${o.cancelled_orders} cancelled`} />
              <Stat label="Average order value" value={fmtMoney(o.aov, "DZD", locale)} hint={`${o.units_sold} units sold`} />
              <Stat
                label="Platform commission"
                value={fmtMoney(o.platform_commission, "DZD", locale)}
                hint={`Pending: ${fmtMoney(o.commission_pending, "DZD", locale)}`}
              />
              <Stat label="Seller net earnings" value={fmtMoney(o.seller_net, "DZD", locale)} hint="Delivered sales minus commission" />
              <Stat
                label="Conversion"
                value={o.visitors > 0 ? pct(o.conversion_rate) : "—"}
                hint={o.visitors > 0 ? `${o.visitors.toLocaleString()} visitors` : "No visitor data yet"}
              />
            </section>

            {/* Sales chart */}
            <div className="mt-6">
              <AdminCard title="Sales over time" subtitle={`GMV per ${granularity} — real order totals`}>
                {seriesQ.isPending ? (
                  <div className="h-56 animate-pulse rounded-md bg-muted/60" />
                ) : seriesQ.isError ? (
                  <QueryError onRetry={() => void seriesQ.refetch()} />
                ) : (
                  <SalesBars data={seriesQ.data ?? []} />
                )}
              </AdminCard>
            </div>

            {/* Pipeline + funnel */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <AdminCard title="Order pipeline" subtitle="Seller-order statuses in range">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-muted-foreground">Delivered</dt><dd className="text-xl font-semibold tabular-nums">{o.delivered_orders}</dd></div>
                  <div><dt className="text-muted-foreground">In progress</dt><dd className="text-xl font-semibold tabular-nums">{o.active_orders}</dd></div>
                  <div><dt className="text-muted-foreground">Cancelled</dt><dd className="text-xl font-semibold tabular-nums">{o.cancelled_orders}</dd></div>
                  <div><dt className="text-muted-foreground">Returned</dt><dd className="text-xl font-semibold tabular-nums">{o.returned_orders}</dd></div>
                </dl>
              </AdminCard>
              <AdminCard title="Storefront funnel" subtitle="Visitor behavior from analytics events">
                {o.visitors === 0 ? (
                  <EmptyState title="No visitor data yet" text="Funnel metrics appear once storefront events are recorded." />
                ) : (
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-muted-foreground">Visitors</dt><dd className="text-xl font-semibold tabular-nums">{o.visitors.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Product views</dt><dd className="text-xl font-semibold tabular-nums">{o.product_views.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Add to cart</dt><dd className="text-xl font-semibold tabular-nums">{o.add_to_cart.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Checkouts</dt><dd className="text-xl font-semibold tabular-nums">{o.checkout_completed.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Conversion</dt><dd className="text-xl font-semibold tabular-nums">{pct(o.conversion_rate)}</dd></div>
                    <div><dt className="text-muted-foreground">Cart abandonment</dt><dd className="text-xl font-semibold tabular-nums">{pct(o.cart_abandonment)}</dd></div>
                  </dl>
                )}
              </AdminCard>
            </div>

            {/* Commission by seller */}
            <div className="mt-6">
              <AdminCard
                title="Commission by seller"
                subtitle="Historical commission from each order's snapshot — never the current rate"
              >
                {bySellerQ.isPending ? (
                  <TableSkeleton rows={6} />
                ) : bySellerQ.isError ? (
                  <QueryError onRetry={() => void bySellerQ.refetch()} />
                ) : (bySellerQ.data ?? []).filter((s) => s.orders_placed > 0).length === 0 ? (
                  <EmptyState title="No seller activity" text="Per-seller numbers appear once sellers receive orders." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th scope="col" className="py-2 pr-4 font-medium">Seller</th>
                          <th scope="col" className="py-2 pr-4 text-right font-medium">Orders</th>
                          <th scope="col" className="py-2 pr-4 text-right font-medium">Sales</th>
                          <th scope="col" className="py-2 pr-4 text-right font-medium">Rate</th>
                          <th scope="col" className="py-2 pr-4 text-right font-medium">Commission</th>
                          <th scope="col" className="py-2 text-right font-medium">Seller net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(bySellerQ.data ?? [])
                          .filter((s) => s.orders_placed > 0)
                          .map((s) => (
                            <tr key={s.seller_id}>
                              <td className="py-3 pr-4 font-medium">{s.legal_name}</td>
                              <td className="py-3 pr-4 text-right tabular-nums">{s.orders_placed}</td>
                              <td className="py-3 pr-4 text-right tabular-nums">{fmtMoney(s.gmv, "DZD", locale)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums">{pct(s.commission_rate)}</td>
                              <td className="py-3 pr-4 text-right font-medium tabular-nums">{fmtMoney(s.commission, "DZD", locale)}</td>
                              <td className="py-3 text-right tabular-nums">{fmtMoney(s.seller_net, "DZD", locale)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCard>
            </div>

            {/* Commission by month */}
            <div className="mt-6">
              <AdminCard title="Commission by month" subtitle="Per seller, per month — eligible orders only">
                {commissionQ.isPending ? (
                  <TableSkeleton rows={6} />
                ) : commissionQ.isError ? (
                  <QueryError onRetry={() => void commissionQ.refetch()} />
                ) : (commissionQ.data ?? []).length === 0 ? (
                  <EmptyState title="No commission yet" text="Monthly commission rows appear once orders are delivered." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th scope="col" className="py-2 pr-4 font-medium">Month</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Seller</th>
                          <th scope="col" className="py-2 pr-4 text-right font-medium">Orders</th>
                          <th scope="col" className="py-2 pr-4 text-right font-medium">Sales</th>
                          <th scope="col" className="py-2 text-right font-medium">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(commissionQ.data ?? []).map((r) => (
                          <tr key={`${r.seller_id}-${r.month}`}>
                            <td className="py-3 pr-4 tabular-nums">{r.month.slice(0, 7)}</td>
                            <td className="py-3 pr-4 font-medium">{r.legal_name}</td>
                            <td className="py-3 pr-4 text-right tabular-nums">{r.order_count}</td>
                            <td className="py-3 pr-4 text-right tabular-nums">{fmtMoney(r.sales, "DZD", locale)}</td>
                            <td className="py-3 text-right font-medium tabular-nums">{fmtMoney(r.commission, "DZD", locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCard>
            </div>
          </>
        )}

        {/* Honest data note */}
        <div className="mt-6 flex gap-3 rounded-2xl border border-border bg-card p-5">
          <Info className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-small font-semibold">{ta.aboutTitle}</p>
            <p className="mt-1 text-small leading-6 text-muted-foreground">
              Financial numbers come from real order rows (orders, seller_orders, order_items).
              Commission always uses the historical snapshot stored on each order — never the
              current seller rate. Settlement tracking is not wired yet, so settled amounts are
              shown as unavailable rather than invented.
            </p>
          </div>
        </div>
      </AdminShell>
    </AdminGate>
  );
}
