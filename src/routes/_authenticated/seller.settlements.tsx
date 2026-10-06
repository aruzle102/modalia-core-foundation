import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCard, EmptyState, Field, Stat, StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { listSettlements, requestSettlement } from "@/lib/seller-finance.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { formatPrice } from "@/lib/localization";
import { RouteError } from "@/components/routing/route-states";

const q = queryOptions({ queryKey: ["seller-settlements"], queryFn: () => listSettlements() });

export const Route = createFileRoute("/_authenticated/seller/settlements")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  errorComponent: ({ reset }) => (
    <SellerShell eyebrow="Seller workspace" title="Settlements">
      <RouteError message="Settlements could not be loaded. Check your connection and try again." reset={reset} />
    </SellerShell>
  ),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: SettlementsPage,
});

function SettlementsPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const { data } = useSuspenseQuery(q);

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Settlements"
    >
      <p className="text-body text-muted-foreground">Request payouts of your earned commission. Platform staff review each request manually.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Payable balance" value={formatPrice(data.payable, locale)} hint="Commission earned, not yet settled" />
        {data.isOwner ? <RequestForm /> : null}
      </div>
      <SettlementList />
    </SellerShell>
  );
}

function RequestForm() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => requestSettlement({ data: { amount: Number(amount), notes: notes || undefined } }),
    onSuccess: () => {
      setMessage("Settlement request submitted.");
      setAmount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["seller-settlements"] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "Request failed."),
  });

  return (
    <AdminCard title="Request a payout" subtitle={`Up to ${formatPrice(data.payable)} available.`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (DZD)">
          <Input
            type="number"
            min="1"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)">
          <Input placeholder={t.common.bankTransferDetails} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={!Number(amount) || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Submitting…" : "Request settlement"}
        </Button>
        {message ? <p className="text-small text-muted-foreground">{message}</p> : null}
      </div>
    </AdminCard>
  );
}

function SettlementList() {
  const { data } = useSuspenseQuery(q);

  return (
    <AdminCard title="Settlement history" subtitle="Status timeline of every request." className="mt-8">
      {data.settlements.length ? (
        <div className="divide-y divide-border">
          {data.settlements.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium tabular-nums">{formatPrice(s.amount)} {s.currency}</p>
                <p className="text-caption text-muted-foreground">
                  Requested {fmtDateTime(s.createdAt)}
                  {s.paymentReference ? ` · Ref ${s.paymentReference}` : ""}
                  {s.settledAt ? ` · Paid ${fmtDateTime(s.settledAt)}` : ""}
                </p>
                {s.notes ? <p className="mt-1 text-small text-muted-foreground">{s.notes}</p> : null}
              </div>
              <StatusPill status={s.status} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No settlements yet" text="Your payout requests and their status will appear here." />
      )}
    </AdminCard>
  );
}
