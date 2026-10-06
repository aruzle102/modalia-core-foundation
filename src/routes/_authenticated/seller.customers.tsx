import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { AdminCard, EmptyState, Stat, TableSkeleton, fmtDateTime, fmtMoney } from "@/components/admin/ui";
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
        <Stat label={t.statCustomers} value={customersQuery.isLoading ? "…" : String(customers.length)} />
        <Stat label={t.statOrders} value={customersQuery.isLoading ? "…" : String(customers.reduce((s, c) => s + c.orderCount, 0))} />
        <Stat label={t.statRevenue} value={customersQuery.isLoading ? "…" : fmtMoney(totalRevenue, "DZD", locale)} />
      </div>

      <div className="mt-6">
        {customersQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : customersQuery.isError ? (
          <AdminCard>
            <EmptyState title={t.errorTitle} text={errMsg(customersQuery.error)} />
          </AdminCard>
        ) : customers.length === 0 ? (
          <AdminCard>
            <EmptyState title={t.emptyTitle} text={t.emptyText} />
          </AdminCard>
        ) : (
          <AdminCard className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pe-4 text-start font-medium">{t.colCustomer}</th>
                  <th className="py-3 pe-4 text-start font-medium">{t.colPhone}</th>
                  <th className="py-3 pe-4 text-start font-medium">{t.colWilaya}</th>
                  <th className="py-3 pe-4 text-start font-medium">{t.colOrders}</th>
                  <th className="py-3 pe-4 text-start font-medium">{t.colTotalSpent}</th>
                  <th className="py-3 text-start font-medium">{t.colLastOrder}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((customer) => (
                  <tr key={`${customer.phone}-${customer.name}`} className="align-top">
                    <td className="py-3 pe-4">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          <Users className="size-4" />
                        </span>
                        {customer.name}
                      </span>
                    </td>
                    <td className="py-3 pe-4 text-xs text-muted-foreground" dir="ltr">{customer.phone}</td>
                    <td className="py-3 pe-4">{customer.wilaya || "—"}</td>
                    <td className="py-3 pe-4 tabular-nums">{customer.orderCount}</td>
                    <td className="py-3 pe-4 tabular-nums font-medium">{fmtMoney(customer.totalSpent, "DZD", locale)}</td>
                    <td className="py-3 text-xs text-muted-foreground">{fmtDateTime(customer.lastOrderAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminCard>
        )}
      </div>
    </SellerShell>
  );
}
