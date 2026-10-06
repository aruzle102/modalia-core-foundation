import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  Stat,
  StatusPill,
  EmptyState,
  TableSkeleton,
  Field,
  fmtMoney,
  fmtDateTime,
} from "@/components/admin/ui";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listSettlements,
  settlementReference,
  createSettlement,
  updateSettlementStatus,
  getSettlementProofUrl,
  listAdminSellersLite,
  type AdminSettlementListItem,
} from "@/lib/admin-catalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAdminT } from "@/components/admin/use-admin-t";
import { errMsg, Pager } from "./_shared";
import { numParam, strParam, useUrlState } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/settlements")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: strParam(search["status"], "all"),
    sellerId: strParam(search["sellerId"], "all"),
    page: numParam(search["page"], 1),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AdminSettlementsPage,
});

type SettlementRow = AdminSettlementListItem;

const STATUS_FILTERS = ["pending", "approved", "paid", "rejected", "cancelled"] as const;

function AdminSettlementsPage() {
  const locale = useAdminLocale();
  const nav = getTranslations(locale).adminNav.items;
  return (
    <AdminGate>
      <AdminShell
        title="Settlements"
        subtitle="Track and pay out seller earnings."
        breadcrumbs={[{ label: nav.settlements }]}
      >
        <SettlementsManager />
      </AdminShell>
    </AdminGate>
  );
}

