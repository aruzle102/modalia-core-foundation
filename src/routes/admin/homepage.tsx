import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  Award,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Megaphone,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Store,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  StatusPill,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
import { errMsg, pickName } from "./_shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getLocale } from "@/lib/i18n";
import { strParam, useUrlState } from "@/hooks/use-url-state";
import { updateHomepageSection } from "@/lib/admin.functions";
import {
  HOMEPAGE_KINDS,
  createHomepageSection,
  deleteHomepageSection,
  duplicateHomepageSection,
  getHomepageSections,
  reorderHomepageSections,
  updateHomepageContent,
  type HomepageKind,
  type HomepageSection,
} from "@/lib/admin-homepage.functions";

export const Route = createFileRoute("/admin/homepage")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    create: strParam(search["create"]),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Homepage builder — Modalia Admin" },
      { name: "description", content: "Reorder, toggle and edit the sections of the Modalia storefront homepage." },
    ],
  }),
  component: HomepageBuilderPage,
});

const sectionsKey = ["admin-homepage-sections"] as const;

const KIND_META: Record<HomepageKind, { label: string; icon: ReactNode }> = {
  hero: { label: "Hero banner", icon: <ImageIcon className="size-4" /> },
  categories: { label: "Categories rail", icon: <LayoutGrid className="size-4" /> },
  trending: { label: "Trending rail", icon: <TrendingUp className="size-4" /> },
  best_sellers: { label: "Best sellers rail", icon: <Award className="size-4" /> },
  new_arrivals: { label: "New arrivals rail", icon: <Sparkles className="size-4" /> },
  flash_sale: { label: "Flash sale", icon: <Zap className="size-4" /> },
  stores: { label: "Stores rail", icon: <Store className="size-4" /> },
  recommendations: { label: "Recommendations rail", icon: <ThumbsUp className="size-4" /> },
  editorial: { label: "Editorial campaign", icon: <Megaphone className="size-4" /> },
  blog: { label: "Blog / journal", icon: <Newspaper className="size-4" /> },
  app_banner: { label: "App banner", icon: <Smartphone className="size-4" /> },
};

const RAIL_KINDS: readonly HomepageKind[] = [
  "categories",
  "trending",
  "best_sellers",
  "new_arrivals",
  "stores",
  "recommendations",
];

/** Kinds whose storefront content is a free-form JSON object (editorial
    campaign, journal posts, app banner links). */
const CONTENT_JSON_KINDS: readonly HomepageKind[] = ["editorial", "blog", "app_banner"];

/** Hint shown in the admin editor for the free-form content of these kinds. */
const CONTENT_JSON_HINT: Record<string, string> = {
  editorial:
    'JSON object: { "image": "https://…", "image_alt": "…", "cta_label": "…", "cta_href": "/shop" }',
  blog:
    'JSON object: { "posts": [ { "title": "…", "excerpt": "…", "image": "https://…", "href": "https://…" } ] }',
  app_banner:
    'JSON object: { "ios_url": "https://…", "android_url": "https://…", "image": "https://…" } — shown only when at least one store URL is set.',
};

/** Raw editable text for a section's content (string or object). */
function rawContentJson(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return "{}";
}

/* --------------------------------- helpers --------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** {ar,fr,en} string map from a localized jsonb value. */
function locMap(value: unknown): { ar: string; fr: string; en: string } {
  const record = asRecord(value);
  return {
    ar: str(record["ar"]),
    fr: str(record["fr"]),
    en: str(record["en"]),
  };
}

function compactLoc(ar: string, fr: string, en: string): Record<string, string> {
  const out: Record<string, string> = {};
  const a = ar.trim();
  const f = fr.trim();
  const e = en.trim();
  if (a) out["ar"] = a;
  if (f) out["fr"] = f;
  if (e) out["en"] = e;
  return out;
}

/** ISO timestamptz -> "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function endsInLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "Ended";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  if (hours > 0) return `Ends in ${hours}h`;
  return "Ends soon";
}

const SECTION_KEY_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/* --------------------------------- page --------------------------------- */

