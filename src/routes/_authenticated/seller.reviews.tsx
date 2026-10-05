import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Flag, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCard, EmptyState, StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { listSellerReviews, flagReviewForRemoderation } from "@/lib/seller-orders.functions";
import { getLocale } from "@/lib/i18n";
import { numParam, strParam, useUrlState } from "@/hooks/use-url-state";
import { SellerShell } from "@/components/seller/SellerShell";
import { errMsg, Pager } from "../admin/_shared";

export const Route = createFileRoute("/_authenticated/seller/reviews")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    queue: strParam(search["queue"], "all"),
    page: numParam(search["page"], 1),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Reviews — Seller — Modalia" }, { name: "description", content: "Reviews on your products." }] }),
  component: SellerReviewsPage,
});

const QUEUES = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "flagged", label: "Flagged" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "hidden", label: "Hidden" },
] as const;

type Queue = (typeof QUEUES)[number]["value"];

function SellerReviewsPage() {
  const { locale } = Route.useSearch();
  const url = useUrlState({ queue: "all", page: 1 });
  const queue = strParam(url.search["queue"], "all") as Queue;
  const page = numParam(url.search["page"], 1);
  const queryClient = useQueryClient();

  const setQueue = (next: Queue) => url.set({ queue: next, page: 1 }, { push: true });

  const payload = useMemo(
    () => ({ page, ...(queue !== "all" ? { status: queue as "pending" | "flagged" | "approved" | "rejected" | "hidden" } : {}) }),
    [queue, page],
  );

  const reviewsQuery = useQuery({
    queryKey: ["seller-reviews", payload],
    queryFn: () => listSellerReviews({ data: payload }),
    retry: false,
  });

  const flag = useMutation({
    mutationFn: (reviewId: string) => flagReviewForRemoderation({ data: { reviewId } }),
    onSuccess: () => {
      toast.success("Review flagged. The moderation team will re-check it.");
      queryClient.invalidateQueries({ queryKey: ["seller-reviews"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const reviews = reviewsQuery.data?.reviews ?? [];
  const total = reviewsQuery.data?.total ?? 0;
  const pageSize = reviewsQuery.data?.pageSize ?? 20;

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Reviews"
    >
      <p className="text-body text-muted-foreground">"Reviews left on your own products. You can flag a review for re-moderation — the final decision stays with the platform team."</p>
      <Tabs value={queue} onValueChange={(v) => setQueue(v as Queue)}>
        <TabsList className="flex flex-wrap">
          {QUEUES.map((q) => (
            <TabsTrigger key={q.value} value={q.value}>{q.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-6">
        {reviewsQuery.isLoading ? (
          <TableSkeleton rows={4} />
        ) : reviewsQuery.isError ? (
          <AdminCard>
            <EmptyState title="Reviews could not be loaded" text={errMsg(reviewsQuery.error)} />
          </AdminCard>
        ) : reviews.length === 0 ? (
          <AdminCard>
            <EmptyState
              title="No reviews here"
              text={queue === "all" ? "When customers review your products, they will appear here." : "No reviews with this status."}
            />
          </AdminCard>
        ) : (
          <div className="space-y-4">
            <div className="space-y-4">
              {reviews.map((review) => (
                <AdminCard key={review.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{review.productName}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Stars rating={review.rating} />
                        <span className="text-xs tabular-nums text-muted-foreground">{review.rating}/5</span>
                      </div>
                    </div>
                    <StatusPill status={review.moderationStatus} />
                  </div>
                  {review.body ? <p className="mt-3 text-sm leading-6">{review.body}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <span>{review.firstName ?? "Anonymous"}</span>
                    {review.verifiedPurchase ? (
                      <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                        <BadgeCheck className="size-3.5" />
                        Verified purchase
                      </span>
                    ) : null}
                    <span>{fmtDateTime(review.createdAt)}</span>
                    {review.flaggedAt ? <span>Flagged by you · {fmtDateTime(review.flaggedAt)}</span> : null}
                  </div>
                  {review.moderationStatus !== "pending" ? (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={flag.isPending}
                        onClick={() => flag.mutate(review.id)}
                      >
                        <Flag className="size-3.5" />
                        Flag for re-moderation
                      </Button>
                    </div>
                  ) : null}
                </AdminCard>
              ))}
            </div>
            <Pager page={page} total={total} pageSize={pageSize} onPage={(p) => url.set({ page: p }, { push: true })} />
          </div>
        )}
      </div>
    </SellerShell>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={i < Math.round(rating) ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground/40"}
        />
      ))}
    </span>
  );
}
