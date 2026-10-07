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
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
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

        <AdminCard>
          {isLoading ? (
            <TableSkeleton />
          ) : isError || !data ? (
            <EmptyState title="Could not load requests" />
          ) : data.length === 0 ? (
            <EmptyState
              icon={<BadgeCheck className="h-8 w-8" />}
              title="No verification requests"
              text="Requests from eligible sellers will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Store</th>
                    <th className="py-2 pr-4">Seller</th>
                    <th className="py-2 pr-4">Sales 30d</th>
                    <th className="py-2 pr-4">Views</th>
                    <th className="py-2 pr-4">Requested</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.storeName}</td>
                      <td className="py-2 pr-4">{r.sellerName}</td>
                      <td className="py-2 pr-4">{r.sales_30d}</td>
                      <td className="py-2 pr-4">{r.unique_views.toLocaleString()}</td>
                      <td className="py-2 pr-4">{fmtDateTime(r.requested_at)}</td>
                      <td className="py-2 pr-4">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="py-2">
                        {r.status === "pending" ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                review.mutate({ requestId: r.id, decision: "approved" })
                              }
                              disabled={review.isPending}
                            >
                              <Check className="mr-1 h-3 w-3" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                review.mutate({ requestId: r.id, decision: "rejected" })
                              }
                              disabled={review.isPending}
                            >
                              <X className="mr-1 h-3 w-3" /> Reject
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
            </div>
          )}
        </AdminCard>
      </AdminShell>
    </AdminGate>
  );
}
