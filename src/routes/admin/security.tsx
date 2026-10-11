import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminGate } from "@/components/admin/AdminGate";
import { SuperAdminGate } from "@/components/admin/SuperAdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
import { DataTable, EmptyState, StatCard } from "@/components/dashboard";
import { getSecurityOverview } from "@/lib/admin-ops.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/security")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Security — Modalia Admin" }],
  }),
  component: SecurityPage,
});

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admins",
  seller_owner: "Seller owners",
  seller_staff: "Seller staff",
  customer: "Customers",
};

function SecurityPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;

  const securityQuery = useQuery({
    queryKey: ["admin-security"],
    queryFn: () => getSecurityOverview({ data: {} }),
    retry: false,
  });

  const data = securityQuery.data;

  return (
    <AdminGate>
      <SuperAdminGate>
      <AdminShell
        title={t.security}
        subtitle="Who holds which role, pending password resets and recent security events."
        breadcrumbs={[{ label: t.security }]}
      >
        {securityQuery.isPending ? (
          <TableSkeleton rows={6} />
        ) : securityQuery.isError ? (
          <EmptyState title="Could not load security overview" description={errMsg(securityQuery.error)} />
        ) : !data ? null : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.roleCounts.map((r) => (
                <StatCard key={r.role} title={ROLE_LABELS[r.role] ?? r.role} value={r.count} />
              ))}
              <StatCard
                title="Password reset required"
                value={data.passwordResetRequired}
                description="Sellers that must reset their password"
              />
            </div>

            <section aria-label="Super admins">
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">Super admins</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Users with full platform access.</p>
              </div>
              {data.superAdmins.length === 0 ? (
                <DataTable>
                  <EmptyState
                    title="No super admins found"
                    description="Nobody currently holds the super_admin role."
                  />
                </DataTable>
              ) : (
                <DataTable>
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                        <th className="px-3 py-3 text-start">Name</th>
                        <th className="px-3 py-3 text-start">User ID</th>
                        <th className="px-3 py-3 text-start">Granted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {data.superAdmins.map((a) => (
                        <tr key={a.user_id} className="hover:bg-muted/40">
                          <td className="px-3 py-3 font-medium">{a.display_name ?? "—"}</td>
                          <td className="px-3 py-3 font-mono text-xs">{a.user_id.slice(0, 8)}…</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {fmtDateTime(a.created_at, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
              )}
            </section>

            <AdminCard
              title="Recent security events"
              subtitle="Audit log entries related to passwords, logins, roles and sessions."
            >
              {data.recentSecurityEvents.length === 0 ? (
                <EmptyState
                  title="No security events"
                  description="Nothing security-related has been logged yet."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentSecurityEvents.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="font-mono text-small">{e.action}</p>
                        {e.resource ? (
                          <p className="text-caption text-muted-foreground">{e.resource}</p>
                        ) : null}
                      </div>
                      <p className="text-caption text-muted-foreground">{fmtDateTime(e.created_at, locale)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </div>
        )}
      </AdminShell>
      </SuperAdminGate>
    </AdminGate>
  );
}
