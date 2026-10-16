import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
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
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SellerShell } from "@/components/seller/SellerShell";
import { getLocale, getTranslations } from "@/lib/i18n";
import { localeTag } from "@/lib/i18n/format";
import { StatusPill, fmtDate, fmtMoney } from "@/components/admin/ui";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { CountUp } from "@/components/motion";
import { Donut, SalesLine } from "@/components/seller/SellerCharts";
import { cn } from "@/lib/utils";
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
const seriesQuery = queryOptions({ queryKey: ["seller-series", 60], queryFn: () => getSellerSalesSeries({ data: { days: 60 } }) });
const topProductsQuery = queryOptions({
  queryKey: ["seller-top-products", 5],
  queryFn: () => getSellerTopProducts({ data: { limit: 5 } }),
});
const breakdownQuery = queryOptions({ queryKey: ["seller-status-breakdown"], queryFn: () => getSellerOrderStatusBreakdown() });
const recentQuery = queryOptions({
  queryKey: ["seller-recent-orders", 8],
  queryFn: () => getSellerRecentOrders({ data: { limit: 8 } }),
});

/* 21st.dev "Dashboard with Collapsible Sidebar" visual language, adapted to
   real seller data. White cards on a light-gray page, soft colored icon
   tiles, no fabricated trend deltas. */

const tileStyles = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400",
  green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400",
  purple: "bg-violet-100 text-violet-600 dark:bg-violet-950/70 dark:text-violet-400",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-950/70 dark:text-orange-400",
} as const;

type TileColor = keyof typeof tileStyles;

/* 21st.dev "Dashboard with Collapsible Sidebar" MetricCard — faithful to reference:
   icon tile top-left, trend arrow top-right, label, big value, trend text. */
