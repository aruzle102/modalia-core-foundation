import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Eye, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AdminCard, Field } from "@/components/admin/ui";
import type { SupportedLocale } from "@/config/platform";
import { localeDirections } from "@/lib/i18n";
import {
  updateStoreAppearance,
  updateStoreProfile,
  updateStoreSections,
  type StoreStudioData,
} from "@/lib/seller-store.functions";
import {
  STORE_ACCENTS,
  accentById,
  localizeText,
  type StoreAccentId,
  type StoreSectionConfig,
  type StoreSectionKind,
  type TrilingualText,
} from "@/lib/store-settings";

export type StoreStudioTab = "profile" | "appearance" | "sections" | "preview";

function nameOf(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of [locale, "fr", "en", "ar"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
  }
  return "";
}

const SECTION_KIND_LABELS: Record<StoreSectionKind, string> = {
  featured: "Featured",
  categories: "Categories",
  offers: "Offers",
  new: "New arrivals",
  best: "Best sellers",
};

function emptyTrilingual(): TrilingualText {
  return { fr: "", en: "", ar: "" };
}

/* --------------------------- Trilingual inputs --------------------------- */

function TrilingualInputs({
  value,
  onChange,
  maxLength,
}: {
  value: TrilingualText;
  onChange: (value: TrilingualText) => void;
  maxLength?: number;
}) {
  const fields: { key: keyof TrilingualText; label: string; dir: "ltr" | "rtl" }[] = [
    { key: "fr", label: "Français", dir: "ltr" },
    { key: "en", label: "English", dir: "ltr" },
    { key: "ar", label: "العربية", dir: "rtl" },
  ];
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <Input
            dir={field.dir}
            value={value[field.key]}
            maxLength={maxLength}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
            placeholder={field.label}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Save button ------------------------------ */

function SaveBar({
  pending,
  savedAt,
  error,
  label = "Save changes",
}: {
  pending: boolean;
  savedAt: number | null;
  error: string | null;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending} className="rounded-full">
        {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
        {pending ? "Saving…" : label}
      </Button>
      {savedAt ? (
        <span className="inline-flex items-center gap-1.5 text-small text-emerald-600">
          <Check className="h-4 w-4" /> Saved
        </span>
      ) : null}
      {error ? <p className="text-small text-destructive">{error}</p> : null}
    </div>
  );
}

function mutationError(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to save. Please try again.";
}

/* --------------------------------- Studio -------------------------------- */

export function StoreStudio({
  data,
  locale,
  initialTab = "profile",
}: {
  data: StoreStudioData;
  locale: SupportedLocale;
  initialTab?: StoreStudioTab;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StoreStudioTab>(initialTab);

  /* Profile state */
  const [profile, setProfile] = useState({
    name: data.store.name,
    description: data.store.description ?? "",
    contactEmail: data.store.contact_email ?? "",
    contactPhone: data.store.contact_phone ?? "",
    logoPath: data.store.logo_path ?? "",
    bannerPath: data.store.banner_path ?? "",
  });

  /* Appearance state */
  const [accent, setAccent] = useState<StoreAccentId>(data.settings.accent);
  const [announcement, setAnnouncement] = useState<TrilingualText>({ ...data.settings.announcement });

  /* Sections state */
  const [sections, setSections] = useState<StoreSectionConfig[]>(
    data.settings.sections.map((section) => ({ ...section, title: { ...section.title } })),
  );
  const [featuredProductIds, setFeaturedProductIds] = useState<string[]>([...data.settings.featured_product_ids]);
  const [featuredCategoryIds, setFeaturedCategoryIds] = useState<string[]>([...data.settings.featured_category_ids]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["seller-store-studio"] });

  const profileMutation = useMutation({
    mutationFn: () =>
      updateStoreProfile({
        data: {
          name: profile.name,
          description: profile.description || undefined,
          contactEmail: profile.contactEmail || undefined,
          contactPhone: profile.contactPhone || undefined,
          logoPath: profile.logoPath || undefined,
          bannerPath: profile.bannerPath || undefined,
        },
      }),
    onSuccess: () => {
      setSavedAt(Date.now());
      setSaveError(null);
      invalidate();
    },
    onError: (error) => setSaveError(mutationError(error)),
  });

  const appearanceMutation = useMutation({
    mutationFn: () => updateStoreAppearance({ data: { accent, announcement } }),
    onSuccess: () => {
      setSavedAt(Date.now());
      setSaveError(null);
      invalidate();
    },
    onError: (error) => setSaveError(mutationError(error)),
  });

  const sectionsMutation = useMutation({
    mutationFn: () =>
      updateStoreSections({
        data: { sections, featuredProductIds, featuredCategoryIds },
      }),
    onSuccess: () => {
      setSavedAt(Date.now());
      setSaveError(null);
      invalidate();
    },
    onError: (error) => setSaveError(mutationError(error)),
  });

  const productById = useMemo(() => {
    const map = new Map<string, { id: string; name: unknown }>();
    for (const product of data.products) map.set(product.id, product);
    return map;
  }, [data.products]);

  const categoryById = useMemo(() => {
    const map = new Map<string, { id: string; name: unknown; slug: string }>();
    for (const category of data.categories) map.set(category.id, category);
    return map;
  }, [data.categories]);

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

  const moveSection = (index: number, delta: -1 | 1) => {
    const next = [...sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    setSections(next);
  };

  const pending = profileMutation.isPending || appearanceMutation.isPending || sectionsMutation.isPending;

  /* ------------------------------- Preview ------------------------------- */

  const previewAnnouncement = localizeText(announcement, locale);
  const previewAccent = accentById(accent);
  const featuredProducts = featuredProductIds
    .map((id) => productById.get(id))
    .filter((product): product is { id: string; name: unknown } => Boolean(product));
  const featuredCategories = featuredCategoryIds
    .map((id) => categoryById.get(id))
    .filter((category): category is { id: string; name: unknown; slug: string } => Boolean(category));
  const sampleProducts = data.products.slice(0, 8);

  const sectionProducts = (kind: StoreSectionKind) => {
    switch (kind) {
      case "featured":
        return featuredProducts;
      case "new":
      case "offers":
      case "best":
        return sampleProducts;
      default:
        return [];
    }
  };

  const renderPreviewFrame = (width: number, label: string) => (
    <div key={label} className="overflow-x-auto rounded-2xl border border-border bg-muted/40 p-4">
      <p className="mb-3 text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label} · {width}px
      </p>
      <div className="mx-auto overflow-hidden rounded-xl border border-border bg-background shadow-sm" style={{ width, maxWidth: "100%" }}>
        {/* Announcement bar */}
        {previewAnnouncement ? (
          <div className="px-4 py-2 text-center" style={{ backgroundColor: previewAccent.swatch, color: previewAccent.ink }}>
            <p className="text-[11px] font-medium leading-5">{previewAnnouncement}</p>
          </div>
        ) : null}
        {/* Store header */}
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold"
              style={{ backgroundColor: previewAccent.swatch, color: previewAccent.ink }}
              aria-hidden
            >
              {(profile.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile.name || "Store name"}</p>
              <p className="text-[10px] text-muted-foreground">Independent seller on Modalia</p>
            </div>
          </div>
          {profile.description ? (
            <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{profile.description}</p>
          ) : null}
        </div>
        {/* Configured sections */}
        <div className="space-y-5 px-4 py-4">
          {sections
            .filter((section) => section.enabled)
            .map((section) => (
              <div key={section.id}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {localizeText(section.title, locale, SECTION_KIND_LABELS[section.kind])}
                </p>
                {section.kind === "categories" ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {featuredCategories.length ? (
                      featuredCategories.map((category) => (
                        <span key={category.id} className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium">
                          {nameOf(category.name, locale) || category.slug}
                        </span>
                      ))
                    ) : (
                      <p className="text-[10px] text-muted-foreground">No categories selected yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {sectionProducts(section.kind).length ? (
                      sectionProducts(section.kind)
                        .slice(0, 4)
                        .map((product) => (
                          <div key={product.id} className="min-w-0">
                            <div className="grid aspect-square place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                              {(nameOf(product.name, locale) || "?").slice(0, 1).toUpperCase()}
                            </div>
                            <p className="mt-1 truncate text-[9px] leading-4">{nameOf(product.name, locale)}</p>
                          </div>
                        ))
                    ) : (
                      <p className="col-span-4 text-[10px] text-muted-foreground">No products selected yet.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
        <div className="border-t border-border px-4 py-3">
          <p className="text-[9px] text-muted-foreground">Modalia marketplace</p>
        </div>
      </div>
    </div>
  );

  /* -------------------------------- Render ------------------------------- */

  return (
    <div dir={localeDirections[locale]}>
      <Tabs value={tab} onValueChange={(value) => setTab(value as StoreStudioTab)}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="me-1.5 h-3.5 w-3.5" /> Preview
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------- Profile ------------------------------ */}
        <TabsContent value="profile" className="mt-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSavedAt(null);
              setSaveError(null);
              profileMutation.mutate();
            }}
          >
            <AdminCard
              title="Store profile"
              subtitle="Public identity of your store. The store slug cannot be changed."
            >
              <div className="grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Store name" hint="2–160 characters. Shown on your storefront.">
                    <Input
                      required
                      minLength={2}
                      maxLength={160}
                      value={profile.name}
                      onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                    />
                  </Field>
                  <Field label="Store slug" hint="Permanent — used in your store URL.">
                    <Input value={data.store.slug} disabled />
                  </Field>
                </div>
                <Field label="Description" hint="Plain text, up to 2000 characters.">
                  <Textarea
                    rows={4}
                    maxLength={2000}
                    value={profile.description}
                    onChange={(event) => setProfile({ ...profile, description: event.target.value })}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Contact email" hint="Shown to customers on your storefront.">
                    <Input
                      type="email"
                      dir="ltr"
                      value={profile.contactEmail}
                      onChange={(event) => setProfile({ ...profile, contactEmail: event.target.value })}
                    />
                  </Field>
                  <Field label="Contact phone" hint="Optional customer service number.">
                    <Input
                      type="tel"
                      dir="ltr"
                      maxLength={30}
                      value={profile.contactPhone}
                      onChange={(event) => setProfile({ ...profile, contactPhone: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Logo path"
                    hint="Storage path of your logo image (e.g. store-logos/logo.png). Uploads are managed separately."
                  >
                    <Input
                      dir="ltr"
                      maxLength={500}
                      value={profile.logoPath}
                      onChange={(event) => setProfile({ ...profile, logoPath: event.target.value })}
                    />
                  </Field>
                  <Field
                    label="Banner path"
                    hint="Storage path of your storefront banner image."
                  >
                    <Input
                      dir="ltr"
                      maxLength={500}
                      value={profile.bannerPath}
                      onChange={(event) => setProfile({ ...profile, bannerPath: event.target.value })}
                    />
                  </Field>
                </div>
                <SaveBar pending={profileMutation.isPending} savedAt={profileMutation.isSuccess ? savedAt : null} error={profileMutation.isError ? saveError : null} />
              </div>
            </AdminCard>
          </form>
        </TabsContent>

        {/* ----------------------------- Appearance ----------------------------- */}
        <TabsContent value="appearance" className="mt-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSavedAt(null);
              setSaveError(null);
              appearanceMutation.mutate();
            }}
          >
            <div className="grid gap-6">
              <AdminCard title="Brand accent" subtitle="Pick one of the curated accents — applied to your storefront announcement bar and highlights.">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {STORE_ACCENTS.map((option) => {
                    const selected = accent === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setAccent(option.id)}
                        aria-pressed={selected}
                        className={`group flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors ${
                          selected ? "border-foreground ring-2 ring-foreground/20" : "border-border hover:border-foreground/40"
                        }`}
                      >
                        <span
                          className="grid size-12 place-items-center rounded-full border border-black/10"
                          style={{ backgroundColor: option.swatch, color: option.ink }}
                          aria-hidden
                        >
                          {selected ? <Check className="h-5 w-5" /> : null}
                        </span>
                        <span className="text-small font-medium">{option.label}</span>
                        <span className="text-caption text-muted-foreground">{option.id}</span>
                      </button>
                    );
                  })}
                </div>
              </AdminCard>
              <AdminCard
                title="Announcement bar"
                subtitle="Optional banner above your storefront. Plain text, up to 120 characters per language."
              >
                <TrilingualInputs value={announcement} onChange={setAnnouncement} maxLength={120} />
                {previewAnnouncement ? (
                  <div className="mt-4 overflow-hidden rounded-xl">
                    <div className="px-4 py-2.5 text-center" style={{ backgroundColor: previewAccent.swatch, color: previewAccent.ink }}>
                      <p className="text-small font-medium">{previewAnnouncement}</p>
                    </div>
                  </div>
                ) : null}
              </AdminCard>
              <SaveBar pending={appearanceMutation.isPending} savedAt={appearanceMutation.isSuccess ? savedAt : null} error={appearanceMutation.isError ? saveError : null} />
            </div>
          </form>
        </TabsContent>

        {/* ------------------------------ Sections ------------------------------ */}
        <TabsContent value="sections" className="mt-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSavedAt(null);
              setSaveError(null);
              sectionsMutation.mutate();
            }}
          >
            <div className="grid gap-6">
              <AdminCard
                title="Storefront sections"
                subtitle="Enable, reorder and rename the sections on your public storefront."
              >
                <div className="space-y-4">
                  {sections.map((section, index) => (
                    <div key={section.id} className="rounded-2xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={index === 0 || pending}
                            onClick={() => moveSection(index, -1)}
                            aria-label={`Move ${SECTION_KIND_LABELS[section.kind]} up`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={index === sections.length - 1 || pending}
                            onClick={() => moveSection(index, 1)}
                            aria-label={`Move ${SECTION_KIND_LABELS[section.kind]} down`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <Badge variant="secondary">{SECTION_KIND_LABELS[section.kind]}</Badge>
                        <span className="text-small font-medium">{localizeText(section.title, locale, SECTION_KIND_LABELS[section.kind])}</span>
                        <div className="ms-auto flex items-center gap-2">
                          <span className="text-caption text-muted-foreground">{section.enabled ? "Visible" : "Hidden"}</span>
                          <Switch
                            checked={section.enabled}
                            onCheckedChange={(checked) =>
                              setSections(sections.map((item, i) => (i === index ? { ...item, enabled: checked } : item)))
                            }
                            aria-label={`Toggle ${SECTION_KIND_LABELS[section.kind]} section`}
                          />
                        </div>
                      </div>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-small text-muted-foreground hover:text-foreground">
                          Edit section title
                        </summary>
                        <div className="mt-3">
                          <TrilingualInputs
                            maxLength={80}
                            value={section.title}
                            onChange={(title) => setSections(sections.map((item, i) => (i === index ? { ...item, title } : item)))}
                          />
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </AdminCard>

              <AdminCard
                title="Featured products"
                subtitle="Hand-pick products for the Featured section. Only your own products can be selected."
              >
                {data.products.length ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                    {data.products.map((product) => {
                      const label = nameOf(product.name, locale) || "Untitled product";
                      const checked = featuredProductIds.includes(product.id);
                      return (
                        <label
                          key={product.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-small transition-colors hover:bg-accent/60 ${
                            checked ? "bg-accent/40 font-medium" : ""
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => setFeaturedProductIds(toggleId(featuredProductIds, product.id))}
                          />
                          <span className="truncate">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-small text-muted-foreground">No products yet — add products first, then feature them here.</p>
                )}
              </AdminCard>

              <AdminCard
                title="Featured categories"
                subtitle="Categories highlighted in the Categories section."
              >
                {data.categories.length ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                    {data.categories.map((category) => {
                      const label = nameOf(category.name, locale) || category.slug;
                      const checked = featuredCategoryIds.includes(category.id);
                      return (
                        <label
                          key={category.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-small transition-colors hover:bg-accent/60 ${
                            checked ? "bg-accent/40 font-medium" : ""
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => setFeaturedCategoryIds(toggleId(featuredCategoryIds, category.id))}
                          />
                          <span className="truncate">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-small text-muted-foreground">No categories available.</p>
                )}
              </AdminCard>

              <SaveBar pending={sectionsMutation.isPending} savedAt={sectionsMutation.isSuccess ? savedAt : null} error={sectionsMutation.isError ? saveError : null} />
            </div>
          </form>
        </TabsContent>

        {/* ------------------------------- Preview ------------------------------ */}
        <TabsContent value="preview" className="mt-6">
          <AdminCard
            title="Live preview"
            subtitle="A scaled mock of your storefront built from the current (unsaved included) studio state. Pure preview — nothing is published from here."
          >
            <div className="grid gap-6">
              {renderPreviewFrame(1200, "Desktop")}
              {renderPreviewFrame(768, "Tablet")}
              {renderPreviewFrame(390, "Mobile")}
            </div>
          </AdminCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
