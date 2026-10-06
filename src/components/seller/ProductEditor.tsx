import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useSearch } from "@tanstack/react-router";
import { BackLink } from "@/components/routing/back-link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  FileVideo,
  Image as ImageIcon,
  Images,
  Loader2,
  Plus,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminCard, EmptyState, StatusPill } from "@/components/admin/ui";
import {
  duplicateProduct,
  getProductEditor,
  getSellerBrands,
  getSellerCategories,
  getSellerColors,
  saveProduct,
  submitForModeration,
} from "@/lib/seller-products.functions";
import {
  getAdminEditorLists,
  getAdminProductEditor,
  saveAdminProduct,
} from "@/lib/admin-products.functions";
import { moderateAdminProduct } from "@/lib/admin-catalog.functions";
import {
  requestMediaUpload as requestAdminMediaUpload,
  finalizeMediaUpload as finalizeAdminMediaUpload,
  deleteStorageObject,
} from "@/lib/admin-media.functions";
import {
  requestSellerMediaUpload,
  finalizeSellerMediaUpload,
  deleteSellerMediaObject,
} from "@/lib/seller-media.functions";
import {
  MediaUploader,
  type UploaderLabels,
} from "@/components/media/MediaUploader";
import { cn } from "@/lib/utils";

/* The seller workspace is English-only (existing convention); the shared
 * uploader takes translated labels, so the admin media manager passes its
 * own trilingual set while the editor uses English. */
const SELLER_UPLOADER_LABELS: UploaderLabels = {
  dropHint: "Drag images, videos or 3D models (GLB/GLTF) here or",
  browse: "Browse files",
  uploading: "Uploading…",
  finalizing: "Validating…",
  done: "Done",
  errUnsupported: "Unsupported file type. Allowed: JPG, PNG, WebP, GIF, MP4, WebM, GLB, GLTF.",
  errTooLarge: "File too large — up to 10 MB for images, 100 MB for videos, 50 MB for 3D models.",
  errEmpty: "The file is empty.",
  errCorrupt: "The file is corrupt or not a genuine file of this type.",
  errTooSmall: "Image too small — minimum 64×64 px.",
  errTooLargeDims: "Image too large — maximum 8000×8000 px.",
  errUploadFailed: "Upload failed. Please try again.",
  errKindMismatch: "The file type does not match the expected kind.",
};

/* ------------------------------------------------------------------ types */

interface LocaleText {
  fr: string;
  en: string;
  ar: string;
}

interface OptionValueState {
  key: string;
  label: LocaleText;
  value: string;
  colorId?: string | null;
}

interface OptionState {
  key: string;
  code: string;
  name: LocaleText;
  values: OptionValueState[];
}

interface VariantState {
  key: string;
  id?: string;
  optionRefs: { optionCode: string; value: string }[];
  sku: string;
  price: string;
  compareAtPrice: string;
  barcode: string;
  weightGrams: string;
  stock: string;
  lowStockThreshold: string;
  imageId?: string;
}

interface ImageState {
  key: string;
  id?: string;
  storagePath: string;
  isPrimary: boolean;
  mediaType: "image" | "video" | "model_3d";
  altText?: LocaleText;
}

interface EditorSnapshot {
  name: LocaleText;
  description: LocaleText;
  shortDescription: LocaleText;
  categoryId: string;
  brandId: string;
  sku: string;
  barcode: string;
  weightGrams: string;
  basePrice: string;
  compareAtPrice: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  images: ImageState[];
  options: OptionState[];
  variants: VariantState[];
}

