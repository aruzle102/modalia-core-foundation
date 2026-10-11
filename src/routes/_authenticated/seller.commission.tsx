import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck, Banknote, Clock, Percent, TrendingUp, Wallet } from "lucide-react";
import { AdminCard, TableSkeleton, fmtDate } from "@/components/admin/ui";
import { EmptyState, StatCard } from "@/components/dashboard";
import { SellerShell } from "@/components/seller/SellerShell";
import { getCommissionSummary } from "@/lib/seller-finance.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { formatPrice } from "@/lib/localization";
import { RouteError } from "@/components/routing/route-states";

const q = queryOptions({ queryKey: ["seller-commission"], queryFn: () => getCommissionSummary() });

export const Route = createFileRoute("/_authenticated/seller/commission")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  errorComponent: CommissionError,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: CommissionPage,
});

function CommissionError({ reset }: { reset: () => void }) {
  const t = getTranslations(useAdminLocale()).seller.commission;
  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <RouteError message={t.loadError} reset={reset} />
    </SellerShell>
  );
}

function CommissionPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).seller.commission;
  const { data } = useSuspenseQuery(q);

  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <p className="text-body text-muted-foreground">{t.intro}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t.currentRate}
          icon={<Percent className="h-4 w-4" aria-hidden="true" />}
          value={`${(data.rate * 100).toFixed(1)}%`}
          description={
            <>
              {data.seller.legalName}
              <br />
              {t.rateAppliedHint}
            </>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-3">
          <StatCard
            title={t.statGross}
            icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
            value={formatPrice(data.kpis.grossDelivered, locale)}
            description={t.statGrossHint(data.kpis.deliveredOrders)}
          />
          <StatCard title={t.statPayable} icon={<Wallet className="h-4 w-4" aria-hidden="true" />} value={formatPrice(data.kpis.commissionPayable, locale)} />
          <StatCard title={t.statNet} icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />} value={formatPrice(data.kpis.netDelivered, locale)} />
          <StatCard
            title={t.statPending}
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
            value={formatPrice(data.kpis.pendingPayout, locale)}
            description={t.statPendingHint}
          />
          <StatCard
            title={t.statSettled}
            icon={<BadgeCheck className="h-4 w-4" aria-hidden="true" />}
            value={formatPrice(data.kpis.settled, locale)}
            description={t.statSettledHint}
          />
        </div>
      </div>

      <AdminCard title={t.historyTitle} subtitle={t.historySubtitle} className="mt-8">
        {data.history.length ? (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="font-medium tabular-nums">{(h.rate * 100).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">{t.effectiveFrom} {fmtDate(h.effectiveFrom, locale)}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t.recorded} {fmtDate(h.createdAt, locale)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t.emptyTitle} description={t.emptyText} />
        )}
      </AdminCard>
    </SellerShell>
  );
}
