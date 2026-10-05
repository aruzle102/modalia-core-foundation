import { createFileRoute, Link } from "@tanstack/react-router";
import { useUrlState, useDebouncedUrlParam, useBackParam, numParam, strParam } from "@/hooks/use-url-state";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, Ban, Power, Pencil } from "lucide-react";
import { toast } from "sonner";
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
  ConfirmDialog,
  fmtMoney,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import { listSellers, updateSellerStatus } from "@/lib/admin-sellers.functions";
import { SellerOnboardingWizard } from "@/components/admin/SellerOnboardingWizard";
import { EditSellerDialog } from "@/components/admin/EditSellerDialog";
import { useAdminT } from "@/components/admin/use-admin-t";

export const Route = createFileRoute("/admin/sellers")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: strParam(search["q"]),
    status: strParam(search["status"], "all"),
    page: numParam(search["page"], 1),
    create: strParam(search["create"]),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Sellers — Modalia Admin" }],
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

type StatusAction = "active" | "suspended" | "disabled";

function SellersPage() {
  const t = useAdminT().sellers;
  const url = useUrlState({ status: "all", page: 1 });
  const backParam = useBackParam();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Deep link: /admin/sellers?create=seller opens the onboarding wizard
  // (the real flow that creates a seller together with their store).
  useEffect(() => {
    if (strParam(url.search["create"]) === "seller") setWizardOpen(true);
  }, [url.search["create"]]);  const [confirmAction, setConfirmAction] = useState<{
    sellerId: string;
    accountStatus: StatusAction;
  } | null>(null);
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const accountStatusFilter = strParam(url.search["status"], "all");
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });

  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const setStatusFilter = (next: string) => url.set({ status: next, page: 1 });

  const accountStatus =
    accountStatusFilter === "all"
      ? undefined
      : (accountStatusFilter as "pending" | "active" | "suspended" | "disabled");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-sellers", accountStatus ?? "all", q, page],
    queryFn: () => listSellers({ data: { accountStatus, q: q || undefined, page } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });

  const statusMutation = useMutation({
    mutationFn: (input: { sellerId: string; accountStatus: StatusAction }) =>
      updateSellerStatus({ data: input }),
    onSuccess: (res) => {
      toast.success(t.statusUpdated(res.accountStatus));
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats ?? {};
  const editingSeller = editingId ? items.find((s) => s.id === editingId) : null;

  const confirmMeta = confirmAction
    ? confirmAction.accountStatus === "suspended"
      ? { title: t.confirmSuspendTitle, description: t.confirmSuspendDesc, label: t.suspend, danger: false }
      : confirmAction.accountStatus === "disabled"
        ? { title: t.confirmDeactivateTitle, description: t.confirmDeactivateDesc, label: t.deactivate, danger: true }
        : { title: t.confirmReactivateTitle, description: t.confirmReactivateDesc, label: t.reactivate, danger: false }
    : null;

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
                onValueChange={(v) => setStatusFilter(v)}
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
              <Button onClick={() => setWizardOpen(true)}>
                <UserPlus className="size-4 me-1.5" />
                Create seller &amp; store
              </Button>
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
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pe-4 text-start font-medium">Name</th>
                    <th className="py-2 pe-4 text-start font-medium">Store</th>
                    <th className="py-2 pe-4 text-start font-medium">Status</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.products}</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.orders}</th>
                    <th className="py-2 pe-4 text-end font-medium">{t.sales}</th>
                    <th className="py-2 pe-4 text-end font-medium">Commission</th>
                    <th className="py-2 pe-4 text-start font-medium">Created</th>
                    <th className="py-2 text-end font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((seller) => {
                    const store = Array.isArray(seller.stores) ? seller.stores[0] : null;
                    const s = stats[seller.id] ?? { productCount: 0, orderCount: 0, salesTotal: 0 };
                    return (
                      <tr key={seller.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 pe-4">
                          <Link
                            to="/admin/sellers/$sellerId"
                            params={{ sellerId: seller.id }}
                            search={{ back: backParam, q, status: accountStatusFilter, page, create: "" }}
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
                        <td className="py-3 pe-4">
                          <StatusPill status={seller.account_status} />
                        </td>
                        <td className="py-3 pe-4 text-end tabular-nums">{s.productCount}</td>
                        <td className="py-3 pe-4 text-end tabular-nums">{s.orderCount}</td>
                        <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap">
                          {fmtMoney(s.salesTotal)}
                        </td>
                        <td className="py-3 pe-4 text-end tabular-nums whitespace-nowrap">
                          {(Number(seller.commission_rate) * 100).toFixed(1)}%
                        </td>
                        <td
                          className="py-3 pe-4 whitespace-nowrap text-muted-foreground"
                          title={fmtDateTime(seller.created_at)}
                        >
                          {timeAgo(seller.created_at)}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button size="sm" variant="ghost" asChild>
                              <Link
                                to="/admin/sellers/$sellerId"
                                params={{ sellerId: seller.id }}
                                search={{ back: backParam, q, status: accountStatusFilter, page, create: "" }}
                              >
                                {t.open}
                              </Link>
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(seller.id)}>
                              <Pencil className="size-3.5" />
                              {t.edit}
                            </Button>
                            {seller.account_status === "active" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setConfirmAction({ sellerId: seller.id, accountStatus: "suspended" })}
                                >
                                  <Ban className="size-3.5 me-1" />
                                  {t.suspend}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setConfirmAction({ sellerId: seller.id, accountStatus: "disabled" })}
                                >
                                  {t.deactivate}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmAction({ sellerId: seller.id, accountStatus: "active" })}
                                disabled={statusMutation.isPending}
                              >
                                <Power className="size-3.5 me-1" />
                                {t.reactivate}
                              </Button>
                            )}
                          </div>
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
              <Pager page={page} total={total} pageSize={data?.pageSize ?? 25} onPage={(p) => setPage(p)} />
            </div>
          )}
        </AdminCard>
        <SellerOnboardingWizard
          open={wizardOpen}
          onOpenChange={(open) => {
            setWizardOpen(open);
            if (!open) url.set({ create: undefined });
          }}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });
          }}
        />
        {editingSeller ? (
          <EditSellerDialog
            sellerId={editingSeller.id}
            initial={{
              legal_name: editingSeller.legal_name,
              first_name: editingSeller.first_name,
              last_name: editingSeller.last_name,
              phone: editingSeller.phone,
              email: editingSeller.email,
            }}
            onClose={() => setEditingId(null)}
            onSaved={refresh}
          />
        ) : null}
        <ConfirmDialog
          open={confirmAction !== null}
          onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
          title={confirmMeta?.title ?? ""}
          description={confirmMeta?.description ?? ""}
          confirmLabel={confirmMeta?.label ?? "Confirm"}
          danger={confirmMeta?.danger}
          onConfirm={() => {
            if (confirmAction) statusMutation.mutate(confirmAction);
          }}
        />
      </AdminShell>
    </AdminGate>
  );
}
