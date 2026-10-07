import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
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
import {
  listPartnershipRequests,
  updatePartnershipStatus,
} from "@/lib/partnership.functions";

export const Route = createFileRoute("/admin/partnerships")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: strParam(search["status"], "all"),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Partnerships — Modalia Admin" }],
  }),
  component: PartnershipsPage,
});

const STATUSES = ["new", "contacted", "in_progress", "closed", "rejected"] as const;

function PartnershipsPage() {
  const { status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partnerships", status],
    queryFn: () => listPartnershipRequests({ data: { status } }),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; status: (typeof STATUSES)[number] }) =>
      updatePartnershipStatus({ data: input }),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["partnerships"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminGate>
      <AdminShell title="Partnership requests" subtitle="B2B cooperation inbox">
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
            <EmptyState title="Could not load requests" />
          ) : data.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="No partnership requests"
              text="New B2B requests will appear here."
            />
          ) : (
            <div className="space-y-4">
              {data.map((r) => (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{r.companyName}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.contactName} · {r.email}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.partnershipType} · {fmtDateTime(r.createdAt)}
                        {r.website ? ` · ${r.website}` : ""}
                      </p>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-3 text-sm whitespace-pre-wrap">{r.description}</p>
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
