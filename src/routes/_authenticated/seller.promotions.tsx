import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import {
  AdminCard,
  ConfirmDialog,
  EmptyState,
  Field,
  Stat,
  StatusPill,
  TableSkeleton,
  fmtDate,
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
  createPromotion,
  deletePromotion,
  listMarketingCatalog,
  listPromotions,
  togglePromotion,
  type MarketingCatalogProduct,
  type SellerPromotionRow,
} from "@/lib/seller-marketing.functions";
import { getLocale, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/promotions")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: PromotionsPage,
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

type PromoState = "live" | "scheduled" | "ended" | "paused";

function promoState(p: SellerPromotionRow, now: number): PromoState {
  if (!p.active) return "paused";
  const start = new Date(p.starts_at).getTime();
  const end = new Date(p.ends_at).getTime();
  if (now < start) return "scheduled";
  if (now > end) return "ended";
  return "live";
}

function basePriceOf(p: SellerPromotionRow): number {
  return p.variant ? Number(p.variant.price) : Number(p.product?.base_price ?? 0);
}

type PromoForm = {
  productId: string;
  variantId: string;
  salePrice: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

const EMPTY_FORM: PromoForm = { productId: "", variantId: "any", salePrice: "", startsAt: "", endsAt: "", active: true };

function PromotionsPage() {
  const { locale } = Route.useSearch();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["seller-promotions"], queryFn: () => listPromotions() });
  const catalogQuery = useQuery({ queryKey: ["seller-marketing-catalog"], queryFn: () => listMarketingCatalog() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PromoForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SellerPromotionRow | null>(null);

  const promotions = query.data?.promotions ?? [];
  const catalog: MarketingCatalogProduct[] = catalogQuery.data?.products ?? [];
  const now = Date.now();

  const stats = useMemo(() => {
    let live = 0, scheduled = 0, ended = 0;
    for (const p of promotions) {
      const s = promoState(p, now);
      if (s === "live") live += 1;
      else if (s === "scheduled") scheduled += 1;
      else ended += 1;
    }
    return { live, scheduled, ended };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotions]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["seller-promotions"] });

  const selectedProduct = catalog.find((p) => p.id === form.productId) ?? null;
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === form.variantId) ?? null;
  const base = selectedVariant ? selectedVariant.price : selectedProduct?.base_price ?? 0;
  const sale = Number(form.salePrice);
  const discountPct = base > 0 && sale > 0 && sale < base ? Math.round((1 - sale / base) * 100) : null;

  const createMutation = useMutation({
    mutationFn: () =>
      createPromotion({
        data: {
          product_id: form.productId,
          variant_id: form.variantId === "any" ? null : form.variantId,
          sale_price: Number(form.salePrice),
          starts_at: new Date(form.startsAt).toISOString(),
          ends_at: new Date(form.endsAt).toISOString(),
          active: form.active,
        },
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => togglePromotion({ data: input }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: string }) => deletePromotion({ data: input }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const createError = createMutation.error instanceof Error ? createMutation.error.message : null;
  const canSubmit = form.productId && form.salePrice && form.startsAt && form.endsAt && !createMutation.isPending;

  const pillFor = (s: PromoState): string => (s === "live" ? "active" : s === "scheduled" ? "confirmed" : "disabled");

  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell
        eyebrow="Marketing"
        title="Discounts"
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            New discount
          </Button>
        }
      >
        {query.isPending ? (
          <TableSkeleton rows={6} />
        ) : query.isError ? (
          <AdminCard title="Could not load discounts">
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Unexpected error."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => query.refetch()}>Retry</Button>
          </AdminCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Live now" value={stats.live} />
              <Stat label="Scheduled" value={stats.scheduled} />
              <Stat label="Ended or paused" value={stats.ended} />
            </div>

            <AdminCard
              title="Your discounts"
              subtitle="Sale prices are validated against the product's current price when you create them."
              className="mt-6"
            >
              {promotions.length === 0 ? (
                <EmptyState
                  title="No discounts yet"
                  text="Put a product or a single variant on sale for a limited time. The sale price must stay below the current price."
                  action={<Button onClick={openCreate}>Create your first discount</Button>}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>Sale price</TableHead>
                        <TableHead>Was</TableHead>
                        <TableHead>Off</TableHead>
                        <TableHead>Valid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-end">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promotions.map((p) => {
                        const baseP = basePriceOf(p);
                        const off = baseP > 0 && p.sale_price < baseP ? Math.round((1 - Number(p.sale_price) / baseP) * 100) : 0;
                        const state = promoState(p, now);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{productName(p.product?.name, locale)}</TableCell>
                            <TableCell className="font-mono text-xs">{p.variant?.sku ?? "All variants"}</TableCell>
                            <TableCell className="font-semibold">{fmtMoney(p.sale_price)}</TableCell>
                            <TableCell className="text-muted-foreground line-through">{fmtMoney(baseP)}</TableCell>
                            <TableCell className="tabular-nums text-green-700 dark:text-green-400">−{off}%</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {fmtDate(p.starts_at)} → {fmtDate(p.ends_at)}
                            </TableCell>
                            <TableCell>
                              <StatusPill status={pillFor(state)} />
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={toggleMutation.isPending}
                                  onClick={() => toggleMutation.mutate({ id: p.id, active: !p.active })}
                                >
                                  {p.active ? "Pause" : "Resume"}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(p)}>
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </AdminCard>
          </>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New discount</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label="Product">
                <Select
                  value={form.productId}
                  onValueChange={(v) => setForm({ ...form, productId: v, variantId: "any" })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose a product" /></SelectTrigger>
                  <SelectContent>
                    {catalog.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {productName(p.name, locale)} · {fmtMoney(p.base_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {selectedProduct && selectedProduct.variants.length > 0 ? (
                <Field label="Variant" hint="Leave on “all variants” to discount the whole product.">
                  <Select value={form.variantId} onValueChange={(v) => setForm({ ...form, variantId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">All variants</SelectItem>
                      {selectedProduct.variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.sku ?? v.id.slice(0, 8)} · {fmtMoney(v.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <Field
                label="Sale price (DZD)"
                hint={
                  base > 0
                    ? `Current price: ${fmtMoney(base)}${discountPct != null ? ` — that's ${discountPct}% off` : " — must be below the current price"}`
                    : undefined
                }
              >
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.salePrice}
                  onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                  placeholder="e.g. 3900"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Starts at">
                  <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </Field>
                <Field label="Ends at">
                  <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </Field>
              </div>
              <Field label="Status">
                <div className="flex items-center gap-3">
                  <Label htmlFor="promo-active" className="text-sm font-normal text-muted-foreground">
                    {form.active ? "Active immediately" : "Created paused"}
                  </Label>
                  <Switch id="promo-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                </div>
              </Field>
              {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={!canSubmit} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Creating…" : "Create discount"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title="Delete discount?"
          description={`This permanently removes the sale price for ${deleteTarget ? productName(deleteTarget.product?.name, locale) : ""}.`}
          confirmLabel="Delete discount"
          danger
          onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}
        />
      </SellerShell>
    </div>
  );
}
