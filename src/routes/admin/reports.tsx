import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { strParam } from "@/hooks/use-url-state";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
import { listProblemReports, updateProblemReport } from "@/lib/problem-reports.functions";

export const Route = createFileRoute("/admin/reports")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: strParam(search["status"], "all"),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Problem reports — Modalia Admin" }],
  }),
  component: ReportsPage,
});

const STATUSES = ["new", "in_review", "resolved", "closed"] as const;

function ReportsPage() {
  const { status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["problem-reports", status],
    queryFn: () => listProblemReports({ data: { status } }),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; status: (typeof STATUSES)[number] }) =>
      updateProblemReport({ data: input }),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["problem-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminGate>
      <AdminShell title="Problem reports" subtitle="User-reported issues">
        <div className="mb-4">
          <Select value={status} onValueChange={(v) => navigate({ search: { status: v } as any })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AdminCard>
          {isLoading ? (
            <TableSkeleton />
          ) : isError || !data ? (
            <EmptyState title="Could not load reports" />
          ) : data.length === 0 ? (
            <EmptyState
              icon={<Flag className="h-8 w-8" />}
              title="No problem reports"
              text="User reports will appear here."
            />
          ) : (
            <div className="space-y-4">
              {data.map((r) => (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{r.subject}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.category}
                        {r.reporterName ? ` · ${r.reporterName}` : ""}
                        {r.reporterEmail ? ` · ${r.reporterEmail}` : ""}
                        {r.reporterPhone ? ` · ${r.reporterPhone}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</p>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-3 text-sm whitespace-pre-wrap">{r.description}</p>
                  {r.imageUrls.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {r.imageUrls.length} image{r.imageUrls.length > 1 ? "s" : ""} attached
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STATUSES.filter((s) => s !== r.status).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: r.id, status: s })}
                      >
                        Mark {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </AdminShell>
    </AdminGate>
  );
}
