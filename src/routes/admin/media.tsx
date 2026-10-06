import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Box,
  ChevronRight,
  Eye,
  FileImage,
  FileVideo,
  Folder,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  ConfirmDialog,
  EmptyState,
  Field,
  TableSkeleton,
  fmtDateTime,
} from "@/components/admin/ui";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listMedia, getMediaSignedUrl, type MediaEntry } from "@/lib/admin-media.functions";
import {
  deleteMedia,
  deleteStorageObject,
  finalizeMediaUpload,
  listProductMedia,
  reorderMedia,
  replaceMedia,
  requestMediaUpload,
  setPrimaryMedia,
  updateMediaAlt,
  type AdminProductMedia,
  type MediaKind,
} from "@/lib/admin-media.functions";
import { listAdminProducts } from "@/lib/admin-catalog.functions";
import {
  MediaUploader,
  type UploaderLabels,
  type UploadedMedia,
} from "@/components/media/MediaUploader";
// Lazy chunk: `three` is heavy and must never be in the admin main bundle.
// The storefront route loads ProductViewer3D the same way. Registry #123.
const ProductViewer3D = lazy(() =>
  import("@/components/commerce/ProductViewer3D").then((mod) => ({ default: mod.ProductViewer3D })),
);
import { getLocale, getTranslations } from "@/lib/i18n";
import { pickLocalizedName } from "@/lib/names";
import { strParam, useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/media")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    tab: search["tab"] === "storage" ? ("storage" as const) : ("product" as const),
    productId: strParam(search["productId"]),
    q: strParam(search["q"]),
    prefix: strParam(search["prefix"]),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Media — Modalia Admin" }],
  }),
  component: MediaPage,
});

function fmtBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MediaT = ReturnType<typeof getTranslations>["admin"]["media"];

function uploaderLabels(t: MediaT): UploaderLabels {
  return {
    dropHint: t.dropHint,
    browse: t.browse,
    uploading: t.uploading,
    finalizing: t.finalizing,
    done: t.done,
    errUnsupported: t.errUnsupported,
    errTooLarge: t.errTooLarge,
    errEmpty: t.errEmpty,
    errCorrupt: t.errCorrupt,
    errTooSmall: t.errTooSmall,
    errTooLargeDims: t.errTooLargeDims,
    errUploadFailed: t.errUploadFailed,
    errKindMismatch: t.errKindMismatch,
  };
}

function MediaPage() {
  const url = useUrlState({ tab: "product", productId: "", q: "", prefix: "" });
  const { locale, tab } = Route.useSearch();
  const t = getTranslations(locale).admin.media;
  const nav = getTranslations(locale).adminNav.items;

  return (
    <AdminGate>
      <AdminShell title={t.title} subtitle={t.subtitle} breadcrumbs={[{ label: nav.media }]}>
        <div className="mb-4 flex gap-1 rounded-lg border border-border bg-card p-1">
          {(["product", "storage"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => url.set({ tab: key }, { push: true })}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {t.tabs[key]}
            </button>
          ))}
        </div>

        {tab === "product" ? (
          <ProductTab
            t={t}
            locale={locale}
            q={strParam(url.search["q"])}
            productId={strParam(url.search["productId"])}
            onSearch={(q) => url.set({ q })}
            onSelectProduct={(id) => url.set({ productId: id }, { push: true })}
          />
        ) : (
          <StorageTab
            t={t}
            prefix={strParam(url.search["prefix"])}
            onNavigate={(prefix) => url.set({ prefix }, { push: true })}
          />
        )}
      </AdminShell>
    </AdminGate>
  );
}

/* ------------------------------------------------------------------ */
/* Product tab: picker + media manager                                 */
/* ------------------------------------------------------------------ */

function ProductTab({
  t,
  locale,
  q,
  productId,
  onSearch,
  onSelectProduct,
}: {
  t: MediaT;
  locale: "ar" | "fr" | "en";
  q: string;
  productId: string;
  onSearch: (q: string) => void;
  onSelectProduct: (id: string) => void;
}) {
  const [term, setTerm] = useState(q);
  const searchQuery = useQuery({
    queryKey: ["admin-media-products", q],
    queryFn: () => listAdminProducts({ data: { q: q || undefined, page: 1 } }),
    retry: false,
  });
  const products = searchQuery.data?.products ?? [];

  return (
    <div className="space-y-4">
      <AdminCard title={t.tabs.product} subtitle={t.selectProduct}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearch(term.trim());
                }
              }}
              placeholder={t.searchProduct}
              className="ps-9"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => onSearch(term.trim())}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {searchQuery.isPending ? (
          <TableSkeleton rows={3} />
        ) : searchQuery.isError ? (
          <EmptyState title="Error" text={errMsg(searchQuery.error)} />
        ) : products.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {products.slice(0, 8).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectProduct(p.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-accent/60",
                    productId === p.id && "bg-accent/60",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {pickLocalizedName(p.name, p.slug)}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {p.slug}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.status}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t.selectProduct}</p>
        )}
      </AdminCard>

      {productId ? (
        <ProductMediaManager key={productId} productId={productId} t={t} locale={locale} />
      ) : null}
    </div>
  );
}

