import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Clock,
  Eye,
  Package,
  Percent,
  Receipt,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerShell } from "@/components/seller/SellerShell";
import { getLocale, getTranslations } from "@/lib/i18n";
import { localeTag } from "@/lib/i18n/format";
import { AdminCard, StatusPill, fmtDate, fmtMoney } from "@/components/admin/ui";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable } from "@/components/dashboard/DataTable";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorState } from "@/components/dashboard/ErrorState";
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
      <div className="mx-auto max-w-md px-6">
        <ErrorState
          title="Seller overview could not be loaded."
          description={
            <>
              <span className="block">{displayMessage}</span>
              <span className="mt-1 block text-xs">If the problem persists, contact support with this message.</span>
            </>
          }
        />
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
          <Button asChild>
            <Link to="/seller/products" search={{ locale, q: "", status: "", moderation: "", page: 1 }}>Manage products</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/seller/orders" search={{ locale, q: "", status: "", page: 1 }}>Orders</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/seller/analytics" search={{ locale, days: 30 }}>Analytics</Link>
          </Button>
        </>
      }
    >
      {/* Onboarding nudge — only until the seller is onboarded */}
      {!overview.onboarded ? (
        <div className="mb-6">
          <OnboardingNudge locale={locale} />
        </div>
      ) : null}

      {/* KPI grid — every figure computed from real rows, see seller-dashboard.functions.ts */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          featured
          title="Net earnings"
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          value={fmtMoney(kpis.netEarnings, currency, locale)}
          description="Delivered sales minus commission payable"
        />
        <StatCard
          title="Delivered sales"
          icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
          value={fmtMoney(kpis.totalDeliveredSales, currency, locale)}
          description={`${kpis.deliveredCount} delivered ${kpis.deliveredCount === 1 ? "order" : "orders"}`}
        />
        <StatCard
          title="Orders"
          icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
          value={String(kpis.ordersCount)}
          description={kpis.pendingOrdersCount > 0 ? `${kpis.pendingOrdersCount} awaiting fulfilment` : "All orders fulfilled"}
        />
        <StatCard
          title="Avg. order value"
          icon={<Receipt className="h-4 w-4" aria-hidden="true" />}
          value={fmtMoney(kpis.averageOrderValue, currency, locale)}
          description="Across delivered orders"
        />
        <StatCard
          title="Commission payable"
          icon={<Percent className="h-4 w-4" aria-hidden="true" />}
          value={fmtMoney(kpis.commissionPayable, currency, locale)}
          description="Owed on delivered sales"
        />
        <StatCard
          title="Pending settlement"
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          value={fmtMoney(kpis.pendingSettlementAmount, currency, locale)}
          description={kpis.pendingSettlementAmount > 0 ? "Queued for payout" : "Nothing queued"}
        />
        <StatCard
          title="Products"
          icon={<Package className="h-4 w-4" aria-hidden="true" />}
          value={String(kpis.productsCount)}
          description={stockIssues > 0 ? `${kpis.lowStockCount} low · ${kpis.outOfStockCount} out of stock` : "Stock levels healthy"}
        />
        <StatCard
          title="Settled to date"
          icon={<BadgeCheck className="h-4 w-4" aria-hidden="true" />}
          value={fmtMoney(kpis.settledAmount, currency, locale)}
          description="Approved / paid settlements"
        />
      </section>

      {/* Today — real rows only. View cards show an honest "not tracked yet"
          state when the analytics pipeline has nothing for this store;
          conversion is omitted unless views are measurable. */}
      <AdminCard title={t.today.title} subtitle={t.today.subtitle} className="mt-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
          <StatCard
            title={t.today.sales}
            icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
            value={
              <>
                <CountUp value={today.todaySales} locale={tag} formatOptions={{ maximumFractionDigits: 2 }} />{" "}
                {currency}
              </>
            }
            description={t.today.salesHint}
          />
          <StatCard
            title={t.today.orders}
            icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
            value={<CountUp value={today.todayOrdersCount} locale={tag} />}
            description={t.today.ordersHint}
          />
          <StatCard
            title={t.today.storeViews}
            icon={<Eye className="h-4 w-4" aria-hidden="true" />}
            value={
              today.viewsMeasurable && today.storeViews != null ? (
                <CountUp value={today.storeViews} locale={tag} />
              ) : (
                t.today.viewsNotTracked
              )
            }
            description={today.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
          />
          <StatCard
            title={t.today.productViews}
            icon={<Eye className="h-4 w-4" aria-hidden="true" />}
            value={
              today.viewsMeasurable && today.productViews != null ? (
                <CountUp value={today.productViews} locale={tag} />
              ) : (
                t.today.viewsNotTracked
              )
            }
            description={today.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
          />
          {today.conversionRate != null ? (
            <StatCard
              title={t.today.conversion}
              icon={<Percent className="h-4 w-4" aria-hidden="true" />}
              value={
                <CountUp
                  value={today.conversionRate / 100}
                  locale={tag}
                  formatOptions={{ style: "percent", maximumFractionDigits: 1 }}
                />
              }
              description={t.today.conversionHint}
            />
          ) : null}
        </div>
      </AdminCard>

      {/* Settlement nudge */}
      {kpis.pendingSettlementAmount > 0 ? (
        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl bg-zinc-950 p-5 text-white">
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

      {/* Top products + stock alerts */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
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
            <EmptyState title="Stock levels healthy" description="No variant is at or below its low-stock threshold." />
          )}
        </AdminCard>
      </section>

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

      {/* Recent orders */}
      <AdminCard
        title="Recent orders"
        subtitle="Latest orders across your store"
        className="mt-8"
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
          <DataTable>
            <table className="w-full min-w-[640px] text-small">
              <thead>
                <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th scope="col" className="py-2.5 ps-4 pe-4 text-start font-semibold">Order</th>
                  <th scope="col" className="py-2.5 pe-4 text-start font-semibold">Customer</th>
                  <th scope="col" className="py-2.5 pe-4 text-start font-semibold">Status</th>
                  <th scope="col" className="py-2.5 pe-4 text-start font-semibold">Date</th>
                  <th scope="col" className="py-2.5 pe-4 text-end font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {recent.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-muted/40">
                    <td className="py-3 ps-4 pe-4 font-medium tabular-nums">{o.orderNumber}</td>
                    <td className="py-3 pe-4 text-muted-foreground">{o.customer}</td>
                    <td className="py-3 pe-4">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="py-3 pe-4 text-muted-foreground">{fmtDate(o.createdAt, locale)}</td>
                    <td className="py-3 pe-4 text-end font-medium tabular-nums">{fmtMoney(o.total, currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        ) : (
          <EmptyState
            title="No orders yet"
            description="Orders for your products will appear here as soon as customers check out."
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
