import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, errMsg } from "./_shared";
import { StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAdminStores } from "@/lib/admin-ops.functions";
import { searchStores } from "@/lib/admin-stores.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { numParam, strParam, useUrlState, useDebouncedUrlParam, useBackParam } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/stores")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    q: strParam(search["q"]),
    status: strParam(search["status"], "all"),
    page: numParam(search["page"], 1),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Stores — Modalia Admin" }],
  }),
  component: StoresPage,
});

function StoresPage() {
  // Child route ($storeId) renders in the Outlet; this route shows the table.
  // (Same pattern as /admin/products and /admin/sellers.)
  const child = useMatch({ from: "/admin/stores", strict: true, shouldThrow: false });
  if (!child) return <Outlet />;
  return <StoresList />;
}

function StoresList() {
  const url = useUrlState({ status: "all", page: 1 });
  const backParam = useBackParam();
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
  const st = getTranslations(locale).admin.stores;
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const statusFilter = strParam(url.search["status"], "all");
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const setStatus = (next: string) => url.set({ status: next, page: 1 });

  const status = statusFilter === "all" ? undefined : (statusFilter as "draft" | "active" | "suspended" | "closed");

  const storesQuery = useQuery({
    queryKey: q ? ["admin-stores-search", q] : ["admin-stores", q, status ?? "all", page],
    queryFn: async () => {
      if (q) {
        // Fast server-side lookup across store name/slug + seller
        // name/email/phone/username. Clicking a result opens the store's
        // Control Center.
        const items = await searchStores({ data: { q } });
        return { items, total: items.length, page: 1, pageSize: items.length || 1 };
      }
      return listAdminStores({ data: { q: q || undefined, status, page } });
    },
    retry: false,
  });

  const items = storesQuery.data?.items ?? [];
  const total = storesQuery.data?.total ?? 0;

  return (
    <AdminGate>
      <AdminShell
        title={t.stores}
        subtitle={st.subtitle}
        breadcrumbs={[{ label: t.stores }]}
      >
        <section aria-label={t.stores}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t.stores}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{st.storesCount(total)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={st.searchPlaceholder}
                  className="w-52 ps-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{st.allStatuses}</SelectItem>
                  <SelectItem value="draft">{st.statusDraft}</SelectItem>
                  <SelectItem value="active">{st.statusActive}</SelectItem>
                  <SelectItem value="suspended">{st.statusSuspended}</SelectItem>
                  <SelectItem value="closed">{st.statusClosed}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {storesQuery.isPending ? (
            <DataTable>
              <div className="p-4">
                <TableSkeleton />
              </div>
            </DataTable>
          ) : storesQuery.isError ? (
            <DataTable>
              <EmptyState title={st.couldNotLoad} description={errMsg(storesQuery.error)} />
            </DataTable>
          ) : items.length === 0 ? (
            <DataTable>
              <EmptyState title={st.noStores} description={st.noStoresDesc} />
            </DataTable>
          ) : (
            <DataTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th className="px-3 py-3 text-start">{st.store}</th>
                    <th className="px-3 py-3 text-start">{st.seller}</th>
                    <th className="px-3 py-3 text-start">{st.status}</th>
                    <th className="px-3 py-3 text-start">{st.verification}</th>
                    <th className="px-3 py-3 text-end">{st.products}</th>
                    <th className="px-3 py-3 text-start">{st.created}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {items.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="px-3 py-3">
                        <Link
                          to="/admin/stores/$storeId"
                          params={{ storeId: s.id }}
                          search={{ back: backParam, tab: "overview", locale, q, status: statusFilter, page }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {s.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">/{s.slug}</p>
                      </td>
                      <td className="px-3 py-3 text-xs">{s.seller_legal_name ?? "—"}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={s.verification_status} />
                      </td>
                      <td className="px-3 py-3 text-end font-medium tabular-nums">{s.product_count}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {fmtDateTime(s.created_at, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
        </section>
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={storesQuery.data?.pageSize ?? 25} onPage={setPage} />
        </div>
      </AdminShell>
    </AdminGate>
  );
}
