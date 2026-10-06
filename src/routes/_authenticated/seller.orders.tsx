import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminCard, EmptyState, StatusPill, TableSkeleton, Field, fmtDateTime, fmtMoney } from "@/components/admin/ui";
import { listSellerOrders } from "@/lib/seller-orders.functions";
import { getLocale } from "@/lib/i18n";
import { numParam, strParam, useBackParam, useDebouncedUrlParam, useUrlState } from "@/hooks/use-url-state";
import { SellerShell } from "@/components/seller/SellerShell";
import { errMsg, Pager } from "../admin/_shared";

export const Route = createFileRoute("/_authenticated/seller/orders")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    q: strParam(search["q"]),
    status: strParam(search["status"]),
    page: numParam(search["page"], 1),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Orders — Seller — Modalia" }, { name: "description", content: "Manage your store's orders." }] }),
  component: SellerOrdersPage,
});

const STATUS_OPTIONS = [
  "pending",
  "accepted",
  "processing",
  "ready_for_shipping",
  "handed_to_courier",
  "in_transit",
  "fulfilled",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
] as const;

function SellerOrdersPage() {
  const { locale } = Route.useSearch();
  const backParam = useBackParam();
  const url = useUrlState({ status: "", page: 1 });
  const search = strParam(url.search["q"]);
  const status = strParam(url.search["status"]);
  const page = numParam(url.search["page"], 1);
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });

  const payload = useMemo(() => {
    const q = search.trim();
    return {
      page,
      ...(q ? { q } : {}),
      ...(status ? { status: status as (typeof STATUS_OPTIONS)[number] } : {}),
    };
  }, [search, status, page]);

  const ordersQuery = useQuery({
    queryKey: ["seller-orders", payload],
    queryFn: () => listSellerOrders({ data: payload }),
    retry: false,
  });

  const orders = ordersQuery.data?.orders ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const pageSize = ordersQuery.data?.pageSize ?? 20;

  const resetFilters = () => url.set({ q: "", status: "", page: 1 });
  const hasFilters = search.trim() !== "" || status !== "";

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Orders"
    >
      <p className="text-body text-muted-foreground">"Only your own store's orders are shown here."</p>
      <AdminCard
        title="Filters"
        actions={
          hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => resetFilters()}
            >
              <X className="size-4" />
              Clear
            </Button>
          ) : null
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Order no, phone or name…"
                className="ps-9"
              />
            </div>
          </Field>
          <Field label="Status">
            <Select value={status || "all"} onValueChange={(v) => url.set({ status: v === "all" ? "" : v, page: 1 })}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option} className="capitalize">
                    {option.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </AdminCard>

      <div className="mt-6">
        {ordersQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : ordersQuery.isError ? (
          <AdminCard>
            <EmptyState title="Orders could not be loaded" text={errMsg(ordersQuery.error)} />
          </AdminCard>
        ) : orders.length === 0 ? (
          <AdminCard>
            <EmptyState
              title="No orders yet"
              text={hasFilters ? "No orders match your filters." : "When customers buy from your store, their orders will appear here."}
            />
          </AdminCard>
        ) : (
          <div className="space-y-4">
            <AdminCard className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-3 pe-4 text-start font-medium">Order</th>
                    <th className="py-3 pe-4 text-start font-medium">Customer</th>
                    <th className="py-3 pe-4 text-start font-medium">Items</th>
                    <th className="py-3 pe-4 text-start font-medium">Total</th>
                    <th className="py-3 pe-4 text-start font-medium">Status</th>
                    <th className="py-3 text-start font-medium">Placed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => (
                    <tr key={order.id} className="align-top">
                      <td className="py-3 pe-4">
                        <Link
                          to="/seller/orders/$orderId"
                          params={{ orderId: order.id }}
                          search={{ locale, back: backParam, q: search, status, page }}
                          className="font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="py-3 pe-4">
                        <p className="font-medium">{[order.firstName, order.lastName].filter(Boolean).join(" ") || "—"}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{order.phone ?? "—"}</p>
                      </td>
                      <td className="py-3 pe-4 tabular-nums">{order.itemCount}</td>
                      <td className="py-3 pe-4 tabular-nums">{fmtMoney(order.subtotal + order.shippingTotal, "DZD", locale)}</td>
                      <td className="py-3 pe-4"><StatusPill status={order.status} /></td>
                      <td className="py-3 text-xs text-muted-foreground">{fmtDateTime(order.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminCard>
            <Pager page={page} total={total} pageSize={pageSize} onPage={(p) => url.set({ page: p }, { push: true })} />
          </div>
        )}
      </div>
    </SellerShell>
  );
}
