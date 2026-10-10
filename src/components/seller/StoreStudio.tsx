import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { AdminCard, ConfirmDialog, EmptyState, Field, StatusPill } from "@/components/admin/ui";
import type { SupportedLocale } from "@/config/platform";
import { getTranslations, localeDirections, type Translation } from "@/lib/i18n";
import { StoreFront } from "@/components/store/StoreFront";
import { StorePreviewFrame } from "@/components/seller/StorePreviewFrame";
import type { CatalogProduct } from "@/lib/catalog.functions";
import type { StoreDetail } from "@/lib/store.functions";
import {
  deleteSellerCollection,
  updateStoreAppearance,
  updateStoreCategory,
  updateStoreProfile,
  updateStoreSections,
  updateStoreSeo,
  updateStoreSlug,
  updateStoreSocials,
  upsertSellerCollection,
  type SellerCollection,
  type StoreStudioData,
} from "@/lib/seller-store.functions";
import {
  STORE_ACCENTS,
  accentById,
  localizeText,
  type StoreAccentId,
  type StoreCollectionConfig,
  type StoreSectionConfig,
  type StoreSectionKind,
  type TrilingualText,
} from "@/lib/store-settings";

export type StoreStudioTab = "profile" | "appearance" | "sections" | "preview";

type V8 = Translation["sellerStoreV8"];
type StudioProduct = StoreStudioData["products"][number];
type StudioCategory = StoreStudioData["categories"][number];

/** Normalize a raw category gender into the CatalogCategory union (V8 #167). */
function categoryGender(value: string | null): "men" | "women" | "kids" | "unisex" | null {
  return value === "men" || value === "women" || value === "kids" || value === "unisex" ? value : null;
}

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

function httpOnly(path: string | null | undefined): string | null {
  return path && /^https?:\/\//.test(path) ? path : null;
}

/**
 * Client-side sibling of the server `storagePublicUrl` (see
 * `src/lib/store.functions.ts`): resolves relative storage object paths
 * (`<sellerId>/uploads/…`) against the public `product-media` bucket for
 * studio previews. Same traversal/allowlist guards; null keeps honest fallbacks.
 */
function storagePreviewUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const base = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const clean = path.replace(/^\/+/, "");
  if (
    !base ||
    !clean ||
    !clean.includes("/") ||
    clean.includes("..") ||
    !/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(clean)
  ) {
    return null;
  }
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/product-media/${clean}`;
}

function emptyTrilingual(): TrilingualText {
  return { fr: "", en: "", ar: "" };
}

/* --------------------------- Trilingual inputs --------------------------- */

function TrilingualInputs({
  value,
  onChange,
  maxLength,
  multiline = false,
}: {
  value: TrilingualText;
  onChange: (value: TrilingualText) => void;
  maxLength?: number;
  multiline?: boolean;
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
          {multiline ? (
            <Textarea
              dir={field.dir}
              rows={3}
              value={value[field.key]}
              maxLength={maxLength}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              placeholder={field.label}
            />
          ) : (
            <Input
              dir={field.dir}
              value={value[field.key]}
              maxLength={maxLength}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              placeholder={field.label}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Save button ------------------------------ */

function SaveBar({
  t,
  pending,
  savedAt,
  error,
}: {
  t: V8;
  pending: boolean;
  savedAt: number | null;
  error: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending} className="rounded-full">
        {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
        {pending ? t.save.saving : t.save.saveChanges}
      </Button>
      {savedAt ? (
        <span className="inline-flex items-center gap-1.5 text-small text-verified">
          <Check className="h-4 w-4" /> {t.save.saved}
        </span>
      ) : null}
      {error ? <p className="text-small text-destructive">{error}</p> : null}
    </div>
  );
}

/** Per-card save mutation: submit handler + pending/saved/error state. */
function useStudioSave<TData>(t: V8, save: () => Promise<TData>, onSaved?: (data: TData) => void) {
  const queryClient = useQueryClient();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: save,
    onSuccess: (result) => {
      setSavedAt(Date.now());
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["seller-store-studio"] });
      onSaved?.(result);
    },
    onError: (err) => setError(err instanceof Error ? err.message : t.save.error),
  });
  return {
    submit: (event: { preventDefault(): void }) => {
      event.preventDefault();
      setSavedAt(null);
      setError(null);
      mutation.mutate();
    },
    pending: mutation.isPending,
    savedAt: mutation.isSuccess ? savedAt : null,
    error: mutation.isError ? error : null,
  };
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
  const fullT = getTranslations(locale);
  const t = fullT.sellerStoreV8;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StoreStudioTab>(initialTab);

  /* Profile state */
  const [profile, setProfile] = useState({
    name: data.store.name,
    contactEmail: data.store.contact_email ?? "",
    contactPhone: data.store.contact_phone ?? "",
    logoPath: data.store.logo_path ?? "",
    bannerPath: data.store.banner_path ?? "",
  });

  /* Trilingual main description (V8 #231) — stored in settings.description;
     the legacy text column remains the read fallback. */
  const [descriptionI18n, setDescriptionI18n] = useState<TrilingualText>({
    ...data.settings.description,
  });

  /* Slug state */
  const [slug, setSlug] = useState(data.store.slug);

  /* Category state */
  const [categoryId, setCategoryId] = useState<string | null>(data.settings.category_id);

  /* Social links state */
  const [socials, setSocials] = useState({ ...data.settings.social_links });

  /* SEO state */
  const [seoTitle, setSeoTitle] = useState<TrilingualText>({ ...data.settings.seo.title });
  const [seoDescription, setSeoDescription] = useState<TrilingualText>({
    ...data.settings.seo.description,
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

  /* Collections dialog state */
  const [editingCollection, setEditingCollection] = useState<SellerCollection | "new" | null>(null);
  const [deletingCollection, setDeletingCollection] = useState<SellerCollection | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["seller-store-studio"] });

  const profileSave = useStudioSave(t, () =>
    updateStoreProfile({
      data: {
        name: profile.name,
        description: descriptionI18n,
        contactEmail: profile.contactEmail || undefined,
        contactPhone: profile.contactPhone || undefined,
        logoPath: profile.logoPath || undefined,
        bannerPath: profile.bannerPath || undefined,
      },
    }),
  );

  const slugSave = useStudioSave(
    t,
    () => updateStoreSlug({ data: { slug } }),
    (result) => setSlug(result.slug),
  );

  const categorySave = useStudioSave(t, () =>
    updateStoreCategory({ data: { categoryId } }),
  );

  const socialsSave = useStudioSave(t, () =>
    updateStoreSocials({
      data: {
        instagram: socials.instagram,
        facebook: socials.facebook,
        tiktok: socials.tiktok,
        website: socials.website,
      },
    }),
  );

  const seoSave = useStudioSave(t, () =>
    updateStoreSeo({ data: { title: seoTitle, description: seoDescription } }),
  );

  const appearanceSave = useStudioSave(t, () =>
    updateStoreAppearance({ data: { accent, announcement } }),
  );

  const sectionsSave = useStudioSave(t, () =>
    updateStoreSections({
      data: { sections, featuredProductIds, featuredCategoryIds },
    }),
  );

  const deleteCollectionMutation = useMutation({
    mutationFn: (id: string) => deleteSellerCollection({ data: { id } }),
    onSuccess: () => {
      setDeletingCollection(null);
      invalidate();
    },
  });

  const productById = useMemo(() => {
    const map = new Map<string, StudioProduct>();
    for (const product of data.products) map.set(product.id, product);
    return map;
  }, [data.products]);

  const categoryById = useMemo(() => {
    const map = new Map<string, StudioCategory>();
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

  const anyPending =
    profileSave.pending ||
    slugSave.pending ||
    categorySave.pending ||
    socialsSave.pending ||
    seoSave.pending ||
    appearanceSave.pending ||
    sectionsSave.pending;

  /* ------------------------- Live preview (real) ------------------------- */

  const previewStore: StoreDetail = useMemo(() => {
    const storeName = profile.name.trim() || data.store.name;
    const toProduct = (row: StudioProduct): CatalogProduct | null => {
      // Same visibility rules as the public storefront: only published products render.
      if (
        row.status !== "active" ||
        row.publication_status !== "published" ||
        row.moderation_status !== "approved" ||
        row.visibility !== "public"
      )
        return null;
      const images = [...(row.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const category = Array.isArray(row.category) ? row.category[0] : row.category;
      return {
        id: row.id,
        slug: row.slug,
        name: nameOf(row.name, locale) || row.slug,
        price: Number(row.base_price),
        compareAtPrice: row.compare_at_price ?? null,
        storeName,
        categorySlug: category?.slug ?? null,
        imagePath: storagePreviewUrl(images[0]?.storage_path ?? null),
        imageAlt: nameOf(images[0]?.alt_text ?? null, locale),
        secondImagePath: storagePreviewUrl(images[1]?.storage_path ?? null),
        secondImageAlt: nameOf(images[1]?.alt_text ?? null, locale),
        createdAt: row.created_at,
      };
    };
    const published = data.products
      .map((row) => ({ row, product: toProduct(row) }))
      .filter((entry): entry is { row: StudioProduct; product: CatalogProduct } => entry.product !== null)
      .sort((a, b) =>
        String(b.row.published_at ?? b.row.created_at).localeCompare(String(a.row.published_at ?? a.row.created_at)),
      );
    const products = published.map((entry) => entry.product);
    const byId = new Map(products.map((product) => [product.id, product]));

    const featuredProducts = featuredProductIds
      .map((id) => byId.get(id))
      .filter((product): product is CatalogProduct => Boolean(product));
    const offerProducts = products
      .filter((product) => product.compareAtPrice != null && product.compareAtPrice > product.price)
      .slice(0, 8);
    const newProducts = products.slice(0, 8);
    const featuredCategories = featuredCategoryIds
      .map((id) => categoryById.get(id))
      .filter((category): category is StudioCategory => Boolean(category))
      .map((category) => ({
        id: category.id,
        slug: category.slug,
        name: nameOf(category.name, locale) || category.slug,
        productCount: products.filter((product) => product.categorySlug === category.slug).length,
        imageUrl: category.image_url ?? null,
        gender: categoryGender(category.gender ?? null),
        featured: category.featured === true,
        seoTitle: category.seo_title ?? null,
        seoDescription: category.seo_description ?? null,
      }));

    const sectionViews = sections
      .filter((section) => section.enabled)
      .map((section) => ({
        id: section.id,
        kind: section.kind,
        title: localizeText(section.title, locale, t.sections.sectionKinds[section.kind]),
      }));

    const resolveCollections = (configs: StoreCollectionConfig[]) =>
      configs
        .filter((collection) => collection.enabled && collection.product_ids.length > 0)
        .map((collection) => ({
          id: collection.id,
          title: localizeText(collection.title, locale, ""),
          subtitle: localizeText(collection.subtitle, locale, ""),
          products: collection.product_ids
            .map((id) => byId.get(id))
            .filter((product): product is CatalogProduct => Boolean(product)),
        }))
        .filter((collection) => collection.title.length > 0 && collection.products.length > 0);

    const savedCollections = data.settings.seller_collections.map((collection) => ({
      ...collection,
      title: { ...collection.title },
      subtitle: { ...collection.subtitle },
      product_ids: [...collection.product_ids],
    }));
    const collections = resolveCollections([
      ...data.settings.official_collections,
      ...savedCollections,
    ]);

    const categoryName = categoryId
      ? nameOf(categoryById.get(categoryId)?.name, locale) || null
      : null;

    return {
      id: data.store.id,
      slug,
      name: storeName,
      description: localizeText(descriptionI18n, locale) || data.store.description || null,
      logoUrl: storagePreviewUrl(profile.logoPath.trim()),
      bannerUrl: storagePreviewUrl(profile.bannerPath.trim()),
      verified: data.store.verification_status === "verified",
      official: (data.store.settings as Record<string, unknown> | null)?.["official"] === true,
      products,
      categories: [
        ...new Set(
          products
            .map((product) => product.categorySlug)
            .filter((value): value is string => Boolean(value)),
        ),
      ],
      accent,
      announcement: localizeText(announcement, locale) || null,
      sections: sectionViews,
      collections,
      featuredProducts,
      featuredCategories,
      newProducts,
      offerProducts,
      bestProducts: [],
      contactEmail: profile.contactEmail.trim() || null,
      contactPhone: profile.contactPhone.trim() || null,
      socialLinks: {
        instagram: httpOnly(socials.instagram.trim()) ?? "",
        facebook: httpOnly(socials.facebook.trim()) ?? "",
        tiktok: httpOnly(socials.tiktok.trim()) ?? "",
        website: httpOnly(socials.website.trim()) ?? "",
      },
      seoTitle: localizeText(seoTitle, locale) || null,
      seoDescription: localizeText(seoDescription, locale) || null,
      categoryName,
    } satisfies StoreDetail;
  }, [
    data,
    profile,
    slug,
    categoryId,
    categoryById,
    socials,
    seoTitle,
    seoDescription,
    accent,
    announcement,
    sections,
    featuredProductIds,
    featuredCategoryIds,
    locale,
    t,
  ]);

  /* -------------------------------- Render ------------------------------- */

  const isVerified = data.store.verification_status === "verified";

  return (
    <div dir={localeDirections[locale]}>
      <div className="mb-4 flex items-center justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to="/store/$slug" params={{ slug }} search={{ locale }}>
            <ExternalLink className="me-1.5 h-3.5 w-3.5" aria-hidden />
            {t.viewStore}
          </Link>
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(value as StoreStudioTab)}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="profile">{t.tabs.profile}</TabsTrigger>
          <TabsTrigger value="appearance">{t.tabs.appearance}</TabsTrigger>
          <TabsTrigger value="sections">{t.tabs.sections}</TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="me-1.5 h-3.5 w-3.5" aria-hidden /> {t.tabs.preview}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------- Profile ------------------------------ */}
        <TabsContent value="profile" className="mt-6">
          {/* Store verification status — honest state, never a fake badge */}
          <div
            className={`mb-6 flex items-start gap-3 rounded-lg border p-4 ${
              isVerified ? "border-verified/30 bg-verified/10" : "border-border bg-card"
            }`}
          >
            <ShieldCheck
              className={`mt-0.5 size-5 shrink-0 ${isVerified ? "text-verified" : "text-muted-foreground"}`}
              aria-hidden
            />
            <div>
              <p className="text-small font-semibold text-foreground">
                {isVerified ? t.verification.verifiedTitle : t.verification.unverifiedTitle}
              </p>
              <p className="mt-1 text-small text-muted-foreground">
                {isVerified ? t.verification.verifiedText : t.verification.unverifiedText}
              </p>
            </div>
          </div>
          <div className="grid gap-6">
            <form onSubmit={profileSave.submit}>
              <AdminCard title={t.profile.title} subtitle={t.profile.subtitle}>
                <div className="grid gap-5">
                  <Field label={t.profile.name} hint={t.profile.nameHint}>
                    <Input
                      required
                      minLength={2}
                      maxLength={160}
                      value={profile.name}
                      onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                    />
                  </Field>
                  <Field label={t.profile.description} hint={t.profile.descriptionHint}>
                    <TrilingualInputs
                      value={descriptionI18n}
                      onChange={setDescriptionI18n}
                      maxLength={2000}
                      multiline
                    />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t.profile.contactEmail} hint={t.profile.contactEmailHint}>
                      <Input
                        type="email"
                        dir="ltr"
                        value={profile.contactEmail}
                        onChange={(event) => setProfile({ ...profile, contactEmail: event.target.value })}
                      />
                    </Field>
                    <Field label={t.profile.contactPhone} hint={t.profile.contactPhoneHint}>
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
                    <Field label={t.profile.logoPath} hint={t.profile.logoPathHint}>
                      <Input
                        dir="ltr"
                        maxLength={500}
                        value={profile.logoPath}
                        onChange={(event) => setProfile({ ...profile, logoPath: event.target.value })}
                      />
                    </Field>
                    <Field label={t.profile.bannerPath} hint={t.profile.bannerPathHint}>
                      <Input
                        dir="ltr"
                        maxLength={500}
                        value={profile.bannerPath}
                        onChange={(event) => setProfile({ ...profile, bannerPath: event.target.value })}
                      />
                    </Field>
                  </div>
                  <SaveBar t={t} pending={profileSave.pending} savedAt={profileSave.savedAt} error={profileSave.error} />
                </div>
              </AdminCard>
            </form>

            <form onSubmit={slugSave.submit}>
              <AdminCard title={t.slug.title} subtitle={t.slug.subtitle}>
                <div className="grid gap-5">
                  <Field label={t.slug.label} hint={t.slug.hint}>
                    <div className="flex items-center gap-2">
                      <span dir="ltr" className="shrink-0 text-small text-muted-foreground">
                        /store/
                      </span>
                      <Input
                        dir="ltr"
                        required
                        minLength={3}
                        maxLength={60}
                        value={slug}
                        onChange={(event) =>
                          setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                        }
                      />
                    </div>
                  </Field>
                  <SaveBar t={t} pending={slugSave.pending} savedAt={slugSave.savedAt} error={slugSave.error} />
                </div>
              </AdminCard>
            </form>

            <form onSubmit={categorySave.submit}>
              <AdminCard title={t.category.title} subtitle={t.category.subtitle}>
                <div className="grid gap-5">
                  <Field label={t.category.label}>
                    <Select
                      value={categoryId ?? "none"}
                      onValueChange={(value) => setCategoryId(value === "none" ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t.category.label} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t.category.none}</SelectItem>
                        {data.categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {nameOf(category.name, locale) || category.slug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <SaveBar t={t} pending={categorySave.pending} savedAt={categorySave.savedAt} error={categorySave.error} />
                </div>
              </AdminCard>
            </form>

            <form onSubmit={socialsSave.submit}>
              <AdminCard title={t.socials.title} subtitle={t.socials.subtitle}>
                <div className="grid gap-5 sm:grid-cols-2">
                  {(
                    [
                      { key: "instagram", label: t.socials.instagram },
                      { key: "facebook", label: t.socials.facebook },
                      { key: "tiktok", label: t.socials.tiktok },
                      { key: "website", label: t.socials.website },
                    ] as const
                  ).map((field) => (
                    <Field key={field.key} label={field.label} hint={t.socials.hint}>
                      <Input
                        dir="ltr"
                        type="url"
                        maxLength={300}
                        placeholder="https://"
                        value={socials[field.key]}
                        onChange={(event) => setSocials({ ...socials, [field.key]: event.target.value })}
                      />
                    </Field>
                  ))}
                </div>
                <div className="mt-5">
                  <SaveBar t={t} pending={socialsSave.pending} savedAt={socialsSave.savedAt} error={socialsSave.error} />
                </div>
              </AdminCard>
            </form>

            <form onSubmit={seoSave.submit}>
              <AdminCard title={t.seo.title} subtitle={t.seo.subtitle}>
                <div className="grid gap-5">
                  <Field label={t.seo.seoTitle} hint={t.seo.seoTitleHint}>
                    <TrilingualInputs value={seoTitle} onChange={setSeoTitle} maxLength={70} />
                  </Field>
                  <Field label={t.seo.seoDescription} hint={t.seo.seoDescriptionHint}>
                    <TrilingualInputs value={seoDescription} onChange={setSeoDescription} maxLength={160} multiline />
                  </Field>
                  <SaveBar t={t} pending={seoSave.pending} savedAt={seoSave.savedAt} error={seoSave.error} />
                </div>
              </AdminCard>
            </form>
          </div>
        </TabsContent>

        {/* ----------------------------- Appearance ----------------------------- */}
        <TabsContent value="appearance" className="mt-6">
          <form onSubmit={appearanceSave.submit}>
            <div className="grid gap-6">
              <AdminCard title={t.appearance.title} subtitle={t.appearance.subtitle}>
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
              <AdminCard title={t.appearance.announcement} subtitle={t.appearance.announcementHint}>
                <TrilingualInputs value={announcement} onChange={setAnnouncement} maxLength={120} />
                {localizeText(announcement, locale) ? (
                  <div className="mt-4 overflow-hidden rounded-xl">
                    <div
                      className="px-4 py-2.5 text-center"
                      style={{ backgroundColor: accentById(accent).swatch, color: accentById(accent).ink }}
                    >
                      <p className="text-small font-medium">{localizeText(announcement, locale)}</p>
                    </div>
                  </div>
                ) : null}
              </AdminCard>
              <SaveBar t={t} pending={appearanceSave.pending} savedAt={appearanceSave.savedAt} error={appearanceSave.error} />
            </div>
          </form>
        </TabsContent>

        {/* ------------------------------ Sections ------------------------------ */}
        <TabsContent value="sections" className="mt-6">
          <form onSubmit={sectionsSave.submit}>
            <div className="grid gap-6">
              <AdminCard title={t.sections.title} subtitle={t.sections.subtitle}>
                <div className="space-y-4">
                  {sections.map((section, index) => (
                    <div key={section.id} className="rounded-2xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={index === 0 || anyPending}
                            onClick={() => moveSection(index, -1)}
                            aria-label={t.sections.moveUp}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={index === sections.length - 1 || anyPending}
                            onClick={() => moveSection(index, 1)}
                            aria-label={t.sections.moveDown}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <Badge variant="secondary">{t.sections.sectionKinds[section.kind]}</Badge>
                        <span className="text-small font-medium">
                          {localizeText(section.title, locale, t.sections.sectionKinds[section.kind])}
                        </span>
                        <div className="ms-auto flex items-center gap-2">
                          <span className="text-caption text-muted-foreground">
                            {section.enabled ? t.sections.visible : t.sections.hidden}
                          </span>
                          <Switch
                            checked={section.enabled}
                            onCheckedChange={(checked) =>
                              setSections(sections.map((item, i) => (i === index ? { ...item, enabled: checked } : item)))
                            }
                            aria-label={t.sections.sectionKinds[section.kind]}
                          />
                        </div>
                      </div>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-small text-muted-foreground hover:text-foreground">
                          {t.sections.editTitle}
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

              <AdminCard title={t.sections.featuredProducts} subtitle={t.sections.featuredProductsHint}>
                {data.products.length ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                    {data.products.map((product) => {
                      const label = nameOf(product.name, locale) || product.slug;
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
                  <p className="text-small text-muted-foreground">{t.sections.emptyProducts}</p>
                )}
              </AdminCard>

              <AdminCard title={t.sections.featuredCategories} subtitle={t.sections.featuredCategoriesHint}>
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
                  <p className="text-small text-muted-foreground">{t.sections.emptyCategories}</p>
                )}
              </AdminCard>

              <SaveBar t={t} pending={sectionsSave.pending} savedAt={sectionsSave.savedAt} error={sectionsSave.error} />
            </div>
          </form>

          <div className="mt-6">
            <AdminCard
              title={t.collections.title}
              subtitle={t.collections.subtitle}
              actions={
                <Button type="button" size="sm" onClick={() => setEditingCollection("new")}>
                  <Plus className="size-4" aria-hidden /> {t.collections.new}
                </Button>
              }
            >
              {data.settings.seller_collections.length === 0 ? (
                <EmptyState title={t.collections.empty} text={t.collections.emptyText} />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.settings.seller_collections.map((collection) => (
                    <div key={collection.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {localizeText(collection.title, locale, t.collections.untitled)}
                          </p>
                          {localizeText(collection.subtitle, locale) ? (
                            <p className="mt-1 text-small text-muted-foreground">
                              {localizeText(collection.subtitle, locale)}
                            </p>
                          ) : null}
                          <p className="mt-2 text-caption text-muted-foreground">
                            {t.collections.productsCount(collection.product_ids.length)}
                          </p>
                        </div>
                        <StatusPill
                          status={collection.enabled ? t.collections.enabled : t.collections.disabled}
                        />
                      </div>
                      {collection.product_ids.length > 0 ? (
                        <ul className="mt-3 space-y-1 text-small text-muted-foreground">
                          {collection.product_ids.slice(0, 5).map((pid) => (
                            <li key={pid} className="truncate">
                              · {nameOf(productById.get(pid)?.name, locale) || pid.slice(0, 8)}
                            </li>
                          ))}
                          {collection.product_ids.length > 5 ? <li>…</li> : null}
                        </ul>
                      ) : null}
                      <div className="mt-4 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditingCollection({
                              id: collection.id,
                              title: { ...collection.title },
                              subtitle: { ...collection.subtitle },
                              product_ids: [...collection.product_ids],
                              enabled: collection.enabled,
                            })
                          }
                        >
                          <Pencil className="size-3.5" aria-hidden /> {t.collections.edit}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDeletingCollection({
                              id: collection.id,
                              title: { ...collection.title },
                              subtitle: { ...collection.subtitle },
                              product_ids: [...collection.product_ids],
                              enabled: collection.enabled,
                            })
                          }
                        >
                          <Trash2 className="size-3.5" aria-hidden /> {t.collections.delete}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          </div>
        </TabsContent>

        {/* ------------------------------- Preview ------------------------------ */}
        <TabsContent value="preview" className="mt-6">
          <AdminCard title={t.preview.title} subtitle={t.preview.subtitle}>
            <div className="grid gap-6">
              <StorePreviewFrame width={1280} label={t.preview.desktop}>
                <StoreFront store={previewStore} locale={locale} t={fullT} />
              </StorePreviewFrame>
              <StorePreviewFrame width={768} label={t.preview.tablet}>
                <StoreFront store={previewStore} locale={locale} t={fullT} />
              </StorePreviewFrame>
              <StorePreviewFrame width={390} label={t.preview.mobile}>
                <StoreFront store={previewStore} locale={locale} t={fullT} />
              </StorePreviewFrame>
            </div>
          </AdminCard>
        </TabsContent>
      </Tabs>

      {editingCollection ? (
        <CollectionEditorDialog
          t={t}
          locale={locale}
          collection={editingCollection === "new" ? null : editingCollection}
          products={data.products.map((product) => ({
            id: product.id,
            name: nameOf(product.name, locale) || product.slug,
          }))}
          onClose={() => setEditingCollection(null)}
          onSaved={() => {
            setEditingCollection(null);
            invalidate();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deletingCollection !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingCollection(null);
        }}
        title={t.collections.deleteTitle}
        description={t.collections.deleteDesc}
        confirmLabel={t.collections.delete}
        danger
        onConfirm={() => {
          if (deletingCollection) deleteCollectionMutation.mutate(deletingCollection.id);
        }}
      />
    </div>
  );
}

/* ------------------------- Collection editor dialog ------------------------ */

function CollectionEditorDialog({
  t,
  locale,
  collection,
  products,
  onClose,
  onSaved,
}: {
  t: V8;
  locale: SupportedLocale;
  collection: SellerCollection | null;
  products: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState<TrilingualText>(
    collection ? { ...collection.title } : emptyTrilingual(),
  );
  const [subtitle, setSubtitle] = useState<TrilingualText>(
    collection ? { ...collection.subtitle } : emptyTrilingual(),
  );
  const [productIds, setProductIds] = useState<string[]>(collection?.product_ids ?? []);
  const [enabled, setEnabled] = useState(collection?.enabled ?? true);
  const [filter, setFilter] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const filtered = products.filter((product) =>
    filter.trim() === "" ? true : product.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const toggle = (id: string) =>
    setProductIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const save = useMutation({
    mutationFn: () =>
      upsertSellerCollection({
        data: {
          ...(collection ? { id: collection.id } : {}),
          title,
          subtitle,
          productIds,
          enabled,
        },
      }),
    onSuccess: onSaved,
    onError: (error) => setServerError(error instanceof Error ? error.message : t.save.error),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{collection ? t.collections.edit : t.collections.new}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.collections.dialogTitle}</Label>
            <TrilingualInputs value={title} onChange={setTitle} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.collections.dialogSubtitle}</Label>
            <TrilingualInputs value={subtitle} onChange={setSubtitle} maxLength={160} multiline />
          </div>
          <div className="space-y-1.5">
            <Label>{t.collections.products}</Label>
            <Input
              placeholder={t.collections.pickProductsPh}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2">
              {filtered.length === 0 ? (
                <p className="p-2 text-small text-muted-foreground">{t.sections.emptyProducts}</p>
              ) : (
                filtered.map((product) => (
                  <label
                    key={product.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                  >
                    <Checkbox checked={productIds.includes(product.id)} onCheckedChange={() => toggle(product.id)} />
                    <span className="text-small">{product.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-caption text-muted-foreground">{t.collections.productsCount(productIds.length)}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="collection-enabled">{t.collections.enabled}</Label>
            <Switch id="collection-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.collections.cancel}
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {t.save.saveChanges}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
