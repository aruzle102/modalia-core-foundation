import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, errMsg, pickName } from "./_shared";
import { StatusPill, TableSkeleton } from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listAdminCommunes } from "@/lib/admin-ops.functions";
import { listWilayas, setCommuneActive } from "@/lib/admin-catalog.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { numParam, strParam, useUrlState, useDebouncedUrlParam } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/communes")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    wilaya: strParam(search["wilaya"]),
    q: strParam(search["q"]),
    page: numParam(search["page"], 1),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Communes — Modalia Admin" }],
  }),
  component: CommunesPage,
});

function CommunesPage() {
  const url = useUrlState({ wilaya: "", page: 1 });
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
  const queryClient = useQueryClient();
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const wilayaId = strParam(url.search["wilaya"]) || undefined;
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const setWilaya = (next: string) => url.set({ wilaya: next === "all" ? "" : next, page: 1 });

  const wilayasQuery = useQuery({
    queryKey: ["admin-wilayas"],
    queryFn: () => listWilayas(),
    retry: false,
  });
  const wilayas = wilayasQuery.data?.wilayas ?? [];

  const communesQuery = useQuery({
    queryKey: ["admin-communes-overview", wilayaId ?? "all", q, page],
    queryFn: () => listAdminCommunes({ data: { wilayaId, q: q || undefined, page } }),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: (payload: { communeId: string; active: boolean }) => setCommuneActive({ data: payload }),
    onSuccess: () => {
      toast.success("Commune updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-communes-overview"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const items = communesQuery.data?.items ?? [];
  const total = communesQuery.data?.total ?? 0;

  return (
    <AdminGate>
      <AdminShell
        title={t.communes}
        subtitle="Toggle which communes are deliverable, per wilaya."
        breadcrumbs={[{ label: t.communes }]}
      >
        <section aria-label={t.communes}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t.communes}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{`${total} commune(s)`}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-44">
                <Label className="sr-only">Wilaya</Label>
                <Select value={wilayaId ?? "all"} onValueChange={setWilaya}>
                  <SelectTrigger><SelectValue placeholder="All wilayas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All wilayas</SelectItem>
                    {wilayas.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.code} — {pickName(w.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search code…"
                  className="w-44 ps-9"
                />
              </div>
            </div>
          </div>
          {communesQuery.isPending ? (
            <DataTable>
              <div className="p-4">
                <TableSkeleton />
              </div>
            </DataTable>
          ) : communesQuery.isError ? (
            <DataTable>
              <EmptyState title="Could not load communes" description={errMsg(communesQuery.error)} />
            </DataTable>
          ) : items.length === 0 ? (
            <DataTable>
              <EmptyState title="No communes" description="No communes match this filter." />
            </DataTable>
          ) : (
            <DataTable>
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th className="px-3 py-3 text-start">Code</th>
                    <th className="px-3 py-3 text-start">Commune</th>
                    <th className="px-3 py-3 text-start">Wilaya</th>
                    <th className="px-3 py-3 text-start">Status</th>
                    <th className="px-3 py-3 text-start">Deliverable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="px-3 py-3 font-mono">{c.code}</td>
                      <td className="px-3 py-3 font-medium">{pickName(c.name) || "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {c.wilaya_code} — {pickName(c.wilaya_name)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={c.active ? "active" : "inactive"} />
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(c.active)}
                          onCheckedChange={(active) => toggle.mutate({ communeId: c.id, active })}
                          aria-label={`Toggle commune ${pickName(c.name)}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
        </section>
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={communesQuery.data?.pageSize ?? 25} onPage={setPage} />
        </div>
      </AdminShell>
    </AdminGate>
  );
}
