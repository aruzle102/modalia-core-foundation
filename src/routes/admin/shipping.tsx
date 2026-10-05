import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  Field,
  fmtMoney,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listWilayas,
  listCommunes,
  listShippingRules,
  upsertShippingRule,
  setShippingRuleEnabled,
  setWilayaActive,
  setCommuneActive,
  type AdminShippingRuleListItem,
} from "@/lib/admin-catalog.functions";
import { errMsg, pickName } from "./_shared";

export const Route = createFileRoute("/admin/shipping")({
  component: AdminShippingPage,
});

type RuleRow = AdminShippingRuleListItem;

function AdminShippingPage() {
  return (
    <AdminGate>
      <AdminShell title="Shipping" subtitle="Delivery pricing per wilaya and weight tier, plus wilaya/commune availability.">
        <ShippingManager />
      </AdminShell>
    </AdminGate>
  );
}

function ShippingManager() {
  const queryClient = useQueryClient();
  const [wilayaId, setWilayaId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<RuleRow | null | "new">(null);

  const wilayasQuery = useQuery({
    queryKey: ["admin-wilayas"],
    queryFn: () => listWilayas(),
    retry: false,
  });
  const wilayas = wilayasQuery.data?.wilayas ?? [];
  const selectedWilayaId = wilayaId ?? wilayas[0]?.id ?? null;

  const rulesQuery = useQuery({
    queryKey: ["admin-shipping-rules", selectedWilayaId],
    queryFn: () => listShippingRules({ data: { wilayaId: selectedWilayaId! } }),
    enabled: selectedWilayaId !== null,
    retry: false,
  });
  const communesQuery = useQuery({
    queryKey: ["admin-communes", selectedWilayaId],
    queryFn: () => listCommunes({ data: { wilayaId: selectedWilayaId! } }),
    enabled: selectedWilayaId !== null,
    retry: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-wilayas"] });
    queryClient.invalidateQueries({ queryKey: ["admin-shipping-rules", selectedWilayaId] });
    queryClient.invalidateQueries({ queryKey: ["admin-communes", selectedWilayaId] });
  };

  const toggleWilaya = useMutation({
    mutationFn: (payload: { wilayaId: string; active: boolean }) => setWilayaActive({ data: payload }),
    onSuccess: () => {
      toast.success("Wilaya updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-wilayas"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const toggleCommune = useMutation({
    mutationFn: (payload: { communeId: string; active: boolean }) => setCommuneActive({ data: payload }),
    onSuccess: () => {
      toast.success("Commune updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-communes", selectedWilayaId] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const toggleRule = useMutation({
    mutationFn: (payload: { id: string; enabled: boolean }) => setShippingRuleEnabled({ data: payload }),
    onSuccess: () => {
      toast.success("Rule updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-shipping-rules", selectedWilayaId] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const selectedWilaya = wilayas.find((w) => w.id === selectedWilayaId) ?? null;
  const rules = rulesQuery.data?.rules ?? [];
  const platformRules = rules.filter((r) => r.seller_id == null);
  const sellerRules = rules.filter((r) => r.seller_id != null);
  const communes = communesQuery.data?.communes ?? [];

  const weightLabel = (r: RuleRow) => {
    const minKg = (Number(r.min_weight_grams) / 1000).toFixed(1).replace(/\.0$/, "");
    if (r.max_weight_grams == null) return `${minKg}kg and above`;
    const maxKg = (Number(r.max_weight_grams) / 1000).toFixed(1).replace(/\.0$/, "");
    return `${minKg} – ${maxKg}kg`;
  };

  return (
    <div className="space-y-6">
      <AdminCard title="Wilaya">
        {wilayasQuery.isPending ? (
          <TableSkeleton />
        ) : wilayasQuery.isError ? (
          <EmptyState title="Could not load wilayas" text={errMsg(wilayasQuery.error)} />
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-60 flex-1 space-y-1.5">
              <Label>Select wilaya</Label>
              <Select value={selectedWilayaId ?? ""} onValueChange={setWilayaId}>
                <SelectTrigger><SelectValue placeholder="Choose a wilaya" /></SelectTrigger>
                <SelectContent>
                  {wilayas.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.code} — {pickName(w.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedWilaya ? (
              <div className="flex items-center gap-3 border border-border px-4 py-2.5">
                <div>
                  <p className="font-medium">{selectedWilaya.code} — {pickName(selectedWilaya.name)}</p>
                  <p className="text-caption text-muted-foreground">
                    {selectedWilaya.active ? "Deliverable" : "Disabled — checkout hides this wilaya"}
                  </p>
                </div>
                <Switch
                  checked={Boolean(selectedWilaya.active)}
                  onCheckedChange={(active) => toggleWilaya.mutate({ wilayaId: selectedWilaya.id, active })}
                  aria-label="Toggle wilaya availability"
                />
              </div>
            ) : null}
          </div>
        )}
      </AdminCard>

      <AdminCard
        title="Platform shipping rules"
        subtitle="Home / stop-desk pricing per weight tier. These apply when a seller has no custom rule."
      >
        {rulesQuery.isPending ? (
          <TableSkeleton />
        ) : rulesQuery.isError ? (
          <EmptyState title="Could not load rules" text={errMsg(rulesQuery.error)} />
        ) : platformRules.length === 0 ? (
          <EmptyState
            title="No platform rules for this wilaya"
            text="Add home and stop-desk prices for the weight tiers below."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Delivery</th>
                  <th className="px-3 py-2 font-medium">Weight tier</th>
                  <th className="px-3 py-2 font-medium">Commune</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Enabled</th>
                  <th className="px-3 py-2 font-medium text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {platformRules.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-3 capitalize">{r.delivery_method === "home" ? "Home" : "Stop desk"}</td>
                    <td className="px-3 py-3">{weightLabel(r)}</td>
                    <td className="px-3 py-3 text-caption">
                      {r.commune_id ? (pickName(r.communes?.name) || r.communes?.code || "—") : "All communes"}
                    </td>
                    <td className="px-3 py-3 font-medium">{fmtMoney(Number(r.price))}</td>
                    <td className="px-3 py-3">
                      <Switch
                        checked={Boolean(r.enabled)}
                        onCheckedChange={(enabled) => toggleRule.mutate({ id: r.id, enabled })}
                        aria-label="Toggle rule"
                      />
                    </td>
                    <td className="px-3 py-3 text-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditingRule(r)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sellerRules.length > 0 ? (
          <p className="mt-3 text-caption text-muted-foreground">
            {sellerRules.length} seller-specific rule(s) also exist for this wilaya; they override the platform prices.
          </p>
        ) : null}
        <div className="mt-4">
          <Button onClick={() => setEditingRule("new")} disabled={!selectedWilayaId}>
            <Plus className="size-4" /> Add rule
          </Button>
        </div>
      </AdminCard>

      <AdminCard title="Communes" subtitle="Toggle which communes are deliverable in this wilaya.">
        {communesQuery.isPending ? (
          <TableSkeleton />
        ) : communesQuery.isError ? (
          <EmptyState title="Could not load communes" text={errMsg(communesQuery.error)} />
        ) : communes.length === 0 ? (
          <EmptyState title="No communes" text="No communes are registered for this wilaya." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {communes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border border-border px-3 py-2.5">
                <div>
                  <p className="text-small font-medium">{pickName(c.name) || c.code}</p>
                  <p className="text-caption text-muted-foreground"><StatusPill status={c.active ? "active" : "inactive"} /></p>
                </div>
                <Switch
                  checked={Boolean(c.active)}
                  onCheckedChange={(active) => toggleCommune.mutate({ communeId: c.id, active })}
                  aria-label={`Toggle commune ${pickName(c.name)}`}
                />
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      {editingRule !== null && selectedWilayaId ? (
        <RuleDialog
          key={editingRule === "new" ? "new" : (editingRule as RuleRow).id}
          rule={editingRule === "new" ? null : (editingRule as RuleRow)}
          wilayaId={selectedWilayaId}
          onClose={() => setEditingRule(null)}
          onSaved={invalidate}
        />
      ) : null}
    </div>
  );
}

function RuleDialog({
  rule,
  wilayaId,
  onClose,
  onSaved,
}: {
  rule: RuleRow | null;
  wilayaId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deliveryMethod, setDeliveryMethod] = useState<string>(rule?.delivery_method ?? "home");
  const [price, setPrice] = useState(rule?.price != null ? String(rule.price) : "");
  const [minWeight, setMinWeight] = useState(String(rule?.min_weight_grams ?? 0));
  const [maxWeight, setMaxWeight] = useState(rule?.max_weight_grams != null ? String(rule.max_weight_grams) : "");
  const [enabled, setEnabled] = useState(Boolean(rule?.enabled ?? true));
  const [serverError, setServerError] = useState<string | null>(null);

  const priceError = price.trim() !== "" && !(Number(price) >= 0) ? "Price must be 0 or more." : null;
  const minError =
    minWeight.trim() !== "" && !(Number.isInteger(Number(minWeight)) && Number(minWeight) >= 0)
      ? "Min weight must be a whole number of grams ≥ 0."
      : null;
  const maxError =
    maxWeight.trim() !== "" && !(Number.isInteger(Number(maxWeight)) && Number(maxWeight) > Number(minWeight || 0))
      ? "Max weight must be a whole number of grams greater than min weight."
      : null;

  const save = useMutation({
    mutationFn: () =>
      upsertShippingRule({
        data: {
          id: rule?.id,
          seller_id: rule?.seller_id ?? null,
          wilaya_id: wilayaId,
          commune_id: rule?.commune_id ?? null,
          delivery_method: deliveryMethod as "home" | "office",
          price: Number(price),
          min_weight_grams: Number(minWeight) || 0,
          max_weight_grams: maxWeight.trim() === "" ? null : Number(maxWeight),
          enabled,
        },
      }),
    onSuccess: () => {
      toast.success(rule ? "Rule updated." : "Rule created.");
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  const hasError = Boolean(priceError || minError || maxError || price.trim() === "");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit shipping rule" : "New shipping rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Delivery method">
            <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="home">Home delivery</SelectItem>
                <SelectItem value="office">Stop desk</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Price (DZD)" error={priceError ?? undefined}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="600" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min weight (g)" error={minError ?? undefined} hint="e.g. 0 or 5000.">
              <Input inputMode="numeric" value={minWeight} onChange={(e) => setMinWeight(e.target.value)} />
            </Field>
            <Field label="Max weight (g)" error={maxError ?? undefined} hint="Empty = no upper limit.">
              <Input inputMode="numeric" value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} placeholder="Empty" />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="rule-enabled">Enabled</Label>
            <Switch id="rule-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">{serverError}</p>
          ) : null}
        </div>
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
            {save.isPending ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