function MetricCard({
  icon,
  tile,
  label,
  value,
  trend,
  trendUp,
  sub,
}: {
  icon: ReactNode;
  tile: TileColor;
  label: string;
  value: ReactNode;
  trend?: string | null;
  trendUp?: boolean | null;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-neutral-900 dark:shadow-none dark:ring-1 dark:ring-neutral-800">
      <div className="flex items-start justify-between">
        <span
          className={cn("flex h-10 w-10 items-center justify-center rounded-lg", tileStyles[tile])}
          aria-hidden="true"
        >
          {icon}
        </span>
        {trendUp === true ? (
          <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
        ) : trendUp === false ? (
          <TrendingDown className="h-4 w-4 text-rose-500" aria-hidden="true" />
        ) : null}
      </div>
      <p className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-[26px] font-bold tracking-tight text-neutral-950 tabular-nums dark:text-white">
        {value}
      </p>
      {trend ? (
        <p className={cn("mt-1 text-xs font-medium", trendUp === false ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
          {trend}
        </p>
      ) : sub ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p>
      ) : null}
    </div>
  );
}

/* Compute % change: current 30d vs prior 30d from the 60-day series.
   Returns null when there is not enough data (honest, not fabricated). */
function trendOf(series: { sales: number; orders: number }[] | null, key: "sales" | "orders"): { pct: number; up: boolean } | null {
  if (!series || series.length < 40) return null;
  const cur = series.slice(-30).reduce((s, p) => s + p[key], 0);
  const prev = series.slice(-60, -30).reduce((s, p) => s + p[key], 0);
  if (prev <= 0) return cur > 0 ? { pct: 100, up: true } : null;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return null;
  return { pct, up: pct >= 0 };
}

function trendText(t: { pct: number; up: boolean } | null): string | null {
  if (!t) return null;
  const sign = t.up ? "+" : "";
  return `${sign}${t.pct.toFixed(1)}% vs prior 30 days`;
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:bg-neutral-900 dark:shadow-none dark:ring-1 dark:ring-neutral-800",
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-neutral-950 dark:text-white">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ViewAllLink({ to, search, children }: { to: string; search: Record<string, unknown>; children: ReactNode }) {
  return (
    <Link
      to={to}
      search={search}
      className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {children}
    </Link>
  );
}

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

function getWelcomeMessage(locale: string, name: string): string {
  const hour = new Date().getHours();
  const firstName = name?.split(" ")[0] || "";
  if (locale === "ar") {
    if (hour < 12) return `صباح الخير${firstName ? `، ${firstName}` : ""} ☀️`;
    if (hour < 18) return `مساء الخير${firstName ? `، ${firstName}` : ""} 👋`;
    return `مرحبًا بعودتك${firstName ? `، ${firstName}` : ""} 🌙`;
  }
  if (locale === "en") {
    if (hour < 12) return `Good morning${firstName ? `, ${firstName}` : ""} ☀️`;
    if (hour < 18) return `Good afternoon${firstName ? `, ${firstName}` : ""} 👋`;
    return `Welcome back${firstName ? `, ${firstName}` : ""} 🌙`;
  }
  // fr
  if (hour < 12) return `Bonjour${firstName ? ` ${firstName}` : ""} ☀️`;
  if (hour < 18) return `Bon après-midi${firstName ? ` ${firstName}` : ""} 👋`;
  return `Bon retour${firstName ? ` ${firstName}` : ""} 🌙`;
}

function getWelcomeSubtext(locale: string): string {
  if (locale === "ar") return "إليك نظرة على أداء متجرك اليوم.";
  if (locale === "en") return "Here's a look at your store performance today.";
  return "Voici un aperçu des performances de votre boutique aujourd'hui.";
}

function SellerOverviewPage() {
  // Child routes (orders, products, etc.) render in the Outlet; this route
  // shows the dashboard homepage only when exactly on /seller.
  const { pathname } = useLocation();
  const isExactSeller = pathname === "/seller" || pathname === "/seller/";
  if (!isExactSeller) return <Outlet />;
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
  // Real trends from the 60-day sales series (current 30d vs prior 30d)
  const salesTrend = trendOf(series, "sales");
  const ordersTrend = trendOf(series, "orders");

  return (
    <SellerShell
      title={overview.seller.legalName}
      eyebrow="Seller overview"
      mainClassName="bg-[#f8f9fc] dark:bg-neutral-950"

    >
      {/* Onboarding nudge — only until the seller is onboarded */}
      {!overview.onboarded ? (
        <div className="mb-6">
          <OnboardingNudge locale={locale} />
        </div>
      ) : null}

      {/* Welcome message */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-h2 text-foreground">
          {getWelcomeMessage(locale, overview.seller.legalName)}
        </h2>
        <p className="mt-1 text-body text-muted-foreground">
          {getWelcomeSubtext(locale)}
        </p>
      </div>

      {/* KPI grid — every figure computed from real rows, see seller-dashboard.functions.ts */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          tile="blue"
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          label="Net earnings"
          value={fmtMoney(kpis.netEarnings, currency, locale)}
          trend={trendText(salesTrend)}
          trendUp={salesTrend?.up ?? null}
          sub="Delivered sales minus commission payable"
        />
        <MetricCard
          tile="green"
          icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
          label="Delivered sales"
          value={fmtMoney(kpis.totalDeliveredSales, currency, locale)}
          trend={trendText(salesTrend)}
          trendUp={salesTrend?.up ?? null}
          sub={`${kpis.deliveredCount} delivered ${kpis.deliveredCount === 1 ? "order" : "orders"}`}
        />
        <MetricCard
          tile="purple"
          icon={<ShoppingBag className="h-5 w-5" aria-hidden="true" />}
          label="Orders"
          value={String(kpis.ordersCount)}
          trend={trendText(ordersTrend)}
          trendUp={ordersTrend?.up ?? null}
          sub={kpis.pendingOrdersCount > 0 ? `${kpis.pendingOrdersCount} awaiting fulfilment` : "All orders fulfilled"}
        />
        <MetricCard
          tile="orange"
          icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
          label="Avg. order value"
          value={fmtMoney(kpis.averageOrderValue, currency, locale)}
          sub="Across delivered orders"
        />
        <MetricCard
          tile="blue"
          icon={<Percent className="h-5 w-5" aria-hidden="true" />}
          label="Commission payable"
          value={fmtMoney(kpis.commissionPayable, currency, locale)}
          sub="Owed on delivered sales"
        />
        <MetricCard
          tile="green"
          icon={<Clock className="h-5 w-5" aria-hidden="true" />}
          label="Pending settlement"
          value={fmtMoney(kpis.pendingSettlementAmount, currency, locale)}
          sub={kpis.pendingSettlementAmount > 0 ? "Queued for payout" : "Nothing queued"}
        />
        <MetricCard
          tile="orange"
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
          label="Products"
          value={String(kpis.productsCount)}
          sub={stockIssues > 0 ? `${kpis.lowStockCount} low · ${kpis.outOfStockCount} out of stock` : "Stock levels healthy"}
        />
        <MetricCard
          tile="purple"
          icon={<BadgeCheck className="h-5 w-5" aria-hidden="true" />}
          label="Settled to date"
          value={fmtMoney(kpis.settledAmount, currency, locale)}
          sub="Approved / paid settlements"
        />
      </section>

      {/* Today — real rows only. View cards show an honest "not tracked yet"
          state when the analytics pipeline has nothing for this store;
          conversion is omitted unless views are measurable. */}
      <SectionCard title={t.today.title} className="mt-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
          <MetricCard
            tile="green"
            icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
            label={t.today.sales}
            value={
              <>
                <CountUp value={today.todaySales} locale={tag} formatOptions={{ maximumFractionDigits: 2 }} />{" "}
                {currency}
              </>
            }
            sub={t.today.salesHint}
          />
          <MetricCard
            tile="purple"
            icon={<ShoppingBag className="h-5 w-5" aria-hidden="true" />}
            label={t.today.orders}
            value={<CountUp value={today.todayOrdersCount} locale={tag} />}
            sub={t.today.ordersHint}
          />
          <MetricCard
            tile="blue"
            icon={<Eye className="h-5 w-5" aria-hidden="true" />}
            label={t.today.storeViews}
            value={
              today.viewsMeasurable && today.storeViews != null ? (
                <CountUp value={today.storeViews} locale={tag} />
              ) : (
                t.today.viewsNotTracked
              )
            }
            sub={today.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
          />
          <MetricCard
            tile="blue"
            icon={<Eye className="h-5 w-5" aria-hidden="true" />}
            label={t.today.productViews}
            value={
              today.viewsMeasurable && today.productViews != null ? (
                <CountUp value={today.productViews} locale={tag} />
              ) : (
                t.today.viewsNotTracked
              )
            }
            sub={today.viewsMeasurable ? undefined : t.today.viewsNotTrackedHint}
          />
          {today.conversionRate != null ? (
            <MetricCard
              tile="orange"
              icon={<Percent className="h-5 w-5" aria-hidden="true" />}
              label={t.today.conversion}
              value={
                <CountUp
                  value={today.conversionRate / 100}
                  locale={tag}
                  formatOptions={{ style: "percent", maximumFractionDigits: 1 }}
                />
              }
              sub={t.today.conversionHint}
            />
          ) : null}
        </div>
      </SectionCard>

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
              View analytics <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}

      {/* Top products + stock alerts */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Top products"
          action={
            <ViewAllLink to="/seller/analytics" search={{ locale, days: 30 }}>
              View all
            </ViewAllLink>
          }
        >
          {topProducts === null ? (
            <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
          ) : topProducts.length > 0 ? (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {topProducts.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {p.units} {p.units === 1 ? "unit" : "units"} sold
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-neutral-950 tabular-nums dark:text-white">
                    {fmtMoney(p.revenue, currency, locale)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-small text-muted-foreground">
              Nothing to rank yet — data will appear here once orders exist.
            </p>
          )}
        </SectionCard>
        <SectionCard
          title="Stock alerts"
          action={
            <ViewAllLink to="/seller/products" search={{ locale, q: "", status: "", moderation: "", page: 1 }}>
              Manage inventory
            </ViewAllLink>
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
        </SectionCard>
      </section>

      {/* Charts */}
      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="Sales — last 30 days"
          subtitle="Delivered sales and order counts per day"
          className="lg:col-span-2"
        >
          {series === null ? (
            <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
          ) : (
            <SalesLine data={series} />
          )}
        </SectionCard>
        <SectionCard title="Order statuses" subtitle="Your orders by current status">
          {breakdown === null ? (
            <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
          ) : (
            <Donut data={breakdown.map((b) => ({ label: b.status, value: b.count }))} centerLabel="orders" />
          )}
        </SectionCard>
      </section>

      {/* Recent activity — built from the seller's real recent orders */}
      <SectionCard
        title="Recent Activity"
        className="mt-8"
        action={
          <ViewAllLink to="/seller/orders" search={{ locale, q: "", status: "", page: 1 }}>
            View all
          </ViewAllLink>
        }
      >
        {recent === null ? (
          <p className="text-small text-muted-foreground">{t.sectionLoadError}</p>
        ) : recent.length > 0 ? (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3">
                <span
                  className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tileStyles.blue)}
                  aria-hidden="true"
                >
                  <ShoppingBag className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-950 tabular-nums dark:text-white">
                    Order {o.orderNumber}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {o.customer} · {fmtMoney(o.total, currency, locale)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusPill status={o.status} />
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                    {fmtDate(o.createdAt, locale)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
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
      </SectionCard>
    </SellerShell>
  );
}
