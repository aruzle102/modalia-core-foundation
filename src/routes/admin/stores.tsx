import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, errMsg } from "./_shared";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAdminStores } from "@/lib/admin-ops.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { numParam, strParam, useUrlState, useDebouncedUrlParam } from "@/hooks/use-url-state";

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
  const url = useUrlState({ status: "all", page: 1 });
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
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
    queryKey: ["admin-stores", q, status ?? "all", page],
    queryFn: () => listAdminStores({ data: { q: q || undefined, status, page } }),
    retry: false,
  });

  const items = storesQuery.data?.items ?? [];
  const total = storesQuery.data?.total ?? 0;

  return (
    <AdminGate>
      <AdminShell
        title={t.stores}
        subtitle="Every storefront on the marketplace, with its seller and catalog size."
        breadcrumbs={[{ label: t.stores }]}
      >
        <AdminCard
          title={t.stores}
          subtitle={`${total} store(s)`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name or slug…"
                  className="w-52 pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          {storesQuery.isPending ? (
            <TableSkeleton />
          ) : storesQuery.isError ? (
            <EmptyState title="Could not load stores" text={errMsg(storesQuery.error)} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No stores yet"
              text="Stores are created when a seller application is approved."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-small">
                <thead>
                  <tr className="border-b border-border text-caption text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Store</th>
                    <th className="px-3 py-2 font-medium">Seller</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Verification</th>
                    <th className="px-3 py-2 font-medium">Products</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="px-3 py-3">
                        <Link
                          to="/store/$slug"
                          params={{ slug: s.slug }}
                          search={{ locale }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {s.name}
                        </Link>
                        <p className="text-caption text-muted-foreground">/{s.slug}</p>
                      </td>
                      <td className="px-3 py-3 text-caption">{s.seller_legal_name ?? "—"}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={s.verification_status} />
                      </td>
                      <td className="px-3 py-3 font-medium">{s.product_count}</td>
                      <td className="px-3 py-3 text-caption text-muted-foreground">
                        {fmtDateTime(s.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={storesQuery.data?.pageSize ?? 25} onPage={setPage} />
        </div>
      </AdminShell>
    </AdminGate>
  );
}
