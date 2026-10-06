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
  getShippingSettings,
  listShippingCommunes,
  listShippingWilayas,
  setShippingSettings,
  toggleShippingRule,
  upsertShippingRule,
  type SellerShippingRuleRow,
} from "@/lib/seller-marketing.functions";
import {
  createSellerOffice,
  deleteSellerOffice,
  listSellerOffices,
  updateSellerOffice,
  type SellerOffice,
} from "@/lib/seller-offices.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/shipping")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
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

// ---------------------------------------------------------------------------
// Weight bands are FIXED PRESETS (V8 §27), matching the checkout_cart RPC's
// half-open semantics: min_weight_grams <= weight < max_weight_grams
// (max_weight_grams = null → no upper limit).
//   "0–5 kg"  → [0, 5000)
//   "> 5 kg"  → [5000, ∞)
// The boundary 5000 g belongs to exactly one band; there is no gap and no
// overlap, so the two presets always coexist for a destination+method.
// ---------------------------------------------------------------------------
const BANDS = [
  { key: "small", min: 0, max: 5000 },
  { key: "large", min: 5000, max: null },
] as const;
type BandKey = (typeof BANDS)[number]["key"];
const METHODS = ["home", "office"] as const;
type Method = (typeof METHODS)[number];

type RuleForm = {
  wilayaId: string;
  communeId: string;
  deliveryMethod: Method;
  band: BandKey;
  price: string;
  enabled: boolean;
};

const EMPTY_FORM: RuleForm = {
  wilayaId: "",
  communeId: "all",
  deliveryMethod: "home",
  band: "small",
  price: "",
  enabled: true,
};

type OfficeForm = {
  name: string;
  wilayaId: string;
  communeId: string;
  address: string;
  phone: string;
  openingHours: string;
  active: boolean;
};

