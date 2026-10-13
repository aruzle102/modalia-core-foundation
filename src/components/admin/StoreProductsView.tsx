import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProductEditor } from "@/components/seller/ProductEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminCard, StatusPill, TableSkeleton, fmtMoney } from "@/components/admin/ui";
import { EmptyState } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { listStoreProducts, setProductStatus, updateAdminProduct } from "@/lib/admin-catalog.functions";
import { pickName } from "@/routes/admin/_shared";

type StoreProduct = {
  id: string;
  slug: string;
  name: unknown;
  description: unknown;
  base_price: number;
  compare_at_price: number | null;
  weight_grams: number | null;
  status: string;
  moderation_status: string;
  moderation_reason: string | null;
  created_at: string;
  sellers: { legal_name: string; commission_rate: number | null };
  product_images: Array<{ storage_path: string; is_primary: boolean | null }>;
  product_variants: Array<{ id: string; sku: string | null; price: number | null; attributes: unknown }>;
};

/**
 * Rich store products view: images, info, full admin control.
 * Every action notifies THAT seller only.
 */
export function StoreProductsView({ sellerId, onBack }: { sellerId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const productsQuery = useQuery({
    queryKey: ["admin-store-products", sellerId],
    queryFn: () => listStoreProducts({ data: { sellerId } }),
    retry: false,
  });
  const products = (productsQuery.data?.products ?? []) as unknown as StoreProduct[];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-store-products"] });
  };

  if (productsQuery.isLoading) return <TableSkeleton rows={6} />;
  if (productsQuery.isError) {
    return <EmptyState title="Could not load products" description="Please try again." />;
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" size="sm" onClick={onBack}>
        ← Back to stores
      </Button>
      {products.length === 0 ? (
        <EmptyState title="No products" description="This store has no products yet." />
      ) : (
        <div className="space-y-6">
          {products.map((p) => {
            const name = pickName(p.name);
            const desc = typeof p.description === "object" && p.description
              ? pickName(p.description as Record<string, string>)
              : "";
            const images = [...(p.product_images ?? [])].sort(
              (a, b) => Number(b.is_primary ?? false) - Number(a.is_primary ?? false),
            );
            const mainImage = images[0]?.storage_path;
            const commissionRate = p.sellers.commission_rate ?? 10;
            const profit = (p.base_price * commissionRate) / 100;
            const variants = p.product_variants ?? [];
            return (
              <AdminCard key={p.id} title={name}>
                <div className="grid gap-6 md:grid-cols-[200px_1fr]">
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900">
                    {mainImage ? (
                      <img src={mainImage} alt={name} className="h-48 w-full object-cover" />
                    ) : (
                      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={p.moderation_status} />
                      <StatusPill status={p.status} />
                    </div>
                    {desc ? <p className="line-clamp-2 text-sm text-muted-foreground">{desc}</p> : null}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Price</p>
                        <p className="font-bold">{fmtMoney(p.base_price, "DZD", "en")}</p>
                        {p.compare_at_price ? (
                          <p className="text-xs text-muted-foreground line-through">
                            {fmtMoney(p.compare_at_price, "DZD", "en")}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Profit ({commissionRate}%)</p>
                        <p className="font-bold text-green-600">{fmtMoney(profit, "DZD", "en")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Variants</p>
                        <p className="font-bold">{variants.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Weight</p>
                        <p className="font-bold">{p.weight_grams ? `${p.weight_grams}g` : "—"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Slug: </span>
                        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{p.slug}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created: </span>
                        {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {variants.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {variants.slice(0, 6).map((v) => (
                          <span key={v.id} className="rounded-md border px-2 py-1 text-xs">
                            {typeof v.attributes === "object" && v.attributes
                              ? Object.values(v.attributes as Record<string, unknown>).join(" / ")
                              : v.sku ?? "Variant"}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <Button
                        type="button" size="sm" variant="outline"
                        onClick={() => {
                          const next = p.status === "active" ? "archived" : "active";
                          toast.promise(
                            setProductStatus({ data: { id: p.id, status: next as "active" | "archived" } }),
                            {
                              loading: "Updating...",
                              success: () => { refresh(); return next === "active" ? "Activated. Seller notified." : "Paused. Seller notified."; },
                              error: "Update failed.",
                            },
                          );
                        }}
                      >
                        {p.status === "active" ? "Pause" : "Activate"}
                      </Button>
                      <Button
                        type="button" size="sm" variant="outline"
                        onClick={() => setEditingId(p.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button" size="sm" variant="outline"
                        onClick={() => {
                          window.open(`/product/${p.slug}`, "_blank", "noopener,noreferrer");
                        }}
                      >
                        View on site
                      </Button>
                      <Button
                        type="button" size="sm" variant="destructive"
                        onClick={() => {
                          if (!confirm(`Delete "${name}" permanently?`)) return;
                          toast.promise(
                            updateAdminProduct({ data: { id: p.id, status: "archived" } }),
                            {
                              loading: "Deleting...",
                              success: () => { refresh(); return "Deleted. Seller notified."; },
                              error: "Delete failed.",
                            },
                          );
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Actions notify this seller only.</p>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}
      <Dialog open={editingId !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editingId ? (
            <ProductEditor
              mode="edit"
              productId={editingId}
              adminMode
              onSaved={() => {
                setEditingId(null);
                refresh();
                toast.success("Product saved. Seller notified.");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
