import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, errMsg } from "./_shared";
import {
  AdminCard,
  EmptyState,
  TableSkeleton,
  fmtDateTime,
  fmtMoney,
} from "@/components/admin/ui";
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

        <AdminCard
          title={tab === "registered" ? "Registered customers" : "Guest buyers"}
          subtitle={`${total} total`}
          actions={
            tab === "registered" ? (
              <div className="relative">
                <Search className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name or phone…"
                  className="w-52 ps-9"
                />
              </div>
            ) : undefined
          }
        >
          {isPending ? (
            <TableSkeleton />
          ) : isError ? (
            <EmptyState title="Could not load customers" text={errMsg(error)} />
          ) : tab === "registered" ? (
            (registeredQuery.data?.items ?? []).length === 0 ? (
              <EmptyState title="No customers yet" text="Customer profiles appear after shoppers sign up." />
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
            <EmptyState title="No guest orders" text="Guest buyers appear after a checkout without an account." />
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
        </AdminCard>
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-start text-small">
        <thead>
          <tr className="border-b border-border text-caption text-muted-foreground">
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Orders</th>
            <th className="px-3 py-2 font-medium">Total spent</th>
            <th className="px-3 py-2 font-medium">Last order</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-muted/40">
              <td className="px-3 py-3 font-medium">{r.name}</td>
              <td className="px-3 py-3 text-caption" dir="ltr">{r.contact}</td>
              <td className="px-3 py-3">{r.orders}</td>
              <td className="px-3 py-3 font-medium">{fmtMoney(r.total, "DZD", locale)}</td>
              <td className="px-3 py-3 text-caption text-muted-foreground">
                {r.last ? fmtDateTime(r.last, locale) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
