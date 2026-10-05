import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AdminCard, EmptyState, Stat, TableSkeleton, fmtDate } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { getCommissionSummary } from "@/lib/seller-finance.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { formatPrice } from "@/lib/localization";

const q = queryOptions({ queryKey: ["seller-commission"], queryFn: () => getCommissionSummary() });

export const Route = createFileRoute("/_authenticated/seller/commission")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  component: CommissionPage,
});

function CommissionPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const { data } = useSuspenseQuery(q);

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Commission"
    >
      <p className="text-body text-muted-foreground">Commission is calculated on fulfilled orders and settled to your account on request.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminCard title="Current rate" subtitle={data.seller.legalName}>
          <p className="text-4xl font-semibold tabular-nums">{(data.rate * 100).toFixed(1)}%</p>
          <p className="mt-1 text-small text-muted-foreground">Applied to every fulfilled order.</p>
        </AdminCard>
        <div className="grid gap-4 lg:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Gross delivered" value={formatPrice(data.kpis.grossDelivered, locale)} hint={`${data.kpis.deliveredOrders} fulfilled orders`} />
          <Stat label="Commission payable" value={formatPrice(data.kpis.commissionPayable, locale)} />
          <Stat label="Net delivered" value={formatPrice(data.kpis.netDelivered, locale)} />
          <Stat label="Pending payout" value={formatPrice(data.kpis.pendingPayout, locale)} hint="Earned, not yet settled" />
          <Stat label="Settled" value={formatPrice(data.kpis.settled, locale)} hint="Approved & paid out" />
        </div>
      </div>

      <AdminCard title="Commission rate history" subtitle="Every rate change is recorded for audit." className="mt-8">
        {data.history.length ? (
          <div className="divide-y divide-border">
            {data.history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="font-medium tabular-nums">{(h.rate * 100).toFixed(1)}%</p>
                  <p className="text-caption text-muted-foreground">Effective {fmtDate(h.effectiveFrom)}</p>
                </div>
                <p className="text-caption text-muted-foreground">Recorded {fmtDate(h.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No rate changes" text="Your commission rate has never been changed." />
        )}
      </AdminCard>
    </SellerShell>
  );
}
