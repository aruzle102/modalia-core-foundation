/**
 * Seller warnings inbox — moderation notices from admin
 * (product deleted/rejected/hidden, or plain warnings).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/ui";
import { getMyWarnings, acknowledgeWarning } from "@/lib/seller-warnings.functions";

const ACTION_LABELS: Record<string, string> = {
  notice: "Notice",
  product_deleted: "Product deleted",
  product_rejected: "Product rejected",
  product_hidden: "Product hidden",
};

export function WarningsInbox() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["seller-warnings"],
    queryFn: () => getMyWarnings(),
  });
  const ack = useMutation({
    mutationFn: (id: string) => acknowledgeWarning({ data: { warningId: id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seller-warnings"] }),
  });

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  const unacked = data.filter((w) => !w.acknowledgedAt);

  return (
    <AdminCard title="Moderation warnings" className="mt-6 border-amber-200">
      <div className="space-y-3">
        {unacked.length > 0 ? (
          <p className="text-sm font-medium text-amber-700">
            You have {unacked.length} unread warning{unacked.length > 1 ? "s" : ""}.
          </p>
        ) : null}
        {data.map((w) => (
          <div
            key={w.id}
            className={`rounded-lg border p-3 ${w.acknowledgedAt ? "opacity-60" : "border-amber-300 bg-amber-50"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium">{ACTION_LABELS[w.actionTaken] ?? w.actionTaken}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{w.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(w.issuedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {!w.acknowledgedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => ack.mutate(w.id)}
                  disabled={ack.isPending}
                >
                  <Check className="mr-1 h-3 w-3" /> Got it
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
