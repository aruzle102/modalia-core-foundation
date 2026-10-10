import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerShell } from "@/components/seller/SellerShell";
import { getLocale, getTranslations } from "@/lib/i18n";
import { localeTag } from "@/lib/i18n/format";
import { AdminCard, EmptyState, Stat, StatusPill, fmtDate, fmtMoney } from "@/components/admin/ui";
import { CountUp } from "@/components/motion";
import { Donut, SalesLine, TopList } from "@/components/seller/SellerCharts";
import { OnboardingNudge } from "@/components/seller/OnboardingNudge";
import {
  getSellerOrderStatusBreakdown,
  getSellerOverview,
  getSellerRecentOrders,
  getSellerSalesSeries,
  getSellerTodayStats,
  getSellerTopProducts,
} from "@/lib/seller-dashboard.functions";

const overviewQuery = queryOptions({ queryKey: ["seller-overview"], queryFn: () => getSellerOverview() });
const todayQuery = queryOptions({ queryKey: ["seller-today-stats"], queryFn: () => getSellerTodayStats() });
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
      context.queryClient.ensureQueryData(todayQuery),
      context.queryClient.ensureQueryData(seriesQuery),
      context.queryClient.ensureQueryData(topProductsQuery),
      context.queryClient.ensureQueryData(breakdownQuery),
      context.queryClient.ensureQueryData(recentQuery),
    ]),
  pendingComponent: () => (
    <div className="px-6 py-24 text-center">
      <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Loading seller overview…</p>
    </div>
  ),
  errorComponent: ({ error }) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Sanitize: show error type but not sensitive details
    const displayMessage = message.includes("DENIED")
      ? "Access denied. Please ensure your seller account is active."
      : message.includes("MUST_RESET_PASSWORD")
        ? "Password reset required. Please change your password."
        : message.includes("Unauthorized")
          ? "Please sign in again."
          : `Error: ${message}`;
    return (
      <div role="alert" className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800" aria-hidden="true">
          <span className="text-xl">⚠</span>
        </div>
        <p className="font-medium text-neutral-900 dark:text-neutral-100">Seller overview could not be loaded.</p>
        <p className="mt-2 text-sm text-muted-foreground">{displayMessage}</p>
        <p className="mt-1 text-xs text-muted-foreground">If the problem persists, contact support with this message.</p>
      </div>
    );
  },
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
  const { data: today } = useSuspenseQuery(todayQuery);
  const { data: series } = useSuspenseQuery(seriesQuery);
  const { data: topProducts } = useSuspenseQuery(topProductsQuery);
  const { data: breakdown } = useSuspenseQuery(breakdownQuery);
  const { data: recent } = useSuspenseQuery(recentQuery);

  const t = getTranslations(locale).sellerDashboardV8;
  const tag = localeTag(locale);

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
      {/* Onboarding nudge (Worker A) — only until the seller is onboarded */}
      {!overview.onboarded ? (
        <div className="mb-6">
          <OnboardingNudge locale={locale} />
        </div>
      ) : null}

      {/* KPI grid — every figure computed from real rows, see seller-dashboard.functions.ts */}
      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net earnings" value={fmtMoney(kpis.netEarnings, currency, locale)} hint="Delivered sales minus commission payable" className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950" />
        <Stat
          label="Delivered sales"
          value={fmtMoney(kpis.totalDeliveredSales, currency, locale)}
          hint={`${kpis.deliveredCount} delivered ${kpis.deliveredCount === 1 ? "order" : "orders"}`}
          className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950"
        />
        <Stat
          label="Orders"
          value={String(kpis.ordersCount)}
          hint={kpis.pendingOrdersCount > 0 ? `${kpis.pendingOrdersCount} awaiting fulfilment` : "All orders fulfilled"}

          className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950"
        />
        <Stat label="Avg. order value" value={fmtMoney(kpis.averageOrderValue, currency, locale)} hint="Across delivered orders"  className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950" />
        <Stat label="Commission payable" value={fmtMoney(kpis.commissionPayable, currency, locale)} hint="Owed on delivered sales"  className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950" />
        <Stat
          label="Pending settlement"
          value={fmtMoney(kpis.pendingSettlementAmount, currency, locale)}
          hint={kpis.pendingSettlementAmount > 0 ? "Queued for payout" : "Nothing queued"}

          className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950"
        />
        <Stat
          label="Products"
          value={String(kpis.productsCount)}
          hint={stockIssues > 0 ? `${kpis.lowStockCount} low · ${kpis.outOfStockCount} out of stock` : "Stock levels healthy"}

          className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950"
        />
        <Stat label="Settled to date" value={fmtMoney(kpis.settledAmount, currency, locale)} hint="Approved / paid settlements"  className="border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:border-neutral-800/80 dark:bg-neutral-950" />
      </section>

      {/* Today — real rows only. View cards show an honest "not tracked yet"
          state when the analytics pipeline has nothing for this store;
          conversion is omitted unless views are measurable. */}
      <AdminCard title={t.today.title} subtitle={t.today.subtitle} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Stat
            label={t.today.sales}
            value={
              <>
                <CountUp value={today.todaySales} locale={tag} formatOptions={{ maximumFractionDigits: 2 }} />{" "}
                {currency}
              </>
            }
            hint={t.today.salesHint}
          />
          <Stat
            label={t.today.orders}
            value={<CountUp value={today.todayOrdersCount} locale={tag} />}
            hint={t.today.ordersHint}
          />
          <Stat
            label={t.today.storeViews}
            value={
              today.viewsMeasurable && today.storeViews != null ? (
                <CountUp value={today.storeViews} locale={tag} />
              ) : (
                t.today.viewsNotTracked
              )
            }
            hint={today.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
          />
          <Stat
            label={t.today.productViews}
            value={
              today.viewsMeasurable && today.productViews != null ? (
                <CountUp value={today.productViews} locale={tag} />
              ) : (
                t.today.viewsNotTracked
              )
            }
            hint={today.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
          />
          {today.conversionRate != null ? (
            <Stat
              label={t.today.conversion}
              value={
                <CountUp
                  value={today.conversionRate / 100}
                  locale={tag}
                  formatOptions={{ style: "percent", maximumFractionDigits: 1 }}
                />
              }
              hint={t.today.conversionHint}
            />
          ) : null}
        </div>
      </AdminCard>

      {/* Settlement nudge */}
      {kpis.pendingSettlementAmount > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-zinc-950 p-5 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold">{fmtMoney(kpis.pendingSettlementAmount, currency, locale)} is queued for payout</p>
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
          {series === null ? (
            <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
          ) : (
            <SalesLine data={series} />
          )}
        </AdminCard>
        <AdminCard title="Order statuses" subtitle="Your orders by current status">
          {breakdown === null ? (
            <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
          ) : (
            <Donut data={breakdown.map((b) => ({ label: b.status, value: b.count }))} centerLabel="orders" />
          )}
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
          {topProducts === null ? (
            <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
          ) : (
            <TopList
              rows={topProducts.map((p) => ({
                label: p.name,
                value: fmtMoney(p.revenue, currency, locale),
                hint: `${p.units} ${p.units === 1 ? "unit" : "units"} sold`,
              }))}
            />
          )}
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
        {recent === null ? (
          <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
        ) : recent.length > 0 ? (
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
                    <td className="py-3 pe-4 text-muted-foreground">{fmtDate(o.createdAt, locale)}</td>
                    <td className="py-3 text-end font-medium tabular-nums">{fmtMoney(o.total, currency, locale)}</td>
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
