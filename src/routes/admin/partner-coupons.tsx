import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  Field,
  StatusPill,
  fmtMoney,
} from "@/components/admin/ui";
import {
  listPartnerCoupons,
  createPartnerCoupon,
  updatePartnerCoupon,
  deletePartnerCoupon,
  validateTiers,
  type PartnerCoupon,
} from "@/lib/partner-coupons.functions";

export const Route = createFileRoute("/admin/partner-coupons")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Partner coupons — Modalia Admin" },
    ],
  }),
  component: PartnerCouponsPage,
});

type TierForm = { minSubtotal: number; maxSubtotal: number | null; discountAmount: number };

const EMPTY_TIERS: TierForm[] = [
  { minSubtotal: 3000, maxSubtotal: 4999, discountAmount: 300 },
  { minSubtotal: 5000, maxSubtotal: 9999, discountAmount: 600 },
  { minSubtotal: 10000, maxSubtotal: 24999, discountAmount: 1000 },
  { minSubtotal: 25000, maxSubtotal: null, discountAmount: 1500 },
];

const EMPTY_FORM = {
  code: "",
  partnerName: "",
  partnerLogo: "",
  fundingModel: "platform" as "platform" | "seller" | "mixed",
  isMandatory: false,
  status: "active" as "active" | "inactive",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  tiers: EMPTY_TIERS.map((t) => ({ ...t })),
};

type FormState = typeof EMPTY_FORM;

function PartnerCouponsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["partner-coupons-admin", tab],
    queryFn: () => listPartnerCoupons({ data: { status: tab } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["partner-coupons-admin"] });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code.trim(),
        partnerName: form.partnerName.trim(),
        partnerLogo: form.partnerLogo.trim(),
        fundingModel: form.fundingModel,
        isMandatory: form.isMandatory,
        status: form.status,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        tiers: form.tiers.map((t) => ({
          minSubtotal: Number(t.minSubtotal),
          maxSubtotal: t.maxSubtotal == null ? null : Number(t.maxSubtotal),
          discountAmount: Number(t.discountAmount),
        })),
      };
      return editing && editing !== "new"
        ? updatePartnerCoupon({ data: { id: editing, ...payload } })
        : createPartnerCoupon({ data: payload });
    },
    onSuccess: () => {
      toast.success("Coupon saved");
      setEditing(null);
      setFormError(null);
      refresh();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePartnerCoupon({ data: { id } }),
    onSuccess: () => {
      toast.success("Coupon deleted");
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (c: PartnerCoupon | null) => {
    setFormError(null);
    if (c) {
      setEditing(c.id);
      setForm({
        code: c.code,
        partnerName: c.partnerName ?? "",
        partnerLogo: c.partnerLogo ?? "",
        fundingModel: c.fundingModel as FormState["fundingModel"],
        isMandatory: c.isMandatory,
        status: c.status as FormState["status"],
        startsAt: c.startsAt ? c.startsAt.slice(0, 16) : "",
        endsAt: c.endsAt ? c.endsAt.slice(0, 16) : "",
        usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
        tiers:
          c.tiers.length > 0
            ? c.tiers.map((t) => ({
                minSubtotal: t.minSubtotal,
                maxSubtotal: t.maxSubtotal,
                discountAmount: t.discountAmount,
              }))
            : EMPTY_TIERS.map((t) => ({ ...t })),
      });
    } else {
      setEditing("new");
      setForm({ ...EMPTY_FORM, tiers: EMPTY_TIERS.map((t) => ({ ...t })) });
    }
  };

  const tierError = useMemo(() => validateTiers(form.tiers), [form.tiers]);

  const setTier = (i: number, patch: Partial<TierForm>) =>
    setForm((f) => ({
      ...f,
      tiers: f.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    }));

  return (
    <AdminGate>
      <AdminShell
        title="Partner coupons"
        subtitle="Platform-wide tiered promotions (MODALIA × partner)"
        actions={
          <Button size="sm" onClick={() => startEdit(null)}>
            <Plus className="mr-1 h-4 w-4" /> New partner coupon
          </Button>
        }
      >
        <div className="mb-4 flex gap-2">
          {(["all", "active", "inactive"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={tab === s ? "default" : "outline"}
              onClick={() => setTab(s)}
            >
              {s === "all" ? "All" : s === "active" ? "Active" : "Inactive"}
            </Button>
          ))}
        </div>

        <AdminCard>
          {isLoading ? (
            <TableSkeleton />
          ) : !data || data.length === 0 ? (
            <EmptyState
              icon={<Ticket className="h-8 w-8" />}
              title="No partner coupons"
              text="Create a tiered partner coupon: discounts apply once per eligible cart, calculated from the combined merchandise subtotal."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Partner</th>
                    <th className="py-2 pr-4">Tiers</th>
                    <th className="py-2 pr-4">Funding</th>
                    <th className="py-2 pr-4">Mandatory</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 pr-4 font-mono font-semibold">{c.code}</td>
                      <td className="py-3 pr-4">{c.partnerName}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {c.tiers.map((t) => (
                          <div key={t.id}>
                            ≥ {fmtMoney(t.minSubtotal, "DZD", "en")}
                            {t.maxSubtotal != null ? ` – ${fmtMoney(t.maxSubtotal, "DZD", "en")}` : "+"}
                            {" → "}
                            <span className="font-medium text-foreground">
                              −{fmtMoney(t.discountAmount, "DZD", "en")}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="py-3 pr-4 capitalize">{c.fundingModel}</td>
                      <td className="py-3 pr-4">{c.isMandatory ? "Yes" : "No"}</td>
                      <td className="py-3 pr-4">
                        <StatusPill status={c.status === "active" ? "active" : "inactive"} />
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeleting(c.id)}>
                            <Trash2 className="mr-1 h-3 w-3" /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        {editing !== null ? (
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-lg bg-background p-6">
              <h3 className="mb-4 text-lg font-semibold">
                {editing === "new" ? "New partner coupon" : "Edit partner coupon"}
              </h3>
              {formError ? (
                <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Coupon code">
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="PARTNER2026"
                    className="font-mono"
                  />
                </Field>
                <Field label="Partner name">
                  <Input
                    value={form.partnerName}
                    onChange={(e) => setForm((f) => ({ ...f, partnerName: e.target.value }))}
                    placeholder="Djezzy"
                  />
                </Field>
                <Field label="Partner logo URL (optional)">
                  <Input
                    value={form.partnerLogo}
                    onChange={(e) => setForm((f) => ({ ...f, partnerLogo: e.target.value }))}
                    placeholder="https://"
                  />
                </Field>
                <Field label="Funding model">
                  <Select
                    value={form.fundingModel}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, fundingModel: v as FormState["fundingModel"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platform">Platform-funded</SelectItem>
                      <SelectItem value="seller">Seller-funded</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Starts at (optional)">
                  <Input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </Field>
                <Field label="Ends at (optional)">
                  <Input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  />
                </Field>
                <Field label="Usage limit (optional)">
                  <Input
                    type="number"
                    min={1}
                    value={form.usageLimit}
                    onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                    placeholder="Unlimited"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, status: v as FormState["status"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <label className="mt-3 flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isMandatory}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isMandatory: v }))}
                />
                Mandatory — sellers cannot opt out of this coupon
              </label>

              <h4 className="mb-2 mt-5 font-semibold">Discount tiers (DA)</h4>
              <p className="mb-3 text-xs text-muted-foreground">
                The first tier whose range contains the eligible cart subtotal wins. The last
                tier must be open-ended (no maximum).
              </p>
              {tierError ? (
                <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {tierError}
                </p>
              ) : null}
              <div className="space-y-2">
                {form.tiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-4 items-end gap-2">
                    <Field label={i === 0 ? "Min (DA)" : ""}>
                      <Input
                        type="number"
                        min={0}
                        value={t.minSubtotal}
                        onChange={(e) => setTier(i, { minSubtotal: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label={i === 0 ? "Max (DA)" : ""}>
                      <Input
                        type="number"
                        min={0}
                        value={t.maxSubtotal ?? ""}
                        disabled={i === form.tiers.length - 1}
                        placeholder={i === form.tiers.length - 1 ? "No max" : ""}
                        onChange={(e) =>
                          setTier(i, {
                            maxSubtotal: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label={i === 0 ? "Discount (DA)" : ""}>
                      <Input
                        type="number"
                        min={0}
                        value={t.discountAmount}
                        onChange={(e) => setTier(i, { discountAmount: Number(e.target.value) })}
                      />
                    </Field>
                    <div className="pb-1">
                      {form.tiers.length > 1 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm((f) => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }))
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {form.tiers.length < 10 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() =>
                    setForm((f) => {
                      const last = f.tiers[f.tiers.length - 1]!;
                      const prevMin = last.minSubtotal;
                      const withMax = f.tiers.map((t, j) =>
                        j === f.tiers.length - 1
                          ? { ...t, maxSubtotal: prevMin + 5000 }
                          : t
                      );
                      return {
                        ...f,
                        tiers: [
                          ...withMax,
                          { minSubtotal: prevMin + 5000, maxSubtotal: null, discountAmount: 0 },
                        ],
                      };
                    })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" /> Add tier
                </Button>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending || !!tierError}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          title="Delete partner coupon?"
          confirmLabel="Delete"
          danger
          onConfirm={() => deleting && remove.mutate(deleting)}
        />
      </AdminShell>
    </AdminGate>
  );
}
