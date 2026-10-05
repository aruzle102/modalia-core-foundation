import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  Field,
  fmtMoney,
  fmtDateTime,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  listAdminCoupons,
  upsertCoupon,
  setCouponStatus,
  deleteCoupon,
  listAdminSellersLite,
  type AdminCouponRow,
} from "@/lib/admin-catalog.functions";
import { errMsg, Pager } from "./_shared";
import { numParam, strParam, useUrlState } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/coupons")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: numParam(search["page"], 1),
    create: strParam(search["create"]),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AdminCouponsPage,
});

type CouponRow = AdminCouponRow;

function AdminCouponsPage() {
  return (
    <AdminGate>
      <AdminShell title="Coupons" subtitle="Create and control discount codes for the platform or individual sellers.">
        <CouponsManager />
      </AdminShell>
    </AdminGate>
  );
}

function CouponsManager() {
  const queryClient = useQueryClient();
  const url = useUrlState({ page: 1 });
  const page = numParam(url.search["page"], 1);
  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const [editing, setEditing] = useState<CouponRow | null | "new">(null);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);

  // Deep link: /admin/coupons?create=coupon opens the new-coupon dialog.
  useEffect(() => {
    if (strParam(url.search["create"]) === "coupon") setEditing("new");
  }, [url.search["create"]]);

  const couponsQuery = useQuery({
    queryKey: ["admin-coupons", page],
    queryFn: () => listAdminCoupons({ data: { page } }),
    retry: false,
  });
  const sellersQuery = useQuery({
    queryKey: ["admin-sellers-lite"],
    queryFn: () => listAdminSellersLite(),
    retry: false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });

  const toggleStatus = useMutation({
    mutationFn: (payload: { id: string; status: "active" | "inactive" }) =>
      setCouponStatus({ data: payload }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteCoupon({ data: { id } }),
    onSuccess: () => {
      toast.success("Coupon deleted.");
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const sellerName = (id: string | null) =>
    id == null
      ? "Platform-wide"
      : (sellersQuery.data?.sellers.find((s) => s.id === id)?.legal_name ?? id.slice(0, 8));

  const coupons = couponsQuery.data?.coupons ?? [];
  const total = couponsQuery.data?.total ?? 0;
  const pageSize = couponsQuery.data?.pageSize ?? 25;

  const discountLabel = (c: CouponRow) =>
    c.discount_type === "percentage" ? `${c.discount_value}%` : fmtMoney(Number(c.discount_value));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-muted-foreground">{total} coupon(s)</p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New coupon
        </Button>
      </div>

      <AdminCard title="Coupons">
        {couponsQuery.isPending ? (
          <TableSkeleton />
        ) : couponsQuery.isError ? (
          <EmptyState title="Could not load coupons" text={errMsg(couponsQuery.error)} />
        ) : coupons.length === 0 ? (
          <EmptyState title="No coupons" text="Create the first discount code to boost sales." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Discount</th>
                  <th className="px-3 py-2 font-medium">Scope</th>
                  <th className="px-3 py-2 font-medium">Usage</th>
                  <th className="px-3 py-2 font-medium">Validity</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coupons.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-mono font-semibold">{c.code}</p>
                      <p className="text-caption text-muted-foreground">
                        {c.min_order_amount != null ? `min ${fmtMoney(Number(c.min_order_amount))}` : "no minimum"}
                        {c.max_discount_amount != null ? ` · capped ${fmtMoney(Number(c.max_discount_amount))}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap font-medium">{discountLabel(c)}</td>
                    <td className="px-3 py-3 text-caption">{sellerName(c.seller_id)}</td>
                    <td className="px-3 py-3 text-caption">
                      {Number(c.usage_count ?? 0)}{c.usage_limit != null ? ` / ${c.usage_limit}` : " / ∞"}
                      {c.per_customer_limit != null ? <span className="block">max {c.per_customer_limit} / customer</span> : null}
                    </td>
                    <td className="px-3 py-3 text-caption">
                      {c.starts_at ? fmtDateTime(c.starts_at) : "—"}
                      <span className="block">to {c.ends_at ? fmtDateTime(c.ends_at) : "—"}</span>
                    </td>
                    <td className="px-3 py-3"><StatusPill status={c.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            toggleStatus.mutate({
                              id: c.id,
                              status: c.status === "active" ? "inactive" : "active",
                            })
                          }
                          disabled={toggleStatus.isPending}
                        >
                          {c.status === "active" ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(c)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
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

      {editing !== null ? (
        <CouponDialog
          key={editing === "new" ? "new" : (editing as CouponRow).id}
          coupon={editing === "new" ? null : (editing as CouponRow)}
          sellers={sellersQuery.data?.sellers ?? []}
          onClose={() => {
            setEditing(null);
            url.set({ create: undefined });
          }}
          onSaved={invalidate}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title="Delete coupon?"
        description={deleting ? `“${deleting.code}” will be permanently removed. This cannot be undone.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string | null {
  return value.trim() === "" ? null : new Date(value).toISOString();
}

function CouponDialog({
  coupon,
  sellers,
  onClose,
  onSaved,
}: {
  coupon: CouponRow | null;
  sellers: { id: string; legal_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [discountType, setDiscountType] = useState<string>(coupon?.discount_type ?? "percentage");
  const [discountValue, setDiscountValue] = useState(coupon?.discount_value != null ? String(coupon.discount_value) : "");
  const [minOrder, setMinOrder] = useState(coupon?.min_order_amount != null ? String(coupon.min_order_amount) : "");
  const [maxDiscount, setMaxDiscount] = useState(coupon?.max_discount_amount != null ? String(coupon.max_discount_amount) : "");
  const [usageLimit, setUsageLimit] = useState(coupon?.usage_limit != null ? String(coupon.usage_limit) : "");
  const [perCustomer, setPerCustomer] = useState(coupon?.per_customer_limit != null ? String(coupon.per_customer_limit) : "");
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(coupon?.starts_at));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(coupon?.ends_at));
  const [sellerId, setSellerId] = useState<string>(coupon?.seller_id ?? "platform");
  const [status, setStatus] = useState<string>(coupon?.status ?? "active");
  const [serverError, setServerError] = useState<string | null>(null);

  const codeError = /^[A-Z0-9_-]{3,32}$/i.test(code.trim()) ? null : "3–32 chars: letters, digits, - or _.";
  const value = Number(discountValue);
  const valueError =
    discountValue.trim() === "" || !(value > 0)
      ? "Enter a positive discount value."
      : discountType === "percentage" && (value < 1 || value > 100)
        ? "Percentage must be between 1 and 100."
        : null;
  const minOrderError = minOrder.trim() !== "" && !(Number(minOrder) >= 0) ? "Must be 0 or more." : null;
  const maxDiscountError = maxDiscount.trim() !== "" && !(Number(maxDiscount) > 0) ? "Must be positive." : null;
  const usageLimitError =
    usageLimit.trim() !== "" && !(Number.isInteger(Number(usageLimit)) && Number(usageLimit) > 0)
      ? "Must be a positive whole number."
      : null;
  const perCustomerError =
    perCustomer.trim() !== "" && !(Number.isInteger(Number(perCustomer)) && Number(perCustomer) > 0)
      ? "Must be a positive whole number."
      : null;
  const datesError =
    startsAt && endsAt && new Date(startsAt) >= new Date(endsAt) ? "Start must be before the end." : null;

  const save = useMutation({
    mutationFn: () =>
      upsertCoupon({
        data: {
          id: coupon?.id,
          code: code.trim().toUpperCase(),
          discount_type: discountType as "percentage" | "fixed",
          discount_value: Number(discountValue),
          min_order_amount: minOrder.trim() === "" ? null : Number(minOrder),
          max_discount_amount: maxDiscount.trim() === "" ? null : Number(maxDiscount),
          usage_limit: usageLimit.trim() === "" ? null : Number(usageLimit),
          per_customer_limit: perCustomer.trim() === "" ? null : Number(perCustomer),
          starts_at: fromDateTimeLocal(startsAt),
          ends_at: fromDateTimeLocal(endsAt),
          seller_id: sellerId === "platform" ? null : sellerId,
          status: status as "active" | "inactive",
        },
      }),
    onSuccess: () => {
      toast.success(coupon ? "Coupon updated." : "Coupon created.");
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  const hasError = Boolean(
    codeError || valueError || minOrderError || maxDiscountError || usageLimitError || perCustomerError || datesError,
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{coupon ? "Edit coupon" : "New coupon"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" error={codeError ?? undefined} hint="Saved in uppercase; must be unique.">
            <Input dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" className="font-mono" />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Discount type">
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed amount (DZD)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={discountType === "percentage" ? "Discount (%)" : "Discount (DZD)"} error={valueError ?? undefined}>
            <Input inputMode="decimal" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === "percentage" ? "10" : "500"} />
          </Field>
          <Field label="Min. order amount (DZD)" error={minOrderError ?? undefined} hint="Optional.">
            <Input inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="Empty = none" />
          </Field>
          <Field label="Max. discount (DZD)" error={maxDiscountError ?? undefined} hint="Caps percentage discounts. Optional.">
            <Input inputMode="decimal" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="Empty = none" />
          </Field>
          <Field label="Total usage limit" error={usageLimitError ?? undefined} hint="Optional.">
            <Input inputMode="numeric" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Empty = unlimited" />
          </Field>
          <Field label="Per-customer limit" error={perCustomerError ?? undefined} hint="Optional.">
            <Input inputMode="numeric" value={perCustomer} onChange={(e) => setPerCustomer(e.target.value)} placeholder="Empty = unlimited" />
          </Field>
          <Field label="Starts at">
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends at" error={datesError ?? undefined}>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Scope</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">Platform-wide</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">Platform-wide coupons apply to every seller's products.</p>
          </div>
        </div>
        {serverError ? (
          <p role="alert" className="mt-4 text-small text-destructive">{serverError}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (hasError) return;
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : coupon ? "Save changes" : "Create coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
