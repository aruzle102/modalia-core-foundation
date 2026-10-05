import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  KeyRound,
  Search,
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
import { Pager } from "./_shared";
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
import {
  listApplications,
  getApplication,
  reviewApplication,
  updateApplicationNotes,
  createSellerAccount,
  type CreateSellerAccountResult,
} from "@/lib/admin-sellers.functions";

export const Route = createFileRoute("/admin/applications")({
  head: () => ({
    meta: [{ title: "Seller Applications — Modalia Admin" }],
  }),
  component: ApplicationsPage,
});

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
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
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const status = statusFilter === "all" ? undefined : (statusFilter as "pending" | "approved" | "rejected" | "suspended");

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
      >
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
                  setStatusFilter(v);
                  setPage(1);
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
                      onClick={() => setSelectedId(app.id)}
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
                      <td className="py-3 whitespace-nowrap text-muted-foreground" title={fmtDateTime(app.created_at)}>
                        {timeAgo(app.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 && (
            <div className="mt-4">
              <Pager page={page} total={total} pageSize={data?.pageSize ?? 25} onPage={setPage} />
            </div>
          )}
        </AdminCard>

        {selectedId && (
          <ApplicationDrawer
            applicationId={selectedId}
            onClose={() => setSelectedId(null)}
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
  const queryClient = useQueryClient();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [provision, setProvision] = useState<CreateSellerAccountResult | null>(null);
  const [copied, setCopied] = useState(false);

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
    mutationFn: (input: { decision: "approve" | "reject"; rejectionReason?: string }) =>
      reviewApplication({
        data: { id: applicationId, decision: input.decision, rejectionReason: input.rejectionReason },
      }),
    onSuccess: (res) => {
      toast.success(res.status === "approved" ? "Application approved." : "Application rejected.");
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

  const createMutation = useMutation({
    mutationFn: () => createSellerAccount({ data: { applicationId } }),
    onSuccess: (res) => {
      setConfirmCreate(false);
      setProvision(res);
      setCopied(false);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmCreate(false);
      toast.error(err.message);
    },
  });

  const copyPassword = async () => {
    if (!provision) return;
    try {
      await navigator.clipboard.writeText(provision.tempPassword);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = provision.tempPassword;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success("Temporary password copied.");
  };

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
              {/* One-time credential display */}
              {provision && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-amber-900 dark:text-amber-100">
                        Seller account created — share this password securely
                      </p>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                        This temporary password will not be shown again. Send it to the seller through
                        a secure channel and ask them to change it on first sign-in.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <code className="flex-1 truncate rounded bg-background px-3 py-2 font-mono text-sm" dir="ltr">
                          {provision.tempPassword}
                        </code>
                        <Button size="sm" onClick={copyPassword}>
                          {copied ? <Check className="size-4 me-1" /> : <Copy className="size-4 me-1" />}
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setProvision(null)}
                      >
                        I have shared it securely — dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              )}

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
                      <p className="text-xs text-muted-foreground" title={fmtDateTime(step.at)}>
                        {fmtDateTime(step.at)} · {timeAgo(step.at)}
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
                      Reviewed {timeAgo(app.reviewed_at)}
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
              {app.status === "pending" && (
                <section className="rounded-lg border p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Decision
                  </h3>
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
                  </div>
                </section>
              )}

              {app.status === "approved" && !app.seller_id && (
                <section className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold">Provision the seller account</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Creates the login, seller record, store, and role. The temporary password is
                        displayed once — share it with the seller through a secure channel.
                      </p>
                      <Button
                        className="mt-3"
                        onClick={() => setConfirmCreate(true)}
                        disabled={createMutation.isPending}
                      >
                        {createMutation.isPending ? "Creating account…" : "Create seller account"}
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
      <ConfirmDialog
        open={confirmCreate}
        onOpenChange={setConfirmCreate}
        title="Create seller account?"
        description="This provisions the seller login and store now. The temporary password is shown once and must be shared securely."
        confirmLabel="Create account"
        onConfirm={() => createMutation.mutate()}
      />
    </div>
  );
}
