import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { AdminCard, EmptyState, Stat, TableSkeleton, fmtDateTime, fmtMoney } from "@/components/admin/ui";
import { getSellerCustomers } from "@/lib/seller-orders.functions";
import { getLocale } from "@/lib/i18n";
import { SellerShell } from "@/components/seller/SellerShell";
import { errMsg } from "../admin/_shared";

export const Route = createFileRoute("/_authenticated/seller/customers")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  head: () => ({ meta: [{ title: "Customers — Seller — Modalia" }, { name: "description", content: "Customers who bought from your store." }] }),
  component: SellerCustomersPage,
});

function SellerCustomersPage() {
  const { locale } = Route.useSearch();
  const customersQuery = useQuery({
    queryKey: ["seller-customers"],
    queryFn: () => getSellerCustomers({ data: {} }),
    retry: false,
  });

  const customers = customersQuery.data?.customers ?? [];
  const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Customers"
    >
      <p className="text-body text-muted-foreground">"Derived from your own orders — read-only. Customers are matched by phone number when available."</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Customers" value={customersQuery.isLoading ? "…" : String(customers.length)} />
        <Stat label="Orders" value={customersQuery.isLoading ? "…" : String(customers.reduce((s, c) => s + c.orderCount, 0))} />
        <Stat label="Revenue from these orders" value={customersQuery.isLoading ? "…" : fmtMoney(totalRevenue)} />
      </div>

      <div className="mt-6">
        {customersQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : customersQuery.isError ? (
          <AdminCard>
            <EmptyState title="Customers could not be loaded" text={errMsg(customersQuery.error)} />
          </AdminCard>
        ) : customers.length === 0 ? (
          <AdminCard>
            <EmptyState
              title="No customers yet"
              text="Customers who order from your store will appear here automatically."
            />
          </AdminCard>
        ) : (
          <AdminCard className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pe-4 text-start font-medium">Customer</th>
                  <th className="py-3 pe-4 text-start font-medium">Phone</th>
                  <th className="py-3 pe-4 text-start font-medium">Wilaya</th>
                  <th className="py-3 pe-4 text-start font-medium">Orders</th>
                  <th className="py-3 pe-4 text-start font-medium">Total spent</th>
                  <th className="py-3 text-start font-medium">Last order</th>
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
                    <td className="py-3 pe-4 tabular-nums font-medium">{fmtMoney(customer.totalSpent)}</td>
                    <td className="py-3 text-xs text-muted-foreground">{fmtDateTime(customer.lastOrderAt)}</td>
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
