import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useUrlState, useDebouncedUrlParam, useBackParam, numParam, strParam } from "@/hooks/use-url-state";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Ban, Power, Pencil } from "lucide-react";
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
  TableSkeleton,
  ConfirmDialog,
  fmtMoney,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import { DataTable, EmptyState, ErrorState } from "@/components/dashboard";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
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

const ACCOUNT_STATUS_VALUES = ["all", "pending", "active", "suspended", "disabled"] as const;

type StatusAction = "active" | "suspended" | "disabled";

function SellersPage() {
  // Child route ($sellerId) renders in the Outlet; this route shows the table.
  const child = useMatch({ from: "/admin/sellers", strict: true, shouldThrow: false });
  if (!child) return <Outlet />;
  return <SellersList />;
}

function SellersList() {
  const locale = useAdminLocale();
  const t = useAdminT().sellers;
  const nav = getTranslations(locale).adminNav.items;
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
        title={t.title}
        subtitle={t.subtitle}
        breadcrumbs={[{ label: nav.sellers }]}
      >
        <AdminCard
          title={t.title}
          subtitle={t.totalSellers(total)}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t.searchPh}
                  className="w-64 ps-8"
                />
              </div>
              <Select
                value={accountStatusFilter}
                onValueChange={(v) => setStatusFilter(v)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t.statusFilter} />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_STATUS_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t.statusLabels[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

            </div>
          }
        >
          {isLoading ? (
            <DataTable>
              <div className="p-4">
                <TableSkeleton rows={8} />
              </div>
            </DataTable>
          ) : isError ? (
            <DataTable>
              <ErrorState
                title={t.listLoadError}
                description={t.listLoadErrorText}
                action={
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    {t.retry}
                  </Button>
                }
              />
            </DataTable>
          ) : items.length === 0 ? (
            <DataTable>
              <EmptyState title={t.noSellers} description={t.adjustFilters} />
            </DataTable>
          ) : (
            <DataTable>
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th className="px-3 py-3 text-start">{t.colName}</th>
                    <th className="px-3 py-3 text-start">{t.colStore}</th>
                    <th className="px-3 py-3 text-start">{t.colStatus}</th>
                    <th className="px-3 py-3 text-end">{t.products}</th>
                    <th className="px-3 py-3 text-end">{t.orders}</th>
                    <th className="px-3 py-3 text-end">{t.sales}</th>
                    <th className="px-3 py-3 text-end">{t.colCommission}</th>
                    <th className="px-3 py-3 text-start">{t.colCreated}</th>
                    <th className="px-3 py-3 text-end">{t.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {items.map((seller) => {
                    const store = Array.isArray(seller.stores) ? seller.stores[0] : null;
                    const s = stats[seller.id] ?? { productCount: 0, orderCount: 0, salesTotal: 0 };
                    return (
                      <tr key={seller.id} className="hover:bg-muted/40">
                        <td className="px-3 py-3">
                          <Link
                            to="/admin/sellers/$sellerId"
                            params={{ sellerId: seller.id }}
                            search={{ back: backParam, tab: "overview", q, status: accountStatusFilter, page, create: "" }}
                            className="font-medium text-primary hover:underline"
                          >
                            {seller.legal_name}
                          </Link>
                          <p className="max-w-52 truncate text-xs text-muted-foreground">
                            {seller.email ?? "—"}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          {store ? (
                            <>
                              <span className="font-medium">{store.name}</span>
                              <p className="text-xs text-muted-foreground" dir="ltr">
                                /{store.slug}
                              </p>
                              <p className="mt-1">
                                <StatusPill status={store.verification_status} />
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={seller.account_status} />
                        </td>
                        <td className="px-3 py-3 text-end tabular-nums">{s.productCount}</td>
                        <td className="px-3 py-3 text-end tabular-nums">{s.orderCount}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-end tabular-nums">
                          {fmtMoney(s.salesTotal, "DZD", locale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-end tabular-nums">
                          {(Number(seller.commission_rate) * 100).toFixed(1)}%
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3 text-muted-foreground"
                          title={fmtDateTime(seller.created_at, locale)}
                        >
                          {timeAgo(seller.created_at, locale)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button size="sm" variant="ghost" asChild>
                              <Link
                                to="/admin/sellers/$sellerId"
                                params={{ sellerId: seller.id }}
                                search={{ back: backParam, tab: "overview", q, status: accountStatusFilter, page, create: "" }}
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
            </DataTable>
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
          confirmLabel={confirmMeta?.label}
          danger={confirmMeta?.danger}
          onConfirm={() => {
            if (confirmAction) statusMutation.mutate(confirmAction);
          }}
        />
      </AdminShell>
    </AdminGate>
  );
}
