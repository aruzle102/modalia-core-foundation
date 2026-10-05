import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listAuditLogs } from "@/lib/admin-catalog.functions";
import { errMsg, Pager } from "./_shared";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAuditPage,
});

function AdminAuditPage() {
  return (
    <AdminGate>
      <AdminShell title="Audit log" subtitle="Read-only record of administrative actions across the platform.">
        <AuditLogViewer />
      </AdminShell>
    </AdminGate>
  );
}

function AuditLogViewer() {
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({ action: "", resource: "" });
  const [expanded, setExpanded] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryKey: ["admin-audit-logs", applied, page],
    queryFn: () =>
      listAuditLogs({
        data: {
          action: applied.action.trim() || undefined,
          resource: applied.resource.trim() || undefined,
          page,
        },
      }),
    retry: false,
  });

  const apply = () => {
    setApplied({ action, resource });
    setPage(1);
  };
  const reset = () => {
    setAction("");
    setResource("");
    setApplied({ action: "", resource: "" });
    setPage(1);
  };

  const logs = logsQuery.data?.logs ?? [];
  const total = logsQuery.data?.total ?? 0;
  const pageSize = logsQuery.data?.pageSize ?? 25;

  return (
    <div className="space-y-6">
      <AdminCard title="Filters">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1 space-y-1.5">
            <Label htmlFor="audit-action">Action (contains)</Label>
            <Input
              id="audit-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. product_approved"
              onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
            />
          </div>
          <div className="min-w-52 flex-1 space-y-1.5">
            <Label htmlFor="audit-resource">Resource (exact)</Label>
            <Input
              id="audit-resource"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              placeholder="e.g. product"
              onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={apply}>Apply</Button>
            <Button variant="outline" onClick={reset}>Reset</Button>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Audit trail" subtitle={`${total} entr${total === 1 ? "y" : "ies"} recorded. Newest first.`}>
        {logsQuery.isPending ? (
          <TableSkeleton />
        ) : logsQuery.isError ? (
          <EmptyState title="Could not load audit logs" text={errMsg(logsQuery.error)} />
        ) : logs.length === 0 ? (
          <EmptyState title="No audit entries" text="Nothing matches these filters yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Resource</th>
                  <th className="px-3 py-2 font-medium">Resource ID</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => {
                  const isOpen = expanded === log["id"];
                  const metadata = log["metadata"] as Record<string, unknown> | null;
                  const hasMetadata =
                    metadata && typeof metadata === "object" && Object.keys(metadata).length > 0;
                  return (
                    <tr key={log["id"]} className="align-top">
                      <td className="px-3 py-3 whitespace-nowrap text-caption">{fmtDateTime(log.created_at)}</td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {log.actor_id ? log.actor_id.slice(0, 8) : "system"}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{log.action}</td>
                      <td className="px-3 py-3 text-caption">{log.resource}</td>
                      <td className="px-3 py-3 font-mono text-xs break-all">
                        {log.resource_id ? log.resource_id.slice(0, 8) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {hasMetadata ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpanded(isOpen ? null : log.id)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? "Hide" : "View"}
                            </Button>
                            {isOpen ? (
                              <pre className="mt-2 max-w-md overflow-x-auto border border-border bg-muted/40 p-3 text-xs leading-5">
                                {JSON.stringify(metadata, null, 2)}
                              </pre>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-caption text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminCard>
    </div>
  );
}
