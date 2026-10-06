import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
} from "@/components/admin/ui";
import { Switch } from "@/components/ui/switch";
import { listAdminWilayas } from "@/lib/admin-ops.functions";
import { setWilayaActive } from "@/lib/admin-catalog.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { Pager, errMsg, pickName } from "./_shared";

export const Route = createFileRoute("/admin/wilayas")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Wilayas — Modalia Admin" }],
  }),
  component: WilayasPage,
});

function WilayasPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
  const queryClient = useQueryClient();

  const wilayasQuery = useQuery({
    queryKey: ["admin-wilayas-overview"],
    queryFn: () => listAdminWilayas({ data: {} }),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: (payload: { wilayaId: string; active: boolean }) => setWilayaActive({ data: payload }),
    onSuccess: () => {
      toast.success("Wilaya updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-wilayas-overview"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const items = wilayasQuery.data?.items ?? [];

  return (
    <AdminGate>
      <AdminShell
        title={t.wilayas}
        subtitle="The 58 Algerian wilayas: delivery availability, communes and shipping rules."
        breadcrumbs={[{ label: t.wilayas }]}
      >
        <AdminCard title={t.wilayas} subtitle={`${items.length} wilaya(s)`}>
          {wilayasQuery.isPending ? (
            <TableSkeleton rows={10} />
          ) : wilayasQuery.isError ? (
            <EmptyState title="Could not load wilayas" text={errMsg(wilayasQuery.error)} />
          ) : items.length === 0 ? (
            <EmptyState title="No wilayas" text="The wilayas table has not been seeded yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-start text-small">
                <thead>
                  <tr className="border-b border-border text-caption text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Wilaya</th>
                    <th className="px-3 py-2 font-medium">Communes</th>
                    <th className="px-3 py-2 font-medium">Shipping rules</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Deliverable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/40">
                      <td className="px-3 py-3 font-mono">{w.code}</td>
                      <td className="px-3 py-3 font-medium">{pickName(w.name)}</td>
                      <td className="px-3 py-3">
                        <Link
                          to="/admin/communes"
                          search={{ locale, wilaya: w.id, q: "", page: 1 }}
                          className="underline-offset-4 hover:underline"
                        >
                          {w.commune_count}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          to="/admin/shipping"
                          search={{ locale, wilaya: w.id }}
                          className="underline-offset-4 hover:underline"
                        >
                          {w.rule_count}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={w.active ? "active" : "inactive"} />
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(w.active)}
                          onCheckedChange={(active) => toggle.mutate({ wilayaId: w.id, active })}
                          aria-label={`Toggle wilaya ${pickName(w.name)}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </AdminShell>
    </AdminGate>
  );
}
