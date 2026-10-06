/**
 * Seller analytics — Section 26 (V8), seller-scoped.
 *
 * Every panel on this page is backed by a dedicated server function in
 * `src/lib/seller-analytics.functions.ts`. All numbers are computed from real
 * rows (analytics_events via the seller-scoped RPC, seller_orders,
 * order_items, products, reviews). Empty windows render honest empty states —
 * never estimates.
 *
 * Search-param conventions (`locale`, `days`) are preserved so deep links
 * keep working.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Info, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerShell } from "@/components/seller/SellerShell";
import { AdminCard, EmptyState, Stat, fmtMoney } from "@/components/admin/ui";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { CountUp } from "@/components/motion";
import { getLocale, getTranslations, type SupportedLocale, type Translation } from "@/lib/i18n";
import { numParam, useUrlState } from "@/hooks/use-url-state";
import {
  getSellerAnalyticsProfile,
  getSellerFunnel,
  getSellerProductPerformance,
  getSellerReviewStats,
  getSellerTraffic,
  getSellerVelocity,
  type ProductPerformanceRow,
  type TrafficDayPoint,
  type VelocityDayPoint,
} from "@/lib/seller-analytics.functions";

const RANGES = [7, 30, 90] as const;

const profileQuery = queryOptions({
  queryKey: ["seller-analytics-profile"],
  queryFn: () => getSellerAnalyticsProfile(),
});
const trafficQuery = (days: number) =>
  queryOptions({ queryKey: ["seller-analytics-traffic", days], queryFn: () => getSellerTraffic({ data: { days } }) });
const funnelQuery = (days: number) =>
  queryOptions({ queryKey: ["seller-analytics-funnel", days], queryFn: () => getSellerFunnel({ data: { days } }) });
const performanceQuery = (days: number) =>
  queryOptions({
    queryKey: ["seller-analytics-performance", days],
    queryFn: () => getSellerProductPerformance({ data: { days, limit: 10 } }),
  });
const velocityQuery = (days: number) =>
  queryOptions({ queryKey: ["seller-analytics-velocity", days], queryFn: () => getSellerVelocity({ data: { days } }) });
const reviewsQuery = queryOptions({
  queryKey: ["seller-analytics-reviews"],
  queryFn: () => getSellerReviewStats(),
});

const bcp47 = (locale: SupportedLocale): string =>
  locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-US";

export const Route = createFileRoute("/_authenticated/seller/analytics")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    days: numParam(search["days"], 30),
  }),
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ context, deps }) => {
    const days = numParam(deps.days, 30);
    return Promise.all([
      context.queryClient.ensureQueryData(profileQuery),
      context.queryClient.ensureQueryData(trafficQuery(days)),
      context.queryClient.ensureQueryData(funnelQuery(days)),
      context.queryClient.ensureQueryData(performanceQuery(days)),
      context.queryClient.ensureQueryData(velocityQuery(days)),
      context.queryClient.ensureQueryData(reviewsQuery),
    ]);
  },
  pendingComponent: () => (
    <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(getLocale()).sellerAnalyticsV8.loading}</div>
  ),
  errorComponent: () => (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      {getTranslations(getLocale()).sellerAnalyticsV8.failed}
    </div>
  ),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Sales analytics — Modalia" },
      { name: "description", content: "Deeper sales, product and settlement analytics for your store." },
      { property: "og:title", content: "Sales analytics — Modalia" },
      { property: "og:description", content: "Deeper sales, product and settlement analytics for your store." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/seller/analytics" }],
  }),
  component: SellerAnalyticsPage,
});

function SellerAnalyticsPage() {
  const url = useUrlState({ days: 30 });
  const days = numParam(url.search["days"], 30);
  const setDays = (next: number) => url.set({ days: next }, { push: true });
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).sellerAnalyticsV8;
  const fmt = bcp47(locale);

  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: reviews } = useSuspenseQuery(reviewsQuery);
  // Range toggle refetches without suspending the page; the previous range stays visible meanwhile.
  const { data: traffic } = useQuery({ ...trafficQuery(days), placeholderData: keepPreviousData });
  const { data: funnel } = useQuery({ ...funnelQuery(days), placeholderData: keepPreviousData });
  const { data: performance } = useQuery({ ...performanceQuery(days), placeholderData: keepPreviousData });
  const { data: velocity } = useQuery({ ...velocityQuery(days), placeholderData: keepPreviousData });

  return (
    <SellerShell
      title={t.title}
      eyebrow={profile.legalName}
      actions={
        <Button asChild variant="outline">
          <Link to="/seller" search={{ locale }}>
            <ArrowLeft className="me-1 h-4 w-4" aria-hidden="true" /> {t.back}
          </Link>
        </Button>
      }
    >
      {/* Storefront traffic — real events, this store only */}
      <AdminCard
        title={t.trafficTitle}
        subtitle={`${t.trafficSubtitle} — ${t.lastDays(days)}`}
        actions={
          <div role="group" aria-label={t.rangeLabel} className="flex gap-1 rounded-full border border-border p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                aria-pressed={days === r}
                className={`rounded-full px-3 py-1 text-small font-medium transition-colors ${
                  days === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.rangeDays(r)}
              </button>
            ))}
          </div>
        }
      >
        {traffic ? (
          traffic.hasData ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label={t.storeViews}
                  value={<CountUp value={traffic.totals.storeViews} locale={fmt} />}
                  hint={t.storeViewsHint}
                />
                <Stat
                  label={t.productViews}
                  value={<CountUp value={traffic.totals.productViews} locale={fmt} />}
                  hint={t.productViewsHint}
                />
                <Stat
                  label={t.searchAppearances}
                  value={<CountUp value={traffic.searchAppearances.count} locale={fmt} />}
                  hint={t.searchAppearancesHint}
                />
                <Stat
                  label={t.visitors}
                  value={<CountUp value={traffic.totals.uniqueVisitors} locale={fmt} />}
                  hint={t.visitorsHint}
                />
              </div>
              <div className="mt-6">
                <TrafficBars
                  data={traffic.series}
                  days={days}
                  storeLabel={t.storeViews}
                  productLabel={t.productViews}
                  caption={t.trafficChartCaption}
                />
              </div>
              <p className="mt-4 text-small leading-6 text-muted-foreground">{t.searchNotTracked}</p>
            </>
          ) : (
            <EmptyState title={t.noTrafficTitle} text={t.noTrafficText} />
          )
        ) : null}
      </AdminCard>

      {/* Conversion funnel — real event stages + confirmed orders */}
      <div className="mt-6">
        <AdminCard title={t.funnelTitle} subtitle={`${t.funnelSubtitle} — ${t.lastDays(days)}`}>
          {funnel ? (
            funnel.hasData ? (
                <FunnelChart
                  stages={funnel.stages.map((s) => ({
                    stage: s.stage,
                    label: t.funnelStageLabels[s.stage],
                    count: s.count,
                  }))}
                  caption={t.funnelCaption}
                />
            ) : (
              <EmptyState title={t.noFunnelTitle} text={t.noFunnelText} />
            )
          ) : null}
        </AdminCard>
      </div>

      {/* Product performance — revenue/units from real order rows, views from real events */}
      <div className="mt-6">
        <AdminCard title={t.performanceTitle} subtitle={`${t.performanceSubtitle} — ${t.lastDays(days)}`}>
          {performance ? (
            performance.hasData ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <section aria-label={t.topTitle}>
                  <p className="text-small font-semibold">{t.topTitle}</p>
                  <p className="text-caption text-muted-foreground">{t.topHint}</p>
                  {performance.top.length > 0 ? (
                    <div className="mt-3">
                      <PerformanceTable rows={performance.top} t={t} fmt={fmt} locale={locale} />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <EmptyState title={t.noTopTitle} text={t.noTopText} />
                    </div>
                  )}
                </section>
                <section aria-label={t.lowTitle}>
                  <p className="text-small font-semibold">{t.lowTitle}</p>
                  <p className="text-caption text-muted-foreground">{t.lowHint}</p>
                  {performance.lowPerforming.length > 0 ? (
                    <div className="mt-3">
                      <PerformanceTable rows={performance.lowPerforming} t={t} fmt={fmt} locale={locale} />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <EmptyState title={t.noLowTitle} text={t.noLowText} />
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <EmptyState title={t.noTopTitle} text={t.noTopText} />
            )
          ) : null}
        </AdminCard>
      </div>

      {/* Sales velocity — delivered revenue/commission/net + units per day */}
      <div className="mt-6">
        <AdminCard title={t.velocityTitle} subtitle={`${t.velocitySubtitle} — ${t.lastDays(days)}`}>
          {velocity ? (
            velocity.hasData ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <Stat
                    label={t.totalUnits}
                    value={<CountUp value={velocity.totals.units} locale={fmt} />}
                  />
                  <Stat
                    label={t.avgUnitsPerDay}
                    value={<CountUp value={velocity.totals.avgUnitsPerDay} locale={fmt} formatOptions={{ maximumFractionDigits: 1 }} />}
                  />
                  <Stat label={t.revenue} value={fmtMoney(velocity.totals.revenue, "DZD", locale)} />
                  <Stat label={t.commission} value={fmtMoney(velocity.totals.commission, "DZD", locale)} />
                  <Stat label={t.net} value={fmtMoney(velocity.totals.net, "DZD", locale)} />
                </div>
                <div className="mt-6">
                  <VelocityChart
                    data={velocity.series}
                    days={days}
                    revenueLabel={t.revenue}
                    unitsLabel={t.unitsLabel}
                    caption={t.velocityCaption}
                  />
                </div>
              </>
            ) : (
              <EmptyState title={t.noVelocityTitle} text={t.noVelocityText} />
            )
          ) : null}
        </AdminCard>
      </div>

      {/* Review stats — approved reviews across this seller's listings */}
      <div className="mt-6">
        <AdminCard title={t.reviewsTitle} subtitle={t.reviewsSubtitle}>
          {reviews.hasData && reviews.averageRating !== null ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
              <div className="text-center sm:text-start">
                <p className="text-small font-medium text-muted-foreground">{t.averageRating}</p>
                <p className="mt-1 text-5xl font-semibold tabular-nums">
                  <CountUp value={reviews.averageRating} locale={fmt} formatOptions={{ maximumFractionDigits: 1 }} />
                </p>
                <p className="mt-2 inline-flex items-center gap-1 text-small text-muted-foreground">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                  {t.approvedReviews(reviews.approvedCount)}
                </p>
              </div>
              <div className="flex-1" role="img" aria-label={`${t.averageRating}: ${reviews.averageRating} — ${t.approvedReviews(reviews.approvedCount)}`}>
                <ol className="space-y-2">
                  {reviews.distribution.map((d) => {
                    const pct = reviews.approvedCount > 0 ? (d.count / reviews.approvedCount) * 100 : 0;
                    return (
                      <li key={d.stars} className="flex items-center gap-3 text-small">
                        <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                          {d.stars} ★
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <span
                            className="block h-full rounded-full bg-amber-400"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-end tabular-nums text-muted-foreground">{d.count}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          ) : (
            <EmptyState title={t.noReviewsTitle} text={t.noReviewsText} />
          )}
        </AdminCard>
      </div>

      {/* Honest data note */}
      <div className="mt-6 flex gap-3 rounded-2xl border border-border bg-card p-5">
        <Info className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-small font-semibold">{t.aboutTitle}</p>
          <p className="mt-1 text-small leading-6 text-muted-foreground">{t.aboutText}</p>
        </div>
      </div>
    </SellerShell>
  );
}

/* ------------------------------ local SVG charts ----------------------------- */
/* Hand-drawn, static SVG (no animation — safe under prefers-reduced-motion).
   Charts render with dir="ltr" so numeric axes keep conventional placement in
   RTL locales; surrounding layout flips through logical properties. */

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** Grouped per-day bars: store views + product views. */
function TrafficBars({
  data,
  days,
  storeLabel,
  productLabel,
  caption,
}: {
  data: TrafficDayPoint[];
  days: number;
  storeLabel: string;
  productLabel: string;
  caption: string;
}) {
  const W = 720;
  const H = 240;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxV = Math.max(1, ...data.map((d) => Math.max(d.storeViews, d.productViews)));
  const hasAny = data.some((d) => d.storeViews > 0 || d.productViews > 0);
  const slot = data.length ? innerW / data.length : innerW;
  const groupW = Math.min(28, slot * 0.7);
  const barW = Math.max(1.5, groupW / 2.4);
  const x = (i: number) => PAD_L + slot * i + (slot - groupW) / 2;
  const y = (v: number) => PAD_T + innerH - (v / maxV) * innerH;
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxV * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <figure dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={hasAny ? `${caption} Peak ${maxV} views in a day over the last ${days} days.` : `${caption} No views in the last ${days} days.`}
      >
        {ticks.map((tk) => (
          <g key={`t-${tk}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(tk)} y2={y(tk)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={PAD_L - 8} y={y(tk) + 4} textAnchor="end" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {compact(tk)}
            </text>
          </g>
        ))}
        {hasAny ? (
          data.map((d, i) => (
            <g key={d.date}>
              <rect x={x(i)} y={y(d.storeViews)} width={barW} height={Math.max(0, PAD_T + innerH - y(d.storeViews))} rx={2} fill="var(--chart-1)" opacity={d.storeViews === 0 ? 0.2 : 0.9}>
                <title>{`${d.date} — ${storeLabel}: ${d.storeViews}`}</title>
              </rect>
              <rect x={x(i) + barW * 1.15} y={y(d.productViews)} width={barW} height={Math.max(0, PAD_T + innerH - y(d.productViews))} rx={2} fill="var(--chart-2)" opacity={d.productViews === 0 ? 0.2 : 0.9}>
                <title>{`${d.date} — ${productLabel}: ${d.productViews}`}</title>
              </rect>
            </g>
          ))
        ) : (
          <text x={W / 2} y={PAD_T + innerH / 2} textAnchor="middle" fontSize={14} fill="currentColor" className="text-muted-foreground">
            {caption}
          </text>
        )}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={PAD_L + slot * i + slot / 2} y={H - 10} textAnchor="middle" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {d.date.slice(8, 10)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center gap-5 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-full" style={{ background: "var(--chart-1)" }} aria-hidden="true" />
          {storeLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-full" style={{ background: "var(--chart-2)" }} aria-hidden="true" />
          {productLabel}
        </span>
      </figcaption>
    </figure>
  );
}

