import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AdminCard, EmptyState, Stat, TableSkeleton, fmtDate } from "@/components/admin/ui";
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
        <AdminCard title={t.currentRate} subtitle={data.seller.legalName}>
          <p className="text-4xl font-semibold tabular-nums">{(data.rate * 100).toFixed(1)}%</p>
          <p className="mt-1 text-small text-muted-foreground">{t.rateAppliedHint}</p>
        </AdminCard>
        <div className="grid gap-4 lg:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t.statGross} value={formatPrice(data.kpis.grossDelivered, locale)} hint={t.statGrossHint(data.kpis.deliveredOrders)} />
          <Stat label={t.statPayable} value={formatPrice(data.kpis.commissionPayable, locale)} />
          <Stat label={t.statNet} value={formatPrice(data.kpis.netDelivered, locale)} />
          <Stat label={t.statPending} value={formatPrice(data.kpis.pendingPayout, locale)} hint={t.statPendingHint} />
          <Stat label={t.statSettled} value={formatPrice(data.kpis.settled, locale)} hint={t.statSettledHint} />
        </div>
      </div>

      <AdminCard title={t.historyTitle} subtitle={t.historySubtitle} className="mt-8">
        {data.history.length ? (
          <div className="divide-y divide-border">
            {data.history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="font-medium tabular-nums">{(h.rate * 100).toFixed(1)}%</p>
                  <p className="text-caption text-muted-foreground">{t.effectiveFrom} {fmtDate(h.effectiveFrom, locale)}</p>
                </div>
                <p className="text-caption text-muted-foreground">{t.recorded} {fmtDate(h.createdAt, locale)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t.emptyTitle} text={t.emptyText} />
        )}
      </AdminCard>
    </SellerShell>
  );
}