function ProductMediaManager({
  productId,
  t,
  locale,
}: {
  productId: string;
  t: MediaT;
  locale: "ar" | "fr" | "en";
}) {
  const queryClient = useQueryClient();
  const labels = uploaderLabels(t);
  const [preview, setPreview] = useState<AdminProductMedia | null>(null);
  const [altEditor, setAltEditor] = useState<AdminProductMedia | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminProductMedia | null>(null);
  const [replacing, setReplacing] = useState<AdminProductMedia | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const mediaQuery = useQuery({
    queryKey: ["admin-product-media", productId],
    queryFn: () => listProductMedia({ data: { productId } }),
    retry: false,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-product-media", productId] });

  const requestUpload = async (file: File, kind: MediaKind) => {
    const res = await requestMediaUpload({
      data: {
        productId,
        filename: file.name,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        mediaKind: kind,
      },
    });
    return { path: res.path, signedUrl: res.signedUrl, mediaKind: res.mediaKind };
  };
  const finalizeUpload = async (path: string, kind: MediaKind) => {
    await finalizeMediaUpload({ data: { productId, path, mediaKind: kind } });
  };
  const onUploaded = (_m: UploadedMedia) => {
    toast.success(t.uploaded);
    invalidate();
  };

  const altMutation = useMutation({
    mutationFn: (input: {
      imageId: string;
      altText: { fr?: string | undefined; en?: string | undefined; ar?: string | undefined };
    }) => updateMediaAlt({ data: { imageId: input.imageId, productId, altText: input.altText } }),
    onSuccess: () => {
      toast.success(t.altSaved);
      setAltEditor(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const primaryMutation = useMutation({
    mutationFn: (imageId: string) => setPrimaryMedia({ data: { imageId, productId } }),
    onSuccess: () => {
      toast.success(t.primarySet);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderMedia({ data: { productId, orderedIds } }),
    onSuccess: () => {
      toast.success(t.reordered);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => deleteMedia({ data: { imageId, productId } }),
    onSuccess: () => {
      toast.success(t.deleted);
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const move = (items: AdminProductMedia[], index: number, dir: -1 | 1) => {
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    reorderMutation.mutate(next.map((m) => m.id));
  };

  const handleReplaceFile = async (file: File | undefined) => {
    const target = replacing;
    setReplacing(null);
    if (!file || !target) return;
    const kind: MediaKind =
      target.mediaType === "model_3d" ? "model_3d" : target.mediaType === "video" ? "video" : "image";
    try {
      const req = await requestMediaUpload({
        data: {
          productId,
          filename: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          mediaKind: kind,
        },
      });
      const put = await fetch(req.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(t.errUploadFailed);
      await replaceMedia({
        data: { imageId: target.id, productId, path: req.path, mediaKind: kind },
      });
      toast.success(t.replaced);
      invalidate();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const product = mediaQuery.data?.product;
  const items = mediaQuery.data?.media ?? [];

  return (
    <AdminCard
      title={product ? pickLocalizedName(product.name, product.slug) : t.tabs.product}
      subtitle={product ? product.slug : undefined}
    >
      {mediaQuery.isPending ? (
        <TableSkeleton rows={4} />
      ) : mediaQuery.isError ? (
        <EmptyState title="Error" text={errMsg(mediaQuery.error)} />
      ) : (
        <>
          <h3 className="mb-2 text-sm font-medium">{t.uploadTitle}</h3>
          <MediaUploader
            acceptKind="any"
            labels={labels}
            requestUpload={requestUpload}
            finalizeUpload={finalizeUpload}
            onUploaded={onUploaded}
          />

          <h3 className="mb-2 mt-6 text-sm font-medium">
            {t.tabs.product} ({items.length})
          </h3>
          {items.length === 0 ? (
            <EmptyState title={t.noMedia} text={t.noMediaText} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((m, i) => (
                <li key={m.id} className="overflow-hidden rounded-lg border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setPreview(m)}
                    className="relative block aspect-video w-full bg-muted/50"
                    aria-label={t.preview}
                  >
                    {m.mediaType === "model_3d" ? (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Box className="h-10 w-10" />
                        <span className="text-xs font-medium">{t.kindModel}</span>
                      </span>
                    ) : m.mediaType === "video" ? (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                        <FileVideo className="h-10 w-10" />
                        <span className="text-xs font-medium">{t.kindVideo}</span>
                      </span>
                    ) : m.previewUrl ? (
                      <img
                        src={m.previewUrl}
                        alt={
                          m.altText[locale] ||
                          m.altText["en"] ||
                          m.altText["fr"] ||
                          m.altText["ar"] ||
                          ""
                        }
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-10 w-10" />
                      </span>
                    )}
                    {m.isPrimary && (
                      <span className="absolute start-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        <Star className="h-3 w-3" /> {t.primary}
                      </span>
                    )}
                    <span className="absolute end-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                      {m.mediaType === "model_3d" ? t.kindModel : m.mediaType === "video" ? t.kindVideo : t.kindImage}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 border-t border-border p-1.5">
                    <button
                      type="button"
                      title={t.preview}
                      onClick={() => setPreview(m)}
                      className="rounded p-1.5 hover:bg-accent"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={t.editAlt}
                      onClick={() => setAltEditor(m)}
                      className="rounded p-1.5 hover:bg-accent"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!m.isPrimary && (
                      <button
                        type="button"
                        title={t.setPrimary}
                        onClick={() => primaryMutation.mutate(m.id)}
                        className="rounded p-1.5 hover:bg-accent"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      title={t.moveUp}
                      disabled={i === 0 || reorderMutation.isPending}
                      onClick={() => move(items, i, -1)}
                      className="rounded p-1.5 hover:bg-accent disabled:opacity-40"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={t.moveDown}
                      disabled={i === items.length - 1 || reorderMutation.isPending}
                      onClick={() => move(items, i, 1)}
                      className="rounded p-1.5 hover:bg-accent disabled:opacity-40"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <span className="flex-1" />
                    <button
                      type="button"
                      title={t.replace}
                      onClick={() => {
                        setReplacing(m);
                        replaceInputRef.current?.click();
                      }}
                      className="rounded p-1.5 hover:bg-accent"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={t.delete}
                      onClick={() => setDeleteTarget(m)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        accept={
          replacing?.mediaType === "model_3d"
            ? ".glb,.gltf"
            : "image/jpeg,image/png,image/webp,image/gif"
        }
        onChange={(e) => {
          void handleReplaceFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Preview dialog */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t.preview}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="flex min-h-64 items-center justify-center rounded-md bg-muted/50">
              {preview.mediaType === "model_3d" ? (
                preview.previewUrl ? (
                  <Suspense
                    fallback={
                      <div className="flex h-96 w-full items-center justify-center text-sm text-muted-foreground" role="status">
                        {getTranslations(locale).common.loading}
                      </div>
                    }
                  >
                    <ProductViewer3D
                      modelUrl={preview.previewUrl}
                      locale={locale}
                      className="h-96 w-full"
                    />
                  </Suspense>
                ) : (
                  <p className="text-sm text-muted-foreground">{t.errUploadFailed}</p>
                )
              ) : preview.mediaType === "video" ? (
                preview.previewUrl ? (
                  <video
                    src={preview.previewUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-96 w-full rounded object-contain"
                  >
                    {t.videoNotSupported}
                  </video>
                ) : (
                  <p className="text-sm text-muted-foreground">{t.errUploadFailed}</p>
                )
              ) : preview.previewUrl ? (
                <img
                  src={preview.previewUrl}
                  alt={preview.altText[locale] || ""}
                  className="max-h-96 rounded object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t.errUploadFailed}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              {t.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alt text dialog */}
      <Dialog open={altEditor !== null} onOpenChange={(open) => !open && setAltEditor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.editAlt}</DialogTitle>
          </DialogHeader>
          {altEditor && (
            <AltTextForm
              key={altEditor.id}
              t={t}
              initial={altEditor.altText}
              saving={altMutation.isPending}
              onSave={(altText) => altMutation.mutate({ imageId: altEditor.id, altText })}
              onCancel={() => setAltEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t.deleteTitle}
        description={t.deleteDesc}
        confirmLabel={t.delete}
        danger
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </AdminCard>
  );
}

function AltTextForm({
  t,
  initial,
  saving,
  onSave,
  onCancel,
}: {
  t: MediaT;
  initial: Record<string, string>;
  saving: boolean;
  onSave: (altText: {
    fr?: string | undefined;
    en?: string | undefined;
    ar?: string | undefined;
  }) => void;
  onCancel: () => void;
}) {
  const [fr, setFr] = useState(initial["fr"] ?? "");
  const [en, setEn] = useState(initial["en"] ?? "");
  const [ar, setAr] = useState(initial["ar"] ?? "");
  return (
    <div className="space-y-4">
      <Field label={t.altFr}>
        <Input value={fr} onChange={(e) => setFr(e.target.value)} maxLength={500} />
      </Field>
      <Field label={t.altEn}>
        <Input value={en} onChange={(e) => setEn(e.target.value)} maxLength={500} />
      </Field>
      <Field label={t.altAr}>
        <Input value={ar} onChange={(e) => setAr(e.target.value)} maxLength={500} dir="rtl" />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave({
              fr: fr.trim() || undefined,
              en: en.trim() || undefined,
              ar: ar.trim() || undefined,
            })
          }
        >
          {t.save}
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Storage tab: raw bucket browser with safe delete                     */
/* ------------------------------------------------------------------ */

function StorageTab({
  t,
  prefix,
  onNavigate,
}: {
  t: MediaT;
  prefix: string;
  onNavigate: (prefix: string) => void;
}) {
  const locale = useAdminLocale();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<MediaEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaEntry | null>(null);

  const mediaQuery = useQuery({
    queryKey: ["admin-media", prefix],
    queryFn: () => listMedia({ data: { prefix } }),
    retry: false,
  });

  const previewUrlQuery = useQuery({
    queryKey: ["admin-media-url", preview?.path],
    queryFn: () => getMediaSignedUrl({ data: { path: preview!.path } }),
    enabled: preview !== null && !preview.isFolder,
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteStorageObject({ data: { path } }),
    onSuccess: () => {
      toast.success(t.objectDeleted);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-media"] });
    },
    onError: (e) => {
      toast.error(errMsg(e));
      setDeleteTarget(null);
    },
  });

  const crumbs = prefix ? prefix.split("/") : [];
  const goTo = (upto: number) => onNavigate(crumbs.slice(0, upto).join("/"));

  const entries = mediaQuery.data?.entries ?? [];
  const folders = entries.filter((e) => e.isFolder);
  const files = entries.filter((e) => !e.isFolder);

  return (
    <>
      <AdminCard title={t.storageTitle} subtitle={prefix ? `/${prefix}` : t.storageSub}>
        <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => goTo(0)}
            className="rounded px-2 py-1 font-medium hover:bg-accent"
          >
            /
          </button>
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => goTo(i + 1)}
                className="rounded px-2 py-1 hover:bg-accent"
              >
                {c}
              </button>
            </span>
          ))}
        </div>

        {mediaQuery.isPending ? (
          <TableSkeleton rows={6} />
        ) : mediaQuery.isError ? (
          <EmptyState title="Error" text={errMsg(mediaQuery.error)} />
        ) : entries.length === 0 ? (
          <EmptyState title={t.noMedia} text={t.storageSub} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  onClick={() => onNavigate(f.path)}
                  className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-3 text-start hover:bg-accent/60"
                >
                  <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{f.name}</span>
                </button>
              </li>
            ))}
            {files.map((f) => (
              <li
                key={f.path}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-3"
              >
                <button
                  type="button"
                  onClick={() => setPreview(f)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start"
                  aria-label={t.preview}
                >
                  <FileImage className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtBytes(f.size)}
                      {f.updatedAt ? ` · ${fmtDateTime(f.updatedAt, locale)}` : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  title={t.delete}
                  onClick={() => setDeleteTarget(f)}
                  className="shrink-0 rounded p-1.5 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      {preview && !preview.isFolder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setPreview(null)}
            aria-hidden
          />
          <div className="relative w-full max-w-lg rounded-lg border bg-background p-4 shadow-xl">
            <p className="truncate text-sm font-medium">{preview.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {preview.mime ?? "file"} · {fmtBytes(preview.size)}
            </p>
            <div className="mt-3 flex min-h-40 items-center justify-center rounded-md bg-muted/50">
              {previewUrlQuery.isPending ? (
                <p className="text-sm text-muted-foreground">{t.finalizing}</p>
              ) : previewUrlQuery.isError ? (
                <p className="text-sm text-destructive">{t.errUploadFailed}</p>
              ) : preview.mime?.startsWith("image/") ? (
                <img
                  src={previewUrlQuery.data?.url}
                  alt={preview.name}
                  className="max-h-96 rounded object-contain"
                />
              ) : (
                <a
                  href={previewUrlQuery.data?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium underline underline-offset-4"
                >
                  {t.preview}
                </a>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                {t.close}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t.deleteTitle}
        description={t.deleteDesc}
        confirmLabel={t.delete}
        danger
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.path)}
      />
    </>
  );
}
