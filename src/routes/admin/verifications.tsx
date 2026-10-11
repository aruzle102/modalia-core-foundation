import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Check, X } from "lucide-react";
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
import { StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import {
  listVerificationRequests,
  reviewVerificationRequest,
} from "@/lib/verification.functions";

export const Route = createFileRoute("/admin/verifications")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: strParam(search["status"], "all"),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Verification Requests — Modalia Admin" }],
  }),
  component: VerificationsPage,
});

function VerificationsPage() {
  const { status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["verifications", status],
    queryFn: () => listVerificationRequests({ data: { status } }),
  });

  const review = useMutation({
    mutationFn: (input: { requestId: string; decision: "approved" | "rejected" }) =>
      reviewVerificationRequest({ data: input }),
    onSuccess: () => {
      toast.success("Request reviewed");
      queryClient.invalidateQueries({ queryKey: ["verifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminGate>
      <AdminShell title="Verification requests" subtitle="Store verification badge requests">
        <div className="mb-4 flex items-center gap-3">
          <Select
            value={status}
            onValueChange={(v) => navigate({ search: { status: v } })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
            <DataTable>
              <div className="p-4">
                <TableSkeleton />
              </div>
            </DataTable>
          ) : isError || !data ? (
            <DataTable>
              <EmptyState title="Could not load requests" />
            </DataTable>
          ) : data.length === 0 ? (
            <DataTable>
              <EmptyState
                icon={<BadgeCheck className="h-8 w-8" />}
                title="No verification requests"
                description="Requests from eligible sellers will appear here."
              />
            </DataTable>
          ) : (
            <DataTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th className="px-3 py-3 text-start">Store</th>
                    <th className="px-3 py-3 text-start">Seller</th>
                    <th className="px-3 py-3 text-end">Sales 30d</th>
                    <th className="px-3 py-3 text-end">Views</th>
                    <th className="px-3 py-3 text-start">Requested</th>
                    <th className="px-3 py-3 text-start">Status</th>
                    <th className="px-3 py-3 text-start">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {data.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="px-3 py-3 font-medium">{r.storeName}</td>
                      <td className="px-3 py-3">{r.sellerName}</td>
                      <td className="px-3 py-3 text-end tabular-nums">{r.sales_30d}</td>
                      <td className="px-3 py-3 text-end tabular-nums">{r.unique_views.toLocaleString()}</td>
                      <td className="px-3 py-3">{fmtDateTime(r.requested_at)}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-3 py-3">
                        {r.status === "pending" ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                review.mutate({ requestId: r.id, decision: "approved" })
                              }
                              disabled={review.isPending}
                            >
                              <Check className="me-1 h-3 w-3" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                review.mutate({ requestId: r.id, decision: "rejected" })
                              }
                              disabled={review.isPending}
                            >
                              <X className="me-1 h-3 w-3" /> Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
      </AdminShell>
    </AdminGate>
  );
}
