import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerShell } from "@/components/seller/SellerShell";
import { AdminCard, EmptyState, Stat, fmtMoney } from "@/components/admin/ui";
import { Donut, OrdersBars, SalesLine, TopList } from "@/components/seller/SellerCharts";
import { getLocale } from "@/lib/i18n";
import {
  getSellerOrderStatusBreakdown,
  getSellerOverview,
  getSellerTopCategories,
  getSellerTopProducts,
  getSellerSalesSeries,
} from "@/lib/seller-dashboard.functions";

const RANGES = [7, 30, 90] as const;

const overviewQuery = queryOptions({ queryKey: ["seller-overview"], queryFn: () => getSellerOverview() });
const seriesQuery = (days: number) =>
  queryOptions({ queryKey: ["seller-series", days], queryFn: () => getSellerSalesSeries({ data: { days } }) });
const topProductsQuery = queryOptions({
  queryKey: ["seller-top-products", 10],
  queryFn: () => getSellerTopProducts({ data: { limit: 10 } }),
});
const topCategoriesQuery = queryOptions({
  queryKey: ["seller-top-categories", 10],
  queryFn: () => getSellerTopCategories({ data: { limit: 10 } }),
});
const breakdownQuery = queryOptions({ queryKey: ["seller-status-breakdown"], queryFn: () => getSellerOrderStatusBreakdown() });

export const Route = createFileRoute("/_authenticated/seller/analytics")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(overviewQuery),
      context.queryClient.ensureQueryData(seriesQuery(30)),
      context.queryClient.ensureQueryData(topProductsQuery),
      context.queryClient.ensureQueryData(topCategoriesQuery),
      context.queryClient.ensureQueryData(breakdownQuery),
    ]),
  pendingComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">Loading analytics…</div>,
  errorComponent: () => (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      Analytics could not be loaded.
    </div>
  ),
  head: () => ({
    meta: [
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
  const [days, setDays] = useState<number>(30);
  const { locale } = Route.useSearch();
  const { data: overview } = useSuspenseQuery(overviewQuery);
  const { data: topProducts } = useSuspenseQuery(topProductsQuery);
  const { data: topCategories } = useSuspenseQuery(topCategoriesQuery);
  const { data: breakdown } = useSuspenseQuery(breakdownQuery);
  // Range toggle refetches without suspending the page; the previous range stays visible meanwhile.
  const { data: series } = useQuery({ ...seriesQuery(days), placeholderData: keepPreviousData });

  const { kpis, currency } = overview;

  return (
    <SellerShell
      title="Sales analytics"
      eyebrow={overview.seller.legalName}
      actions={
        <Button asChild variant="outline">
          <Link to="/seller" search={{ locale }}>
            <ArrowLeft className="me-1 h-4 w-4" aria-hidden="true" /> Overview
          </Link>
        </Button>
      }
    >
      {/* Range toggle + sales chart */}
      <AdminCard
        title="Sales performance"
        subtitle="Delivered sales and order counts per day"
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
        {series ? <SalesLine data={series} /> : null}
      </AdminCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminCard title="Orders per day" subtitle={`Last ${days} days, non-cancelled orders`}>
          {series ? <OrdersBars data={series} /> : null}
        </AdminCard>
        <AdminCard title="Order statuses" subtitle="Your orders by current status">
          <Donut data={breakdown.map((b) => ({ label: b.status, value: b.count }))} centerLabel="orders" />
        </AdminCard>
      </div>

      {/* Rankings */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminCard title="Top products" subtitle="By revenue across non-cancelled orders">
          {topProducts.length > 0 ? (
            <RankingTable
              rows={topProducts.map((p) => ({ label: p.name, meta: `${p.units} sold`, value: fmtMoney(p.revenue, currency) }))}
            />
          ) : (
            <EmptyState title="No product sales yet" text="Product rankings appear once orders are placed." />
          )}
        </AdminCard>
        <AdminCard title="Top categories" subtitle="By revenue across non-cancelled orders">
          {topCategories.length > 0 ? (
            <RankingTable
              rows={topCategories.map((c) => ({ label: c.name, meta: `${c.units} sold`, value: fmtMoney(c.revenue, currency) }))}
            />
          ) : (
            <EmptyState title="No category sales yet" text="Category rankings appear once orders are placed." />
          )}
        </AdminCard>
      </div>

      {/* Also keep the compact ranked-bar view for a quick scan */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminCard title="Top products — at a glance" subtitle="Revenue share ranking">
          <TopList
            rows={topProducts.slice(0, 5).map((p) => ({
              label: p.name,
              value: fmtMoney(p.revenue, currency),
              hint: `${p.units} ${p.units === 1 ? "unit" : "units"} sold`,
            }))}
          />
        </AdminCard>
        <AdminCard title="Settlements" subtitle="Payout position with the platform">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Net earnings" value={fmtMoney(kpis.netEarnings, currency)} hint="Sales minus commission payable" />
            <Stat label="Pending payout" value={fmtMoney(kpis.pendingSettlementAmount, currency)} hint="Queued settlements" />
            <Stat label="Settled to date" value={fmtMoney(kpis.settledAmount, currency)} hint="Approved / paid" />
          </div>
          <p className="mt-4 text-small text-muted-foreground">
            Commission payable on delivered sales currently stands at {fmtMoney(kpis.commissionPayable, currency)}. Settlements
            are processed by the platform team.
          </p>
        </AdminCard>
      </div>

      {/* Honest data note — conversion cannot be computed from order rows alone */}
      <div className="mt-6 flex gap-3 rounded-2xl border border-border bg-card p-5">
        <Info className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-small font-semibold">About these figures</p>
          <p className="mt-1 text-small leading-6 text-muted-foreground">
            Every figure on this page is computed from your real order, product and settlement records. Conversion rate is not
            shown: it would require storefront analytics events (product views, add-to-cart actions), which are not collected
            yet. Nothing here is estimated or sampled.
          </p>
        </div>
      </div>
    </SellerShell>
  );
}

function RankingTable({ rows }: { rows: { label: string; meta: string; value: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b border-border text-caption uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-10 py-2 pe-3 text-start font-medium">#</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">Name</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">Units</th>
            <th scope="col" className="py-2 text-end font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              <td className="py-2.5 pe-3 text-caption font-semibold text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="max-w-0 truncate py-2.5 pe-3 font-medium">{r.label}</td>
              <td className="py-2.5 pe-3 text-muted-foreground tabular-nums">{r.meta}</td>
              <td className="py-2.5 text-end font-medium tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
