import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Eye,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, errMsg } from "./_shared";
import { numParam, strParam, useDebouncedUrlParam, useUrlState } from "@/hooks/use-url-state";
import {
  AdminCard,
  StatusPill,
  TableSkeleton,
  ConfirmDialog,
  Field,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import { DataTable, EmptyState, ErrorState, StatCard } from "@/components/dashboard";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import {
  listApplications,
  getApplication,
  reviewApplication,
  updateApplicationNotes,
} from "@/lib/admin-sellers.functions";
import { SellerOnboardingWizard } from "@/components/admin/SellerOnboardingWizard";
import { aiAdminModerationBrief } from "@/lib/ai.functions";

export const Route = createFileRoute("/admin/applications")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: strParam(search["q"]),
    status: strParam(search["status"], "all"),
    page: numParam(search["page"], 1),
    // Open application detail drawer. Kept in the URL so the browser Back
    // button closes the drawer and the inspected application is shareable.
    application: strParam(search["application"]),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Seller Applications — Modalia Admin" }],
  }),
  component: ApplicationsPage,
});

const STATUS_VALUES = [
  "all",
  "pending",
  "under_review",
  "approved",
  "rejected",
  "converted",
  "suspended",
] as const;

function formatCategories(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

function ApplicationsPage() {
  const locale = useAdminLocale();
  const t = getTranslations(locale).admin.applications;
  const nav = getTranslations(locale).adminNav.items;
  const queryClient = useQueryClient();
  const url = useUrlState({ status: "all", page: 1 });
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const statusFilter = strParam(url.search["status"], "all");
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  // Detail drawer state lives in the URL: Back closes the drawer and the
  // inspected application is a shareable link. `push: true` so each opened
  // application is its own history entry.
  const selectedId = strParam(url.search["application"]) || null;
  const openApplication = (id: string) => url.set({ application: id }, { push: true });
  const closeApplication = () => url.set({ application: undefined });

  const setPage = (next: number) => url.set({ page: next }, { push: true });

  const status =
    statusFilter === "all"
      ? undefined
      : (statusFilter as
          | "pending"
          | "under_review"
          | "approved"
          | "rejected"
          | "converted"
          | "suspended");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-applications", status ?? "all", q, page],
    queryFn: () => listApplications({ data: { status, q: q || undefined, page } }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <AdminGate>
      <AdminShell
        title={t.title}
        subtitle={t.subtitle}
        breadcrumbs={[{ label: nav.sellerApplications }]}
      >
        <ModerationBriefCard />
        <AdminCard
          title={t.cardTitle}
          subtitle={t.total(total)}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t.searchPh}
                  className="w-64 ps-8"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  url.set({ status: v, page: 1 });
                }}
              >
                <SelectTrigger className="w-44" aria-label={t.statusFilter}>
                  <SelectValue placeholder={t.statusFilter} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t.statuses[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        >
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : isError ? (
            <ErrorState
              title={t.loadError}
              description={t.loadErrorText}
              action={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  {t.retry}
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={t.noResults}
              description={t.noResultsText}
            />
          ) : (
            <DataTable>
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th className="px-3 py-3 text-start">{t.colApplicant}</th>
                    <th className="px-3 py-3 text-start">{t.colStore}</th>
                    <th className="px-3 py-3 text-start">{t.colCategories}</th>
                    <th className="px-3 py-3 text-start">{t.colPhone}</th>
                    <th className="px-3 py-3 text-start">{t.colEmail}</th>
                    <th className="px-3 py-3 text-start">{t.colStatus}</th>
                    <th className="px-3 py-3 text-start">{t.colSubmitted}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {items.map((app) => (
                    <tr
                      key={app.id}
                      onClick={() => openApplication(app.id)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="max-w-44 truncate px-3 py-3 font-medium">
                        {app.first_name} {app.last_name}
                      </td>
                      <td className="max-w-44 truncate px-3 py-3">{app.proposed_store_name}</td>
                      <td className="px-3 py-3">
                        <span className="line-clamp-1 max-w-40 text-muted-foreground">
                          {formatCategories(app.product_categories).join(", ") || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3" dir="ltr">
                        {app.phone}
                      </td>
                      <td className="max-w-48 truncate px-3 py-3" dir="ltr">{app.email}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <StatusPill status={app.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground" title={fmtDateTime(app.created_at, locale)}>
                        {timeAgo(app.created_at, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          )}
          {total > 0 && (
            <div className="mt-4">
              <Pager page={page} total={total} pageSize={data?.pageSize ?? 25} onPage={(p) => setPage(p)} />
            </div>
          )}
        </AdminCard>

        {selectedId && (
          <ApplicationDrawer
            applicationId={selectedId}
            onClose={closeApplication}
            onChanged={() => {
              queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
            }}
          />
        )}
      </AdminShell>
    </AdminGate>
  );
}

function ApplicationDrawer({
  applicationId,
  onClose,
  onChanged,
}: {
  applicationId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const locale = useAdminLocale();
  const t = getTranslations(locale).admin.applications;
  const queryClient = useQueryClient();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["admin-application", applicationId],
    queryFn: () => getApplication({ data: { id: applicationId } }),
  });

  const app = detailQuery.data?.application;
  const linkedSeller = detailQuery.data?.seller;
  const timeline = detailQuery.data?.timeline ?? [];

  useEffect(() => {
    if (app && notes === null) setNotes(app.admin_notes ?? "");
  }, [app, notes]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-application", applicationId] });
    onChanged();
  };

  const reviewMutation = useMutation({
    mutationFn: (input: {
      decision: "approve" | "reject" | "start_review";
      rejectionReason?: string;
    }) =>
      reviewApplication({
        data: { id: applicationId, decision: input.decision, rejectionReason: input.rejectionReason },
      }),
    onSuccess: (res) => {
      toast.success(
        res.status === "approved"
          ? t.approvedMsg
          : res.status === "rejected"
            ? t.rejectedMsg
            : t.underReviewMsg,
      );
      setConfirmApprove(false);
      setConfirmReject(false);
      setRejectionReason("");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const notesMutation = useMutation({
    mutationFn: () => updateApplicationNotes({ data: { id: applicationId, adminNotes: notes ?? "" } }),
    onSuccess: () => {
      toast.success(t.notesSaved);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 end-0 flex w-full max-w-2xl flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-lg font-semibold">{t.detailTitle}</h2>
            {app && <StatusPill status={app.status} />}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t.close}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {detailQuery.isLoading ? (
            <TableSkeleton rows={6} />
          ) : detailQuery.isError || !app ? (
            <ErrorState title={t.detailLoadError} description={t.retry} />
          ) : (
            <div className="space-y-6">
              {/* Applicant */}
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.applicantSection}
                </h3>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t.fullName}</dt>
                    <dd className="truncate font-medium">
                      {app.first_name} {app.last_name}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t.proposedStore}</dt>
                    <dd className="truncate font-medium">{app.proposed_store_name}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t.email}</dt>
                    <dd className="truncate break-all" dir="ltr">{app.email}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t.phone}</dt>
                    <dd dir="ltr">{app.phone}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t.productCategories}</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {formatCategories(app.product_categories).length ? (
                        formatCategories(app.product_categories).map((c) => (
                          <span key={c} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t.businessDesc}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{app.business_description}</dd>
                  </div>
                  {app.additional_information && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">{t.additionalInfo}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{app.additional_information}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Timeline */}
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.timelineSection}
                </h3>
                <ol className="space-y-2.5 border-s-2 border-muted ps-4">
                  {timeline.map((step) => (
                    <li key={step.key} className="relative">
                      <span className="absolute -start-[21px] top-1 size-2.5 rounded-full bg-primary" />
                      <p className="text-sm font-medium">{t.timelineLabels[step.key as keyof typeof t.timelineLabels] ?? step.key}</p>
                      <p className="text-xs text-muted-foreground" title={fmtDateTime(step.at, locale)}>
                        {fmtDateTime(step.at, locale)} · {timeAgo(step.at, locale)}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Review info */}
              {(app.rejection_reason || app.reviewed_at) && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.reviewSection}
                  </h3>
                  {app.rejection_reason && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <p className="font-medium">{t.rejectionReasonLabel}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{app.rejection_reason}</p>
                    </div>
                  )}
                  {app.reviewed_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.reviewedAt(timeAgo(app.reviewed_at, locale))}
                    </p>
                  )}
                </section>
              )}

              {/* Admin notes */}
              <section>
                <Field label={t.notesLabel} hint={t.notesHint}>
                  <Textarea
                    value={notes ?? ""}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder={t.notesPh}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={notesMutation.isPending || notes === (app.admin_notes ?? "")}
                  onClick={() => notesMutation.mutate()}
                >
                  {notesMutation.isPending ? t.saving : t.saveNotes}
                </Button>
              </section>

              {/* Actions */}
              {(app.status === "pending" || app.status === "under_review") && (
                <section className="rounded-lg border p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.decisionSection}
                  </h3>
                  {app.status === "under_review" && (
                    <p className="mb-3 text-sm text-muted-foreground">
                      {t.underReviewHint}
                    </p>
                  )}
                  <Field label={t.rejectReasonLabel} hint={t.rejectReasonHint}>
                    <Textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={2}
                      placeholder={t.rejectReasonPh}
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => setConfirmApprove(true)}>
                      <Check className="size-4 me-1.5" />
                      {t.approve}
                    </Button>
                    <Button variant="destructive" onClick={() => setConfirmReject(true)}>
                      <X className="size-4 me-1.5" />
                      {t.reject}
                    </Button>
                    {app.status === "pending" && (
                      <Button
                        variant="outline"
                        onClick={() => reviewMutation.mutate({ decision: "start_review" })}
                        disabled={reviewMutation.isPending}
                      >
                        {t.markUnderReview}
                      </Button>
                    )}
                  </div>
                </section>
              )}

              {app.status === "approved" && !app.seller_id && (
                <section className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <UserPlus className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="font-semibold">{t.provisionTitle}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t.provisionText}
                      </p>
                      <Button className="mt-3" onClick={() => setWizardOpen(true)}>
                        <UserPlus className="size-4 me-1.5" />
                        {t.provisionCta}
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              {app.seller_id && linkedSeller && (
                <section>
                  <Link
                    to="/admin/sellers/$sellerId"
                    params={{ sellerId: app.seller_id }}
                    search={{ back: "", tab: "overview", q: "", status: "all", page: 1, create: "" }}
                    className="inline-flex"
                  >
                    <Button variant="outline">
                      <Eye className="size-4 me-1.5" />
                      {t.viewSeller}
                    </Button>
                  </Link>
                </section>
              )}
            </div>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title={t.confirmApproveTitle}
        description={t.confirmApproveDesc(`${app?.first_name ?? ""} ${app?.last_name ?? ""}`.trim())}
        confirmLabel={t.confirmApproveLabel}
        onConfirm={() => reviewMutation.mutate({ decision: "approve" })}
      />
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title={t.confirmRejectTitle}
        description={
          rejectionReason.trim()
            ? t.confirmRejectDescWithReason
            : t.confirmRejectDescNeedReason
        }
        confirmLabel={t.confirmRejectLabel}
        onConfirm={() => {
          if (!rejectionReason.trim()) {
            toast.error(t.rejectReasonRequired);
            return;
          }
          reviewMutation.mutate({ decision: "reject", rejectionReason: rejectionReason.trim() });
        }}
      />

      {app && (
        <SellerOnboardingWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          application={{
            id: app.id,
            first_name: app.first_name,
            last_name: app.last_name,
            phone: app.phone,
            email: app.email,
            proposed_store_name: app.proposed_store_name,
            business_description: app.business_description,
          }}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

/**
 * Rule-based moderation brief: a factual summary of what needs human
 * review (pending applications, pending products, open tickets).
 * Counts and one-line facts only — no invented judgments.
 */
function ModerationBriefCard() {
  const locale = useAdminLocale();
  const t = getTranslations(locale).admin.applications;
  const briefQuery = useQuery({
    queryKey: ["admin-moderation-brief"],
    queryFn: () => aiAdminModerationBrief({ data: { locale: "en" } }),
    retry: false,
    staleTime: 60_000,
  });
  const brief = briefQuery.data ?? null;

  return (
    <AdminCard
      title={t.briefTitle}
      subtitle={t.briefSubtitle}
      actions={
        <Button variant="outline" size="sm" onClick={() => briefQuery.refetch()} disabled={briefQuery.isFetching}>
          {t.refresh}
        </Button>
      }
    >
      {briefQuery.isLoading ? (
        <TableSkeleton rows={3} />
      ) : briefQuery.isError || !brief ? (
        <EmptyState title={t.briefUnavailable} description={briefQuery.isError ? errMsg(briefQuery.error) : "No data."} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t.pendingApplications, value: brief.counts.pendingApplications },
              { label: t.pendingProducts, value: brief.counts.pendingProducts },
              { label: t.openTickets, value: brief.counts.openTickets },
              { label: t.oldestWaiting, value: brief.counts.oldestApplicationWaitingDays },
            ].map((stat) => (
              <StatCard key={stat.label} title={stat.label} value={stat.value} />
            ))}
          </div>

          {brief.applications.length ? (
            <div>
              <p className="text-sm font-medium">{t.oldestApplications}</p>
              <ul className="mt-2 space-y-2 text-sm">
                {brief.applications.slice(0, 5).map((a) => (
                  <li key={a.id} className="rounded-xl bg-muted/50 p-3">
                    <p className="font-medium">
                      {a.applicant} — {a.proposedStore}
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        {t.waitingDays(a.waitingDays)}
                      </span>
                    </p>
                    <p className="mt-1 break-words text-muted-foreground">{a.business}</p>
                    {a.categories.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t.categoriesLabel(a.categories.join(", "))}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.pendingProducts.length ? (
            <div>
              <p className="text-sm font-medium">{t.pendingProducts}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {brief.pendingProducts.slice(0, 5).map((p) => (
                  <li key={p.id} className="break-words">
                    {p.name}
                    {p.store ? ` — ${p.store}` : ""} · {t.waitingDays(p.waitingDays)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.openTickets.length ? (
            <div>
              <p className="text-sm font-medium">{t.openSupport}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {brief.openTickets.slice(0, 5).map((tk) => (
                  <li key={tk.id} className="break-words">
                    {tk.subject || t.noSubject} · {t.waitingDays(tk.waitingDays)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs italic text-muted-foreground">{brief.disclaimer}</p>
        </div>
      )}
    </AdminCard>
  );
}
