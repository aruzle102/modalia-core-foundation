import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminGate } from "@/components/admin/AdminGate";
import { SuperAdminGate } from "@/components/admin/SuperAdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  TableSkeleton,
  fmtMoney,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import { DataTable, EmptyState, ErrorState } from "@/components/dashboard";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { listAdminCommissions } from "@/lib/admin-catalog.functions";
import { updateCommissionRate } from "@/lib/admin-sellers.functions";
import { errMsg, Pager } from "./_shared";
import { numParam, strParam, useBackParam, useDebouncedUrlParam, useUrlState } from "@/hooks/use-url-state";
import { useAdminT } from "@/components/admin/use-admin-t";

export const Route = createFileRoute("/admin/commissions")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: strParam(search["q"]),
    page: numParam(search["page"], 1),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Commissions — Modalia Admin" }],
  }),
  component: CommissionsPage,
});

function CommissionsPage() {
  const locale = useAdminLocale();
  const t = useAdminT().commissions;
  const nav = getTranslations(locale).adminNav.items;
  const url = useUrlState({ page: 1 });
  const backParam = useBackParam();
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const queryClient = useQueryClient();
  const setPage = (next: number) => url.set({ page: next }, { push: true });

  const rateMutation = useMutation({
    mutationFn: (input: { sellerId: string; rate: number }) =>
      updateCommissionRate({ data: input }),
    onSuccess: (res) => {
      toast.success(t.rateUpdated((res.rate * 100).toFixed(1)));
      setEditingId(null);
      setEditRate("");
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitRate = (sellerId: string) => {
    const parsed = Number(editRate.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error(t.invalidRate);
      return;
    }
    rateMutation.mutate({ sellerId, rate: parsed });
  };

  const query = useQuery({
    queryKey: ["admin-commissions", q, page],
    queryFn: () => listAdminCommissions({ data: { q: q.trim() || undefined, page } }),
    retry: false,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageSize = query.data?.pageSize ?? 25;
  const totals = rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      commission: acc.commission + r.commission,
      net: acc.net + r.net,
    }),
    { gross: 0, commission: 0, net: 0 },
  );

  return (
    <AdminGate>
      <SuperAdminGate>
      <AdminShell
        title={t.title}
        subtitle={t.subtitle}
        breadcrumbs={[{ label: nav.commissions }]}
      >
        <AdminCard
          title={t.title}
          subtitle={t.totalSellers(total)}
          actions={
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-64 ps-8"
              />
            </div>
          }
        >
          {query.isPending ? (
            <DataTable>
              <div className="p-4">
                <TableSkeleton rows={8} />
              </div>
            </DataTable>
          ) : query.isError ? (
            <DataTable>
              <ErrorState
                title={t.loadError}
                description={errMsg(query.error)}
                action={
                  <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                    {t.retry}
                  </Button>
                }
              />
            </DataTable>
          ) : rows.length === 0 ? (
            <DataTable>
              <EmptyState title={t.noSellers} />
            </DataTable>
          ) : (
            <DataTable>
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th className="px-3 py-3 text-start">{t.seller}</th>
                    <th className="px-3 py-3 text-end">{t.rate}</th>
                    <th className="px-3 py-3 text-end">{t.orders}</th>
                    <th className="px-3 py-3 text-end">{t.gross}</th>
                    <th className="px-3 py-3 text-end">{t.commission}</th>
                    <th className="px-3 py-3 text-end">{t.net}</th>
                    <th className="px-3 py-3 text-end">{t.history}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {rows.map((r) => {
                    const open = expanded === r.sellerId;
                    return (
                      <Fragment key={r.sellerId}>
                        <tr className="hover:bg-muted/40">
                          <td className="px-3 py-3">
                            <Link
                              to="/admin/sellers/$sellerId"
                              params={{ sellerId: r.sellerId }}
                              search={{ back: backParam, tab: "overview", q, status: "", page, create: "" }}
                              className="font-medium text-primary hover:underline"
                            >
                              {r.legalName}
                            </Link>
                            <p className="max-w-52 truncate text-xs text-muted-foreground">
                              {r.email ?? "—"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-end font-medium tabular-nums">
                            {editingId === r.sellerId ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Input
                                  value={editRate}
                                  onChange={(e) => setEditRate(e.target.value)}
                                  placeholder={(r.commissionRate * 100).toFixed(1)}
                                  inputMode="decimal"
                                  dir="ltr"
                                  className="h-8 w-20 text-end"
                                  autoFocus
                                />
                                <span className="text-muted-foreground">%</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  disabled={rateMutation.isPending}
                                  onClick={() => submitRate(r.sellerId)}
                                  aria-label={t.save}
                                >
                                  <Check className="size-4 text-emerald-600" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditRate("");
                                  }}
                                  aria-label={t.cancel}
                                >
                                  <X className="size-4" />
                                </Button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                {(r.commissionRate * 100).toFixed(1)}%
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  onClick={() => {
                                    setEditingId(r.sellerId);
                                    setEditRate((r.commissionRate * 100).toFixed(1));
                                  }}
                                  aria-label={t.editRate}
                                  title={t.editRate}
                                >
                                  <Pencil className="size-3.5 opacity-60" />
                                </Button>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-end tabular-nums">{r.orderCount}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-end tabular-nums">
                            {fmtMoney(r.gross, "DZD", locale)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-end tabular-nums text-brand">
                            {fmtMoney(r.commission, "DZD", locale)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-end font-medium tabular-nums">
                            {fmtMoney(r.net, "DZD", locale)}
                          </td>
                          <td className="px-3 py-3 text-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpanded(open ? null : r.sellerId)}
                              aria-expanded={open}
                            >
                              {open ? t.hideHistory : t.viewHistory}
                            </Button>
                          </td>
                        </tr>
                        {open ? (
                          <tr key={`${r.sellerId}-history`} className="bg-muted/30">
                            <td colSpan={7} className="px-4 py-3">
                              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t.history}
                              </h4>
                              {r.history.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t.noHistory}</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-96 text-sm">
                                    <thead>
                                      <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                                        <th className="px-3 py-2 text-start">{t.rate}</th>
                                        <th className="px-3 py-2 text-start">{t.effectiveFrom}</th>
                                        <th className="px-3 py-2 text-start">{t.changedBy}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                      {r.history.map((h) => (
                                        <tr key={h.id}>
                                          <td className="px-3 py-1.5 font-medium">
                                            {(h.rate * 100).toFixed(1)}%
                                          </td>
                                          <td className="px-3 py-1.5 text-muted-foreground" title={fmtDateTime(h.effectiveFrom, locale)}>
                                            {timeAgo(h.effectiveFrom, locale)}
                                          </td>
                                          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                                            {h.changedBy ? h.changedBy.slice(0, 8) : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td className="px-3 py-3 font-medium" colSpan={3}>{t.pageTotals}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-end font-medium tabular-nums">{fmtMoney(totals.gross, "DZD", locale)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-end font-medium tabular-nums text-brand">
                      {fmtMoney(totals.commission, "DZD", locale)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-end font-medium tabular-nums">{fmtMoney(totals.net, "DZD", locale)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </DataTable>
          )}
          {total > 0 && (
            <div className="mt-4">
              <Pager page={page} total={total} pageSize={pageSize} onPage={(p) => setPage(p)} />
            </div>
          )}
        </AdminCard>
      </AdminShell>
      </SuperAdminGate>
    </AdminGate>
  );
}
