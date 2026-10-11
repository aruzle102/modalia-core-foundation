import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, Banknote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableSkeleton, fmtDateTime, fmtMoney } from "@/components/admin/ui";
import { DataTable, EmptyState, ErrorState, StatCard } from "@/components/dashboard";
import { getSellerCustomers } from "@/lib/seller-orders.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { SellerShell } from "@/components/seller/SellerShell";
import { errMsg } from "../admin/_shared";

export const Route = createFileRoute("/_authenticated/seller/customers")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Customers — Seller — Modalia" }, { name: "description", content: "Customers who bought from your store." }] }),
  component: SellerCustomersPage,
});

function SellerCustomersPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).seller.customers;
  const customersQuery = useQuery({
    queryKey: ["seller-customers"],
    queryFn: () => getSellerCustomers({ data: {} }),
    retry: false,
  });

  const customers = customersQuery.data?.customers ?? [];
  const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);

  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <p className="text-body text-muted-foreground">{t.description}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t.statCustomers}
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          value={String(customers.length)}
          loading={customersQuery.isLoading}
        />
        <StatCard
          title={t.statOrders}
          icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
          value={String(customers.reduce((s, c) => s + c.orderCount, 0))}
          loading={customersQuery.isLoading}
        />
        <StatCard
          title={t.statRevenue}
          icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
          value={fmtMoney(totalRevenue, "DZD", locale)}
          loading={customersQuery.isLoading}
        />
      </div>

      <div className="mt-6">
        {customersQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : customersQuery.isError ? (
          <ErrorState
            title={t.errorTitle}
            description={errMsg(customersQuery.error)}
            action={
              <Button variant="outline" onClick={() => customersQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : customers.length === 0 ? (
          <DataTable>
            <EmptyState title={t.emptyTitle} description={t.emptyText} />
          </DataTable>
        ) : (
          <DataTable>
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="px-3 py-3 text-start">{t.colCustomer}</th>
                  <th className="px-3 py-3 text-start">{t.colPhone}</th>
                  <th className="px-3 py-3 text-start">{t.colWilaya}</th>
                  <th className="px-3 py-3 text-end">{t.colOrders}</th>
                  <th className="px-3 py-3 text-end">{t.colTotalSpent}</th>
                  <th className="px-3 py-3 text-start">{t.colLastOrder}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {customers.map((customer) => (
                  <tr key={`${customer.phone}-${customer.name}`} className="align-top hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          <Users className="size-4" />
                        </span>
                        {customer.name}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground" dir="ltr">{customer.phone}</td>
                    <td className="px-3 py-3">{customer.wilaya || "—"}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{customer.orderCount}</td>
                    <td className="px-3 py-3 text-end tabular-nums font-medium">{fmtMoney(customer.totalSpent, "DZD", locale)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{fmtDateTime(customer.lastOrderAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </div>
    </SellerShell>
  );
}
