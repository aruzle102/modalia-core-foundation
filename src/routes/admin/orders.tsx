import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  numParam,
  strParam,
  useBackParam,
  useDebouncedUrlParam,
  useUrlState,
} from "@/hooks/use-url-state";
import {
  AdminCard,
  Stat,
  StatusPill,
  EmptyState,
  TableSkeleton,
  Field,
  fmtMoney,
  fmtDateTime,
} from "@/components/admin/ui";
import { listAdminSellersLite } from "@/lib/admin-catalog.functions";
import { listAdminOrders } from "@/lib/admin-orders.functions";
import { getLocale, getTranslations } from "@/lib/i18n";

export const Route = createFileRoute("/admin/orders")({
  // List state (search / filters / page) lives in the URL so Back works and
  // filtered views are shareable.
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    q: strParam(search["q"]),
    status: strParam(search["status"]),
    sellerId: strParam(search["sellerId"]),
    wilaya: strParam(search["wilaya"]),
    paymentMethod: strParam(search["paymentMethod"]),
    minTotal: strParam(search["minTotal"]),
    maxTotal: strParam(search["maxTotal"]),
    from: strParam(search["from"]),
    to: strParam(search["to"]),
    page: numParam(search["page"], 1),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Orders — Admin — Modalia" },
      { name: "description", content: "Search, filter and manage customer orders." },
    ],
  }),
  component: OrdersPage,
});

