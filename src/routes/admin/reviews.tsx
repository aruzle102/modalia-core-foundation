import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  Field,
  fmtDateTime,
} from "@/components/admin/ui";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAdminReviews, moderateReview, type ReviewQueue } from "@/lib/admin-catalog.functions";
import { errMsg, pickName, Pager } from "./_shared";
import { numParam, strParam, useUrlState } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/reviews")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: strParam(search["tab"], "pending"),
    page: numParam(search["page"], 1),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AdminReviewsPage,
});

const QUEUES: { value: ReviewQueue; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "flagged", label: "Flagged" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "hidden", label: "Hidden" },
];

function AdminReviewsPage() {
  const locale = useAdminLocale();
  const nav = getTranslations(locale).adminNav.items;
  return (
    <AdminGate>
      <AdminShell
        title="Reviews"
        subtitle="Moderate customer reviews and handle abuse reports."
        breadcrumbs={[{ label: nav.reviews }]}
      >
        <ReviewsManager />
      </AdminShell>
    </AdminGate>
  );
}

function ReviewsManager() {
  const locale = useAdminLocale();
  const queryClient = useQueryClient();
  const url = useUrlState({ tab: "pending", page: 1 });
  const queue = strParam(url.search["tab"], "pending") as ReviewQueue;
  const page = numParam(url.search["page"], 1);
  const setQueue = (next: ReviewQueue) => url.set({ tab: next, page: 1 }, { push: true });
  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const [moderating, setModerating] = useState<{ id: string; decision: "approve" | "reject" | "hide" } | null>(null);

  const reviewsQuery = useQuery({
    queryKey: ["admin-reviews", queue, page],
    queryFn: () => listAdminReviews({ data: { queue, page } }),
    retry: false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });

  const moderate = useMutation({
    mutationFn: (payload: { id: string; decision: "approve" | "reject" | "hide"; reason?: string }) =>
      moderateReview({ data: payload }),
    onSuccess: () => {
      toast.success("Review moderated.");
      setModerating(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const reviews = reviewsQuery.data?.reviews ?? [];
  const total = reviewsQuery.data?.total ?? 0;
  const pageSize = reviewsQuery.data?.pageSize ?? 25;

  return (
    <div className="space-y-6">
      <Tabs value={queue} onValueChange={(v) => setQueue(v as ReviewQueue)}>
        <TabsList>
          {QUEUES.map((q) => (
            <TabsTrigger key={q.value} value={q.value}>{q.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <AdminCard
        title={`${QUEUES.find((q) => q.value === queue)?.label} reviews`}
        subtitle={`${total} review(s) in this queue.`}
      >
        {reviewsQuery.isPending ? (
          <TableSkeleton />
        ) : reviewsQuery.isError ? (
          <EmptyState title="Could not load reviews" text={errMsg(reviewsQuery.error)} />
        ) : reviews.length === 0 ? (
          <EmptyState title="Queue is empty" text="Nothing needs attention here right now." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Review</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Rating</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reviews.map((r) => {
                  const product = r.products;
                  const reviewer = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Anonymous";
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="max-w-md whitespace-pre-wrap">{r.body ?? "—"}</p>
                        {r.image_url ? (
                          <a href={r.image_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                            <img
                              src={r.image_url}
                              alt="Review attachment"
                              className="size-20 rounded-lg border border-border object-cover"
                            />
                          </a>
                        ) : null}
                        <p className="mt-1 text-caption text-muted-foreground">
                          {reviewer} · {fmtDateTime(r.created_at, locale)}
                          {r.verified_purchase ? " · verified purchase" : ""}
                          {r.flagged_at ? " · flagged" : ""}
                        </p>
                        {r.moderation_reason ? (
                          <p className="mt-1 text-caption text-brand">
                            Note: {r.moderation_reason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-caption">
                        {pickName(product.name) || product.slug || r.product_id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.rating} / 5</td>
                      <td className="px-3 py-3"><StatusPill status={r.moderation_status} /></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setModerating({ id: r.id, decision: "approve" })}
                            disabled={moderate.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setModerating({ id: r.id, decision: "reject" })}
                            disabled={moderate.isPending}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setModerating({ id: r.id, decision: "hide" })}
                            disabled={moderate.isPending}
                          >
                            Hide
                          </Button>
                        </div>
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

      {moderating ? (
        <ModerateReviewDialog
          id={moderating.id}
          decision={moderating.decision}
          onClose={() => setModerating(null)}
          onConfirm={(reason) => {
            const trimmed = (reason ?? "").trim();
            moderate.mutate(
              trimmed
                ? { id: moderating.id, decision: moderating.decision, reason: trimmed }
                : { id: moderating.id, decision: moderating.decision },
            );
          }}
          pending={moderate.isPending}
        />
      ) : null}
    </div>
  );
}

function ModerateReviewDialog({
  id: _id,
  decision,
  onClose,
  onConfirm,
  pending,
}: {
  id: string;
  decision: "approve" | "reject" | "hide";
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const needsReason = decision !== "approve";
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === "approve" ? "Approve review" : decision === "reject" ? "Reject review" : "Hide review"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label={needsReason ? "Reason (required)" : "Note (optional)"}
            hint="Recorded in the audit trail."
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={needsReason ? "Why is this review being removed?" : "Optional context…"}
              rows={3}
            />
          </Field>
          {needsReason ? (
            <div className="space-y-1.5">
              <Label>Quick reasons</Label>
              <div className="flex flex-wrap gap-2">
                {["Spam", "Abuse", "Off-topic", "Fake review"].map((r) => (
                  <Button key={r} size="sm" variant="outline" onClick={() => setReason(r)}>
                    {r}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onConfirm(reason.trim() || undefined)}
            disabled={pending || (needsReason && !reason.trim())}
            variant={decision === "approve" ? "default" : "destructive"}
          >
            {pending ? "Working…" : decision === "approve" ? "Approve" : decision === "reject" ? "Reject" : "Hide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
