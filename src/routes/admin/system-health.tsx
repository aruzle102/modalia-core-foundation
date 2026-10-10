import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState, TableSkeleton } from "@/components/admin/ui";
import { runSystemHealthChecks, type HealthCheck, type HealthStatus } from "@/lib/system-health.functions";
import { getLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/system-health")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "System Health — Modalia Admin" }],
  }),
  component: SystemHealthPage,
});

const STATUS_META: Record<HealthStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  healthy: { icon: CheckCircle2, label: "Healthy", className: "text-emerald-600" },
  warning: { icon: AlertTriangle, label: "Warning", className: "text-amber-600" },
  error: { icon: XCircle, label: "Error", className: "text-destructive" },
};

function CheckRow({ check }: { check: HealthCheck }) {
  const meta = STATUS_META[check.status];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.className)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {check.label}
          <span className={cn("ms-2 text-xs font-semibold uppercase tracking-wide", meta.className)}>
            {meta.label}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{check.message}</p>
      </div>
    </li>
  );
}

function SystemHealthPage() {
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: () => runSystemHealthChecks(),
    retry: false,
    staleTime: 60_000,
  });

  const checks = data?.checks ?? [];
  const byCategory = new Map<string, HealthCheck[]>();
  for (const c of checks) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  const errors = checks.filter((c) => c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warning").length;

  return (
    <AdminGate>
      <AdminShell
        title="System Health"
        subtitle={
          data
            ? `Last checked ${new Date(data.ranAt).toLocaleString()} — ${errors} errors, ${warnings} warnings`
            : "Run safe, read-only diagnostics across the platform."
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              toast.promise(refetch().then((r) => { if (r.error) throw r.error; }), {
                loading: "Running diagnostics…",
                success: "Diagnostics complete",
                error: "Diagnostics failed",
              });
            }}
            disabled={isFetching}
          >
            <RefreshCw className={cn("mr-1 h-4 w-4", isFetching && "animate-spin")} />
            Re-run checks
          </Button>
        }
      >
        {isPending ? (
          <AdminCard title="Diagnostics">
            <TableSkeleton />
          </AdminCard>
        ) : isError || !data ? (
          <AdminCard title="Diagnostics">
            <EmptyState
              icon={<Activity className="h-8 w-8" />}
              title="Could not run diagnostics"
              text="The health check service failed. Please try again."
            />
          </AdminCard>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...byCategory.entries()].map(([category, list]) => (
              <AdminCard key={category} title={category}>
                <ul className="divide-y divide-border">
                  {list.map((c) => (
                    <CheckRow key={c.id} check={c} />
                  ))}
                </ul>
              </AdminCard>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Diagnostics are read-only and never expose secrets, credentials, or connection details.
        </p>
      </AdminShell>
    </AdminGate>
  );
}
