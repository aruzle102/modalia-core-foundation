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
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  Field,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
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

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "converted", label: "Converted" },
  { value: "suspended", label: "Suspended" },
] as const;

const TIMELINE_LABELS: Record<string, string> = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  approved: "Approved",
  rejected: "Rejected",
  account_created: "Seller account created",
  store_activated: "Store activated",
};

function formatCategories(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

function ApplicationsPage() {
  const locale = useAdminLocale();
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
        title="Seller Applications"
        subtitle="Review applications, approve sellers, and provision seller accounts."
        breadcrumbs={[{ label: nav.sellerApplications }]}
      >
        <ModerationBriefCard />
        <AdminCard
          title="Applications"
          subtitle={`${total} total`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, email, store, phone…"
                  className="w-64 ps-8"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  url.set({ status: v, page: 1 });
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
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
            <EmptyState
              title="Could not load applications"
              text="Something went wrong while fetching the applications."
              action={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="No applications found"
              text="Try adjusting the search or status filter."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pe-4 text-start font-medium">Applicant</th>
                    <th className="py-2 pe-4 text-start font-medium">Store</th>
                    <th className="py-2 pe-4 text-start font-medium">Categories</th>
                    <th className="py-2 pe-4 text-start font-medium">Phone</th>
                    <th className="py-2 pe-4 text-start font-medium">Email</th>
                    <th className="py-2 pe-4 text-start font-medium">Status</th>
                    <th className="py-2 text-start font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((app) => (
                    <tr
                      key={app.id}
                      onClick={() => openApplication(app.id)}
                      className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50"
                    >
                      <td className="py-3 pe-4 font-medium">
                        {app.first_name} {app.last_name}
                      </td>
                      <td className="py-3 pe-4">{app.proposed_store_name}</td>
                      <td className="py-3 pe-4">
                        <span className="line-clamp-1 max-w-48 text-muted-foreground">
                          {formatCategories(app.product_categories).join(", ") || "—"}
                        </span>
                      </td>
                      <td className="py-3 pe-4 whitespace-nowrap" dir="ltr">
                        {app.phone}
                      </td>
                      <td className="py-3 pe-4 max-w-56 truncate">{app.email}</td>
                      <td className="py-3 pe-4">
                        <StatusPill status={app.status} />
                      </td>
                      <td className="py-3 whitespace-nowrap text-muted-foreground" title={fmtDateTime(app.created_at, locale)}>
                        {timeAgo(app.created_at, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          ? "Application approved."
          : res.status === "rejected"
            ? "Application rejected."
            : "Application moved to under review.",
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
      toast.success("Admin notes saved.");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 end-0 flex w-full max-w-2xl flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Application detail</h2>
            {app && <StatusPill status={app.status} />}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {detailQuery.isLoading ? (
            <TableSkeleton rows={6} />
          ) : detailQuery.isError || !app ? (
            <EmptyState title="Could not load application" text="Please try again." />
          ) : (
            <div className="space-y-6">
              {/* Applicant */}
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Applicant
                </h3>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Full name</dt>
                    <dd className="font-medium">
                      {app.first_name} {app.last_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Proposed store name</dt>
                    <dd className="font-medium">{app.proposed_store_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd className="break-all" dir="ltr">{app.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Phone</dt>
                    <dd dir="ltr">{app.phone}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Product categories</dt>
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
                    <dt className="text-xs text-muted-foreground">Business description</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm">{app.business_description}</dd>
                  </div>
                  {app.additional_information && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Additional information</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm">{app.additional_information}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Timeline */}
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Timeline
                </h3>
                <ol className="space-y-2.5 border-s-2 border-muted ps-4">
                  {timeline.map((step) => (
                    <li key={step.key} className="relative">
                      <span className="absolute -start-[21px] top-1 size-2.5 rounded-full bg-primary" />
                      <p className="text-sm font-medium">{TIMELINE_LABELS[step.key] ?? step.key}</p>
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
                    Review
                  </h3>
                  {app.rejection_reason && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <p className="font-medium">Rejection reason</p>
                      <p className="mt-1 whitespace-pre-wrap">{app.rejection_reason}</p>
                    </div>
                  )}
                  {app.reviewed_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reviewed {timeAgo(app.reviewed_at, locale)}
                    </p>
                  )}
                </section>
              )}

              {/* Admin notes */}
              <section>
                <Field label="Admin notes" hint="Internal only — never shown to the seller.">
                  <Textarea
                    value={notes ?? ""}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Internal notes about this application…"
                  />
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={notesMutation.isPending || notes === (app.admin_notes ?? "")}
                  onClick={() => notesMutation.mutate()}
                >
                  {notesMutation.isPending ? "Saving…" : "Save notes"}
                </Button>
              </section>

              {/* Actions */}
              {(app.status === "pending" || app.status === "under_review") && (
                <section className="rounded-lg border p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Decision
                  </h3>
                  {app.status === "under_review" && (
                    <p className="mb-3 text-sm text-muted-foreground">
                      This application is under review — record a final decision below.
                    </p>
                  )}
                  <Field label="Rejection reason" hint="Required if you reject this application.">
                    <Textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={2}
                      placeholder="Why is this application being rejected?"
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => setConfirmApprove(true)}>
                      <Check className="size-4 me-1.5" />
                      Approve
                    </Button>
                    <Button variant="destructive" onClick={() => setConfirmReject(true)}>
                      <X className="size-4 me-1.5" />
                      Reject
                    </Button>
                    {app.status === "pending" && (
                      <Button
                        variant="outline"
                        onClick={() => reviewMutation.mutate({ decision: "start_review" })}
                        disabled={reviewMutation.isPending}
                      >
                        Mark under review
                      </Button>
                    )}
                  </div>
                </section>
              )}

              {app.status === "approved" && !app.seller_id && (
                <section className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <UserPlus className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold">Provision the seller account</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Launch the onboarding wizard to configure the seller, login, store,
                        commission and permissions, then create everything in one step. The
                        temporary password is displayed once — share it with the seller through a
                        secure channel.
                      </p>
                      <Button className="mt-3" onClick={() => setWizardOpen(true)}>
                        <UserPlus className="size-4 me-1.5" />
                        Create seller &amp; store
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
                      View seller profile
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
        title="Approve this application?"
        description={`Approving ${app?.first_name ?? ""} ${app?.last_name ?? ""} marks the application as approved. You will still need to create the seller account in a separate step.`}
        confirmLabel="Approve application"
        onConfirm={() => reviewMutation.mutate({ decision: "approve" })}
      />
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title="Reject this application?"
        description={
          rejectionReason.trim()
            ? `The application will be rejected with the reason you entered.`
            : "Enter a rejection reason first — it is required."
        }
        confirmLabel="Reject application"
        onConfirm={() => {
          if (!rejectionReason.trim()) {
            toast.error("A rejection reason is required.");
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
  const briefQuery = useQuery({
    queryKey: ["admin-moderation-brief"],
    queryFn: () => aiAdminModerationBrief({ data: { locale: "en" } }),
    retry: false,
    staleTime: 60_000,
  });
  const brief = briefQuery.data ?? null;

  return (
    <AdminCard
      title="Moderation brief"
      subtitle="Rule-based summary from live data — every decision still needs a human."
      actions={
        <Button variant="outline" size="sm" onClick={() => briefQuery.refetch()} disabled={briefQuery.isFetching}>
          Refresh
        </Button>
      }
    >
      {briefQuery.isLoading ? (
        <TableSkeleton rows={3} />
      ) : briefQuery.isError || !brief ? (
        <EmptyState title="Brief unavailable" text={briefQuery.isError ? errMsg(briefQuery.error) : "No data."} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Pending applications", value: brief.counts.pendingApplications },
              { label: "Products awaiting moderation", value: brief.counts.pendingProducts },
              { label: "Open support tickets", value: brief.counts.openTickets },
              { label: "Oldest application waiting (days)", value: brief.counts.oldestApplicationWaitingDays },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border p-3">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {brief.applications.length ? (
            <div>
              <p className="text-sm font-medium">Oldest pending applications</p>
              <ul className="mt-2 space-y-2 text-sm">
                {brief.applications.slice(0, 5).map((a) => (
                  <li key={a.id} className="rounded-xl bg-muted/50 p-3">
                    <p className="font-medium">
                      {a.applicant} — proposed store “{a.proposedStore}”
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        waiting {a.waitingDays} day{a.waitingDays === 1 ? "" : "s"}
                      </span>
                    </p>
                    <p className="mt-1 text-muted-foreground">{a.business}</p>
                    {a.categories.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">Categories: {a.categories.join(", ")}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.pendingProducts.length ? (
            <div>
              <p className="text-sm font-medium">Products awaiting moderation</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {brief.pendingProducts.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {p.store ? ` — ${p.store}` : ""} · waiting {p.waitingDays} day{p.waitingDays === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.openTickets.length ? (
            <div>
              <p className="text-sm font-medium">Open support requests</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {brief.openTickets.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    {t.subject || "No subject"} · waiting {t.waitingDays} day{t.waitingDays === 1 ? "" : "s"}
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