function HomepageBuilderPage() {
  return (
    <AdminGate>
      <AdminShell
        title="Homepage builder"
        subtitle="Reorder, toggle and edit the sections of the storefront homepage. Changes go live as soon as they are saved."
      >
        <BuilderManager />
      </AdminShell>
    </AdminGate>
  );
}

function BuilderManager() {
  const queryClient = useQueryClient();
  const url = useUrlState();
  const sectionsQuery = useQuery({
    queryKey: sectionsKey,
    queryFn: () => getHomepageSections(),
    retry: false,
  });

  const [items, setItems] = useState<HomepageSection[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HomepageSection | null>(null);

  // Deep link: /admin/homepage?create=section opens the add-section dialog.
  useEffect(() => {
    if (strParam(url.search["create"]) === "section") setAddOpen(true);
  }, [url.search["create"]]);

  useEffect(() => {
    if (sectionsQuery.data) setItems(sectionsQuery.data.sections);
  }, [sectionsQuery.data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: sectionsKey });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => reorderHomepageSections({ data: { orderedIds } }),
    onSuccess: () => {
      toast.success("Section order saved.");
      invalidate();
    },
    onError: (error) => {
      toast.error(errMsg(error));
      invalidate(); // resync with the server order
    },
  });

  const toggle = useMutation({
    mutationFn: (payload: { sectionId: string; enabled: boolean }) =>
      updateHomepageSection({ data: payload }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(errMsg(error)),
  });

  const duplicate = useMutation({
    mutationFn: (sectionId: string) => duplicateHomepageSection({ data: { sectionId } }),
    onSuccess: (result) => {
      toast.success(`Duplicated as "${result.section.section_key}". It starts disabled.`);
      invalidate();
    },
    onError: (error) => toast.error(errMsg(error)),
  });

  const remove = useMutation({
    mutationFn: (sectionId: string) => deleteHomepageSection({ data: { sectionId } }),
    onSuccess: () => {
      toast.success("Section deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(errMsg(error)),
  });

  function moveItem(fromId: string, toId: string): HomepageSection[] | null {
    if (fromId === toId) return null;
    const next = [...items];
    const from = next.findIndex((item) => item.id === fromId);
    const to = next.findIndex((item) => item.id === toId);
    if (from < 0 || to < 0) return null;
    const [moved] = next.splice(from, 1);
    if (!moved) return null;
    next.splice(to, 0, moved);
    return next;
  }

  function commitOrder(next: HomepageSection[]) {
    setItems(next);
    reorder.mutate(next.map((item) => item.id));
  }

  function nudge(id: string, direction: -1 | 1) {
    const index = items.findIndex((item) => item.id === id);
    const target = items[index + direction];
    if (index < 0 || !target) return;
    const next = moveItem(id, target.id);
    if (next) commitOrder(next);
  }

  if (sectionsQuery.isPending) {
    return <TableSkeleton rows={6} />;
  }

  if (sectionsQuery.isError || !sectionsQuery.data) {
    return (
      <div role="alert" className="border border-destructive/40 bg-destructive/5 p-6">
        <p className="font-medium text-destructive">Homepage sections failed to load</p>
        <p className="mt-2 text-sm text-destructive">{errMsg(sectionsQuery.error)}</p>
        <Button className="mt-4" onClick={() => sectionsQuery.refetch()}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    );
  }

  const editingSection = editingId ? (items.find((item) => item.id === editingId) ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} section{items.length === 1 ? "" : "s"} · drag the handle or use the arrows to
          reorder — the order saves automatically.
        </p>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add section
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No homepage sections"
          text="Add your first section to start building the storefront homepage."
          action={<Button onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add section</Button>}
        />
      ) : (
        <ol className="space-y-3" aria-label="Homepage sections in display order">
          {items.map((section, index) => (
            <li
              key={section.id}
              draggable={false}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dropTargetId !== section.id) setDropTargetId(section.id);
              }}
              onDragLeave={() => {
                if (dropTargetId === section.id) setDropTargetId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedId) {
                  const next = moveItem(draggedId, section.id);
                  if (next) commitOrder(next);
                }
                setDraggedId(null);
                setDropTargetId(null);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDropTargetId(null);
              }}
              className={
                dropTargetId === section.id && draggedId
                  ? "rounded-lg ring-2 ring-primary ring-offset-2"
                  : "rounded-lg"
              }
            >
              <SectionCard
                section={section}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                isDragging={draggedId === section.id}
                onDragStart={() => setDraggedId(section.id)}
                onMoveUp={() => nudge(section.id, -1)}
                onMoveDown={() => nudge(section.id, 1)}
                onToggle={(enabled) => toggle.mutate({ sectionId: section.id, enabled })}
                togglePending={toggle.isPending}
                onEdit={() => setEditingId(section.id)}
                onDuplicate={() => duplicate.mutate(section.id)}
                duplicatePending={duplicate.isPending}
                onDelete={() => setDeleteTarget(section)}
              />
            </li>
          ))}
        </ol>
      )}

      <AddSectionDialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) url.set({ create: undefined });
        }}
        onCreated={(section) => {
          setAddOpen(false);
          url.set({ create: undefined });
          invalidate();
          setEditingId(section.id);
        }}
      />

      {editingSection ? (
        <SectionSettingsSheet
          section={editingSection}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            invalidate();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete section?"
        {...(deleteTarget
          ? {
              description: `Delete "${deleteTarget.section_key}" (${KIND_META[deleteTarget.kind].label})? This cannot be undone. The last section of a kind is protected and cannot be deleted.`,
            }
          : {})}
        confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
        danger
        onConfirm={() => {
          if (deleteTarget && !remove.isPending) remove.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

/* ------------------------------- section card ------------------------------- */

function SectionCard({
  section,
  position,
  isFirst,
  isLast,
  isDragging,
  onDragStart,
  onMoveUp,
  onMoveDown,
  onToggle,
  togglePending,
  onEdit,
  onDuplicate,
  duplicatePending,
  onDelete,
}: {
  section: HomepageSection;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: (enabled: boolean) => void;
  togglePending: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  duplicatePending: boolean;
  onDelete: () => void;
}) {
  const meta = KIND_META[section.kind];
  const title = pickName(section.title) || section.section_key;
  const now = Date.now();
  const scheduled = section.starts_at && new Date(section.starts_at).getTime() > now;
  const expired = section.ends_at && new Date(section.ends_at).getTime() <= now;

  return (
    <div
      className={`border border-border bg-card p-4 transition-opacity sm:p-5 ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onMoveDown();
            }
          }}
          aria-label={`Drag to reorder ${section.section_key}`}
          title="Drag to reorder"
          className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              {meta.icon}
              {meta.label}
            </span>
            <span className="text-caption text-muted-foreground">·</span>
            <code className="font-mono text-xs text-muted-foreground">{section.section_key}</code>
            <span className="text-caption tabular-nums text-muted-foreground">#{position}</span>
            <StatusPill status={section.enabled ? "active" : "disabled"} />
            {scheduled ? <StatusPill status="scheduled" /> : null}
            {expired ? <StatusPill status="ended" /> : null}
          </div>

          <p className="mt-1.5 truncate font-medium" dir="auto">
            {title}
          </p>

          <SectionPreview section={section} />

          {(section.starts_at || section.ends_at) && (
            <p className="mt-2 text-caption text-muted-foreground">
              {section.starts_at ? `From ${fmtDateTime(section.starts_at)}` : "Always on"}
              {section.ends_at ? ` · until ${fmtDateTime(section.ends_at)}` : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`section-enabled-${section.id}`} className="sr-only">
              {section.enabled ? "Disable" : "Enable"} section {section.section_key}
            </Label>
            <Switch
              id={`section-enabled-${section.id}`}
              checked={section.enabled}
              disabled={togglePending}
              onCheckedChange={onToggle}
              aria-label={`${section.enabled ? "Disable" : "Enable"} ${section.section_key}`}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onMoveUp}
              disabled={isFirst}
              aria-label={`Move ${section.section_key} up`}
              title="Move up"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onMoveDown}
              disabled={isLast}
              aria-label={`Move ${section.section_key} down`}
              title="Move down"
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label={`Edit ${section.section_key}`} title="Edit settings">
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onDuplicate}
              disabled={duplicatePending}
              aria-label={`Duplicate ${section.section_key}`}
              title="Duplicate"
            >
              <Copy className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label={`Delete ${section.section_key}`}
              title="Delete"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Honest mini-preview built only from the section's real data. */
function SectionPreview({ section }: { section: HomepageSection }) {
  const content = asRecord(section.content);
  const subtitle = pickName(section.subtitle);
  const chips: string[] = [];

  if (RAIL_KINDS.includes(section.kind)) {
    const limit = content["limit"];
    chips.push(typeof limit === "number" && limit > 0 ? `limit: ${limit}` : "limit: default");
  }
  if (section.kind === "hero") {
    const ctaLink = str(content["cta_link"]);
    const ctaLabel = pickName(content["cta_label"]);
    if (ctaLabel) chips.push(`CTA: ${ctaLabel}`);
    if (ctaLink) chips.push(ctaLink);
    const alignment = str(content["alignment"]);
    if (alignment) chips.push(`align: ${alignment}`);
  }
  if (section.kind === "flash_sale") {
    const promo = pickName(content["promo_label"]);
    if (promo) chips.push(promo);
    const limit = content["limit"];
    if (typeof limit === "number" && limit > 0) chips.push(`limit: ${limit}`);
    if (section.ends_at) chips.push(endsInLabel(section.ends_at));
  }

  const mediaUrl = section.kind === "hero" ? str(content["media_url"]) : "";

  return (
    <div className="mt-2.5 flex items-start gap-3">
      {mediaUrl ? (
        <img
          src={mediaUrl}
          alt=""
          className="h-14 w-20 shrink-0 rounded border border-border object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0">
        {subtitle ? (
          <p className="truncate text-small text-muted-foreground" dir="auto">
            {subtitle}
          </p>
        ) : null}
        {chips.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-caption text-muted-foreground"
                dir="auto"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------ add dialog ------------------------------ */

function AddSectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (section: HomepageSection) => void;
}) {
  const [kind, setKind] = useState<HomepageKind>("hero");
  const [key, setKey] = useState("");
  const [titleEn, setTitleEn] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createHomepageSection({
        data: {
          kind,
          section_key: key.trim(),
          title: titleEn.trim() ? { en: titleEn.trim() } : null,
        },
      }),
    onSuccess: (result) => {
      toast.success(`Section "${result.section.section_key}" created.`);
      onCreated(result.section);
      setKey("");
      setTitleEn("");
    },
    onError: (error) => toast.error(errMsg(error)),
  });

  const trimmed = key.trim();
  const keyError =
    !trimmed ? null
    : trimmed.length < 3 ? "Key must be at least 3 characters."
    : !SECTION_KEY_RE.test(trimmed) ? "Use lowercase letters, numbers, dashes or underscores."
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add section</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Section type">
            <Select value={kind} onValueChange={(value) => setKind(value as HomepageKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOMEPAGE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Section key"
            hint="Unique identifier, e.g. hero-main or flash-sale-eid. Used by the storefront to find this section."
            error={keyError ?? undefined}
          >
            <Input
              dir="ltr"
              placeholder="hero-main"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              aria-invalid={Boolean(keyError)}
            />
          </Field>
          <Field label="Title (English, optional)" hint="You can add Arabic and French titles from the settings panel.">
            <Input value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!trimmed || Boolean(keyError) || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create & edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- settings sheet ---------------------------- */

interface SettingsForm {
  titleAr: string;
  titleFr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleFr: string;
  subtitleEn: string;
  startsAt: string;
  endsAt: string;
  // hero
  ctaAr: string;
  ctaFr: string;
  ctaEn: string;
  ctaLink: string;
  mediaUrl: string;
  alignment: string;
  overlay: string;
  // rails / flash sale
  limit: string;
  // flash sale
  promoAr: string;
  promoFr: string;
  promoEn: string;
  // editorial / blog / app_banner (free-form JSON content)
  contentJson: string;
}

function formFromSection(section: HomepageSection): SettingsForm {
  const content = asRecord(section.content);
  const title = locMap(section.title);
  const subtitle = locMap(section.subtitle);
  const cta = locMap(content["cta_label"]);
  const promo = locMap(content["promo_label"]);
  const limit = content["limit"];
  return {
    titleAr: title.ar,
    titleFr: title.fr,
    titleEn: title.en,
    subtitleAr: subtitle.ar,
    subtitleFr: subtitle.fr,
    subtitleEn: subtitle.en,
    startsAt: toLocalInput(section.starts_at),
    endsAt: toLocalInput(section.ends_at),
    ctaAr: cta.ar,
    ctaFr: cta.fr,
    ctaEn: cta.en,
    ctaLink: str(content["cta_link"]),
    mediaUrl: str(content["media_url"]),
    alignment: str(content["alignment"]) || "start",
    overlay: str(content["overlay"]) || "soft",
    limit: typeof limit === "number" && limit > 0 ? String(limit) : "",
    promoAr: promo.ar,
    promoFr: promo.fr,
    promoEn: promo.en,
    contentJson: rawContentJson(section.content),
  };
}

function SectionSettingsSheet({
  section,
  onClose,
  onSaved,
}: {
  section: HomepageSection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SettingsForm>(() => formFromSection(section));

  // Reset when a different section is opened.
  useEffect(() => {
    setForm(formFromSection(section));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  const set = (field: keyof SettingsForm, value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const save = useMutation({
    mutationFn: () => {
      const content: Record<string, unknown> = {};
      if (section.kind === "hero") {
        const ctaLabel = compactLoc(form.ctaAr, form.ctaFr, form.ctaEn);
        content["cta_label"] = Object.keys(ctaLabel).length > 0 ? ctaLabel : null;
        content["cta_link"] = form.ctaLink.trim() || null;
        content["media_url"] = form.mediaUrl.trim() || null;
        content["alignment"] = form.alignment;
        content["overlay"] = form.overlay;
      }
      if (RAIL_KINDS.includes(section.kind) || section.kind === "flash_sale") {
        const limit = Number.parseInt(form.limit, 10);
        content["limit"] = Number.isFinite(limit) && limit > 0 ? limit : null;
      }
      if (section.kind === "flash_sale") {
        const promo = compactLoc(form.promoAr, form.promoFr, form.promoEn);
        content["promo_label"] = Object.keys(promo).length > 0 ? promo : null;
      }
      if (CONTENT_JSON_KINDS.includes(section.kind)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(form.contentJson) as unknown;
        } catch {
          throw new Error("Content is not valid JSON.");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Content must be a JSON object.");
        }
        Object.assign(content, parsed as Record<string, unknown>);
      }
      return updateHomepageContent({
        data: {
          sectionId: section.id,
          patch: {
            title: compactLoc(form.titleAr, form.titleFr, form.titleEn),
            subtitle: compactLoc(form.subtitleAr, form.subtitleFr, form.subtitleEn),
            content,
            starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
            ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Section settings saved.");
      onSaved();
    },
    onError: (error) => toast.error(errMsg(error)),
  });

  const isRail = RAIL_KINDS.includes(section.kind);
  const isContentJsonKind = CONTENT_JSON_KINDS.includes(section.kind);
  const limitNumber = Number.parseInt(form.limit, 10);
  const limitError =
    form.limit.trim() && (!Number.isFinite(limitNumber) || limitNumber <= 0)
      ? "Enter a positive number, or leave empty for the default."
      : null;
  const contentJsonError = (() => {
    if (!isContentJsonKind) return null;
    try {
      const parsed = JSON.parse(form.contentJson) as unknown;
      return !parsed || typeof parsed !== "object" || Array.isArray(parsed)
        ? "Content must be a JSON object."
        : null;
    } catch {
      return "Content is not valid JSON.";
    }
  })();

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {KIND_META[section.kind].icon}
            Edit {KIND_META[section.kind].label}
          </SheetTitle>
          <SheetDescription>
            <code className="font-mono text-xs">{section.section_key}</code>
            {" · "}changes apply to the live homepage when saved.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">Titles</h3>
            <LocalizedInputs
              label="Title"
              ar={form.titleAr}
              fr={form.titleFr}
              en={form.titleEn}
              onAr={(v) => set("titleAr", v)}
              onFr={(v) => set("titleFr", v)}
              onEn={(v) => set("titleEn", v)}
            />
            <LocalizedInputs
              label="Subtitle"
              ar={form.subtitleAr}
              fr={form.subtitleFr}
              en={form.subtitleEn}
              onAr={(v) => set("subtitleAr", v)}
              onFr={(v) => set("subtitleFr", v)}
              onEn={(v) => set("subtitleEn", v)}
            />
          </section>

          {section.kind === "hero" ? (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Hero content</h3>
              <Field label="Media URL" hint="Banner image or video shown behind the hero copy.">
                <Input
                  dir="ltr"
                  type="url"
                  placeholder="https://…"
                  value={form.mediaUrl}
                  onChange={(event) => set("mediaUrl", event.target.value)}
                />
              </Field>
              <LocalizedInputs
                label="CTA label"
                ar={form.ctaAr}
                fr={form.ctaFr}
                en={form.ctaEn}
                onAr={(v) => set("ctaAr", v)}
                onFr={(v) => set("ctaFr", v)}
                onEn={(v) => set("ctaEn", v)}
              />
              <Field label="CTA link" hint="Where the button leads, e.g. /shop or a category path.">
                <Input
                  dir="ltr"
                  placeholder="/shop"
                  value={form.ctaLink}
                  onChange={(event) => set("ctaLink", event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Text alignment">
                  <Select value={form.alignment} onValueChange={(v) => set("alignment", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="start">Start</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="end">End</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Overlay">
                  <Select value={form.overlay} onValueChange={(v) => set("overlay", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="soft">Soft</SelectItem>
                      <SelectItem value="strong">Strong</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>
          ) : null}

          {isRail || section.kind === "flash_sale" ? (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">
                {section.kind === "flash_sale" ? "Flash sale" : "Rail"} settings
              </h3>
              <Field
                label="Item limit"
                hint="How many items to show. Leave empty for the storefront default."
                error={limitError ?? undefined}
              >
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="8"
                  value={form.limit}
                  onChange={(event) => set("limit", event.target.value)}
                  aria-invalid={Boolean(limitError)}
                />
              </Field>
              {section.kind === "flash_sale" ? (
                <LocalizedInputs
                  label="Promo label"
                  ar={form.promoAr}
                  fr={form.promoFr}
                  en={form.promoEn}
                  onAr={(v) => set("promoAr", v)}
                  onFr={(v) => set("promoFr", v)}
                  onEn={(v) => set("promoEn", v)}
                />
              ) : null}
            </section>
          ) : null}

          {isContentJsonKind ? (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">{KIND_META[section.kind].label} content</h3>
              <Field
                label="Content (JSON)"
                hint={CONTENT_JSON_HINT[section.kind] ?? "Free-form JSON object."}
                error={contentJsonError ?? undefined}
              >
                <Textarea
                  dir="ltr"
                  spellCheck={false}
                  rows={8}
                  className="font-mono text-xs"
                  placeholder="{}"
                  value={form.contentJson}
                  onChange={(event) => set("contentJson", event.target.value)}
                  aria-invalid={Boolean(contentJsonError)}
                />
              </Field>
            </section>
          ) : null}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">Scheduling</h3>
            <p className="text-caption text-muted-foreground">
              The storefront only shows sections inside their schedule. Leave both empty to always show.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts at">
                <Input
                  dir="ltr"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => set("startsAt", event.target.value)}
                />
              </Field>
              <Field label="Ends at">
                <Input
                  dir="ltr"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => set("endsAt", event.target.value)}
                />
              </Field>
            </div>
          </section>
        </div>

        <SheetFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending || Boolean(limitError) || Boolean(contentJsonError)} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function LocalizedInputs({
  label,
  ar,
  fr,
  en,
  onAr,
  onFr,
  onEn,
}: {
  label: string;
  ar: string;
  fr: string;
  en: string;
  onAr: (value: string) => void;
  onFr: (value: string) => void;
  onEn: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="space-y-2">
        <Input
          dir="rtl"
          lang="ar"
          placeholder="العربية"
          value={ar}
          onChange={(event) => onAr(event.target.value)}
          aria-label={`${label} (Arabic)`}
        />
        <Input
          placeholder="Français"
          value={fr}
          onChange={(event) => onFr(event.target.value)}
          aria-label={`${label} (French)`}
        />
        <Input
          placeholder="English"
          value={en}
          onChange={(event) => onEn(event.target.value)}
          aria-label={`${label} (English)`}
        />
      </div>
    </Field>
  );
}
