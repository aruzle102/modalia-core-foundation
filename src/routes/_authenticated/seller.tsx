import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, LogIn, RefreshCw, ShieldAlert, Store as StoreIcon, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerShell } from "@/components/seller/SellerShell";
import { SellerGateCard, SellerShellSkeleton, useSellerSession } from "@/components/seller/ui";
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

// Only the essential seller identity + KPIs are preloaded in the route loader.
// Secondary widgets load progressively with their own skeletons.
const overviewQuery = queryOptions({
  queryKey: ["seller-overview"],
  queryFn: () => getSellerOverview(),
  staleTime: 60 * 1000,
  gcTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/_authenticated/seller")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  // Do NOT block the route on dashboard data. The component handles
  // session states (signed-out, not-seller, suspended, must-reset-password)
  // and loads data progressively.
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
  const navigate = useNavigate();
  const session = useSellerSession();

  // Temp password → redirect to password change
  useEffect(() => {
    if (session.status === "ready" && session.seller?.mustResetPassword) {
      void navigate({ to: "/seller/change-password", search: { locale } as any });
    }
  }, [session.status, session.seller, navigate, locale]);

  // --- Session gates ---
  if (session.status === "checking") {
    return <SellerShellSkeleton />;
  }
  if (session.status === "signed-out") {
    return (
      <SellerGateCard
        icon={<LogIn className="h-6 w-6" />}
        title="Sign in to your seller workspace"
        description="You need to sign in with your seller account to access the dashboard."
      >
        <Button asChild>
          <Link to="/seller/login" search={{ locale, redirect: "/seller" } as any}>Sign in</Link>
        </Button>
      </SellerGateCard>
    );
  }
  if (session.status === "suspended") {
    return (
      <SellerGateCard
        icon={<ShieldAlert className="h-6 w-6" />}
        title="Account suspended"
        description={
          session.suspendedReason === "pending"
            ? "Your seller application is still under review."
            : "Your seller account has been suspended. Please contact support."
        }
      />
    );
  }
  if (session.status === "not-seller") {
    return (
      <SellerGateCard
        icon={<StoreIcon className="h-6 w-6" />}
        title="No seller account"
        description="This account is not registered as a seller. Apply to start selling on Modalia."
      >
        <Button asChild>
          <Link to="/become-a-seller" search={{ locale } as any}>Become a seller</Link>
        </Button>
      </SellerGateCard>
    );
  }
  if (session.status === "error") {
    return (
      <SellerGateCard
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Could not load seller session"
        description={session.error ?? "An unexpected error occurred."}
      >
        <Button variant="outline" onClick={session.retry}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </SellerGateCard>
    );
  }

  // Session ready → load dashboard progressively
  return <DashboardContent locale={locale} />;
}

function DashboardContent({ locale }: { locale: "fr" | "en" | "ar" }) {
  const { data: overview, isPending: overviewPending, isError: overviewError, refetch } = useQuery(overviewQuery);

  if (overviewPending) {
    return <SellerShellSkeleton />;
  }
  if (overviewError || !overview) {
    return (
      <SellerGateCard
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Seller overview could not be loaded"
        description="Please try again. If the problem persists, contact support."
      >
        <Button variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </SellerGateCard>
    );
  }

  return <DashboardWidgets overview={overview} locale={locale} />;
}

function DashboardWidgets({
  overview,
  locale,
}: {
  overview: Awaited<ReturnType<typeof getSellerOverview>>;
  locale: "fr" | "en" | "ar";
}) {
  const t = getTranslations(locale).sellerDashboardV8;
  const tag = localeTag(locale);
  const { kpis, currency, lowStockAlerts } = overview;
  const stockIssues = kpis.lowStockCount + kpis.outOfStockCount;

  // Secondary widgets: independent queries, own skeletons, never block the page
  const today = useQuery({
    queryKey: ["seller-today-stats"],
    queryFn: () => getSellerTodayStats(),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const series = useQuery({
    queryKey: ["seller-series", 30],
    queryFn: () => getSellerSalesSeries({ data: { days: 30 } }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const topProducts = useQuery({
    queryKey: ["seller-top-products", 5],
    queryFn: () => getSellerTopProducts({ data: { limit: 5 } }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const breakdown = useQuery({
    queryKey: ["seller-status-breakdown"],
    queryFn: () => getSellerOrderStatusBreakdown(),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const recent = useQuery({
    queryKey: ["seller-recent-orders", 8],
    queryFn: () => getSellerRecentOrders({ data: { limit: 8 } }),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

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
      {!overview.onboarded ? (
        <div className="mb-6">
          <OnboardingNudge locale={locale} />
        </div>
      ) : null}

      {/* KPIs — from overview (already loaded) */}
      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net earnings" value={fmtMoney(kpis.netEarnings, currency, locale)} hint="Delivered sales minus commission payable" />
        <Stat
          label="Delivered sales"
          value={fmtMoney(kpis.totalDeliveredSales, currency, locale)}
          hint={`${kpis.deliveredCount} delivered ${kpis.deliveredCount === 1 ? "order" : "orders"}`}
        />
        <Stat
          label="Orders"
          value={String(kpis.ordersCount)}
          hint={kpis.pendingOrdersCount > 0 ? `${kpis.pendingOrdersCount} awaiting fulfilment` : "All orders fulfilled"}
        />
        <Stat label="Avg. order value" value={fmtMoney(kpis.averageOrderValue, currency, locale)} hint="Across delivered orders" />
        <Stat label="Commission payable" value={fmtMoney(kpis.commissionPayable, currency, locale)} hint="Owed on delivered sales" />
        <Stat
          label="Pending settlement"
          value={fmtMoney(kpis.pendingSettlementAmount, currency, locale)}
          hint={kpis.pendingSettlementAmount > 0 ? "Queued for payout" : "Nothing queued"}
        />
        <Stat
          label="Products"
          value={String(kpis.productsCount)}
          hint={stockIssues > 0 ? `${kpis.lowStockCount} low · ${kpis.outOfStockCount} out of stock` : "Stock levels healthy"}
        />
        <Stat label="Settled to date" value={fmtMoney(kpis.settledAmount, currency, locale)} hint="Approved / paid settlements" />
      </section>

      {/* Today — progressive */}
      <AdminCard title={t.today.title} subtitle={t.today.subtitle} className="mt-6">
        {today.isPending ? (
          <WidgetSkeleton />
        ) : today.isError ? (
          <WidgetError onRetry={() => void today.refetch()} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <Stat
              label={t.today.sales}
              value={<><CountUp value={today.data.todaySales} locale={tag} formatOptions={{ maximumFractionDigits: 2 }} /> {currency}</>}
              hint={t.today.salesHint}
            />
            <Stat label={t.today.orders} value={<CountUp value={today.data.todayOrdersCount} locale={tag} />} hint={t.today.ordersHint} />
            <Stat
              label={t.today.storeViews}
              value={today.data.viewsMeasurable && today.data.storeViews != null ? <CountUp value={today.data.storeViews} locale={tag} /> : t.today.viewsNotTracked}
              hint={today.data.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
            />
            <Stat
              label={t.today.productViews}
              value={today.data.viewsMeasurable && today.data.productViews != null ? <CountUp value={today.data.productViews} locale={tag} /> : t.today.viewsNotTracked}
              hint={today.data.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
            />
            {today.data.conversionRate != null ? (
              <Stat
                label={t.today.conversion}
                value={<CountUp value={today.data.conversionRate / 100} locale={tag} formatOptions={{ style: "percent", maximumFractionDigits: 1 }} />}
                hint={t.today.conversionHint}
              />
            ) : null}
          </div>
        )}
      </AdminCard>

      {/* Settlement nudge */}
      {kpis.pendingSettlementAmount > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-zinc-950 p-5 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold">{fmtMoney(kpis.pendingSettlementAmount, currency, locale)} is queued for payout</p>
            <p className="mt-0.5 text-small text-white/55">Settlements are processed by the platform team. Track payout history in Analytics.</p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/seller/analytics" search={{ locale, days: 30 }}>
              View analytics <ArrowRight className="ms-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}

      {/* Charts — progressive */}
      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <AdminCard title="Sales — last 30 days" subtitle="Delivered sales and order counts per day" className="lg:col-span-2">
          {series.isPending ? <WidgetSkeleton /> : series.isError ? <WidgetError onRetry={() => void series.refetch()} /> : <SalesLine data={series.data} />}
        </AdminCard>
        <AdminCard title="Order statuses" subtitle="Your orders by current status">
          {breakdown.isPending ? (
            <WidgetSkeleton />
          ) : breakdown.isError ? (
            <WidgetError onRetry={() => void breakdown.refetch()} />
          ) : (
            <Donut data={breakdown.data.map((b) => ({ label: b.status, value: b.count }))} centerLabel="orders" />
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
          {topProducts.isPending ? (
            <WidgetSkeleton />
          ) : topProducts.isError ? (
            <WidgetError onRetry={() => void topProducts.refetch()} />
          ) : (
            <TopList
              rows={topProducts.data.map((p) => ({
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

      {/* Recent orders — progressive */}
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
        {recent.isPending ? (
          <WidgetSkeleton />
        ) : recent.isError ? (
          <WidgetError onRetry={() => void recent.refetch()} />
        ) : recent.data.length > 0 ? (
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
                {recent.data.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pe-4 font-medium tabular-nums">{o.orderNumber}</td>
                    <td className="py-3 pe-4 text-muted-foreground">{o.customer}</td>
                    <td className="py-3 pe-4"><StatusPill status={o.status} /></td>
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

function WidgetSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

function WidgetError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <span>Could not load this widget.</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1 h-3 w-3" /> Retry
      </Button>
    </div>
  );
}
