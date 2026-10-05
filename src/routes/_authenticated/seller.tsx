import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerShell } from "@/components/seller/SellerShell";
import { getLocale } from "@/lib/i18n";
import { AdminCard, EmptyState, Stat, StatusPill, fmtDate, fmtMoney } from "@/components/admin/ui";
import { Donut, SalesLine, TopList } from "@/components/seller/SellerCharts";
import {
  getSellerOrderStatusBreakdown,
  getSellerOverview,
  getSellerRecentOrders,
  getSellerSalesSeries,
  getSellerTopProducts,
} from "@/lib/seller-dashboard.functions";

const overviewQuery = queryOptions({ queryKey: ["seller-overview"], queryFn: () => getSellerOverview() });
const seriesQuery = queryOptions({ queryKey: ["seller-series", 30], queryFn: () => getSellerSalesSeries({ data: { days: 30 } }) });
const topProductsQuery = queryOptions({
  queryKey: ["seller-top-products", 5],
  queryFn: () => getSellerTopProducts({ data: { limit: 5 } }),
});
const breakdownQuery = queryOptions({ queryKey: ["seller-status-breakdown"], queryFn: () => getSellerOrderStatusBreakdown() });
const recentQuery = queryOptions({
  queryKey: ["seller-recent-orders", 8],
  queryFn: () => getSellerRecentOrders({ data: { limit: 8 } }),
});

export const Route = createFileRoute("/_authenticated/seller")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(overviewQuery),
      context.queryClient.ensureQueryData(seriesQuery),
      context.queryClient.ensureQueryData(topProductsQuery),
      context.queryClient.ensureQueryData(breakdownQuery),
      context.queryClient.ensureQueryData(recentQuery),
    ]),
  pendingComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">Loading seller overview…</div>,
  errorComponent: () => (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      Seller overview could not be loaded.
    </div>
  ),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Seller overview — Modalia" },
      { name: "description", content: "Your store's sales, orders, stock and earnings at a glance." },
      { property: "og:title", content: "Seller overview — Modalia" },
      { property: "og:description", content: "Your store's sales, orders, stock and earnings at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/seller" }],
  }),
  component: SellerOverviewPage,
});

