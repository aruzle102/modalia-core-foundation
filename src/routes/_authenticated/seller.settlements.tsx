import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCard, EmptyState, Field, Stat, StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { listSettlements, requestSettlement } from "@/lib/seller-finance.functions";
import { getLocale, getTranslations, type SupportedLocale } from "@/lib/i18n";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { formatPrice } from "@/lib/localization";
import { RouteError } from "@/components/routing/route-states";

const q = queryOptions({ queryKey: ["seller-settlements"], queryFn: () => listSettlements() });

export const Route = createFileRoute("/_authenticated/seller/settlements")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  errorComponent: SettlementsError,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: SettlementsPage,
});

function SettlementsError({ reset }: { reset: () => void }) {
  const t = getTranslations(useAdminLocale()).seller.settlements;
  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <RouteError message={t.loadError} reset={reset} />
    </SellerShell>
  );
}

type SettlementsT = ReturnType<typeof getTranslations>["seller"]["settlements"];

function SettlementsPage() {
  const { locale } = Route.useSearch();
  const t: SettlementsT = getTranslations(locale).seller.settlements;
  const { data } = useSuspenseQuery(q);

  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <p className="text-body text-muted-foreground">{t.intro}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label={t.payableBalance} value={formatPrice(data.payable, locale)} hint={t.payableHint} />
        {data.isOwner ? <RequestForm t={t} locale={locale} /> : null}
      </div>
      <SettlementList t={t} locale={locale} />
    </SellerShell>
  );
}

function RequestForm({ t, locale }: { t: SettlementsT; locale: SupportedLocale }) {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => requestSettlement({ data: { amount: Number(amount), notes: notes || undefined } }),
    onSuccess: () => {
      setMessage(t.submitted);
      setAmount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["seller-settlements"] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : t.requestFailed),
  });

  return (
    <AdminCard title={t.requestTitle} subtitle={t.requestSubtitle(formatPrice(data.payable, locale))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.amountLabel}>
          <Input
            type="number"
            min="1"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label={t.notesLabel}>
          <Input placeholder={t.notesPlaceholder} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={!Number(amount) || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? t.submitting : t.requestCta}
        </Button>
        {message ? <p className="text-small text-muted-foreground">{message}</p> : null}
      </div>
    </AdminCard>
  );
}

function SettlementList({ t, locale }: { t: SettlementsT; locale: SupportedLocale }) {
  const { data } = useSuspenseQuery(q);

  return (
    <AdminCard title={t.historyTitle} subtitle={t.historySubtitle} className="mt-8">
      {data.settlements.length ? (
        <div className="divide-y divide-border">
          {data.settlements.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium tabular-nums">{formatPrice(s.amount, locale)} {s.currency}</p>
                <p className="text-caption text-muted-foreground">
                  {t.requested} {fmtDateTime(s.createdAt, locale)}
                  {s.paymentReference ? ` · ${t.refLabel(s.paymentReference)}` : ""}
                  {s.settledAt ? ` · ${t.paidLabel} ${fmtDateTime(s.settledAt, locale)}` : ""}
                </p>
                {s.notes ? <p className="mt-1 text-small text-muted-foreground">{s.notes}</p> : null}
              </div>
              <StatusPill status={s.status} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={t.emptyTitle} text={t.emptyText} />
      )}
    </AdminCard>
  );
}