const EMPTY_LOCALE: LocaleText = { fr: "", en: "", ar: "" };
const LOCALES = [
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
] as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function asLocale(value: unknown): LocaleText {
  const out = { ...EMPTY_LOCALE };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of ["fr", "en", "ar"] as const) {
      const v = (value as Record<string, unknown>)[k];
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Client-side public URL for a seller storage path (`<sellerId>/uploads/…`).
 * Mirrors the server `publicUrl` in `src/lib/store.functions.ts`. Returns null
 * when the path can't be resolved — the caller keeps the honest icon tile.
 */
function mediaPreviewUrl(path: string): string | null {
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

function refKey(refs: { optionCode: string; value: string }[]): string {
  return refs
    .map((r) => `${r.optionCode}::${r.value}`)
    .sort()
    .join("|");
}

function emptySnapshot(): EditorSnapshot {
  return {
    name: { ...EMPTY_LOCALE },
    description: { ...EMPTY_LOCALE },
    shortDescription: { ...EMPTY_LOCALE },
    categoryId: "",
    brandId: "",
    sku: "",
    barcode: "",
    weightGrams: "",
    basePrice: "",
    compareAtPrice: "",
    tags: [],
    seoTitle: "",
    seoDescription: "",
    images: [],
    options: [],
    variants: [],
  };
}

/* ------------------------------------------------------------------ main */

/**
 * Media list thumbnail: renders the real image when its storage path resolves
 * to a public URL, and falls back to the honest icon tile when it can't
 * (unresolvable path, or the object fails to load — e.g. an unpublished
 * draft the public endpoint won't serve). Videos and 3D models always show
 * the icon tile.
 */
function MediaThumb({ img }: { img: ImageState }) {
  const [failed, setFailed] = useState(false);
  const url = img.mediaType === "image" ? mediaPreviewUrl(img.storagePath) : null;
  if (!url || failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
        {img.mediaType === "model_3d" ? (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        ) : img.mediaType === "video" ? (
          <FileVideo className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Images className="h-5 w-5 text-muted-foreground" />
        )}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-md bg-muted object-cover"
    />
  );
}

export function ProductEditor({
  mode,
  productId,
  adminMode,
  adminSellerId,
}: {
  mode: "create" | "edit";
  productId?: string;
  /**
   * Admin context (Section 35): uses the admin server functions
   * (`assertAdmin` + shared save core) instead of the seller ones.
   * Everything else — steps, validation, UX — is the same editor.
   */
  adminMode?: boolean;
  /** Required in admin create mode: the seller the new product belongs to. */
  adminSellerId?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const backParam = typeof routeSearch["back"] === "string" ? routeSearch["back"] : "";

  const editorQuery = useQuery({
    queryKey: [adminMode ? "admin-product-editor" : "seller-product-editor", productId],
    queryFn: () =>
      adminMode
        ? getAdminProductEditor({ data: { productId: productId as string } })
        : getProductEditor({ data: { productId: productId as string } }),
    enabled: mode === "edit" && !!productId,
  });
  // Admin mode fetches all three lists in one call; the seller path keeps its
  // three separate endpoints untouched.
  const adminListsQuery = useQuery({
    queryKey: ["admin-editor-lists"],
    queryFn: () => getAdminEditorLists(),
    enabled: adminMode === true,
  });
  const categoriesQuery = useQuery({
    queryKey: ["seller-categories"],
    queryFn: () => getSellerCategories(),
    enabled: !adminMode,
  });
  const brandsQuery = useQuery({
    queryKey: ["seller-brands"],
    queryFn: () => getSellerBrands(),
    enabled: !adminMode,
  });
  const colorsQuery = useQuery({
    queryKey: ["seller-colors"],
    queryFn: () => getSellerColors(),
    enabled: !adminMode,
  });

  const [snap, setSnap] = useState<EditorSnapshot>(() => {
    if (mode === "create") {
      try {
        const raw = localStorage.getItem(adminMode ? "admin-product-draft-new" : "seller-product-draft-new");
        if (raw) return { ...emptySnapshot(), ...JSON.parse(raw) };
      } catch {
        /* ignore */
      }
    }
    return emptySnapshot();
  });
  const [hydrated, setHydrated] = useState(mode === "create");
  const [dirty, setDirty] = useState(false);
  const [locale, setLocale] = useState<"fr" | "en" | "ar">("fr");
  const [tagInput, setTagInput] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  /* Map server editor payload -> local state (edit mode, once). */
  useEffect(() => {
    if (mode !== "edit" || hydrated || !editorQuery.data?.product) return;
    const p: any = editorQuery.data.product;
    const options: OptionState[] = (p.product_options ?? [])
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((o: any) => ({
        key: o.id,
        code: o.code,
        name: asLocale(o.name),
        values: (o.product_option_values ?? [])
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((v: any) => ({ key: v.id, label: asLocale(v.label), value: v.value, colorId: v.color_id ?? null })),
      }));
    const valueLabel = new Map<string, string>();
    for (const o of options)
      for (const v of o.values) valueLabel.set(v.key, v.value);
    const variants: VariantState[] = (p.product_variants ?? [])
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((v: any) => {
        const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
        return {
          key: v.id,
          id: v.id,
          optionRefs: (v.variant_option_values ?? [])
            .map((l: any) => {
              const opt = options.find((o) => o.values.some((x) => x.key === l.product_option_value_id));
              const val = opt?.values.find((x) => x.key === l.product_option_value_id);
              return opt && val ? { optionCode: opt.code, value: val.value } : null;
            })
            .filter(Boolean),
          sku: v.sku ?? "",
          price: v.price != null ? String(v.price) : "",
          compareAtPrice: v.compare_at_price != null ? String(v.compare_at_price) : "",
          barcode: v.barcode ?? "",
          weightGrams: v.weight_grams != null ? String(v.weight_grams) : "",
          stock: String(inv?.quantity ?? 0),
          lowStockThreshold: String(inv?.low_stock_threshold ?? 3),
          imageId: v.image_id ?? undefined,
        };
      });
    const images: ImageState[] = (p.product_images ?? [])
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((img: any) => ({
        key: img.id,
        id: img.id,
        storagePath: img.storage_path,
        isPrimary: !!img.is_primary,
        mediaType:
          img.media_type === "model_3d" ? "model_3d" : img.media_type === "video" ? "video" : "image",
        altText: asLocale(img.alt_text),
      }));
    const meta: any = p.metadata ?? {};
    setSnap({
      name: asLocale(p.name),
      description: asLocale(p.description),
      shortDescription: asLocale(p.short_description),
      categoryId: p.category_id ?? "",
      brandId: p.brand_id ?? "",
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      weightGrams: p.weight_grams != null ? String(p.weight_grams) : "",
      basePrice: p.base_price != null ? String(p.base_price) : "",
      compareAtPrice: p.compare_at_price != null ? String(p.compare_at_price) : "",
      tags: (p.product_tag_assignments ?? [])
        .map((a: any) => a.product_tags)
        .filter(Boolean)
        .map((t: any) => asLocale(t.name).fr || asLocale(t.name).en || t.slug || "")
        .filter(Boolean),
      seoTitle: typeof meta.seo_title === "string" ? meta.seo_title : "",
      seoDescription: typeof meta.seo_description === "string" ? meta.seo_description : "",
      images,
      options,
      variants,
    });
    setHydrated(true);
  }, [mode, hydrated, editorQuery.data]);

  const patch = useCallback((fn: (s: EditorSnapshot) => EditorSnapshot) => {
    setSnap((s) => fn(s));
    setDirty(true);
  }, []);

  /* ------------------------- variant matrix regeneration ------------------------- */
  useEffect(() => {
    if (!hydrated) return;
    setSnap((s) => {
      if (!s.options.length) return s;
      const combos: { optionCode: string; value: string }[][] = [[]];
      for (const opt of s.options) {
        const next: { optionCode: string; value: string }[][] = [];
        for (const combo of combos) {
          for (const val of opt.values) {
            if (!val.value.trim()) continue;
            next.push([...combo, { optionCode: opt.code, value: val.value.trim() }]);
          }
        }
        combos.length = 0;
        combos.push(...next);
      }
      if (!combos.length) return s;
      const baseSku = s.sku.trim() || "VAR";
      const byKey = new Map(s.variants.map((v) => [refKey(v.optionRefs), v]));
      const nextVariants: VariantState[] = combos.map((refs, i) => {
        const key = refKey(refs);
        const prev = byKey.get(key);
        if (prev && prev.optionRefs.length === refs.length) return prev;
        const valueSlug = refs
          .map((r) => slugify(r.value))
          .filter(Boolean)
          .join("-");
        return {
          key: `new-${uid()}-${i}`,
          optionRefs: refs,
          sku: `${baseSku}-${valueSlug || i + 1}`.slice(0, 80),
          price: s.basePrice,
          compareAtPrice: s.compareAtPrice,
          barcode: "",
          weightGrams: s.weightGrams,
          stock: "0",
          lowStockThreshold: "3",
        };
      });
      // Avoid infinite loops: only update if the combination set changed.
      const same =
        nextVariants.length === s.variants.length &&
        nextVariants.every((v, i) => v.key === s.variants[i]?.key);
      return same ? s : { ...s, variants: nextVariants };
    });
  }, [hydrated, snap.options, snap.sku, snap.basePrice, snap.compareAtPrice, snap.weightGrams]);

  /* ------------------------- autosave + navigation guard ------------------------- */
  useEffect(() => {
    if (mode !== "create") return;
    const key = adminMode ? "admin-product-draft-new" : "seller-product-draft-new";
    const id = window.setInterval(() => {
      if (dirtyRef.current) {
        try {
          localStorage.setItem(key, JSON.stringify(snap));
          setSavedAt(new Date().toLocaleTimeString());
        } catch {
          /* storage full — ignore */
        }
      }
    }, 20_000);
    return () => window.clearInterval(id);
  }, [mode, adminMode, snap]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: false,
    withResolver: true,
  });

  /* ------------------------- mutations ------------------------- */
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(snap, mode === "edit" ? productId : undefined);
      if (adminMode) {
        return saveAdminProduct({
          data: { ...payload, sellerId: mode === "create" ? adminSellerId : undefined },
        });
      }
      return saveProduct({ data: payload });
    },
    onSuccess: (res) => {
      setError(null);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      queryClient.invalidateQueries({ queryKey: ["seller-product-editor"] });
      queryClient.invalidateQueries({ queryKey: ["seller-inventory"] });
      if (adminMode) {
        queryClient.invalidateQueries({ queryKey: ["admin-products"] });
        queryClient.invalidateQueries({ queryKey: ["admin-product-editor"] });
      }
      if (mode === "create") {
        try {
          localStorage.removeItem(adminMode ? "admin-product-draft-new" : "seller-product-draft-new");
        } catch {
          /* ignore */
        }
        if (adminMode) {
          navigate({
            to: "/admin/products/$productId",
            params: { productId: res.productId },
            search: { q: "", moderation: "all", status: "all", sellerId: "all", page: 1, create: "", back: "" },
          });
        } else {
          navigate({ to: "/seller/products/$productId", params: { productId: res.productId }, search: { locale, back: backParam, q: "", status: "", moderation: "", page: 1 } });
        }
      } else {
        setSavedAt(new Date().toLocaleTimeString());
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Unable to save product."),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      adminMode
        ? // Admins don't "submit for review" — they approve directly.
          moderateAdminProduct({
            data: { productId: productId as string, decision: "approve" },
          })
        : submitForModeration({ data: { productId: productId as string } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-product-editor"] });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-product-editor"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Unable to submit."),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateProduct({ data: { productId: productId as string } }),
    onSuccess: (res) =>
      navigate({ to: "/seller/products/$productId", params: { productId: res.productId }, search: { locale, back: backParam, q: "", status: "", moderation: "", page: 1 } }),
    onError: (e) => setError(e instanceof Error ? e.message : "Unable to duplicate."),
  });

  const applyBulk = (field: "price" | "stock") => {
    const raw = field === "price" ? bulkPrice : bulkStock;
    if (raw.trim() === "") return;
    patch((s) => ({
      ...s,
      variants: s.variants.map((v) => ({ ...v, [field]: raw })),
    }));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    patch((s) => (s.tags.includes(t) ? s : { ...s, tags: [...s.tags, t] }));
    setTagInput("");
  };

  const addUploadedMedia = (media: { path: string; kind: "image" | "video" | "model_3d" }) => {
    patch((s) => ({
      ...s,
      images: [
        ...s.images,
        {
          key: `img-${uid()}`,
          storagePath: media.path,
          isPrimary: s.images.length === 0,
          mediaType: media.kind,
          altText: { ...EMPTY_LOCALE },
        },
      ],
    }));
  };

  const addOption = () => {
    patch((s) => {
      const n = s.options.length + 1;
      const code = `option-${n}-${uid()}`;
      return {
        ...s,
        options: [
          ...s.options,
          { key: code, code, name: { ...EMPTY_LOCALE }, values: [] },
        ],
      };
    });
  };

  const editorProduct: any = editorQuery.data?.product;
  const categories: any[] = adminMode
    ? (adminListsQuery.data?.categories ?? [])
    : (categoriesQuery.data?.categories ?? []);
  const brands: any[] = adminMode
    ? (adminListsQuery.data?.brands ?? [])
    : (brandsQuery.data?.brands ?? []);
  const colors: { id: string; name: unknown; slug: string; hex_value: string | null }[] = adminMode
    ? (adminListsQuery.data?.colors ?? [])
    : (colorsQuery.data?.colors ?? []);
  const colorById = new Map(colors.map((c) => [c.id, c]));
  const canSubmit =
    mode === "edit" &&
    (editorProduct?.moderation_status === "draft" ||
      editorProduct?.moderation_status === "rejected" ||
      editorProduct?.status === "draft");

  const content = useMemo(() => {
    if (mode === "edit") {
      if (editorQuery.isPending) return <EditorSkeleton />;
      if (editorQuery.isError || !editorQuery.data)
        return (
          <EmptyState
            title="Product not found"
            text="This product does not exist or you do not have access to it."
            action={
              <Button asChild>
                <BackLink back={backParam} fallbackTo={adminMode ? "/admin/products" : "/seller/products"}>Back to products</BackLink>
              </Button>
            }
          />
        );
    }
    return null;
  }, [mode, editorQuery.isPending, editorQuery.isError, editorQuery.data]);

  if (content) return content;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" && editorProduct ? (
            <>
              <StatusPill status={editorProduct.status} />
              <StatusPill status={editorProduct.moderation_status} />
              <StatusPill status={editorProduct.visibility} />
              {editorProduct.moderation_status === "rejected" && editorProduct.moderation_reason ? (
                <span className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {editorProduct.moderation_reason}
                </span>
              ) : null}
            </>
          ) : (
            <Badge variant="outline">New draft</Badge>
          )}
          {savedAt && !dirty ? (
            <span className="text-xs text-muted-foreground">Saved {savedAt}</span>
          ) : null}
          {dirty ? <span className="text-xs text-amber-600">Unsaved changes</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" && !adminMode ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => duplicateMutation.mutate()}
              disabled={duplicateMutation.isPending}
            >
              <Copy className="me-1.5 h-4 w-4" /> Duplicate
            </Button>
          ) : null}
          {canSubmit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              <Send className="me-1.5 h-4 w-4" />
              {submitMutation.isPending
                ? adminMode
                  ? "Approving…"
                  : "Submitting…"
                : adminMode
                  ? "Approve & publish"
                  : "Submit for review"}
            </Button>
          ) : null}
          <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : null}
            {mode === "create" ? "Create product" : "Save changes"}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* basic info */}
          <AdminCard title="Basic information" subtitle="Name and description in three languages">
            <Tabs value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
              <TabsList className="mb-4">
                {LOCALES.map((l) => (
                  <TabsTrigger key={l.code} value={l.code}>
                    {l.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {LOCALES.map((l) => (
                <TabsContent key={l.code} value={l.code} className="space-y-4">
                  <div dir={l.dir}>
                    <Label htmlFor={`name-${l.code}`}>Product name ({l.label})</Label>
                    <Input
                      id={`name-${l.code}`}
                      className="mt-1.5"
                      value={snap.name[l.code]}
                      onChange={(e) =>
                        patch((s) => ({ ...s, name: { ...s.name, [l.code]: e.target.value } }))
                      }
                      placeholder={l.code === "ar" ? "اسم المنتج" : "Product name"}
                    />
                  </div>
                  <div dir={l.dir}>
                    <Label htmlFor={`desc-${l.code}`}>Description</Label>
                    <Textarea
                      id={`desc-${l.code}`}
                      className="mt-1.5 min-h-28"
                      value={snap.description[l.code]}
                      onChange={(e) =>
                        patch((s) => ({
                          ...s,
                          description: { ...s.description, [l.code]: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div dir={l.dir}>
                    <Label htmlFor={`short-${l.code}`}>Short description</Label>
                    <Textarea
                      id={`short-${l.code}`}
                      className="mt-1.5 min-h-16"
                      value={snap.shortDescription[l.code]}
                      onChange={(e) =>
                        patch((s) => ({
                          ...s,
                          shortDescription: { ...s.shortDescription, [l.code]: e.target.value },
                        }))
                      }
                    />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </AdminCard>

          {/* classification */}
          <AdminCard title="Classification" subtitle="Category, brand and identifiers">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Category</Label>
                <Select
                  value={snap.categoryId || "none"}
                  onValueChange={(v) => patch((s) => ({ ...s, categoryId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {asLocale(c.name).fr || asLocale(c.name).en || c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Brand</Label>
                <Select
                  value={snap.brandId || "none"}
                  onValueChange={(v) => patch((s) => ({ ...s, brandId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select a brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No brand</SelectItem>
                    {brands.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sku">Product SKU</Label>
                <Input
                  id="sku"
                  className="mt-1.5 font-mono"
                  value={snap.sku}
                  onChange={(e) => patch((s) => ({ ...s, sku: e.target.value }))}
                  placeholder="e.g. DRESS-001"
                />
              </div>
              <div>
                <Label htmlFor="barcode">Barcode</Label>
                <Input
                  id="barcode"
                  className="mt-1.5 font-mono"
                  value={snap.barcode}
                  onChange={(e) => patch((s) => ({ ...s, barcode: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="weight">Weight (grams)</Label>
                <Input
                  id="weight"
                  type="number"
                  min={0}
                  className="mt-1.5"
                  value={snap.weightGrams}
                  onChange={(e) => patch((s) => ({ ...s, weightGrams: e.target.value }))}
                />
              </div>
              <div>
                <Label>Tags</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Add a tag and press Enter"
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {snap.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button
                        type="button"
                        aria-label={`Remove tag ${t}`}
                        onClick={() => patch((s) => ({ ...s, tags: s.tags.filter((x) => x !== t) }))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </AdminCard>

          {/* pricing */}
          <AdminCard title="Pricing" subtitle="Base price applies to variants unless overridden">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="base-price">Base price (DZD)</Label>
                <Input
                  id="base-price"
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1.5"
                  value={snap.basePrice}
                  onChange={(e) => patch((s) => ({ ...s, basePrice: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="compare-price">Compare-at price (DZD)</Label>
                <Input
                  id="compare-price"
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1.5"
                  value={snap.compareAtPrice}
                  onChange={(e) => patch((s) => ({ ...s, compareAtPrice: e.target.value }))}
                />
              </div>
            </div>
          </AdminCard>

          {/* images */}
          <AdminCard
            title="Media"
            subtitle="Images, videos and 3D models — first primary image is the cover"
          >
            <MediaUploader
              acceptKind="any"
              labels={SELLER_UPLOADER_LABELS}
              requestUpload={async (file, kind) => {
                if (adminMode) {
                  // Admin editor: product-scoped in edit mode, seller-staged in
                  // create mode (mirrors the seller pipeline's uploads flow).
                  const res = await requestAdminMediaUpload({
                    data: {
                      ...(mode === "edit"
                        ? { productId: productId as string }
                        : { sellerId: adminSellerId as string }),
                      filename: file.name,
                      mimeType: file.type || undefined,
                      sizeBytes: file.size,
                      mediaKind: kind,
                    },
                  });
                  return { path: res.path, signedUrl: res.signedUrl, mediaKind: res.mediaKind };
                }
                const res = await requestSellerMediaUpload({
                  data: {
                    filename: file.name,
                    mimeType: file.type || undefined,
                    sizeBytes: file.size,
                    mediaKind: kind,
                  },
                });
                return { path: res.path, signedUrl: res.signedUrl, mediaKind: res.mediaKind };
              }}
              finalizeUpload={async (path, kind) => {
                if (adminMode) {
                  const res = await finalizeAdminMediaUpload({
                    data: {
                      ...(mode === "edit"
                        ? { productId: productId as string }
                        : { sellerId: adminSellerId as string }),
                      path,
                      mediaKind: kind,
                    },
                  });
                  return { width: res.width ?? null, height: res.height ?? null };
                }
                const res = await finalizeSellerMediaUpload({ data: { path, mediaKind: kind } });
                return { width: res.width, height: res.height };
              }}
              onUploaded={addUploadedMedia}
            />
            {snap.images.length ? (
              <ul className="mt-4 space-y-2">
                {snap.images.map((img, i) => (
                  <li
                    key={img.key}
                    className="flex items-center gap-3 rounded-lg border p-2.5"
                  >
                    <MediaThumb img={img} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={img.storagePath}>
                      {img.storagePath}
                    </span>
                    <Select
                      value={img.mediaType}
                      onValueChange={(v: "image" | "video" | "model_3d") =>
                        patch((s) => ({
                          ...s,
                          images: s.images.map((x) =>
                            x.key === img.key ? { ...x, mediaType: v } : x,
                          ),
                        }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="model_3d">3D model</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      title="Set as primary"
                      aria-pressed={img.isPrimary}
                      onClick={() =>
                        patch((s) => ({
                          ...s,
                          images: s.images.map((x, xi) => ({
                            ...x,
                            isPrimary: xi === i,
                          })),
                        }))
                      }
                      className={cn(
                        "rounded p-1.5",
                        img.isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Star className={cn("h-4 w-4", img.isPrimary && "fill-amber-500")} />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove media"
                      onClick={() => {
                        // Uploaded but never saved to the product: delete the
                        // orphan object right away. Saved rows are cleaned up
                        // by saveProduct's reference-counted sync.
                        if (!img.id && img.storagePath) {
                          if (adminMode) {
                            deleteStorageObject({ data: { path: img.storagePath } }).catch(() => {
                              /* best-effort cleanup */
                            });
                          } else {
                            deleteSellerMediaObject({
                              data: { path: img.storagePath },
                            }).catch(() => {
                              /* best-effort cleanup */
                            });
                          }
                        }
                        patch((s) => ({
                          ...s,
                          images: s.images.filter((x) => x.key !== img.key),
                        }));
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No media yet.</p>
            )}
          </AdminCard>

          {/* options */}
          <AdminCard
            title="Options"
            subtitle="e.g. Size, Color — variants are generated from combinations"
            actions={
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus className="me-1.5 h-4 w-4" /> Add option
              </Button>
            }
          >
            {snap.options.length ? (
              <div className="space-y-4">
                {snap.options.map((opt, oi) => (
                  <div key={opt.key} className="rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid flex-1 gap-3 sm:grid-cols-3">
                        {(["fr", "en", "ar"] as const).map((lc) => (
                          <div key={lc}>
                            <Label>Option name ({lc})</Label>
                            <Input
                              className="mt-1.5"
                              value={opt.name[lc]}
                              onChange={(e) =>
                                patch((s) => ({
                                  ...s,
                                  options: s.options.map((o, j) =>
                                    j === oi ? { ...o, name: { ...o.name, [lc]: e.target.value } } : o,
                                  ),
                                }))
                              }
                              placeholder={lc === "fr" ? "Taille" : lc === "en" ? "Size" : "الحجم"}
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="Remove option"
                        onClick={() =>
                          patch((s) => ({ ...s, options: s.options.filter((_, j) => j !== oi) }))
                        }
                        className="mt-6 rounded p-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {opt.values.map((val, vi) => (
                        <Badge key={val.key} variant="secondary" className="gap-1.5 py-1 ps-2.5">
                          <Select
                            value={val.colorId ?? "none"}
                            onValueChange={(v: string) =>
                              patch((s) => ({
                                ...s,
                                options: s.options.map((o, j) =>
                                  j === oi
                                    ? {
                                        ...o,
                                        values: o.values.map((x, k) =>
                                          k === vi
                                            ? { ...x, colorId: v === "none" ? null : v }
                                            : x,
                                        ),
                                      }
                                    : o,
                                ),
                              }))
                            }
                          >
                            <SelectTrigger
                              aria-label="Value color"
                              className="h-6 w-6 shrink-0 rounded-full border p-0 [&>svg]:hidden"
                              style={{
                                backgroundColor: val.colorId
                                  ? (colorById.get(val.colorId)?.hex_value ?? "#cccccc")
                                  : "transparent",
                              }}
                            >
                              <span className="sr-only">Color</span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No color</SelectItem>
                              {colors.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="h-4 w-4 rounded-full border"
                                      style={{ backgroundColor: c.hex_value ?? "#cccccc" }}
                                    />
                                    {asLocale(c.name).en || asLocale(c.name).fr || c.slug}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="h-6 w-24 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                            value={val.value}
                            onChange={(e) => {
                              const v = e.target.value;
                              patch((s) => ({
                                ...s,
                                options: s.options.map((o, j) =>
                                  j === oi
                                    ? {
                                        ...o,
                                        values: o.values.map((x, k) =>
                                          k === vi
                                            ? {
                                                ...x,
                                                value: v,
                                                label: {
                                                  fr: x.label.fr || v,
                                                  en: x.label.en || v,
                                                  ar: x.label.ar || v,
                                                },
                                              }
                                            : x,
                                        ),
                                      }
                                    : o,
                                ),
                              }));
                            }}
                            placeholder="Value"
                          />
                          <button
                            type="button"
                            aria-label="Remove value"
                            onClick={() =>
                              patch((s) => ({
                                ...s,
                                options: s.options.map((o, j) =>
                                  j === oi ? { ...o, values: o.values.filter((_, k) => k !== vi) } : o,
                                ),
                              }))
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patch((s) => ({
                            ...s,
                            options: s.options.map((o, j) =>
                              j === oi
                                ? {
                                    ...o,
                                    values: [...o.values, { key: `val-${uid()}`, label: { ...EMPTY_LOCALE }, value: "" }],
                                  }
                                : o,
                            ),
                          }))
                        }
                      >
                        <Plus className="me-1 h-3.5 w-3.5" /> Value
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No options"
                text="A product without options has a single default variant. Add options to create combinations."
              />
            )}
          </AdminCard>

          {/* variant matrix */}
          <AdminCard
            title={`Variants (${snap.variants.length})`}
            subtitle="Per-variant SKU, price, stock and low-stock threshold"
          >
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="bulk-price">Set all prices</Label>
                <Input
                  id="bulk-price"
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1.5 w-36"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => applyBulk("price")}>
                Apply price
              </Button>
              <div>
                <Label htmlFor="bulk-stock">Set all stock</Label>
                <Input
                  id="bulk-stock"
                  type="number"
                  min={0}
                  className="mt-1.5 w-36"
                  value={bulkStock}
                  onChange={(e) => setBulkStock(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => applyBulk("stock")}>
                Apply stock
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-start text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 text-start font-medium">Variant</th>
                    <th className="px-3 py-2.5 text-start font-medium">SKU</th>
                    <th className="px-3 py-2.5 text-start font-medium">Price</th>
                    <th className="px-3 py-2.5 text-start font-medium">Stock</th>
                    <th className="px-3 py-2.5 text-start font-medium">Low at</th>
                    <th className="px-3 py-2.5 text-start font-medium">Image</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.variants.map((v, vi) => (
                    <tr key={v.key} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        {v.optionRefs.length ? (
                          <span className="text-xs">
                            {v.optionRefs.map((r) => r.value).join(" / ")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Default</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 font-mono text-xs"
                          value={v.sku}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              variants: s.variants.map((x, j) =>
                                j === vi ? { ...x, sku: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-8 w-28 text-xs"
                          value={v.price}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              variants: s.variants.map((x, j) =>
                                j === vi ? { ...x, price: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-24 text-xs"
                          value={v.stock}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              variants: s.variants.map((x, j) =>
                                j === vi ? { ...x, stock: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 text-xs"
                          value={v.lowStockThreshold}
                          onChange={(e) =>
                            patch((s) => ({
                              ...s,
                              variants: s.variants.map((x, j) =>
                                j === vi ? { ...x, lowStockThreshold: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={v.imageId ?? "none"}
                          onValueChange={(val) =>
                            patch((s) => ({
                              ...s,
                              variants: s.variants.map((x, j) =>
                                j === vi ? { ...x, ...(val === "none" ? {} : { imageId: val }) } : x,
                              ),
                            }))
                          }
                          disabled={!snap.images.length}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {snap.images.map((img, ii) => (
                              <SelectItem key={img.key} value={img.id ?? img.key}>
                                Image {ii + 1}
                                {img.id ? null : " (new)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                  {!snap.variants.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Add at least one option with values, or save to create the default variant.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </AdminCard>
        </div>

        {/* side rail */}
        <div className="space-y-6">
          <AdminCard title="SEO" subtitle="Stored in product metadata">
            <div className="space-y-4">
              <div>
                <Label htmlFor="seo-title">Meta title</Label>
                <Input
                  id="seo-title"
                  className="mt-1.5"
                  value={snap.seoTitle}
                  onChange={(e) => patch((s) => ({ ...s, seoTitle: e.target.value }))}
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="seo-desc">Meta description</Label>
                <Textarea
                  id="seo-desc"
                  className="mt-1.5 min-h-20"
                  value={snap.seoDescription}
                  onChange={(e) => patch((s) => ({ ...s, seoDescription: e.target.value }))}
                  maxLength={320}
                />
              </div>
            </div>
          </AdminCard>
          <AdminCard title="Workflow" subtitle="Publication lifecycle">
            <WorkflowHelp />
          </AdminCard>
        </div>
      </div>

      {/* navigation guard */}
      {blocker.status === "blocked" ? (
        <AlertDialog open onOpenChange={(open) => !open && blocker.reset()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes to this product. Leaving now will lose them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => blocker.reset()}>Stay</AlertDialogCancel>
              <AlertDialogAction onClick={() => blocker.proceed()}>Leave</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

function buildPayload(snap: EditorSnapshot, id?: string) {
  const clean = (t: LocaleText) =>
    Object.fromEntries(
      Object.entries(t).filter(([, v]) => v.trim()),
    ) as Record<string, string>;
  const name = clean(snap.name);
  if (!Object.keys(name).length) throw new Error("Product name is required in at least one language.");
  const basePrice = Number(snap.basePrice);
  if (!Number.isFinite(basePrice) || basePrice < 0) throw new Error("Base price must be 0 or more.");

  const variants =
    snap.variants.length > 0
      ? snap.variants
      : [
          {
            key: "default",
            optionRefs: [],
            sku: snap.sku.trim() || `VAR-${uid().toUpperCase()}`,
            price: snap.basePrice,
            compareAtPrice: snap.compareAtPrice,
            barcode: "",
            weightGrams: snap.weightGrams,
            stock: "0",
            lowStockThreshold: "3",
          },
        ];

  return {
    id,
    name,
    description: clean(snap.description),
    shortDescription: clean(snap.shortDescription),
    categoryId: snap.categoryId || null,
    brandId: snap.brandId || null,
    sku: snap.sku.trim() || undefined,
    barcode: snap.barcode.trim() || undefined,
    weightGrams: snap.weightGrams === "" ? undefined : Number(snap.weightGrams),
    basePrice,
    compareAtPrice:
      snap.compareAtPrice === "" ? undefined : Number(snap.compareAtPrice),
    tags: snap.tags,
    seoTitle: snap.seoTitle.trim() || undefined,
    seoDescription: snap.seoDescription.trim() || undefined,
    images: snap.images.map((img, i) => ({
      id: img.id,
      storagePath: img.storagePath,
      isPrimary: img.isPrimary,
      sortOrder: i,
      mediaType: img.mediaType,
      altText: clean(img.altText ?? { ...EMPTY_LOCALE }),
    })),
    options: snap.options.map((o) => ({
      code: o.code,
      name: clean(o.name),
      values: o.values
        .filter((v) => v.value.trim())
        .map((v) => ({
          label: clean(v.label),
          value: v.value.trim(),
          colorId: v.colorId ?? null,
        })),
    })),
    variants: variants.map((v) => ({
      id: v.id,
      optionRefs: v.optionRefs,
      sku: v.sku.trim() || `VAR-${uid().toUpperCase()}`,
      price: v.price === "" ? basePrice : Math.max(0, Number(v.price) || 0),
      compareAtPrice: v.compareAtPrice === "" ? undefined : Math.max(0, Number(v.compareAtPrice) || 0),
      barcode: v.barcode.trim() || undefined,
      weightGrams: v.weightGrams === "" ? undefined : Math.max(0, Number(v.weightGrams) || 0),
      stock: Math.max(0, Number(v.stock) || 0),
      lowStockThreshold: Math.max(0, Number(v.lowStockThreshold) || 0),
      // Only real (saved) image ids cross the wire — unsaved image keys are
      // skipped because the save core links variants by image row id and the
      // row doesn't exist yet. Follow-up for the save-core owner: resolve a
      // non-UUID imageId by matching data.images[].storagePath to the rows
      // inserted in the same save (the image loop runs before the variant
      // link loop), so a variant can keep an in-memory image across one save.
      imageId:
        v.imageId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.imageId)
          ? v.imageId
          : undefined,
    })),
  };
}

function EditorSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function WorkflowHelp() {
  const steps = [
    ["Draft", "Only you can see it."],
    ["Submit for review", "Goes private, pending moderation."],
    ["Approved", "Published and visible publicly."],
    ["Hide", "Stays published but hidden."],
    ["Archive", "Removed from the catalog."],
  ];
  return (
    <ol className="space-y-2.5 text-sm">
      {steps.map(([title, text]) => (
        <li key={title} className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>
            <strong className="font-medium">{title}.</strong>{" "}
            <span className="text-muted-foreground">{text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