const EMPTY_OFFICE_FORM: OfficeForm = {
  name: "",
  wilayaId: "",
  communeId: "all",
  address: "",
  phone: "",
  openingHours: "",
  active: true,
};

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ShippingPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).sellerShippingV8;
  const qc = useQueryClient();

  const query = useQuery({ queryKey: ["seller-shipping-rules"], queryFn: () => getShippingRules() });
  const settingsQuery = useQuery({ queryKey: ["seller-shipping-settings"], queryFn: () => getShippingSettings() });
  const officesQuery = useQuery({ queryKey: ["seller-offices"], queryFn: () => listSellerOffices() });
  const wilayasQuery = useQuery({ queryKey: ["seller-shipping-wilayas"], queryFn: () => listShippingWilayas() });

  const rules = query.data?.rules ?? [];
  const wilayas = wilayasQuery.data?.wilayas ?? [];
  const offices = officesQuery.data?.offices ?? [];
  const officeEnabled = settingsQuery.data?.office_enabled ?? true;

  const home = rules.filter((r) => r.delivery_method === "home").length;
  const office = rules.filter((r) => r.delivery_method === "office").length;
  const enabledCount = rules.filter((r) => r.enabled).length;

  const invalidateRules = () => qc.invalidateQueries({ queryKey: ["seller-shipping-rules"] });

  // ------------------------------------------------------------------
  // Office-delivery master switch (§27.4)
  // ------------------------------------------------------------------
  const [confirmDisableOffice, setConfirmDisableOffice] = useState(false);
  const settingsMutation = useMutation({
    mutationFn: (office_enabled: boolean) => setShippingSettings({ data: { office_enabled } }),
    onSuccess: () => {
      setConfirmDisableOffice(false);
      qc.invalidateQueries({ queryKey: ["seller-shipping-settings"] });
      invalidateRules();
    },
  });

  // ------------------------------------------------------------------
  // Per-wilaya price matrix (§27.1–2)
  //
  // One row per wilaya with wilaya-wide rules (commune_id IS NULL), four
  // editable cells: home/office × (0–5 kg / > 5 kg). An empty cell removes
  // that band's rule on save. Commune-specific rules are NOT shown here —
  // they live in the "All rules" table below.
  // ------------------------------------------------------------------
  const [addedWilayas, setAddedWilayas] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [savedRows, setSavedRows] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const matrixWilayaIds = Array.from(
    new Set([
      ...rules.filter((r) => r.wilaya_id && !r.commune_id).map((r) => r.wilaya_id as string),
      ...addedWilayas,
    ]),
  ).sort((a, b) => {
    const wa = wilayas.find((w) => w.id === a);
    const wb = wilayas.find((w) => w.id === b);
    return (wa?.code ?? "").localeCompare(wb?.code ?? "");
  });

  const findRule = (wilayaId: string, method: Method, bandKey: BandKey): SellerShippingRuleRow | undefined => {
    const band = BANDS.find((b) => b.key === bandKey);
    if (!band) return undefined;
    return rules.find(
      (r) =>
        r.wilaya_id === wilayaId &&
        r.commune_id == null &&
        r.delivery_method === method &&
        Number(r.min_weight_grams) === band.min &&
        (band.max == null ? r.max_weight_grams == null : Number(r.max_weight_grams) === band.max),
    );
  };

  const cellValue = (wilayaId: string, method: Method, bandKey: BandKey): string => {
    const edited = edits[wilayaId]?.[`${method}:${bandKey}`];
    if (edited !== undefined) return edited;
    const rule = findRule(wilayaId, method, bandKey);
    return rule ? String(rule.price) : "";
  };

  const setCellValue = (wilayaId: string, method: Method, bandKey: BandKey, value: string) => {
    setEdits((prev) => ({ ...prev, [wilayaId]: { ...(prev[wilayaId] ?? {}), [`${method}:${bandKey}`]: value } }));
    setSavedRows((prev) => {
      if (!prev[wilayaId]) return prev;
      const next = { ...prev };
      delete next[wilayaId];
      return next;
    });
  };

  const saveRowMutation = useMutation({
    mutationFn: async (wilayaId: string) => {
      const jobs: Array<Promise<unknown>> = [];
      for (const method of METHODS) {
        for (const band of BANDS) {
          const raw = cellValue(wilayaId, method, band.key).trim();
          const rule = findRule(wilayaId, method, band.key);
          if (raw === "") {
            if (rule) jobs.push(deleteShippingRule({ data: { id: rule.id } }));
            continue;
          }
          const price = Number(raw);
          if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
            throw new Error(`${t.prices.saveError} (${method} · ${band.key})`);
          }
          const payload = {
            wilaya_id: wilayaId,
            commune_id: null as string | null,
            delivery_method: method,
            price,
            min_weight_grams: band.min,
            max_weight_grams: band.max,
            enabled: rule?.enabled ?? true,
          };
          jobs.push(
            upsertShippingRule(rule ? { data: { ...payload, id: rule.id } } : { data: payload }),
          );
        }
      }
      await Promise.all(jobs);
      return wilayaId;
    },
    onSuccess: (wilayaId) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[wilayaId];
        return next;
      });
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[wilayaId];
        return next;
      });
      setSavedRows((prev) => ({ ...prev, [wilayaId]: true }));
      setAddedWilayas((prev) => prev.filter((w) => w !== wilayaId));
      invalidateRules();
    },
    onError: (error, wilayaId) => {
      setRowErrors((prev) => ({
        ...prev,
        [wilayaId]: error instanceof Error ? error.message : t.prices.saveError,
      }));
    },
  });

  const addWilaya = (wilayaId: string) => {
    if (!wilayaId || matrixWilayaIds.includes(wilayaId)) return;
    setAddedWilayas((prev) => (prev.includes(wilayaId) ? prev : [...prev, wilayaId]));
  };

  const removeAddedRow = (wilayaId: string) => {
    setAddedWilayas((prev) => prev.filter((w) => w !== wilayaId));
    setEdits((prev) => {
      const next = { ...prev };
      delete next[wilayaId];
      return next;
    });
  };

  // ------------------------------------------------------------------
  // Rule dialog (new/edit) — preset bands, no free-text weights (§27.2)
  // ------------------------------------------------------------------
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SellerShippingRuleRow | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SellerShippingRuleRow | null>(null);

  const communesQuery = useQuery({
    queryKey: ["seller-shipping-communes", form.wilayaId],
    queryFn: () => listShippingCommunes({ data: { wilayaId: form.wilayaId } }),
    enabled: dialogOpen && form.wilayaId !== "",
  });
  const communes = communesQuery.data?.communes ?? [];

  const saveMutation = useMutation({
    mutationFn: () => {
      const band = BANDS.find((b) => b.key === form.band) ?? BANDS[0];
      const payload = {
        wilaya_id: form.wilayaId,
        commune_id: form.communeId === "all" ? null : form.communeId,
        delivery_method: form.deliveryMethod,
        price: Number(form.price),
        min_weight_grams: band.min,
        max_weight_grams: band.max,
        enabled: form.enabled,
      };
      return editing
        ? upsertShippingRule({ data: { ...payload, id: editing.id } })
        : upsertShippingRule({ data: payload });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      invalidateRules();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggleShippingRule({ data: input }),
    onSuccess: invalidateRules,
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: string }) => deleteShippingRule({ data: input }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateRules();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (row: SellerShippingRuleRow) => {
    setEditing(row);
    const min = Number(row.min_weight_grams);
    const max = row.max_weight_grams == null ? null : Number(row.max_weight_grams);
    const band: BandKey = min === 0 && max === 5000 ? "small" : min === 5000 && max == null ? "large" : "small";
    setForm({
      wilayaId: row.wilaya_id ?? "",
      communeId: row.commune_id ?? "all",
      deliveryMethod: row.delivery_method === "office" ? "office" : "home",
      band,
      price: String(row.price),
      enabled: row.enabled,
    });
    setDialogOpen(true);
  };

  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const canSubmit = form.wilayaId !== "" && form.price.trim() !== "" && !saveMutation.isPending;

  // ------------------------------------------------------------------
  // Delivery offices (§28)
  // ------------------------------------------------------------------
  const [officeDialogOpen, setOfficeDialogOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<SellerOffice | null>(null);
  const [officeForm, setOfficeForm] = useState<OfficeForm>(EMPTY_OFFICE_FORM);
  const [deleteOfficeTarget, setDeleteOfficeTarget] = useState<SellerOffice | null>(null);

  const officeCommunesQuery = useQuery({
    queryKey: ["seller-office-communes", officeForm.wilayaId],
    queryFn: () => listShippingCommunes({ data: { wilayaId: officeForm.wilayaId } }),
    enabled: officeDialogOpen && officeForm.wilayaId !== "",
  });
  const officeCommunes = officeCommunesQuery.data?.communes ?? [];

  const officeSaveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: officeForm.name.trim(),
        wilaya_id: officeForm.wilayaId,
        commune_id: officeForm.communeId === "all" ? null : officeForm.communeId,
        address: officeForm.address.trim() === "" ? null : officeForm.address.trim(),
        phone: officeForm.phone.trim() === "" ? null : officeForm.phone.trim(),
        opening_hours: officeForm.openingHours.trim() === "" ? null : officeForm.openingHours.trim(),
        active: officeForm.active,
      };
      if (editingOffice) {
        await updateSellerOffice({ data: { ...payload, id: editingOffice.id } });
      } else {
        await createSellerOffice({ data: payload });
      }
      return { ok: true as const };
    },
    onSuccess: () => {
      setOfficeDialogOpen(false);
      setEditingOffice(null);
      setOfficeForm(EMPTY_OFFICE_FORM);
      qc.invalidateQueries({ queryKey: ["seller-offices"] });
    },
  });

  const officeToggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => updateSellerOffice({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller-offices"] }),
  });

  const officeDeleteMutation = useMutation({
    mutationFn: (input: { id: string }) => deleteSellerOffice({ data: input }),
    onSuccess: () => {
      setDeleteOfficeTarget(null);
      qc.invalidateQueries({ queryKey: ["seller-offices"] });
    },
  });

  const openCreateOffice = () => {
    setEditingOffice(null);
    setOfficeForm(EMPTY_OFFICE_FORM);
    setOfficeDialogOpen(true);
  };
  const openEditOffice = (o: SellerOffice) => {
    setEditingOffice(o);
    setOfficeForm({
      name: o.name,
      wilayaId: o.wilaya_id,
      communeId: o.commune_id ?? "all",
      address: o.address ?? "",
      phone: o.phone ?? "",
      openingHours: o.opening_hours ?? "",
      active: o.active,
    });
    setOfficeDialogOpen(true);
  };

  const officeSaveError = officeSaveMutation.error instanceof Error ? officeSaveMutation.error.message : null;
  const canSubmitOffice =
    officeForm.name.trim().length >= 2 && officeForm.wilayaId !== "" && !officeSaveMutation.isPending;

  const rulesError = query.error instanceof Error ? query.error.message : null;

  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell
        eyebrow="Store"
        title={t.title}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {t.dialog.create}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label={t.stats.rules} value={rules.length} />
          <Stat label={t.stats.home} value={home} />
          <Stat label={t.stats.office} value={office} />
          <Stat label={t.stats.enabled} value={enabledCount} />
        </div>

        {/* Office-delivery master switch */}
        <AdminCard title={t.officeDelivery.title} subtitle={t.officeDelivery.hint} className="mt-6">
          {settingsQuery.isPending ? (
            <TableSkeleton rows={1} />
          ) : settingsQuery.isError ? (
            <SectionError
              message={settingsQuery.error instanceof Error ? settingsQuery.error.message : t.loadError}
              onRetry={() => settingsQuery.refetch()}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={officeEnabled}
                  disabled={settingsMutation.isPending}
                  onCheckedChange={(v) => {
                    if (v) settingsMutation.mutate(true);
                    else setConfirmDisableOffice(true);
                  }}
                  aria-label={t.officeDelivery.enable}
                />
                <Label className="text-sm font-normal text-muted-foreground">
                  {officeEnabled ? t.officeDelivery.enabledOn : t.officeDelivery.enabledOff} — {t.officeDelivery.enable}
                </Label>
              </div>
              {!officeEnabled && (
                <p className="text-sm text-amber-600 dark:text-amber-400">{t.officeDelivery.pausedNote}</p>
              )}
            </div>
          )}
        </AdminCard>

        {/* Per-wilaya price matrix */}
        <AdminCard title={t.prices.title} subtitle={t.prices.hint} className="mt-6">
          {query.isPending ? (
            <TableSkeleton rows={6} />
          ) : query.isError ? (
            <SectionError message={rulesError ?? t.loadError} onRetry={() => query.refetch()} />
          ) : matrixWilayaIds.length === 0 ? (
            <EmptyState
              title={t.prices.empty}
              text={t.prices.emptyText}
              action={
                <div className="flex w-full max-w-sm gap-2">
                  <Select value="" onValueChange={addWilaya}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t.prices.chooseWilaya} />
                    </SelectTrigger>
                    <SelectContent>
                      {wilayas.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} · {placeName(w.name, locale, w.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.rules.wilaya}</TableHead>
                      {METHODS.map((m) =>
                        BANDS.map((b) => (
                          <TableHead key={`${m}-${b.key}`} className="whitespace-nowrap">
                            {m === "home" ? t.prices.home : t.prices.office} ·{" "}
                            {b.key === "small" ? t.prices.bandSmall : t.prices.bandLarge}
                          </TableHead>
                        )),
                      )}
                      <TableHead className="text-end">{t.rules.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrixWilayaIds.map((wilayaId) => {
                      const w = wilayas.find((x) => x.id === wilayaId);
                      const isAdded = addedWilayas.includes(wilayaId);
                      const saving = saveRowMutation.isPending && saveRowMutation.variables === wilayaId;
                      return (
                        <TableRow key={wilayaId}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {w ? `${w.code} · ${placeName(w.name, locale, w.code)}` : wilayaId}
                          </TableCell>
                          {METHODS.map((m) =>
                            BANDS.map((b) => (
                              <TableCell key={`${m}-${b.key}`}>
                                <Input
                                  type="number"
                                  min="0"
                                  inputMode="decimal"
                                  className="w-28 tabular-nums"
                                  placeholder={t.prices.pricePlaceholder}
                                  value={cellValue(wilayaId, m, b.key)}
                                  onChange={(e) => setCellValue(wilayaId, m, b.key, e.target.value)}
                                  aria-label={`${w?.code ?? ""} ${m} ${b.key}`}
                                />
                              </TableCell>
                            )),
                          )}
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              {savedRows[wilayaId] && (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400">{t.prices.saved}</span>
                              )}
                              <Button
                                size="sm"
                                disabled={saving}
                                onClick={() => saveRowMutation.mutate(wilayaId)}
                              >
                                {saving ? t.dialog.saving : t.prices.saveRow}
                              </Button>
                              {isAdded && (
                                <Button variant="ghost" size="sm" onClick={() => removeAddedRow(wilayaId)}>
                                  {t.prices.removeRow}
                                </Button>
                              )}
                            </div>
                            {rowErrors[wilayaId] && (
                              <p className="mt-1 text-end text-xs text-destructive">{rowErrors[wilayaId]}</p>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex w-full max-w-sm items-center gap-2">
                <Select value="" onValueChange={addWilaya}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.prices.addWilaya} />
                  </SelectTrigger>
                  <SelectContent>
                    {wilayas
                      .filter((w) => !matrixWilayaIds.includes(w.id))
                      .map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} · {placeName(w.name, locale, w.code)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </AdminCard>

        {/* All rules (incl. commune-specific) */}
        <AdminCard title={t.rules.title} subtitle={t.rules.hint} className="mt-6">
          {query.isPending ? (
            <TableSkeleton rows={6} />
          ) : query.isError ? (
            <SectionError message={rulesError ?? t.loadError} onRetry={() => query.refetch()} />
          ) : rules.length === 0 ? (
            <EmptyState title={t.prices.empty} text={t.rules.hint} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.rules.wilaya}</TableHead>
                    <TableHead>{t.rules.commune}</TableHead>
                    <TableHead>{t.rules.method}</TableHead>
                    <TableHead>{t.rules.band}</TableHead>
                    <TableHead>{t.rules.price}</TableHead>
                    <TableHead>{t.rules.enabled}</TableHead>
                    <TableHead className="text-end">{t.rules.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.wilayas ? `${r.wilayas.code} · ${placeName(r.wilayas.name, locale, r.wilayas.code)}` : "—"}
                      </TableCell>
                      <TableCell>
                        {r.communes
                          ? `${r.communes.code} · ${placeName(r.communes.name, locale, r.communes.code)}`
                          : t.rules.allCommunes}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={r.delivery_method === "home" ? "confirmed" : "pending"} />
                        <span className="ms-2 text-xs text-muted-foreground">
                          {r.delivery_method === "home" ? t.rules.home : t.rules.office}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {bandLabel(Number(r.min_weight_grams), r.max_weight_grams != null ? Number(r.max_weight_grams) : null)}
                      </TableCell>
                      <TableCell className="font-semibold">{fmtMoney(r.price, "DZD", locale)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={r.enabled}
                          disabled={toggleMutation.isPending}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, enabled: v })}
                          aria-label={r.enabled ? t.dialog.off : t.dialog.on}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            <Pencil className="me-1 h-3.5 w-3.5" />
                            {t.rules.edit}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>
                            {t.rules.delete}
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

        {/* Delivery offices (§28) */}
        <AdminCard
          title={t.offices.title}
          subtitle={t.offices.hint}
          className="mt-6"
          actions={
            <Button size="sm" onClick={openCreateOffice}>
              <Plus className="me-2 h-4 w-4" />
              {t.offices.add}
            </Button>
          }
        >
          {officesQuery.isPending ? (
            <TableSkeleton rows={3} />
          ) : officesQuery.isError ? (
            <SectionError
              message={officesQuery.error instanceof Error ? officesQuery.error.message : t.loadError}
              onRetry={() => officesQuery.refetch()}
            />
          ) : offices.length === 0 ? (
            <EmptyState
              title={t.offices.empty}
              text={t.offices.emptyText}
              action={<Button onClick={openCreateOffice}>{t.offices.add}</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.offices.name}</TableHead>
                    <TableHead>{t.offices.wilaya}</TableHead>
                    <TableHead>{t.offices.address}</TableHead>
                    <TableHead>{t.offices.phone}</TableHead>
                    <TableHead>{t.offices.hours}</TableHead>
                    <TableHead>{t.offices.active}</TableHead>
                    <TableHead className="text-end">{t.rules.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offices.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {o.wilayas ? `${o.wilayas.code} · ${placeName(o.wilayas.name, locale, o.wilayas.code)}` : "—"}
                        {o.communes && (
                          <span className="block text-xs text-muted-foreground">
                            {placeName(o.communes.name, locale, o.communes.code)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-52 truncate text-sm text-muted-foreground">{o.address ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{o.phone ?? "—"}</TableCell>
                      <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                        {o.opening_hours ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={o.active}
                          disabled={officeToggleMutation.isPending}
                          onCheckedChange={(v) => officeToggleMutation.mutate({ id: o.id, active: v })}
                          aria-label={o.active ? t.dialog.off : t.dialog.on}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditOffice(o)}>
                            <Pencil className="me-1 h-3.5 w-3.5" />
                            {t.rules.edit}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteOfficeTarget(o)}>
                            {t.rules.delete}
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

        {/* Rule dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? t.dialog.editTitle : t.dialog.newTitle}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.dialog.wilaya}>
                  <Select
                    value={form.wilayaId}
                    onValueChange={(v) => setForm({ ...form, wilayaId: v, communeId: "all" })}
                  >
                    <SelectTrigger><SelectValue placeholder={t.dialog.chooseWilaya} /></SelectTrigger>
                    <SelectContent>
                      {wilayas.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} · {placeName(w.name, locale, w.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t.dialog.commune} hint={t.dialog.communeHint}>
                  <Select
                    value={form.communeId}
                    onValueChange={(v) => setForm({ ...form, communeId: v })}
                    disabled={form.wilayaId === ""}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.dialog.allCommunes}</SelectItem>
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
                <Field label={t.dialog.method}>
                  <Select
                    value={form.deliveryMethod}
                    onValueChange={(v) => setForm({ ...form, deliveryMethod: v as Method })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">{t.dialog.home}</SelectItem>
                      <SelectItem value="office">{t.dialog.office}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t.dialog.price}>
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="450"
                  />
                </Field>
              </div>
              <Field label={t.dialog.band}>
                <div className="flex gap-2">
                  {BANDS.map((b) => (
                    <Button
                      key={b.key}
                      type="button"
                      variant={form.band === b.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm({ ...form, band: b.key })}
                    >
                      {b.key === "small" ? t.dialog.bandSmall : t.dialog.bandLarge}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label={t.dialog.status}>
                <div className="flex items-center gap-3">
                  <Label htmlFor="rule-enabled" className="text-sm font-normal text-muted-foreground">
                    {form.enabled ? t.dialog.on : t.dialog.off}
                  </Label>
                  <Switch id="rule-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                </div>
              </Field>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t.dialog.cancel}</Button>
              <Button disabled={!canSubmit} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? t.dialog.saving : editing ? t.dialog.save : t.dialog.create}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title={t.deleteRule.title}
          description={t.deleteRule.text}
          confirmLabel={t.deleteRule.confirm}
          danger
          onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
        />

        <ConfirmDialog
          open={confirmDisableOffice}
          onOpenChange={setConfirmDisableOffice}
          title={t.officeDelivery.confirmDisableTitle}
          description={t.officeDelivery.confirmDisableText}
          confirmLabel={t.officeDelivery.confirmDisable}
          danger
          onConfirm={() => settingsMutation.mutate(false)}
        />

        {/* Office dialog */}
        <Dialog open={officeDialogOpen} onOpenChange={setOfficeDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingOffice ? t.offices.editTitle : t.offices.newTitle}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label={t.offices.name}>
                <Input
                  value={officeForm.name}
                  onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })}
                  maxLength={120}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.offices.wilaya}>
                  <Select
                    value={officeForm.wilayaId}
                    onValueChange={(v) => setOfficeForm({ ...officeForm, wilayaId: v, communeId: "all" })}
                  >
                    <SelectTrigger><SelectValue placeholder={t.offices.chooseWilaya} /></SelectTrigger>
                    <SelectContent>
                      {wilayas.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} · {placeName(w.name, locale, w.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={`${t.offices.commune} (${t.offices.communeOptional})`}>
                  <Select
                    value={officeForm.communeId}
                    onValueChange={(v) => setOfficeForm({ ...officeForm, communeId: v })}
                    disabled={officeForm.wilayaId === ""}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.offices.allCommunes}</SelectItem>
                      {officeCommunes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} · {placeName(c.name, locale, c.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label={t.offices.address}>
                <Input
                  value={officeForm.address}
                  onChange={(e) => setOfficeForm({ ...officeForm, address: e.target.value })}
                  maxLength={500}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.offices.phone}>
                  <Input
                    value={officeForm.phone}
                    onChange={(e) => setOfficeForm({ ...officeForm, phone: e.target.value })}
                    maxLength={24}
                    inputMode="tel"
                    dir="ltr"
                  />
                </Field>
                <Field label={t.offices.hours} hint={t.offices.hoursHint}>
                  <Input
                    value={officeForm.openingHours}
                    onChange={(e) => setOfficeForm({ ...officeForm, openingHours: e.target.value })}
                    maxLength={300}
                  />
                </Field>
              </div>
              <Field label={t.offices.active}>
                <div className="flex items-center gap-3">
                  <Label htmlFor="office-active" className="text-sm font-normal text-muted-foreground">
                    {officeForm.active ? t.dialog.on : t.dialog.off}
                  </Label>
                  <Switch
                    id="office-active"
                    checked={officeForm.active}
                    onCheckedChange={(v) => setOfficeForm({ ...officeForm, active: v })}
                  />
                </div>
              </Field>
              {officeSaveError ? <p className="text-sm text-destructive">{officeSaveError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOfficeDialogOpen(false)}>{t.offices.cancel}</Button>
              <Button disabled={!canSubmitOffice} onClick={() => officeSaveMutation.mutate()}>
                {officeSaveMutation.isPending ? t.offices.saving : editingOffice ? t.offices.save : t.offices.create}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteOfficeTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteOfficeTarget(null); }}
          title={t.offices.deleteTitle}
          description={t.offices.deleteText}
          confirmLabel={t.offices.deleteConfirm}
          danger
          onConfirm={() => { if (deleteOfficeTarget) officeDeleteMutation.mutate({ id: deleteOfficeTarget.id }); }}
        />
      </SellerShell>
    </div>
  );
}
