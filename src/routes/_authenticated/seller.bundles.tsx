import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus, Trash2, X } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import {
  AdminCard,
  ConfirmDialog,
  EmptyState,
  Field,
  Stat,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteBundle,
  listBundles,
  listMarketingCatalog,
  saveBundle,
  type MarketingCatalogProduct,
  type SellerBundleRow,
} from "@/lib/seller-marketing.functions";
import { getLocale, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/bundles")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: BundlesPage,
});

function productName(name: unknown, locale: string): string {
  if (name && typeof name === "object") {
    const n = name as Record<string, unknown>;
    for (const key of [locale, "en", "fr", "ar"]) {
      if (typeof n[key] === "string" && (n[key] as string).trim()) return n[key] as string;
    }
  }
  return "Untitled product";
}

type BundleLine = { productId: string; variantId: string; qty: string };

const EMPTY_LINE: BundleLine = { productId: "", variantId: "any", qty: "1" };

function BundlesPage() {
  const { locale } = Route.useSearch();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["seller-bundles"], queryFn: () => listBundles() });
  const catalogQuery = useQuery({ queryKey: ["seller-marketing-catalog"], queryFn: () => listMarketingCatalog() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [containerId, setContainerId] = useState("");
  const [lines, setLines] = useState<BundleLine[]>([{ ...EMPTY_LINE }]);
  const [deleteTarget, setDeleteTarget] = useState<SellerBundleRow | null>(null);

  const bundles = query.data?.bundles ?? [];
  const catalog: MarketingCatalogProduct[] = catalogQuery.data?.products ?? [];

  const stats = useMemo(() => {
    const items = bundles.reduce((s, b) => s + b.items.length, 0);
    const fulfillable = bundles.filter((b) => b.bundle_available > 0).length;
    return { bundles: bundles.length, items, fulfillable };
  }, [bundles]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["seller-bundles"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveBundle({
        data: {
          product_id: containerId,
          items: lines.map((l) => ({
            product_id: l.productId,
            variant_id: l.variantId === "any" ? null : l.variantId,
            qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
          })),
        },
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setContainerId("");
      setLines([{ ...EMPTY_LINE }]);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { product_id: string }) => deleteBundle({ data: input }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  const openCreate = () => {
    setContainerId("");
    setLines([{ ...EMPTY_LINE }]);
    setDialogOpen(true);
  };

  const updateLine = (index: number, patch: Partial<BundleLine>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch, ...(patch.productId ? { variantId: "any" } : {}) } : l)));

  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const canSubmit =
    containerId !== "" &&
    lines.length > 0 &&
    lines.every((l) => l.productId !== "") &&
    !saveMutation.isPending;

  const lineProduct = (line: BundleLine) => catalog.find((p) => p.id === line.productId) ?? null;

  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell
        eyebrow="Marketing"
        title="Bundles"
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            New bundle
          </Button>
        }
      >
        <AdminCard
          title="What a bundle is"
          subtitle="Each item in a bundle keeps its own price and stock — a bundle is a merchandising group with a validation layer. Bundle-wide pricing is not applied at checkout."
          className="mb-6"
        >
          <p className="text-sm text-muted-foreground">
            When you save a bundle, every item is verified server-side: it must belong to your
            catalog and have enough available stock (quantity minus reserved) for the quantity you
            set. The bundle's fulfillable count is the minimum across items of{" "}
            <span className="font-mono">⌊available ÷ qty⌋</span>.
          </p>
        </AdminCard>

        {query.isPending ? (
          <TableSkeleton rows={4} />
        ) : query.isError ? (
          <AdminCard title="Could not load bundles">
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Unexpected error."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => query.refetch()}>Retry</Button>
          </AdminCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Bundles" value={stats.bundles} />
              <Stat label="Bundled items" value={stats.items} />
              <Stat label="Fulfillable now" value={stats.fulfillable} hint="At least one full bundle in stock" />
            </div>

            <div className="mt-6 space-y-4">
              {bundles.length === 0 ? (
                <AdminCard title="Bundles">
                  <EmptyState
                    title="No bundles yet"
                    text="Group products into a bundle — for example a skincare set or a starter kit — and Modalia checks every item is yours and in stock."
                    action={
                      <Button onClick={openCreate}>
                        <PackagePlus className="me-2 h-4 w-4" />
                        Create your first bundle
                      </Button>
                    }
                  />
                </AdminCard>
              ) : (
                bundles.map((b) => (
                  <AdminCard
                    key={b.id}
                    title={productName(b.name, locale)}
                    subtitle={`${b.items.length} item${b.items.length === 1 ? "" : "s"} · can fulfill ${b.bundle_available} bundle${b.bundle_available === 1 ? "" : "s"}`}
                    actions={
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(b)}>
                        <Trash2 className="me-1 h-3.5 w-3.5" />
                        Remove bundle
                      </Button>
                    }
                  >
                    <ul className="divide-y divide-border">
                      {b.items.map((item, i) => (
                        <li key={`${item.product_id}-${item.variant_id ?? "all"}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.variant_id ? `Variant ${item.variant_id.slice(0, 8)} · ` : ""}
                              Qty per bundle: {item.qty} · {fmtMoney(item.unit_price)} each
                            </p>
                          </div>
                          <p className={`text-sm tabular-nums ${item.available >= item.qty ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
                            {item.available} available
                          </p>
                        </li>
                      ))}
                    </ul>
                  </AdminCard>
                ))
              )}
            </div>
          </>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New bundle</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field
                label="Bundle product"
                hint="The product this bundle is attached to (e.g. a “Skincare set” product page)."
              >
                <Select value={containerId} onValueChange={setContainerId}>
                  <SelectTrigger><SelectValue placeholder="Choose the bundle product" /></SelectTrigger>
                  <SelectContent>
                    {catalog.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {productName(p.name, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="space-y-3">
                <p className="text-sm font-medium">Bundle items</p>
                {lines.map((line, index) => {
                  const p = lineProduct(line);
                  return (
                    <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_90px_auto]">
                      <Select value={line.productId} onValueChange={(v) => updateLine(index, { productId: v })}>
                        <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                        <SelectContent>
                          {catalog
                            .filter((cp) => cp.id !== containerId)
                            .map((cp) => (
                              <SelectItem key={cp.id} value={cp.id}>
                                {productName(cp.name, locale)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={line.variantId}
                        onValueChange={(v) => updateLine(index, { variantId: v })}
                        disabled={!p || p.variants.length === 0}
                      >
                        <SelectTrigger><SelectValue placeholder="Variant" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any variant</SelectItem>
                          {(p?.variants ?? []).map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.sku ?? v.id.slice(0, 8)} · {v.available} in stock
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={line.qty}
                        onChange={(e) => updateLine(index, { qty: e.target.value })}
                        aria-label="Quantity per bundle"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={lines.length === 1}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="Remove item"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}>
                  <Plus className="me-1 h-3.5 w-3.5" />
                  Add item
                </Button>
              </div>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={!canSubmit} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Validating stock…" : "Save bundle"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title="Remove bundle?"
          description={`This clears the bundle from ${deleteTarget ? productName(deleteTarget.name, locale) : ""}. The product and its items stay in your catalog.`}
          confirmLabel="Remove bundle"
          danger
          onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ product_id: deleteTarget.id }); }}
        />
      </SellerShell>
    </div>
  );
}
