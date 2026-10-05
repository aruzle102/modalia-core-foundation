import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminCard, EmptyState, Field, StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { createSupportRequest, listSupportRequests } from "@/lib/seller-support.functions";
import { getLocale, getTranslations } from "@/lib/i18n";

const q = queryOptions({ queryKey: ["seller-support"], queryFn: () => listSupportRequests() });

export const Route = createFileRoute("/_authenticated/seller/support")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  component: SupportPage,
});

function SupportPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Support"
    >
      <p className="text-body text-muted-foreground">Reach the Modalia team for account, payout or catalog issues. Replies appear below.</p>
      <RequestForm />
      <RequestList />
    </SellerShell>
  );
}

function RequestForm() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createSupportRequest({ data: { subject, message } }),
    onSuccess: () => {
      setStatus("Request submitted. We'll get back to you soon.");
      setSubject("");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["seller-support"] });
    },
    onError: (err) => setStatus(err instanceof Error ? err.message : "Submission failed."),
  });

  return (
    <AdminCard title="New request" subtitle="Describe the issue; the team replies here." className="mb-8">
      <Field label="Subject">
        <Input placeholder="e.g. Payout delayed" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <div className="mt-4">
        <Field label="Message" hint={`${message.length}/4000 characters`}>
          <Textarea rows={5} maxLength={4000} placeholder="Tell us what happened…" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={subject.trim().length < 3 || message.trim().length < 10 || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Submitting…" : "Send request"}
        </Button>
        {status ? <p className="text-small text-muted-foreground">{status}</p> : null}
      </div>
    </AdminCard>
  );
}

function RequestList() {
  const { data } = useSuspenseQuery(q);

  return (
    <AdminCard title="Your requests" subtitle={`${data.requests.length} total`}>
      {data.requests.length ? (
        <div className="divide-y divide-border">
          {data.requests.map((r) => (
            <div key={r.id} className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{r.subject}</p>
                <div className="flex items-center gap-3">
                  <span className="text-caption text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
                  <StatusPill status={r.status} />
                </div>
              </div>
              <p className="mt-2 max-w-3xl text-small text-muted-foreground">{r.message}</p>
              {r.adminResponse ? (
                <div className="mt-3 rounded-xl bg-muted p-4">
                  <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                    Modalia team{r.respondedAt ? ` · ${fmtDateTime(r.respondedAt)}` : ""}
                  </p>
                  <p className="mt-1.5 text-small">{r.adminResponse}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No requests yet" text="Send your first request above and our team will help." />
      )}
    </AdminCard>
  );
}
