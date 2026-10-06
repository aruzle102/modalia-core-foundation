import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState, SegmentedControl, StatRow, StatRows } from "@/components/admin/ui";
import { numParam, useUrlState } from "@/hooks/use-url-state";
import { TopList } from "@/components/admin/Charts";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { getAdminAnalytics } from "@/lib/analytics.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { useAdminLocale } from "@/components/admin/useAdminLocale";

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
  pendingComponent: AnalyticsPending,
  errorComponent: AnalyticsError,
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
function AnalyticsPending() {
  const ta = getTranslations(useAdminLocale()).admin.analytics;
  return <div className="px-6 py-24 text-center text-muted-foreground">{ta.loading}</div>;
}

function AnalyticsError() {
  const ta = getTranslations(useAdminLocale()).admin.analytics;
  return (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      {ta.loadError}
    </div>
  );
}
function VelocityBars({
  data,
  t,
}: {
  data: { date: string; purchases: number }[];
  t: ReturnType<typeof getTranslations>["admin"]["analytics"];
}) {
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
            ? t.velocityAriaHas(data.length, Math.max(...data.map((d) => d.purchases)))
            : t.velocityAriaEmpty(data.length)
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
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const ta = t.admin.analytics;
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
        title={ta.title}
        subtitle={ta.subtitle}
        breadcrumbs={[{ label: t.adminNav.items.analytics }]}
        actions={
          <SegmentedControl
            ariaLabel={t.common.dateRange}
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={RANGES.map((r) => ({ value: String(r), label: ta.rangeDays(r) }))}
          />
        }
      >
        {!analytics.hasData ? (
          <AdminCard title={ta.noDataTitle}>
            <EmptyState title={ta.noDataEmptyTitle} text={ta.noDataEmptyText} />
          </AdminCard>
        ) : (
          <>
            {/* KPI stats */}
            <StatRows>
              <StatRow label={ta.eventsRecorded} value={totals.events.toLocaleString()} hint={ta.lastDays(days)} />
              <StatRow label={ta.uniqueVisitors} value={totals.uniqueVisitors.toLocaleString()} hint={ta.visitorsHint} />
              <StatRow label={ta.productViews} value={totals.productViews.toLocaleString()} hint={ta.productViewsHint} />
              <StatRow label={ta.viewToPurchase} value={viewToPurchase} hint={ta.conversionHint} />
            </StatRows>

            {/* Funnel */}
            <div className="mt-6">
              <AdminCard title={ta.funnelTitle} subtitle={ta.funnelSubtitle(days)}>
                <FunnelChart stages={funnel} caption={ta.funnelCaption} />
              </AdminCard>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <AdminCard title={ta.trendingTitle} subtitle={ta.trendingSubtitle}>
                {trendingProducts.length > 0 ? (
                  <TopList
                    title={ta.trendingTitle}
                    rows={trendingProducts.map((p) => ({
                      label: p.name,
                      value: ta.viewsUnit(p.views.toLocaleString()),
                    }))}
                  />
                ) : (
                  <EmptyState title={ta.trendingEmptyTitle} text={ta.trendingEmptyText} />
                )}
              </AdminCard>
              <AdminCard title={ta.searchesTitle} subtitle={ta.searchesSubtitle}>
                {popularSearches.length > 0 ? (
                  <TopList
                    title={ta.searchesTitle}
                    rows={popularSearches.map((s) => ({
                      label: s.query,
                      value: ta.searchesUnit(s.count.toLocaleString()),
                    }))}
                  />
                ) : (
                  <EmptyState title={ta.searchesEmptyTitle} text={ta.searchesEmptyText} />
                )}
              </AdminCard>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <AdminCard title={ta.velocityTitle} subtitle={ta.velocitySubtitle(days)}>
                <VelocityBars data={velocity} t={ta} />
              </AdminCard>
              <AdminCard title={ta.categoriesTitle} subtitle={ta.categoriesSubtitle}>
                {categories.length > 0 ? (
                  <TopList
                    title={ta.categoriesTitle}
                    rows={categories.map((c) => ({
                      label: c.name,
                      value: ta.viewsUnit(c.views.toLocaleString()),
                    }))}
                  />
                ) : (
                  <EmptyState title={ta.categoriesEmptyTitle} text={ta.categoriesEmptyText} />
                )}
              </AdminCard>
            </div>

            <div className="mt-6">
              <AdminCard title={ta.sellersTitle} subtitle={ta.sellersSubtitle}>
                {sellers.length > 0 ? (
                  <TopList
                    title={ta.sellersTitle}
                    rows={sellers.map((s) => ({
                      label: s.name,
                      value: ta.viewsUnit(s.views.toLocaleString()),
                      hint: ta.bagHint(s.carts.toLocaleString()),
                    }))}
                  />
                ) : (
                  <EmptyState title={ta.sellersEmptyTitle} text={ta.sellersEmptyText} />
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
              {ta.aboutText(days)}{" "}
              {ta.aboutPause} <span className="font-mono">analytics_enabled</span>
              {ta.aboutPauseSuffix}
            </p>
          </div>
        </div>
      </AdminShell>
    </AdminGate>
  );
}
