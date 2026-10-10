/**
 * Seller verification request card.
 * Shows progress toward: 50 sales/30d + 5000 unique store views.
 * Eligible sellers can submit a verification request for admin review.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/ui";
import {
  getVerificationStatus,
  requestVerification,
  type VerificationEligibility,
} from "@/lib/verification.functions";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function VerificationCard() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["verification-status"],
    queryFn: () => getVerificationStatus(),
  });
  const mutation = useMutation({
    mutationFn: () => requestVerification(),
    onSuccess: (res) => {
      setMessage(res.message);
      queryClient.invalidateQueries({ queryKey: ["verification-status"] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  if (isLoading) {
    return (
      <AdminCard title="Store verification" className="mt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </AdminCard>
    );
  }
  if (isError || !data) {
    return (
      <AdminCard title="Store verification" className="mt-6">
        <p className="text-sm text-muted-foreground">Could not load verification status.</p>
      </AdminCard>
    );
  }

  const v: VerificationEligibility = data;
  if (v.verificationStatus === "verified") {
    return (
      <AdminCard title="Store verification" className="mt-6">
        <div className="flex items-center gap-2 text-green-600">
          <BadgeCheck className="h-5 w-5" />
          <span className="font-medium">Your store is verified</span>
        </div>
      </AdminCard>
    );
  }

  return (
    <AdminCard
      title="Store verification"
      subtitle="Get the verified badge: 50 sales in 30 days + 5,000 unique store views"
      className="mt-6"
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Sales (30 days)</span>
            <span className="font-medium">
              {v.sales30d} / {v.salesRequired}
            </span>
          </div>
          <ProgressBar value={v.sales30d} max={v.salesRequired} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Unique store views</span>
            <span className="font-medium">
              {v.uniqueViews.toLocaleString()} / {v.viewsRequired.toLocaleString()}
            </span>
          </div>
          <ProgressBar value={v.uniqueViews} max={v.viewsRequired} />
          <p className="mt-1 text-xs text-muted-foreground">Each device counts once.</p>
        </div>

        {v.requestStatus === "pending" ? (
          <p className="text-sm text-amber-600">Your verification request is under review.</p>
        ) : v.requestStatus === "rejected" ? (
          <p className="text-sm text-red-600">
            Your last request was not approved. Keep growing and try again when eligible.
          </p>
        ) : null}

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <Button
          disabled={!v.eligible || v.requestStatus === "pending" || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : v.eligible ? (
            "Request verification"
          ) : (
            "Not yet eligible"
          )}
        </Button>
      </div>
    </AdminCard>
  );
}