function SellerOverviewPage() {
  const { locale } = Route.useSearch();
  const { data: overview } = useSuspenseQuery(overviewQuery);
  const { data: series } = useSuspenseQuery(seriesQuery);
  const { data: topProducts } = useSuspenseQuery(topProductsQuery);
  const { data: breakdown } = useSuspenseQuery(breakdownQuery);
  const { data: recent } = useSuspenseQuery(recentQuery);

  const { kpis, currency, lowStockAlerts } = overview;
  const stockIssues = kpis.lowStockCount + kpis.outOfStockCount;

  return (
    <SellerShell
      title={overview.seller.legalName}
      eyebrow="Seller overview"
      actions={
        <>
          <Button asChild variant="outline">
            <Link to="/seller/orders" search={{ locale, q: "", status: "", page: 1 }}>Orders</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/seller/analytics" search={{ locale, days: 30 }}>Analytics</Link>
          </Button>
          <Button asChild>
            <Link to="/seller/products" search={{ locale, q: "", status: "", moderation: "", page: 1 }}>Manage products</Link>
          </Button>
        </>
      }
    >
      {/* KPI grid — every figure computed from real rows, see seller-dashboard.functions.ts */}
      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net earnings" value={fmtMoney(kpis.netEarnings, currency)} hint="Delivered sales minus commission payable" />
        <Stat
          label="Delivered sales"
          value={fmtMoney(kpis.totalDeliveredSales, currency)}
          hint={`${kpis.deliveredCount} delivered ${kpis.deliveredCount === 1 ? "order" : "orders"}`}
        />
        <Stat
          label="Orders"
          value={String(kpis.ordersCount)}
          hint={kpis.pendingOrdersCount > 0 ? `${kpis.pendingOrdersCount} awaiting fulfilment` : "All orders fulfilled"}
        />
        <Stat label="Avg. order value" value={fmtMoney(kpis.averageOrderValue, currency)} hint="Across delivered orders" />
        <Stat label="Commission payable" value={fmtMoney(kpis.commissionPayable, currency)} hint="Owed on delivered sales" />
        <Stat
          label="Pending settlement"
          value={fmtMoney(kpis.pendingSettlementAmount, currency)}
          hint={kpis.pendingSettlementAmount > 0 ? "Queued for payout" : "Nothing queued"}
        />
        <Stat
          label="Products"
          value={String(kpis.productsCount)}
          hint={stockIssues > 0 ? `${kpis.lowStockCount} low · ${kpis.outOfStockCount} out of stock` : "Stock levels healthy"}
        />
        <Stat label="Settled to date" value={fmtMoney(kpis.settledAmount, currency)} hint="Approved / paid settlements" />
      </section>

      {/* Settlement nudge */}
      {kpis.pendingSettlementAmount > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-zinc-950 p-5 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold">{fmtMoney(kpis.pendingSettlementAmount, currency)} is queued for payout</p>
            <p className="mt-0.5 text-small text-white/55">
              Settlements are processed by the platform team. Track payout history in Analytics.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/seller/analytics" search={{ locale, days: 30 }}>
              View analytics <ArrowRight className="ms-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}

      {/* Charts */}
      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <AdminCard title="Sales — last 30 days" subtitle="Delivered sales and order counts per day" className="lg:col-span-2">
          <SalesLine data={series} />
        </AdminCard>
        <AdminCard title="Order statuses" subtitle="Your orders by current status">
          <Donut data={breakdown.map((b) => ({ label: b.status, value: b.count }))} centerLabel="orders" />
        </AdminCard>
      </section>

      {/* Top products + stock alerts */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminCard
          title="Top products"
          subtitle="By revenue across non-cancelled orders"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/seller/analytics" search={{ locale, days: 30 }}>
                Details <ArrowRight className="ms-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          <TopList
            rows={topProducts.map((p) => ({
              label: p.name,
              value: fmtMoney(p.revenue, currency),
              hint: `${p.units} ${p.units === 1 ? "unit" : "units"} sold`,
            }))}
          />
        </AdminCard>
        <AdminCard
          title="Stock alerts"
          subtitle={stockIssues > 0 ? `${stockIssues} variants need attention` : "All variants above their low-stock threshold"}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/seller/products" search={{ locale, q: "", status: "", moderation: "", page: 1 }}>
                Manage inventory <ArrowRight className="ms-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          {lowStockAlerts.length > 0 ? (
            <ul className="divide-y divide-border">
              {lowStockAlerts.map((a, i) => (
                <li key={`${a.variantSku}-${i}`} className="flex items-center gap-3 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium">{a.productName}</p>
                    <p className="text-caption text-muted-foreground tabular-nums">
                      {a.variantSku ? `${a.variantSku} · ` : ""}Qty {a.qty} / threshold {a.threshold}
                    </p>
                  </div>
                  {a.outOfStock ? <StatusPill status="out_of_stock" /> : <StatusPill status="low_stock" />}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Stock levels healthy" text="No variant is at or below its low-stock threshold." />
          )}
        </AdminCard>
      </section>

      {/* Recent orders */}
      <AdminCard
        title="Recent orders"
        subtitle="Latest orders across your store"
        className="mt-6"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/seller/orders" search={{ locale, q: "", status: "", page: 1 }}>
              All orders <ArrowRight className="ms-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        {recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-border text-start text-caption uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pe-4 text-start font-medium">Order</th>
                  <th scope="col" className="py-2 pe-4 text-start font-medium">Customer</th>
                  <th scope="col" className="py-2 pe-4 text-start font-medium">Status</th>
                  <th scope="col" className="py-2 pe-4 text-start font-medium">Date</th>
                  <th scope="col" className="py-2 text-end font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pe-4 font-medium tabular-nums">{o.orderNumber}</td>
                    <td className="py-3 pe-4 text-muted-foreground">{o.customer}</td>
                    <td className="py-3 pe-4">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="py-3 pe-4 text-muted-foreground">{fmtDate(o.createdAt)}</td>
                    <td className="py-3 text-end font-medium tabular-nums">{fmtMoney(o.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No orders yet"
            text="Orders for your products will appear here as soon as customers check out."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/seller/products" search={{ locale, q: "", status: "", moderation: "", page: 1 }}>Add products</Link>
              </Button>
            }
          />
        )}
      </AdminCard>
    </SellerShell>
  );
}
