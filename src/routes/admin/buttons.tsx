import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MousePointerClick, Plus, Pencil, Trash2 } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/routing/back-link";
import {
  listSiteButtons,
  createSiteButton,
  updateSiteButton,
  deleteSiteButton,
  ACTION_TYPES,
  PLACEMENTS,
  BUTTON_STYLES,
  type SiteButton,
} from "@/lib/admin-buttons.functions";
import { getLocale } from "@/lib/i18n";
import { strParam } from "@/hooks/use-url-state";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/buttons")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    back: strParam(search["back"]),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Button Control — Modalia Admin" },
      { name: "description", content: "Centralized control over site buttons and CTAs." },
    ],
  }),
  component: ButtonsPage,
});

const PLACEMENT_LABELS: Record<string, string> = {
  hero_primary: "Hero — primary",
  hero_secondary: "Hero — secondary",
  header: "Header",
  footer: "Footer",
  category_cta: "Category CTA",
  product_cta: "Product CTA",
  banner_cta: "Banner CTA",
};

function ButtonsPage() {
  const { locale, back } = Route.useSearch();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SiteButton | null>(null);
  const [showForm, setShowForm] = useState(false);

  const buttonsQuery = useQuery({
    queryKey: ["admin-site-buttons"],
    queryFn: () => listSiteButtons({ data: {} }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-site-buttons"] });

  const del = useMutation({
    mutationFn: (id: string) => deleteSiteButton({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Button deleted."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete."),
  });

  const toggle = useMutation({
    mutationFn: (b: SiteButton) => updateSiteButton({ data: { id: b.id, is_active: !b.is_active } }),
    onSuccess: () => { invalidate(); toast.success("Button updated."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update."),
  });

  const buttons = buttonsQuery.data?.buttons ?? [];
  const grouped = PLACEMENTS.map((p) => ({
    placement: p,
    items: buttons.filter((b) => b.placement === p),
  })).filter((g) => g.items.length > 0);

  return (
    <AdminGate>
      <AdminShell
        title="Button Control"
        subtitle="Centralized control over site buttons and CTAs. Safe predefined actions only."
        breadcrumbs={[{ label: "Button Control" }]}
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="size-4 me-1.5" />
            New button
          </Button>
        }
      >
        <BackLink back={back} fallbackTo="/admin" fallbackSearch={{ locale }}>
          <ArrowLeft className="size-4 me-1.5" />
          Back
        </BackLink>

        {showForm ? (
          <ButtonForm
            initial={editing}
            onClose={() => { setShowForm(false); setEditing(null); }}
            onSaved={() => { setShowForm(false); setEditing(null); invalidate(); }}
          />
        ) : null}

        {buttonsQuery.isPending ? (
          <div className="mt-4 space-y-2" aria-busy="true">
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : buttons.length === 0 && !showForm ? (
          <AdminCard className="mt-4">
            <EmptyState
              title="No buttons configured"
              text="Create your first site button. Only safe predefined actions are allowed."
            />
          </AdminCard>
        ) : (
          <div className="mt-4 space-y-6">
            {grouped.map((g) => (
              <section key={g.placement}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {PLACEMENT_LABELS[g.placement] ?? g.placement}
                </h2>
                <div className="grid gap-3">
                  {g.items.map((b) => (
                    <AdminCard key={b.id}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <MousePointerClick className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{b.label}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {b.action_type} → {b.destination}
                            {b.locale ? ` · ${b.locale.toUpperCase()}` : ""}
                            {!b.is_active ? " · Disabled" : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggle.mutate(b)}
                            disabled={toggle.isPending}
                          >
                            {b.is_active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditing(b); setShowForm(true); }}
                            aria-label={`Edit ${b.label}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { if (confirm(`Delete "${b.label}"?`)) del.mutate(b.id); }}
                            aria-label={`Delete ${b.label}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </AdminCard>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </AdminShell>
    </AdminGate>
  );
}

function ButtonForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: SiteButton | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [actionType, setActionType] = useState<string>(initial?.action_type ?? "link_internal");
  const [destination, setDestination] = useState(initial?.destination ?? "/shop");
  const [placement, setPlacement] = useState<string>(initial?.placement ?? "hero_primary");
  const [style, setStyle] = useState<string>(initial?.style ?? "primary");
  const [locale, setLocale] = useState(initial?.locale ?? "");

  const save = useMutation({
    mutationFn: async (): Promise<{ id: string } | { ok: boolean }> => {
      const payload = {
        label: label.trim(),
        action_type: actionType as (typeof ACTION_TYPES)[number],
        destination: destination.trim(),
        placement: placement as (typeof PLACEMENTS)[number],
        style: style as (typeof BUTTON_STYLES)[number],
        is_active: initial?.is_active ?? true,
        sort_order: initial?.sort_order ?? 0,
        locale: locale === "" ? null : (locale as "ar" | "fr" | "en"),
      };
      return initial
        ? updateSiteButton({ data: { id: initial.id, ...payload } })
        : createSiteButton({ data: payload });
    },
    onSuccess: () => { toast.success("Button saved."); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const inputCls =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

  return (
    <AdminCard className="mt-4">
      <h2 className="mb-4 font-semibold">{initial ? "Edit button" : "New button"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Label</span>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Shop Now" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Action type</span>
          <select className={inputCls} value={actionType} onChange={(e) => setActionType(e.target.value)}>
            {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Destination</span>
          <input className={inputCls} value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={500} placeholder="/shop or https://…" />
          <span className="mt-1 block text-xs text-muted-foreground">
            Internal paths must start with /. External links must use https://. No JavaScript allowed.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Placement</span>
          <select className={inputCls} value={placement} onChange={(e) => setPlacement(e.target.value)}>
            {PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABELS[p] ?? p}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Style</span>
          <select className={inputCls} value={style} onChange={(e) => setStyle(e.target.value)}>
            {BUTTON_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Locale (optional)</span>
          <select className={inputCls} value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="">All locales</option>
            <option value="ar">Arabic</option>
            <option value="fr">French</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !label.trim()}>
          {save.isPending ? "Saving…" : "Save button"}
        </Button>
      </div>
    </AdminCard>
  );
}
