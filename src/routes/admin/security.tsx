import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminGate } from "@/components/admin/AdminGate";
import { SuperAdminGate } from "@/components/admin/SuperAdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  Stat,
  EmptyState,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
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
          <EmptyState title="Could not load security overview" text={errMsg(securityQuery.error)} />
        ) : !data ? null : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.roleCounts.map((r) => (
                <AdminCard key={r.role}>
                  <Stat label={ROLE_LABELS[r.role] ?? r.role} value={r.count} />
                </AdminCard>
              ))}
              <AdminCard>
                <Stat
                  label="Password reset required"
                  value={data.passwordResetRequired}
                  hint="Sellers that must reset their password"
                />
              </AdminCard>
            </div>

            <AdminCard title="Super admins" subtitle="Users with full platform access.">
              {data.superAdmins.length === 0 ? (
                <EmptyState title="No super admins found" text="Nobody currently holds the super_admin role." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-start text-small">
                    <thead>
                      <tr className="border-b border-border text-caption text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">User ID</th>
                        <th className="px-3 py-2 font-medium">Granted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.superAdmins.map((a) => (
                        <tr key={a.user_id}>
                          <td className="px-3 py-3 font-medium">{a.display_name ?? "—"}</td>
                          <td className="px-3 py-3 font-mono text-caption">{a.user_id.slice(0, 8)}…</td>
                          <td className="px-3 py-3 text-caption text-muted-foreground">
                            {fmtDateTime(a.created_at, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminCard>

            <AdminCard
              title="Recent security events"
              subtitle="Audit log entries related to passwords, logins, roles and sessions."
            >
              {data.recentSecurityEvents.length === 0 ? (
                <EmptyState title="No security events" text="Nothing security-related has been logged yet." />
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
