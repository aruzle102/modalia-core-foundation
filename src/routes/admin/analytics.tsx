import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState, Stat } from "@/components/admin/ui";
import { numParam, useUrlState } from "@/hooks/use-url-state";
import { TopList } from "@/components/admin/Charts";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { getAdminAnalytics } from "@/lib/analytics.functions";
import { getLocale } from "@/lib/i18n";

const RANGES = [7, 30, 90] as const;

const analyticsQuery = (days: number) =>
  queryOptions({
    queryKey: ["admin-analytics", days],
    queryFn: () => getAdminAnalytics({ data: { days } }),
    retry: false,
  });

export const Route = createFileRoute("/admin/analytics")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    days: numParam(search["days"], 30),
  }),
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(analyticsQuery(numParam(deps.days, 30))),
  pendingComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">Loading analytics…</div>,
  errorComponent: () => (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      Analytics could not be loaded.
    </div>
  ),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Analytics — Admin — Modalia" },
      { name: "description", content: "Real storefront analytics: funnels, trending products, searches and velocity." },
      { property: "og:title", content: "Analytics — Admin — Modalia" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAnalyticsPage,
});

/** Minimal vertical bars for per-day purchase velocity (hand-drawn SVG). */
function VelocityBars({ data }: { data: { date: string; purchases: number }[] }) {
  const W = 720;
  const H = 220;
  const PAD = 8;
  const innerH = H - PAD * 2 - 24;
  const max = Math.max(1, ...data.map((d) => d.purchases));
  const bw = (W - PAD * 2) / Math.max(1, data.length);
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));
  return (
    <figure dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          data.some((d) => d.purchases > 0)
            ? `Daily purchases over the last ${data.length} days. Peak ${Math.max(...data.map((d) => d.purchases))} in a day.`
            : `No purchases recorded in the last ${data.length} days.`
        }
      >
        {data.map((d, i) => {
          const h = (d.purchases / max) * innerH;
          return (
            <g key={d.date}>
              <rect
                x={PAD + i * bw + bw * 0.15}
                y={PAD + innerH - h}
                width={Math.max(1, bw * 0.7)}
                height={Math.max(h, d.purchases > 0 ? 2 : 0)}
                rx={2}
                fill="var(--chart-1)"
                opacity={d.purchases > 0 ? 0.9 : 0.15}
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
                  {d.date.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function AdminAnalyticsPage() {
  const url = useUrlState({ days: 30 });
  const days = numParam(url.search["days"], 30);
  const setDays = (next: number) => url.set({ days: next });
  const { data } = useQuery({ ...analyticsQuery(days), placeholderData: keepPreviousData });
  const suspense = useSuspenseQuery(analyticsQuery(days));
  const analytics = data ?? suspense.data;

  const { totals, funnel, trendingProducts, popularSearches, velocity, categories, sellers } = analytics;
  const viewToPurchase =
    totals.productViews > 0 ? `${((totals.purchases / totals.productViews) * 100).toFixed(1)}%` : "—";

  return (
    <AdminGate>
      <AdminShell
        title="Analytics"
        subtitle="Real storefront events — views, carts, checkouts, purchases. Never estimated."
        actions={
          <div role="group" aria-label="Date range" className="flex gap-1 rounded-full border border-border p-1">
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
                {r}d
              </button>
            ))}
          </div>
        }
      >
        {!analytics.hasData ? (
          <AdminCard title="No analytics data yet">
            <EmptyState
              title="Nothing recorded in this window"
              text="Figures appear here once visitors browse the storefront. Event collection starts automatically — no setup needed. If collection was disabled in site settings, re-enable analytics_enabled to resume."
            />
          </AdminCard>
        ) : (
          <>
            {/* KPI stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Events recorded" value={totals.events.toLocaleString()} hint={`Last ${days} days`} />
              <Stat label="Unique visitors" value={totals.uniqueVisitors.toLocaleString()} hint="Anonymous visitor ids" />
              <Stat label="Product view events" value={totals.productViews.toLocaleString()} hint="Genuine product page views" />
              <Stat label="View → purchase" value={viewToPurchase} hint="Purchases ÷ product views" />
            </div>

            {/* Funnel */}
            <div className="mt-6">
              <AdminCard
                title="Conversion funnel"
                subtitle={`Last ${days} days — unique visitors reaching each stage`}
              >
                <FunnelChart stages={funnel} />
              </AdminCard>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <AdminCard title="Trending products" subtitle="Most-viewed products in the window">
                {trendingProducts.length > 0 ? (
                  <TopList
                    title="Trending products"
                    rows={trendingProducts.map((p) => ({
                      label: p.name,
                      value: `${p.views.toLocaleString()} views`,
                    }))}
                  />
                ) : (
                  <EmptyState title="No product views yet" text="Trending products appear once visitors view listings." />
                )}
              </AdminCard>
              <AdminCard title="Popular searches" subtitle="What visitors actually typed">
                {popularSearches.length > 0 ? (
                  <TopList
                    title="Popular searches"
                    rows={popularSearches.map((s) => ({
                      label: s.query,
                      value: `${s.count.toLocaleString()} searches`,
                    }))}
                  />
                ) : (
                  <EmptyState title="No searches yet" text="Popular searches appear once visitors use search." />
                )}
              </AdminCard>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <AdminCard title="Purchase velocity" subtitle={`Purchases per day, last ${days} days`}>
                <VelocityBars data={velocity} />
              </AdminCard>
              <AdminCard title="Category performance" subtitle="Category page views in the window">
                {categories.length > 0 ? (
                  <TopList
                    title="Top categories"
                    rows={categories.map((c) => ({
                      label: c.name,
                      value: `${c.views.toLocaleString()} views`,
                    }))}
                  />
                ) : (
                  <EmptyState title="No category views yet" text="Category rankings appear once visitors browse categories." />
                )}
              </AdminCard>
            </div>

            <div className="mt-6">
              <AdminCard title="Seller performance" subtitle="Product views and bags per seller in the window">
                {sellers.length > 0 ? (
                  <TopList
                    title="Top sellers"
                    rows={sellers.map((s) => ({
                      label: s.name,
                      value: `${s.views.toLocaleString()} views`,
                      hint: `${s.carts.toLocaleString()} added to bag`,
                    }))}
                  />
                ) : (
                  <EmptyState title="No seller activity yet" text="Seller rankings appear once visitors view products." />
                )}
              </AdminCard>
            </div>
          </>
        )}

        {/* Honest data note */}
        <div className="mt-6 flex gap-3 rounded-2xl border border-border bg-card p-5">
          <Info className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-small font-semibold">About these figures</p>
            <p className="mt-1 text-small leading-6 text-muted-foreground">
              Every figure on this page is computed from real storefront events recorded in the last {days} days —
              nothing is estimated, sampled or backfilled. Visitors are identified by a random first-party id only;
              Do-Not-Track requests are honored and no third-party cookies are used. Collection can be paused
              platform-wide via the <span className="font-mono">analytics_enabled</span> site setting.
            </p>
          </div>
        </div>
      </AdminShell>
    </AdminGate>
  );
}
