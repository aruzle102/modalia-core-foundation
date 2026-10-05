import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteShippingRule,
  getShippingRules,
  listShippingCommunes,
  listShippingWilayas,
  toggleShippingRule,
  upsertShippingRule,
  type SellerShippingRuleRow,
} from "@/lib/seller-marketing.functions";
import { getLocale, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/shipping")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  component: ShippingPage,
});

function placeName(name: unknown, locale: string, fallback: string): string {
  if (name && typeof name === "object") {
    const n = name as Record<string, unknown>;
    for (const key of [locale, "en", "fr", "ar"]) {
      if (typeof n[key] === "string" && (n[key] as string).trim()) return n[key] as string;
    }
  }
  return fallback;
}

function bandLabel(min: number, max: number | null): string {
  return max == null ? `${min.toLocaleString()} g and up` : `${min.toLocaleString()}–${max.toLocaleString()} g`;
}

type RuleForm = {
  wilayaId: string;
  communeId: string;
  deliveryMethod: "home" | "office";
  price: string;
  minWeight: string;
  maxWeight: string;
  enabled: boolean;
};

const EMPTY_FORM: RuleForm = {
  wilayaId: "",
  communeId: "all",
  deliveryMethod: "home",
  price: "",
  minWeight: "0",
  maxWeight: "",
  enabled: true,
};