/** Delivered-revenue bars with a dashed units line on a secondary axis. */
function VelocityChart({
  data,
  days,
  revenueLabel,
  unitsLabel,
  caption,
}: {
  data: VelocityDayPoint[];
  days: number;
  revenueLabel: string;
  unitsLabel: string;
  caption: string;
}) {
  const W = 720;
  const H = 280;
  const PAD_L = 56;
  const PAD_R = 44;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const hasAny = data.some((d) => d.revenue > 0 || d.units > 0);
  const maxRevenue = Math.max(1, ...data.map((d) => d.revenue));
  const maxUnits = Math.max(1, ...data.map((d) => d.units));
  const slot = data.length ? innerW / data.length : innerW;
  const barW = Math.max(2, Math.min(28, slot * 0.62));
  const x = (i: number) => PAD_L + slot * i + (slot - barW) / 2;
  const yRevenue = (v: number) => PAD_T + innerH - (v / maxRevenue) * innerH;
  const yUnits = (v: number) => PAD_T + innerH - (v / maxUnits) * innerH;
  const unitsLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${(x(i) + barW / 2).toFixed(1)},${yUnits(d.units).toFixed(1)}`).join(" ");

  const revenueTicks = [0, 0.5, 1].map((f) => Math.round(maxRevenue * f));
  const unitsTicks = [0, 0.5, 1].map((f) => Math.round(maxUnits * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <figure dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={hasAny ? `${caption} Peak daily revenue ${compact(maxRevenue)} over the last ${days} days.` : `${caption} No sales in the last ${days} days.`}
      >
        {revenueTicks.map((tk) => (
          <g key={`r-${tk}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yRevenue(tk)} y2={yRevenue(tk)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={PAD_L - 8} y={yRevenue(tk) + 4} textAnchor="end" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {compact(tk)}
            </text>
          </g>
        ))}
        {unitsTicks.map((tk) => (
          <text key={`u-${tk}`} x={W - PAD_R + 8} y={yUnits(tk) + 4} fontSize={11} fill="currentColor" className="text-muted-foreground">
            {compact(tk)}
          </text>
        ))}
        {hasAny ? (
          <>
            {data.map((d, i) => (
              <rect
                key={d.date}
                x={x(i)}
                y={yRevenue(d.revenue)}
                width={barW}
                height={Math.max(0, PAD_T + innerH - yRevenue(d.revenue))}
                rx={Math.min(4, barW / 2)}
                fill="var(--chart-1)"
                opacity={d.revenue === 0 ? 0.2 : 0.85}
              >
                <title>{`${d.date}: ${d.revenue} — ${d.units}`}</title>
              </rect>
            ))}
            <path d={unitsLine} fill="none" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : (
          <text x={W / 2} y={PAD_T + innerH / 2} textAnchor="middle" fontSize={14} fill="currentColor" className="text-muted-foreground">
            {caption}
          </text>
        )}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={PAD_L + slot * i + slot / 2} y={H - 10} textAnchor="middle" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {d.date.slice(8, 10)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center gap-5 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-full" style={{ background: "var(--chart-1)" }} aria-hidden="true" />
          {revenueLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 border-t-2 border-dashed" style={{ borderColor: "var(--chart-2)" }} aria-hidden="true" />
          {unitsLabel}
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------ performance table ---------------------------- */

function PerformanceTable({
  rows,
  t,
  fmt,
  locale,
}: {
  rows: ProductPerformanceRow[];
  t: Translation["sellerAnalyticsV8"];
  fmt: string;
  locale: SupportedLocale;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b border-border text-caption uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-10 py-2 pe-3 text-start font-medium">#</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t.colProduct}</th>
            <th scope="col" className="py-2 pe-3 text-end font-medium">{t.colViews}</th>
            <th scope="col" className="py-2 pe-3 text-end font-medium">{t.colUnits}</th>
            <th scope="col" className="py-2 pe-3 text-end font-medium">{t.colRevenue}</th>
            <th scope="col" className="py-2 text-end font-medium">{t.colConversion}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={r.productId}>
              <td className="py-2.5 pe-3 text-caption font-semibold text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="max-w-0 truncate py-2.5 pe-3 font-medium">{r.name}</td>
              <td className="py-2.5 pe-3 text-end text-muted-foreground tabular-nums">
                <CountUp value={r.views} locale={fmt} />
              </td>
              <td className="py-2.5 pe-3 text-end text-muted-foreground tabular-nums">
                <CountUp value={r.units} locale={fmt} />
              </td>
              <td className="py-2.5 pe-3 text-end font-medium tabular-nums">{fmtMoney(r.revenue, "DZD", locale)}</td>
              <td className="py-2.5 text-end tabular-nums text-muted-foreground">
                {r.conversionPct === null ? "—" : `${new Intl.NumberFormat(fmt, { maximumFractionDigits: 1 }).format(r.conversionPct)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
