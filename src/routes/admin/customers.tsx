import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, errMsg } from "./_shared";
import {
  TableSkeleton,
  fmtDateTime,
  fmtMoney,
} from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { listAdminCustomers, listGuestCustomers } from "@/lib/admin-ops.functions";
import { getLocale, getTranslations, type SupportedLocale } from "@/lib/i18n";
import { numParam, strParam, useUrlState, useDebouncedUrlParam } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/customers")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    q: strParam(search["q"]),
    page: numParam(search["page"], 1),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Customers — Modalia Admin" }],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const url = useUrlState({ page: 1 });
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
  const [tab, setTab] = useState<"registered" | "guest">("registered");
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const setPage = (next: number) => url.set({ page: next }, { push: true });

  const registeredQuery = useQuery({
    queryKey: ["admin-customers", q, page],
    queryFn: () => listAdminCustomers({ data: { q: q || undefined, page } }),
    enabled: tab === "registered",
    retry: false,
  });
  const guestQuery = useQuery({
    queryKey: ["admin-guest-customers", page],
    queryFn: () => listGuestCustomers({ data: { page } }),
    enabled: tab === "guest",
    retry: false,
  });

  const isPending = tab === "registered" ? registeredQuery.isPending : guestQuery.isPending;
  const isError = tab === "registered" ? registeredQuery.isError : guestQuery.isError;
  const error = tab === "registered" ? registeredQuery.error : guestQuery.error;
  const total = tab === "registered" ? (registeredQuery.data?.total ?? 0) : (guestQuery.data?.total ?? 0);
  const pageSize = tab === "registered" ? (registeredQuery.data?.pageSize ?? 25) : (guestQuery.data?.pageSize ?? 25);

  return (
    <AdminGate>
      <AdminShell
        title={t.customers}
        subtitle="Registered shoppers and guest buyers, with real order history."
        breadcrumbs={[{ label: t.customers }]}
      >
        <div className="mb-4 flex gap-2">
          {(["registered", "guest"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setTab(v);
                url.set({ page: 1 });
              }}
              className={
                tab === v
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              }
            >
              {v === "registered" ? "Registered" : "Guest buyers"}
            </button>
          ))}
        </div>

        <section aria-label={tab === "registered" ? "Registered customers" : "Guest buyers"}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {tab === "registered" ? "Registered customers" : "Guest buyers"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{`${total} total`}</p>
            </div>
            {tab === "registered" ? (
              <div className="relative">
                <Search className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name or phone…"
                  className="w-52 ps-9"
                />
              </div>
            ) : null}
          </div>
          {isPending ? (
            <DataTable>
              <div className="p-4">
                <TableSkeleton />
              </div>
            </DataTable>
          ) : isError ? (
            <DataTable>
              <EmptyState title="Could not load customers" description={errMsg(error)} />
            </DataTable>
          ) : tab === "registered" ? (
            (registeredQuery.data?.items ?? []).length === 0 ? (
              <DataTable>
                <EmptyState
                  title="No customers yet"
                  description="Customer profiles appear after shoppers sign up."
                />
              </DataTable>
            ) : (
              <CustomerTable
                locale={locale}
                rows={(registeredQuery.data?.items ?? []).map((c) => ({
                  key: c.id,
                  name: c.display_name ?? "—",
                  contact: c.phone ?? "—",
                  orders: c.order_count,
                  total: c.total_spent,
                  last: c.last_order_at,
                }))}
              />
            )
          ) : (guestQuery.data?.items ?? []).length === 0 ? (
            <DataTable>
              <EmptyState
                title="No guest orders"
                description="Guest buyers appear after a checkout without an account."
              />
            </DataTable>
          ) : (
            <CustomerTable
              locale={locale}
              rows={(guestQuery.data?.items ?? []).map((g) => ({
                key: g.key,
                name: g.email ?? "Guest",
                contact: g.phone ?? g.email ?? "—",
                orders: g.order_count,
                total: g.total_spent,
                last: g.last_order_at,
              }))}
            />
          )}
        </section>
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminShell>
    </AdminGate>
  );
}

function CustomerTable({
  rows,
  locale,
}: {
  rows: { key: string; name: string; contact: string; orders: number; total: number; last: string | null }[];
  locale: SupportedLocale;
}) {
  return (
    <DataTable>
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <th className="px-3 py-3 text-start">Customer</th>
            <th className="px-3 py-3 text-start">Contact</th>
            <th className="px-3 py-3 text-end">Orders</th>
            <th className="px-3 py-3 text-end">Total spent</th>
            <th className="px-3 py-3 text-start">Last order</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-muted/40">
              <td className="px-3 py-3 font-medium">{r.name}</td>
              <td className="px-3 py-3 text-xs" dir="ltr">{r.contact}</td>
              <td className="px-3 py-3 text-end tabular-nums">{r.orders}</td>
              <td className="px-3 py-3 text-end font-medium tabular-nums">{fmtMoney(r.total, "DZD", locale)}</td>
              <td className="px-3 py-3 text-xs text-muted-foreground">
                {r.last ? fmtDateTime(r.last, locale) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}