const ORDER_STATUS_OPTIONS = [
  "pending",
  "received",
  "confirmed",
  "processing",
  "preparing",
  "ready_for_shipping",
  "handed_to_courier",
  "shipped",
  "in_transit",
  "delivered",
  "failed_delivery",
  "cancelled",
  "returned",
  "refunded",
] as const;

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function OrdersPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const url = useUrlState({ page: 1 });
  const backParam = useBackParam();
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const status = strParam(url.search["status"]);
  const sellerId = strParam(url.search["sellerId"]);
  const wilaya = strParam(url.search["wilaya"]);
  const paymentMethod = strParam(url.search["paymentMethod"]);
  const minTotal = strParam(url.search["minTotal"]);
  const maxTotal = strParam(url.search["maxTotal"]);
  const from = strParam(url.search["from"]);
  const to = strParam(url.search["to"]);
  const [search, setSearch] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const setFilter = (patch: Record<string, string | undefined>) => url.set({ ...patch, page: 1 });

  const payload = useMemo(() => {
    const trimmedSearch = q.trim();
    const trimmedWilaya = wilaya.trim();
    const min = minTotal.trim() === "" ? undefined : Number(minTotal);
    const max = maxTotal.trim() === "" ? undefined : Number(maxTotal);
    return {
      page,
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      ...(status ? { status: status as (typeof ORDER_STATUS_OPTIONS)[number] } : {}),
      ...(sellerId ? { sellerId } : {}),
      ...(trimmedWilaya ? { wilaya: trimmedWilaya } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(min !== undefined && Number.isFinite(min) ? { minTotal: min } : {}),
      ...(max !== undefined && Number.isFinite(max) ? { maxTotal: max } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
  }, [q, status, sellerId, wilaya, paymentMethod, minTotal, maxTotal, from, to, page]);

  const ordersQuery = useQuery({
    queryKey: ["admin-orders", payload],
    queryFn: () => listAdminOrders({ data: payload }),
  });
  const sellersQuery = useQuery({
    queryKey: ["admin-sellers-lite"],
    queryFn: () => listAdminSellersLite(),
    select: (data) => data.sellers,
  });

  const orders = ordersQuery.data?.orders ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const pageSize = ordersQuery.data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRevenue = orders.reduce((sum, order) => sum + order.grandTotal, 0);
  const sellers = sellersQuery.data ?? [];

  const hasActiveFilters =
    q.trim() !== "" ||
    status !== "" ||
    sellerId !== "" ||
    wilaya.trim() !== "" ||
    paymentMethod !== "" ||
    minTotal.trim() !== "" ||
    maxTotal.trim() !== "" ||
    from !== "" ||
    to !== "";

  const clearFilters = () => {
    url.set({
      q: undefined,
      status: undefined,
      sellerId: undefined,
      wilaya: undefined,
      paymentMethod: undefined,
      minTotal: undefined,
      maxTotal: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
  };

  return (
    <AdminGate>
      <AdminShell
        title="Orders"
        subtitle="Search, filter and manage every customer order on the marketplace."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Matching orders" value={ordersQuery.isLoading ? "…" : String(total)} />
          <Stat
            label="Revenue on this page"
            value={ordersQuery.isLoading ? "…" : fmtMoney(pageRevenue)}
          />
        </div>

        <AdminCard
          title="Filters"
          actions={
            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  Clear
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="sm:hidden"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="size-4" />
                {filtersOpen ? "Hide" : "Show"}
              </Button>
            </div>
          }
        >
          <div
            className={`grid gap-4 ${filtersOpen ? "" : "hidden"} sm:grid sm:grid-cols-2 lg:grid-cols-4`}
          >
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.common.orderSearchPlaceholder}
                  className="ps-9"
                />
              </div>
            </Field>
            <Field label="Status">
              <Select
                value={status}
                onValueChange={(value) => setFilter({ status: value === "all" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {ORDER_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {statusLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Seller">
              <Select
                value={sellerId}
                onValueChange={(value) => setFilter({ sellerId: value === "all" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All sellers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sellers</SelectItem>
                  {sellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Wilaya">
              <Input
                value={wilaya}
                onChange={(event) => setFilter({ wilaya: event.target.value })}
                placeholder="e.g. Alger"
              />
            </Field>
            <Field label="Payment method">
              <Select
                value={paymentMethod}
                onValueChange={(value) =>
                  setFilter({ paymentMethod: value === "all" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="cod">Cash on delivery</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Min total (DZD)">
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                value={minTotal}
                onChange={(event) => setFilter({ minTotal: event.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Max total (DZD)">
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                value={maxTotal}
                onChange={(event) => setFilter({ maxTotal: event.target.value })}
                placeholder="No limit"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <Input
                  type="date"
                  value={from}
                  onChange={(event) => setFilter({ from: event.target.value })}
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  value={to}
                  onChange={(event) => setFilter({ to: event.target.value })}
                />
              </Field>
            </div>
          </div>
        </AdminCard>

        <AdminCard title={total > 0 ? `${total} order${total === 1 ? "" : "s"}` : "Orders"}>
          {ordersQuery.isLoading ? (
            <TableSkeleton />
          ) : ordersQuery.isError ? (
            <EmptyState
              title="Orders could not be loaded"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => ordersQuery.refetch()}
                >
                  Try again
                </Button>
              }
            />
          ) : orders.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? "No orders match these filters" : "No orders yet"}
              action={
                hasActiveFilters ? (
                  <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-start font-medium">Order</th>
                      <th className="px-3 py-2 text-start font-medium">Date</th>
                      <th className="px-3 py-2 text-start font-medium">Customer</th>
                      <th className="px-3 py-2 text-start font-medium">Phone</th>
                      <th className="px-3 py-2 text-start font-medium">Wilaya</th>
                      <th className="px-3 py-2 text-start font-medium">Sellers</th>
                      <th className="px-3 py-2 text-end font-medium">Items</th>
                      <th className="px-3 py-2 text-end font-medium">Total</th>
                      <th className="px-3 py-2 text-start font-medium">Payment</th>
                      <th className="px-3 py-2 text-start font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            to="/admin/orders/$orderId"
                            params={{ orderId: order.id }}
                            search={{
                              back: backParam,
                              locale,
                              q,
                              status,
                              sellerId,
                              wilaya,
                              paymentMethod,
                              minTotal,
                              maxTotal,
                              from,
                              to,
                              page,
                            }}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                          {fmtDateTime(order.createdAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          {[order.firstName, order.lastName].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2.5 text-muted-foreground"
                          dir="ltr"
                        >
                          {order.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">{order.wilaya || "—"}</td>
                        <td
                          className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground"
                          title={order.sellerNames.join(", ")}
                        >
                          {order.sellerNames.length > 0 ? order.sellerNames.join(", ") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{order.itemCount}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-end font-medium tabular-nums">
                          {fmtMoney(order.grandTotal)}
                        </td>
                        <td className="px-3 py-2.5 capitalize text-muted-foreground">
                          {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill status={order.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Page {safePage} of {totalPages} · {total} order{total === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1 || ordersQuery.isFetching}
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages || ordersQuery.isFetching}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </AdminCard>
      </AdminShell>
    </AdminGate>
  );
}
