import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
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
  AdminCard,
  ConfirmDialog,
  EmptyState,
  Field,
  Stat,
  TableSkeleton,
} from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { RouteError } from "@/components/routing/route-states";
import {
  createSellerOffice,
  deleteSellerOffice,
  listSellerOffices,
  updateSellerOffice,
  type SellerOffice,
} from "@/lib/seller-offices.functions";
import { listShippingCommunes, listShippingWilayas } from "@/lib/seller-marketing.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/offices")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  errorComponent: ({ reset }) => (
    <SellerShell eyebrow="Seller workspace" title="Delivery Offices">
      <RouteError message="Your delivery offices could not be loaded. Check your connection and try again." reset={reset} />
    </SellerShell>
  ),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Delivery Offices — Seller — Modalia" },
      { name: "description", content: "Manage your delivery offices — the pickup points where customers collect orders." },
    ],
  }),
  component: SellerOfficesPage,
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

type OfficeFormErrors = {
  name?: string;
  wilayaId?: string;
  phone?: string;
};

function SellerOfficesPage() {
  const search = Route.useSearch() as unknown as { locale?: string };
  // Defensive: the generated route tree may not yet include this path
  // (TanStack codegen runs at build time); normalize through getLocale.
  const locale = getLocale(search.locale);
  const t = getTranslations(locale);
  const o = t.sellerShippingV8.offices;
  const navTitle = t.sellerDashboardV8.nav.offices;
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SellerOffice | null>(null);
  const [form, setForm] = useState<OfficeForm>(EMPTY_OFFICE_FORM);
  const [formErrors, setFormErrors] = useState<OfficeFormErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<SellerOffice | null>(null);

  const officesQuery = useQuery({ queryKey: ["seller-offices"], queryFn: () => listSellerOffices() });
  const offices = officesQuery.data?.offices ?? [];

  const wilayasQuery = useQuery({ queryKey: ["seller-shipping-wilayas"], queryFn: () => listShippingWilayas() });
  const wilayas = wilayasQuery.data?.wilayas ?? [];

  const communesQuery = useQuery({
    queryKey: ["seller-office-communes", form.wilayaId],
    queryFn: () => listShippingCommunes({ data: { wilayaId: form.wilayaId } }),
    enabled: dialogOpen && form.wilayaId !== "",
  });
  const communes = communesQuery.data?.communes ?? [];

  const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // ------------------------------------------------------------------
  // Client-side validation: name >= 2 chars, wilaya required,
  // phone must match the server schema when provided.
  // ------------------------------------------------------------------
  function validate(next: OfficeForm): OfficeFormErrors {
    const errors: OfficeFormErrors = {};
    if (next.name.trim().length < 2) errors.name = errName(next.name.trim().length === 0);
    if (next.wilayaId === "") errors.wilayaId = errWilaya;
    const phone = next.phone.trim();
    if (phone !== "") {
      if (phone.length < 6 || phone.length > 24 || !/^[+0-9][0-9\s\-/]*$/.test(phone)) {
        errors.phone = errPhone;
      }
    }
    return errors;
  }

  // Inline validation strings (trilingual).
  const errName = (missing: boolean) =>
    missing
      ? locale === "ar"
        ? "أدخل اسم المكتب."
        : locale === "fr"
          ? "Saisissez le nom du bureau."
          : "Enter the office name."
      : locale === "ar"
        ? "الاسم يجب أن يحتوي على حرفين على الأقل."
        : locale === "fr"
          ? "Le nom doit contenir au moins 2 caractères."
          : "Name needs at least 2 characters.";
  const errWilaya =
    locale === "ar"
      ? "اختر الولاية."
      : locale === "fr"
        ? "Choisissez une wilaya."
        : "Choose a wilaya.";
  const errPhone =
    locale === "ar"
      ? "رقم الهاتف غير صالح."
      : locale === "fr"
        ? "Numéro de téléphone invalide."
        : "Phone number looks invalid.";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        wilaya_id: form.wilayaId,
        commune_id: form.communeId === "all" ? null : form.communeId,
        address: form.address.trim() === "" ? null : form.address.trim(),
        phone: form.phone.trim() === "" ? null : form.phone.trim(),
        opening_hours: form.openingHours.trim() === "" ? null : form.openingHours.trim(),
        active: form.active,
      };
      if (editing) {
        await updateSellerOffice({ data: { ...payload, id: editing.id } });
      } else {
        await createSellerOffice({ data: payload });
      }
      return { ok: true as const };
    },
    onSuccess: () => {
      toast.success(editing ? oSaved : oCreated);
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_OFFICE_FORM);
      setFormErrors({});
      qc.invalidateQueries({ queryKey: ["seller-offices"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => updateSellerOffice({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller-offices"] }),
    onError: (e) => toast.error(errMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: string }) => deleteSellerOffice({ data: input }),
    onSuccess: () => {
      toast.success(oDeleted);
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["seller-offices"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const oCreated =
    locale === "ar" ? "تمت إضافة المكتب." : locale === "fr" ? "Bureau ajouté." : "Office added.";
  const oSaved =
    locale === "ar" ? "تم حفظ التغييرات." : locale === "fr" ? "Modifications enregistrées." : "Changes saved.";
  const oDeleted =
    locale === "ar" ? "تم حذف المكتب." : locale === "fr" ? "Bureau supprimé." : "Office deleted.";

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_OFFICE_FORM);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (office: SellerOffice) => {
    setEditing(office);
    setForm({
      name: office.name,
      wilayaId: office.wilaya_id,
      communeId: office.commune_id ?? "all",
      address: office.address ?? "",
      phone: office.phone ?? "",
      openingHours: office.opening_hours ?? "",
      active: office.active,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const canSubmit = !saveMutation.isPending;

  const handleSave = () => {
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    saveMutation.mutate();
  };

  const activeCount = offices.filter((x) => x.active).length;
  const loadError = officesQuery.error instanceof Error ? officesQuery.error.message : o.empty;

  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell
        eyebrow="Seller workspace"
        title={navTitle}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {o.add}
          </Button>
        }
      >
        <p className="text-body text-muted-foreground">{o.hint}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label={navTitle} value={offices.length} />
          <Stat label={o.active} value={activeCount} />
          <Stat
            label={locale === "ar" ? "غير نشط" : locale === "fr" ? "Inactifs" : "Inactive"}
            value={offices.length - activeCount}
          />
        </div>

        <AdminCard title={o.title} subtitle={o.hint} className="mt-6">
          {officesQuery.isPending ? (
            <TableSkeleton rows={3} />
          ) : officesQuery.isError ? (
            <EmptyState
              title={loadError}
              action={
                <Button variant="outline" onClick={() => officesQuery.refetch()}>
                  {locale === "ar" ? "إعادة المحاولة" : locale === "fr" ? "Réessayer" : "Retry"}
                </Button>
              }
            />
          ) : offices.length === 0 ? (
            <EmptyState title={o.empty} text={o.emptyText} action={<Button onClick={openCreate}>{o.add}</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{o.name}</TableHead>
                    <TableHead>{o.wilaya}</TableHead>
                    <TableHead>{o.address}</TableHead>
                    <TableHead>{o.phone}</TableHead>
                    <TableHead>{o.hours}</TableHead>
                    <TableHead>{o.active}</TableHead>
                    <TableHead className="text-end">
                      {locale === "ar" ? "إجراءات" : locale === "fr" ? "Actions" : "Actions"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offices.map((office) => (
                    <TableRow key={office.id}>
                      <TableCell className="font-medium">{office.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {office.wilayas
                          ? `${office.wilayas.code} · ${placeName(office.wilayas.name, locale, office.wilayas.code)}`
                          : "—"}
                        {office.communes && (
                          <span className="block text-xs text-muted-foreground">
                            {placeName(office.communes.name, locale, office.communes.code)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-52 truncate text-sm text-muted-foreground">
                        {office.address ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{office.phone ?? "—"}</TableCell>
                      <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                        {office.opening_hours ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={office.active}
                          disabled={toggleMutation.isPending}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: office.id, active: v })}
                          aria-label={office.active ? t.sellerShippingV8.dialog.off : t.sellerShippingV8.dialog.on}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(office)}>
                            <Pencil className="me-1 h-3.5 w-3.5" />
                            {t.sellerShippingV8.rules.edit}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(office)}>
                            {t.sellerShippingV8.rules.delete}
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

        {/* Create / edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? o.editTitle : o.newTitle}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label={o.name} error={formErrors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={120}
                  aria-invalid={formErrors.name ? true : undefined}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={o.wilaya} error={formErrors.wilayaId}>
                  <Select
                    value={form.wilayaId}
                    onValueChange={(v) => setForm({ ...form, wilayaId: v, communeId: "all" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={o.chooseWilaya} />
                    </SelectTrigger>
                    <SelectContent>
                      {wilayas.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} · {placeName(w.name, locale, w.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={`${o.commune} (${o.communeOptional})`}>
                  <Select
                    value={form.communeId}
                    onValueChange={(v) => setForm({ ...form, communeId: v })}
                    disabled={form.wilayaId === ""}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{o.allCommunes}</SelectItem>
                      {communes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} · {placeName(c.name, locale, c.code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label={o.address}>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  maxLength={500}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={o.phone} error={formErrors.phone}>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    maxLength={24}
                    inputMode="tel"
                    dir="ltr"
                    aria-invalid={formErrors.phone ? true : undefined}
                  />
                </Field>
                <Field label={o.hours} hint={o.hoursHint}>
                  <Input
                    value={form.openingHours}
                    onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
                    maxLength={300}
                  />
                </Field>
              </div>
              <Field label={o.active}>
                <div className="flex items-center gap-3">
                  <Label htmlFor="office-active" className="text-sm font-normal text-muted-foreground">
                    {form.active ? t.sellerShippingV8.dialog.on : t.sellerShippingV8.dialog.off}
                  </Label>
                  <Switch
                    id="office-active"
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                </div>
              </Field>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {o.cancel}
              </Button>
              <Button disabled={!canSubmit} onClick={handleSave}>
                {saveMutation.isPending ? o.saving : editing ? o.save : o.create}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={o.deleteTitle}
          description={o.deleteText}
          confirmLabel={o.deleteConfirm}
          danger
          onConfirm={() => {
            if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id });
          }}
        />
      </SellerShell>
    </div>
  );
}
