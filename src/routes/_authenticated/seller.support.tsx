import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminCard, EmptyState, Field, StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { createSupportRequest, listSupportRequests } from "@/lib/seller-support.functions";
import { getLocale, getTranslations, type SupportedLocale } from "@/lib/i18n";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { RouteError } from "@/components/routing/route-states";

const q = queryOptions({ queryKey: ["seller-support"], queryFn: () => listSupportRequests() });

export const Route = createFileRoute("/_authenticated/seller/support")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  errorComponent: SupportError,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: SupportPage,
});

function SupportError({ reset }: { reset: () => void }) {
  const t = getTranslations(useAdminLocale()).seller.support;
  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <RouteError message={t.loadError} reset={reset} />
    </SellerShell>
  );
}

type SupportT = ReturnType<typeof getTranslations>["seller"]["support"];

function SupportPage() {
  const { locale } = Route.useSearch();
  const t: SupportT = getTranslations(locale).seller.support;

  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <p className="text-body text-muted-foreground">{t.intro}</p>
      <RequestForm t={t} />
      <RequestList t={t} locale={locale} />
    </SellerShell>
  );
}

function RequestForm({ t }: { t: SupportT }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createSupportRequest({ data: { subject, message } }),
    onSuccess: () => {
      setStatus(t.submitted);
      setSubject("");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["seller-support"] });
    },
    onError: (err) => setStatus(err instanceof Error ? err.message : t.submitFailed),
  });

  return (
    <AdminCard title={t.formTitle} subtitle={t.formSubtitle} className="mb-8">
      <Field label={t.subjectLabel}>
        <Input placeholder={t.subjectPlaceholder} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <div className="mt-4">
        <Field label={t.messageLabel} hint={t.messageHint(message.length)}>
          <Textarea rows={5} maxLength={4000} placeholder={t.messagePlaceholder} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={subject.trim().length < 3 || message.trim().length < 10 || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? t.submitting : t.send}
        </Button>
        {status ? <p className="text-small text-muted-foreground">{status}</p> : null}
      </div>
    </AdminCard>
  );
}

function RequestList({ t, locale }: { t: SupportT; locale: SupportedLocale }) {
  const { data } = useSuspenseQuery(q);

  return (
    <AdminCard title={t.listTitle} subtitle={t.listSubtitle(data.requests.length)}>
      {data.requests.length ? (
        <div className="divide-y divide-border">
          {data.requests.map((r) => (
            <div key={r.id} className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{r.subject}</p>
                <div className="flex items-center gap-3">
                  <span className="text-caption text-muted-foreground">{fmtDateTime(r.createdAt, locale)}</span>
                  <StatusPill status={r.status} />
                </div>
              </div>
              <p className="mt-2 max-w-3xl text-small text-muted-foreground">{r.message}</p>
              {r.adminResponse ? (
                <div className="mt-3 rounded-xl bg-muted p-4">
                  <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.teamLabel}{r.respondedAt ? ` · ${fmtDateTime(r.respondedAt, locale)}` : ""}
                  </p>
                  <p className="mt-1.5 text-small">{r.adminResponse}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={t.emptyTitle} text={t.emptyText} />
      )}
    </AdminCard>
  );
}
