import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
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
import { Pager } from "./_shared";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import { listSellers } from "@/lib/admin-sellers.functions";

export const Route = createFileRoute("/admin/sellers")({
  head: () => ({
    meta: [{ title: "Sellers — Modalia Admin" }],
  }),
  component: SellersPage,
});

const ACCOUNT_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "disabled", label: "Disabled" },
] as const;

function SellersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const accountStatus =
    accountStatusFilter === "all"
      ? undefined
      : (accountStatusFilter as "pending" | "active" | "suspended" | "disabled");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-sellers", accountStatus ?? "all", q, page],
    queryFn: () => listSellers({ data: { accountStatus, q: q || undefined, page } }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <AdminGate>
      <AdminShell
        title="Sellers"
        subtitle="Manage seller accounts, stores, verification, and commissions."
      >
        <AdminCard
          title="Sellers"
          subtitle={`${total} total`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, email, phone, store…"
                  className="w-64 ps-8"
                />
              </div>
              <Select
                value={accountStatusFilter}
                onValueChange={(v) => {
                  setAccountStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Account status" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        >
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : isError ? (
            <EmptyState
              title="Could not load sellers"
              text="Something went wrong while fetching the sellers."
              action={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState title="No sellers found" text="Try adjusting the search or filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pe-4 text-start font-medium">Seller</th>
                    <th className="py-2 pe-4 text-start font-medium">Store</th>
                    <th className="py-2 pe-4 text-start font-medium">Phone</th>
                    <th className="py-2 pe-4 text-start font-medium">Account</th>
                    <th className="py-2 pe-4 text-start font-medium">Verification</th>
                    <th className="py-2 pe-4 text-start font-medium">Commission</th>
                    <th className="py-2 text-start font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((seller) => {
                    const store = Array.isArray(seller.stores) ? seller.stores[0] : null;
                    return (
                      <tr key={seller.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 pe-4">
                          <Link
                            to="/admin/sellers/$sellerId"
                            params={{ sellerId: seller.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {seller.legal_name}
                          </Link>
                          <p className="max-w-52 truncate text-xs text-muted-foreground">
                            {seller.email ?? "—"}
                          </p>
                        </td>
                        <td className="py-3 pe-4">
                          {store ? (
                            <>
                              <span className="font-medium">{store.name}</span>
                              <p className="text-xs text-muted-foreground" dir="ltr">
                                /{store.slug}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pe-4 whitespace-nowrap" dir="ltr">
                          {seller.phone ?? "—"}
                        </td>
                        <td className="py-3 pe-4">
                          <StatusPill status={seller.account_status} />
                        </td>
                        <td className="py-3 pe-4">
                          {store ? (
                            <StatusPill status={store.verification_status} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pe-4 whitespace-nowrap">
                          {(Number(seller.commission_rate) * 100).toFixed(1)}%
                        </td>
                        <td
                          className="py-3 whitespace-nowrap text-muted-foreground"
                          title={fmtDateTime(seller.created_at)}
                        >
                          {timeAgo(seller.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 && (
            <div className="mt-4">
              <Pager page={page} total={total} pageSize={data?.pageSize ?? 25} onPage={setPage} />
            </div>
          )}
        </AdminCard>
      </AdminShell>
    </AdminGate>
  );
}
