import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import {
  AdminCard,
  ConfirmDialog,
  EmptyState,
  Field,
  Stat,
  StatusPill,
  TableSkeleton,
  fmtDate,
  fmtMoney,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createCoupon,
  listCoupons,
  toggleCoupon,
  updateCoupon,
  type SellerCouponRow,
} from "@/lib/seller-marketing.functions";
import { getLocale, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/coupons")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  component: CouponsPage,
});

type CouponForm = {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  min_order_amount: string;
  max_discount_amount: string;
  usage_limit: string;
  per_customer_limit: string;
  starts_at: string;
  ends_at: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: CouponForm = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  min_order_amount: "",
  max_discount_amount: "",
  usage_limit: "",
  per_customer_limit: "",
  starts_at: "",
  ends_at: "",
  status: "active",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

function valueLabel(row: SellerCouponRow): string {
  return row.discount_type === "percentage"
    ? `${row.discount_value}%`
    : fmtMoney(row.discount_value);
}

function CouponsPage() {
  const { locale } = Route.useSearch();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["seller-coupons"], queryFn: () => listCoupons() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SellerCouponRow | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [disableTarget, setDisableTarget] = useState<SellerCouponRow | null>(null);

  const coupons = query.data?.coupons ?? [];
  const stats = useMemo(() => {
    const active = coupons.filter((c) => c.status === "active").length;
    const redemptions = coupons.reduce((s, c) => s + (c.usage_count ?? 0), 0);
    return { active, redemptions, total: coupons.length };
  }, [coupons]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["seller-coupons"] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_order_amount: form.min_order_amount.trim() ? Number(form.min_order_amount) : null,
        max_discount_amount: form.max_discount_amount.trim() ? Number(form.max_discount_amount) : null,
        usage_limit: form.usage_limit.trim() ? Math.floor(Number(form.usage_limit)) : null,
        per_customer_limit: form.per_customer_limit.trim() ? Math.floor(Number(form.per_customer_limit)) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        status: form.status,
      };
      return editing
        ? updateCoupon({ data: { id: editing.id, ...payload } })
        : createCoupon({ data: payload });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; status: "active" | "inactive" }) => toggleCoupon({ data: input }),
    onSuccess: () => {
      setDisableTarget(null);
      invalidate();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (row: SellerCouponRow) => {
    setEditing(row);
    setForm({
      code: row.code,
      discount_type: row.discount_type === "fixed" ? "fixed" : "percentage",
      discount_value: String(row.discount_value),
      min_order_amount: row.min_order_amount != null ? String(row.min_order_amount) : "",
      max_discount_amount: row.max_discount_amount != null ? String(row.max_discount_amount) : "",
      usage_limit: row.usage_limit != null ? String(row.usage_limit) : "",
      per_customer_limit: row.per_customer_limit != null ? String(row.per_customer_limit) : "",
      starts_at: toLocalInput(row.starts_at),
      ends_at: toLocalInput(row.ends_at),
      status: row.status === "inactive" ? "inactive" : "active",
    });
    setDialogOpen(true);
  };

  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;

  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell
        eyebrow="Marketing"
        title="Coupons"
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            New coupon
          </Button>
        }
      >
        {query.isPending ? (
          <TableSkeleton rows={6} />
        ) : query.isError ? (
          <AdminCard title="Could not load coupons">
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Unexpected error."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AdminCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Active coupons" value={stats.active} />
              <Stat label="Total redemptions" value={stats.redemptions} hint="Times any of your coupons was used" />
              <Stat label="All coupons" value={stats.total} />
            </div>

            <AdminCard title="Your coupons" subtitle="Codes are uppercase and unique within your store." className="mt-6">
              {coupons.length === 0 ? (
                <EmptyState
                  title="No coupons yet"
                  text="Create a coupon code to reward customers — percentage or fixed-amount, with optional usage limits and validity dates."
                  action={<Button onClick={openCreate}>Create your first coupon</Button>}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Min order</TableHead>
                        <TableHead>Max discount</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Valid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-end">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coupons.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                          <TableCell>{valueLabel(c)}</TableCell>
                          <TableCell>{c.min_order_amount != null ? fmtMoney(c.min_order_amount) : "—"}</TableCell>
                          <TableCell>{c.max_discount_amount != null ? fmtMoney(c.max_discount_amount) : "—"}</TableCell>
                          <TableCell className="tabular-nums">
                            {c.usage_count ?? 0}
                            {c.usage_limit ? ` / ${c.usage_limit}` : ""}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {c.starts_at ? fmtDate(c.starts_at) : "—"} → {c.ends_at ? fmtDate(c.ends_at) : "—"}
                          </TableCell>
                          <TableCell>
                            <StatusPill status={c.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                                <Pencil className="me-1 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              {c.status === "active" ? (
                                <Button variant="ghost" size="sm" onClick={() => setDisableTarget(c)}>
                                  Disable
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={toggleMutation.isPending}
                                  onClick={() => toggleMutation.mutate({ id: c.id, status: "active" })}
                                >
                                  Enable
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </AdminCard>
          </>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit coupon" : "New coupon"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label="Code">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="RAMADAN20"
                  className="font-mono uppercase"
                  maxLength={40}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Discount type">
                  <Select
                    value={form.discount_type}
                    onValueChange={(v) => setForm({ ...form, discount_type: v as CouponForm["discount_type"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed amount (DZD)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={form.discount_type === "percentage" ? "Percent (1–100)" : "Amount (DZD)"}>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                    placeholder={form.discount_type === "percentage" ? "20" : "500"}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Min order (DZD)" hint="Optional">
                  <Input type="number" min="0" step="any" value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} />
                </Field>
                <Field label="Max discount (DZD)" hint="Caps percentage discounts">
                  <Input type="number" min="0" step="any" value={form.max_discount_amount} onChange={(e) => setForm({ ...form, max_discount_amount: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Usage limit" hint="Total redemptions, optional">
                  <Input type="number" min="1" step="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} />
                </Field>
                <Field label="Per-customer limit" hint="Optional">
                  <Input type="number" min="1" step="1" value={form.per_customer_limit} onChange={(e) => setForm({ ...form, per_customer_limit: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Starts at" hint="Optional">
                  <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
                </Field>
                <Field label="Ends at" hint="Optional">
                  <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
                </Field>
              </div>
              <Field label="Status">
                <div className="flex items-center gap-3">
                  <Label htmlFor="coupon-status" className="text-sm font-normal text-muted-foreground">
                    {form.status === "active" ? "Active" : "Inactive"}
                  </Label>
                  <Switch
                    id="coupon-status"
                    checked={form.status === "active"}
                    onCheckedChange={(v: boolean) => setForm({ ...form, status: v ? "active" : "inactive" })}
                  />
                </div>
              </Field>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create coupon"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={disableTarget !== null}
          onOpenChange={(open) => { if (!open) setDisableTarget(null); }}
          title="Disable coupon?"
          description={`Customers will no longer be able to use ${disableTarget?.code ?? ""}. You can re-enable it any time.`}
          confirmLabel="Disable coupon"
          danger
          onConfirm={() => { if (disableTarget) toggleMutation.mutate({ id: disableTarget.id, status: "inactive" }); }}
        />
      </SellerShell>
    </div>
  );
}