function ShippingPage() {
  const { locale } = Route.useSearch();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["seller-shipping-rules"], queryFn: () => getShippingRules() });
  const wilayasQuery = useQuery({ queryKey: ["seller-shipping-wilayas"], queryFn: () => listShippingWilayas() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SellerShippingRuleRow | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SellerShippingRuleRow | null>(null);

  const communesQuery = useQuery({
    queryKey: ["seller-shipping-communes", form.wilayaId],
    queryFn: () => listShippingCommunes({ data: { wilayaId: form.wilayaId } }),
    enabled: dialogOpen && form.wilayaId !== "",
  });

  const rules = query.data?.rules ?? [];
  const wilayas = wilayasQuery.data?.wilayas ?? [];
  const communes = communesQuery.data?.communes ?? [];

  const home = rules.filter((r) => r.delivery_method === "home").length;
  const office = rules.filter((r) => r.delivery_method === "office").length;
  const enabledCount = rules.filter((r) => r.enabled).length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["seller-shipping-rules"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertShippingRule({
        data: {
          id: editing?.id,
          wilaya_id: form.wilayaId,
          commune_id: form.communeId === "all" ? null : form.communeId,
          delivery_method: form.deliveryMethod,
          price: Number(form.price),
          min_weight_grams: Math.floor(Number(form.minWeight) || 0),
          max_weight_grams: form.maxWeight.trim() ? Math.floor(Number(form.maxWeight)) : null,
          enabled: form.enabled,
        },
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggleShippingRule({ data: input }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: string }) => deleteShippingRule({ data: input }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (row: SellerShippingRuleRow) => {
    setEditing(row);
    setForm({
      wilayaId: row.wilaya_id ?? "",
      communeId: row.commune_id ?? "all",
      deliveryMethod: row.delivery_method === "office" ? "office" : "home",
      price: String(row.price),
      minWeight: String(row.min_weight_grams),
      maxWeight: row.max_weight_grams != null ? String(row.max_weight_grams) : "",
      enabled: row.enabled,
    });
    setDialogOpen(true);
  };

  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const canSubmit = form.wilayaId !== "" && form.price.trim() !== "" && !saveMutation.isPending;

  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell
        eyebrow="Store"
        title="Shipping"
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            New rule
          </Button>
        }
      >
        {query.isPending ? (
          <TableSkeleton rows={6} />
        ) : query.isError ? (
          <AdminCard title="Could not load shipping rules">
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Unexpected error."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => query.refetch()}>Retry</Button>
          </AdminCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Rules" value={rules.length} />
              <Stat label="Home delivery" value={home} />
              <Stat label="Desk pickup" value={office} />
              <Stat label="Enabled" value={enabledCount} />
            </div>

            <AdminCard
              title="Your shipping rules"
              subtitle="Per wilaya, optionally per commune, per delivery method. Weight bands are in grams and may not overlap."
              className="mt-6"
            >
              {rules.length === 0 ? (
                <EmptyState
                  title="No shipping rules yet"
                  text="Set delivery prices per wilaya — for example 0–5000 g then 5001 g and up — for home delivery and desk pickup."
                  action={<Button onClick={openCreate}>Create your first rule</Button>}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wilaya</TableHead>
                        <TableHead>Commune</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Weight band</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Enabled</TableHead>
                        <TableHead className="text-end">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.wilayas ? `${r.wilayas.code} · ${placeName(r.wilayas.name, locale, r.wilayas.code)}` : "—"}
                          </TableCell>
                          <TableCell>
                            {r.communes ? `${r.communes.code} · ${placeName(r.communes.name, locale, r.communes.code)}` : "All communes"}
                          </TableCell>
                          <TableCell>
                            <StatusPill status={r.delivery_method === "home" ? "confirmed" : "pending"} />
                            <span className="ms-2 text-xs text-muted-foreground">
                              {r.delivery_method === "home" ? "Home delivery" : "Desk pickup"}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {bandLabel(Number(r.min_weight_grams), r.max_weight_grams != null ? Number(r.max_weight_grams) : null)}
                          </TableCell>
                          <TableCell className="font-semibold">{fmtMoney(r.price)}</TableCell>
                          <TableCell>
                            <Switch
                              checked={r.enabled}
                              disabled={toggleMutation.isPending}
                              onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, enabled: v })}
                              aria-label={r.enabled ? "Disable rule" : "Enable rule"}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                                <Pencil className="me-1 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>
                                Delete
                              </Button>
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
              <DialogTitle>{editing ? "Edit shipping rule" : "New shipping rule"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Wilaya">
                  <Select
                    value={form.wilayaId}
                    onValueChange={(v) => setForm({ ...form, wilayaId: v, communeId: "all" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose a wilaya" /></SelectTrigger>
                    <SelectContent>
                      {wilayas.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} · {placeName(w.name, locale, w.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Commune" hint="Optional — leave on all communes">
                  <Select
                    value={form.communeId}
                    onValueChange={(v) => setForm({ ...form, communeId: v })}
                    disabled={form.wilayaId === ""}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All communes</SelectItem>
                      {communes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} · {placeName(c.name, locale, c.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Delivery method">
                  <Select
                    value={form.deliveryMethod}
                    onValueChange={(v) => setForm({ ...form, deliveryMethod: v as RuleForm["deliveryMethod"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Home delivery</SelectItem>
                      <SelectItem value="office">Desk pickup</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Price (DZD)">
                  <Input type="number" min="0" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g. 450" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Min weight (g)">
                  <Input type="number" min="0" step="1" value={form.minWeight} onChange={(e) => setForm({ ...form, minWeight: e.target.value })} />
                </Field>
                <Field label="Max weight (g)" hint="Empty = no upper limit">
                  <Input type="number" min="1" step="1" value={form.maxWeight} onChange={(e) => setForm({ ...form, maxWeight: e.target.value })} placeholder="5000" />
                </Field>
              </div>
              <Field label="Status">
                <div className="flex items-center gap-3">
                  <Label htmlFor="rule-enabled" className="text-sm font-normal text-muted-foreground">
                    {form.enabled ? "Enabled" : "Disabled"}
                  </Label>
                  <Switch id="rule-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                </div>
              </Field>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={!canSubmit} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title="Delete shipping rule?"
          description="This removes the price rule for this destination and delivery method."
          confirmLabel="Delete rule"
          danger
          onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
        />
      </SellerShell>
    </div>
  );
}