function SettlementsManager() {
  const locale = useAdminLocale();
  const queryClient = useQueryClient();
  const t = useAdminT().settlements;
  const url = useUrlState({ status: "all", sellerId: "all", page: 1 });
  const status = strParam(url.search["status"], "all");
  const sellerId = strParam(url.search["sellerId"], "all");
  const page = numParam(url.search["page"], 1);
  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const setFilter = (patch: Record<string, string | undefined>) => url.set({ ...patch, page: 1 });
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<SettlementRow | null>(null);

  const settlementsQuery = useQuery({
    queryKey: ["admin-settlements", status, sellerId, page],
    queryFn: () =>
      listSettlements({
        data: {
          status: status === "all" ? undefined : (status as (typeof STATUS_FILTERS)[number]),
          sellerId: sellerId === "all" ? undefined : sellerId,
          page,
        },
      }),
    retry: false,
  });
  const sellersQuery = useQuery({
    queryKey: ["admin-sellers-lite"],
    queryFn: () => listAdminSellersLite(),
    retry: false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });

  const sellerName = (id: string) =>
    sellersQuery.data?.sellers.find((s) => s.id === id)?.legal_name ?? id.slice(0, 8);

  const settlements = settlementsQuery.data?.settlements ?? [];
  const total = settlementsQuery.data?.total ?? 0;
  const pageSize = settlementsQuery.data?.pageSize ?? 25;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setFilter({ status: v })}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Seller</Label>
            <Select
              value={sellerId}
              onValueChange={(v) => {
                setFilter({ sellerId: v });
              }}
            >
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sellers</SelectItem>
                {(sellersQuery.data?.sellers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New settlement
        </Button>
      </div>

      <AdminCard title="Settlements" subtitle={`${total} settlement(s) match.`}>
        {settlementsQuery.isPending ? (
          <TableSkeleton />
        ) : settlementsQuery.isError ? (
          <EmptyState title="Could not load settlements" text={errMsg(settlementsQuery.error)} />
        ) : settlements.length === 0 ? (
          <EmptyState title="No settlements" text="No settlements match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Seller</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">{t.proof}</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {settlements.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-3 py-3 font-medium">{sellerName(s.seller_id)}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-medium">{fmtMoney(Number(s.amount), "DZD", locale)}</td>
                    <td className="px-3 py-3 text-caption">
                      {s.period_start ?? "—"} → {s.period_end ?? "—"}
                    </td>
                    <td className="px-3 py-3"><StatusPill status={s.status} /></td>
                    <td className="px-3 py-3 font-mono text-xs">{s.payment_reference ?? "—"}</td>
                    <td className="px-3 py-3 text-caption">
                      {s.payment_proof_path ? (
                        <span className="font-medium text-verified">{t.proofAttached}</span>
                      ) : (
                        <span className="text-muted-foreground">{t.noProof}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-caption">{fmtDateTime(s.created_at, locale)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(s.status === "pending" || s.status === "approved") ? (
                          <Button size="sm" variant="outline" onClick={() => setActing(s)}>
                            Manage
                          </Button>
                        ) : (
                          <span className="text-caption text-muted-foreground">terminal</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminCard>

      {creating ? (
        <CreateSettlementDialog
          sellers={sellersQuery.data?.sellers ?? []}
          onClose={() => setCreating(false)}
          onSaved={invalidate}
        />
      ) : null}

      {acting ? (
        <ManageSettlementDialog
          settlement={acting}
          sellerName={sellerName(acting.seller_id)}
          onClose={() => setActing(null)}
          onSaved={invalidate}
        />
      ) : null}
    </div>
  );
}

function CreateSettlementDialog({
  sellers,
  onClose,
  onSaved,
}: {
  sellers: { id: string; legal_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const locale = useAdminLocale();
  const [selectedSeller, setSelectedSeller] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const referenceQuery = useQuery({
    queryKey: ["admin-settlement-reference", selectedSeller],
    queryFn: () => settlementReference({ data: { sellerId: selectedSeller } }),
    enabled: selectedSeller !== "",
    retry: false,
  });

  const amountError = amount.trim() === "" || !(Number(amount) > 0) ? "Enter a positive amount." : null;
  const periodError =
    periodStart && periodEnd && periodStart > periodEnd ? "Period start must be before the period end." : null;

  const save = useMutation({
    mutationFn: () =>
      createSettlement({
        data: {
          sellerId: selectedSeller,
          amount: Number(amount),
          period_start: periodStart || null,
          period_end: periodEnd || null,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Settlement created as pending.");
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  const ref = referenceQuery.data;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New settlement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Seller">
            <Select value={selectedSeller} onValueChange={setSelectedSeller}>
              <SelectTrigger><SelectValue placeholder="Select a seller" /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {selectedSeller ? (
            <div className="border border-border bg-muted/40 p-4">
              <p className="text-caption font-semibold text-muted-foreground">Server-computed reference (read-only)</p>
              {referenceQuery.isPending ? (
                <p className="mt-2 text-small text-muted-foreground">Computing…</p>
              ) : referenceQuery.isError ? (
                <p className="mt-2 text-small text-destructive">{errMsg(referenceQuery.error)}</p>
              ) : ref ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Fulfilled orders" value={String(ref.orderCount)} />
                  <Stat label="Earned" value={fmtMoney(ref.earnedTotal, "DZD", locale)} />
                  <Stat label="Settled" value={fmtMoney(ref.settledTotal, "DZD", locale)} />
                  <Stat label="Available" value={fmtMoney(ref.available, "DZD", locale)} />
                </div>
              ) : null}
              {ref ? (
                <div className="mt-3 space-y-1 text-caption text-muted-foreground">
                  <p>· {ref.earnedLabel}.</p>
                  <p>· {ref.settledLabel}.</p>
                  <p>· Available = earned − settled. The amount you enter is independent; this is guidance only.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <Field label="Amount (DZD)" error={amountError ?? undefined}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Period start">
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </Field>
            <Field label="Period end" error={periodError ?? undefined}>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Internal notes…" />
          </Field>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">{serverError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (amountError || periodError || !selectedSeller) return;
              save.mutate();
            }}
            disabled={save.isPending || !selectedSeller}
          >
            {save.isPending ? "Creating…" : "Create settlement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageSettlementDialog({
  settlement,
  sellerName,
  onClose,
  onSaved,
}: {
  settlement: SettlementRow;
  sellerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const locale = useAdminLocale();
  const t = useAdminT().settlements;
  const nextOptions =
    settlement.status === "pending" ? (["approved", "rejected", "cancelled"] as const) : (["paid", "cancelled"] as const);
  const [nextStatus, setNextStatus] = useState<string>(nextOptions[0]);
  const [paymentReference, setPaymentReference] = useState(settlement.payment_reference ?? "");
  const [proofPath, setProofPath] = useState<string | null>(settlement.payment_proof_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [openingProof, setOpeningProof] = useState(false);
  const [notes, setNotes] = useState(settlement.notes ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateSettlementStatus({
        data: {
          id: settlement.id,
          status: nextStatus as "approved" | "paid" | "rejected" | "cancelled",
          payment_reference: paymentReference || undefined,
          payment_proof_path: proofPath,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(`Settlement ${nextStatus}.`);
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  const uploadProof = async (file: File) => {
    const okType = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType) {
      toast.error("Only images or PDF files are accepted.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be 10 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "proof";
      const path = `${settlement.id}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("settlement-proofs").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      setProofPath(path);
      toast.success(t.proofAttached);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const viewProof = async () => {
    setOpeningProof(true);
    try {
      const { url } = await getSettlementProofUrl({ data: { settlementId: settlement.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the proof.");
    } finally {
      setOpeningProof(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage settlement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{sellerName}</p>
              <p className="text-small text-muted-foreground">{fmtMoney(Number(settlement.amount), "DZD", locale)} · {fmtDateTime(settlement.created_at, locale)}</p>
            </div>
            <StatusPill status={settlement.status} />
          </div>
          <Field label="New status">
            <Select value={nextStatus} onValueChange={setNextStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {nextOptions.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Payment reference" hint="Bank transfer reference, receipt number, etc.">
            <Input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g. TRF-2026-0102"
            />
          </Field>
          <Field label={t.proof} hint={t.proofHint}>
            <div className="flex flex-wrap items-center gap-2">
              {proofPath ? (
                <>
                  <span className="text-sm font-medium text-verified">
                    {t.proofAttached}
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={viewProof} disabled={openingProof}>
                    {openingProof ? "…" : t.viewProof}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setProofPath(null)}>
                    {t.removeProof}
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">{t.noProof}</span>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadProof(file);
                  }}
                />
                {uploading ? t.uploading : proofPath ? t.replaceProof : t.uploadProof}
              </label>
            </div>
          </Field>
          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">{serverError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setServerError(null); save.mutate(); }} disabled={save.isPending || uploading}>
            {save.isPending ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
