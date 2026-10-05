import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  TableSkeleton,
  fmtMoney,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import { listAdminCommissions } from "@/lib/admin-catalog.functions";
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
  const t = useAdminT().commissions;
  const url = useUrlState({ page: 1 });
  const backParam = useBackParam();
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const setPage = (next: number) => url.set({ page: next }, { push: true });

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
      <AdminShell title={t.title} subtitle={t.subtitle}>
        <AdminCard
          title={t.title}
          subtitle={`${total} total`}
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
            <TableSkeleton rows={8} />
          ) : query.isError ? (
            <EmptyState
              title="Could not load commissions"
              text={errMsg(query.error)}
              action={
                <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState title={t.noSellers} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pe-4 text-start font-medium">{t.seller}</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.rate}</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.orders}</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.gross}</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.commission}</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.net}</th>
                    <th className="py-2 text-end font-medium">{t.history}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const open = expanded === r.sellerId;
                    return (
                      <Fragment key={r.sellerId}>
                        <tr className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-3 pe-4">
                            <Link
                              to="/admin/sellers/$sellerId"
                              params={{ sellerId: r.sellerId }}
                              search={{ back: backParam, q, status: "", page, create: "" }}
                              className="font-medium text-primary hover:underline"
                            >
                              {r.legalName}
                            </Link>
                            <p className="max-w-52 truncate text-xs text-muted-foreground">
                              {r.email ?? "—"}
                            </p>
                          </td>
                          <td className="py-3 pe-4 text-end tabular-nums font-medium">
                            {(r.commissionRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 pe-4 text-end tabular-nums">{r.orderCount}</td>
                          <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap">
                            {fmtMoney(r.gross)}
                          </td>
                          <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap text-amber-700 dark:text-amber-400">
                            {fmtMoney(r.commission)}
                          </td>
                          <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap font-medium">
                            {fmtMoney(r.net)}
                          </td>
                          <td className="py-3 text-end">
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
                          <tr key={`${r.sellerId}-history`} className="border-b bg-muted/30">
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
                                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-1.5 pe-3 text-start font-medium">{t.rate}</th>
                                        <th className="py-1.5 pe-3 text-start font-medium">{t.effectiveFrom}</th>
                                        <th className="py-1.5 text-start font-medium">{t.changedBy}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.history.map((h) => (
                                        <tr key={h.id} className="border-b last:border-0">
                                          <td className="py-1.5 pe-3 font-medium">
                                            {(h.rate * 100).toFixed(1)}%
                                          </td>
                                          <td className="py-1.5 pe-3 text-muted-foreground" title={fmtDateTime(h.effectiveFrom)}>
                                            {timeAgo(h.effectiveFrom)}
                                          </td>
                                          <td className="py-1.5 font-mono text-xs text-muted-foreground">
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
                  <tr className="border-t-2 font-medium">
                    <td className="py-3 pe-4" colSpan={3}>Page totals</td>
                    <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap">{fmtMoney(totals.gross)}</td>
                    <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap text-amber-700 dark:text-amber-400">
                      {fmtMoney(totals.commission)}
                    </td>
                    <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap">{fmtMoney(totals.net)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {total > 0 && (
            <div className="mt-4">
              <Pager page={page} total={total} pageSize={pageSize} onPage={(p) => setPage(p)} />
            </div>
          )}
        </AdminCard>
      </AdminShell>
    </AdminGate>
  );
}
