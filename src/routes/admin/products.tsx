import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Star, StarOff } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  Field,
  fmtMoney,
  fmtDateTime,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  listAdminProducts,
  moderateAdminProduct,
  updateAdminProduct,
  setProductStatus,
  listAdminSellersLite,
  listAdminCategories,
  type AdminProductListItem,
} from "@/lib/admin-catalog.functions";
import { errMsg, pickName, Pager } from "./_shared";

export const Route = createFileRoute("/admin/products")({
  component: AdminProductsPage,
});

type ProductRow = AdminProductListItem;

const MODERATION_FILTERS = ["pending", "approved", "rejected"] as const;
const STATUS_FILTERS = ["draft", "active", "archived"] as const;

function AdminProductsPage() {
  return (
    <AdminGate>
      <AdminShell title="Products" subtitle="Moderate the catalog, edit prices and control publication.">
        <ProductsManager />
      </AdminShell>
    </AdminGate>
  );
}

function ProductsManager() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [moderation, setModeration] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sellerId, setSellerId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; title: string; description: string; run: () => void } | null>(null);

  const filters = {
    q: q.trim() || undefined,
    moderationStatus: moderation === "all" ? undefined : moderation,
    status: status === "all" ? undefined : (status as "draft" | "active" | "archived"),
    sellerId: sellerId === "all" ? undefined : sellerId,
    page,
  };
  const productsQuery = useQuery({
    queryKey: ["admin-products", filters],
    queryFn: () => listAdminProducts({ data: filters }),
    retry: false,
  });
  const sellersQuery = useQuery({
    queryKey: ["admin-sellers-lite"],
    queryFn: () => listAdminSellersLite(),
    retry: false,
  });
  const sellerName = (id: string) =>
    sellersQuery.data?.sellers.find((s) => s.id === id)?.legal_name ?? id.slice(0, 8);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  const mutate = (
    label: string,
    fn: () => Promise<unknown>,
    opts?: { confirm?: { title: string; description: string } },
  ) => {
    const run = () =>
      toast.promise(fn(), {
        loading: `${label}…`,
        success: () => {
          invalidate();
          return "Done.";
        },
        error: (e) => errMsg(e),
      });
    if (opts?.confirm) {
      setConfirm({ id: label, title: opts.confirm.title, description: opts.confirm.description, run });
    } else {
      void run();
    }
  };

  const moderate = useMutation({
    mutationFn: (payload: { id: string; decision: "approve" | "reject" | "hide"; reason?: string }) =>
      moderateAdminProduct({ data: payload }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatusMut = useMutation({
    mutationFn: (payload: { id: string; status: "draft" | "active" | "archived" }) =>
      setProductStatus({ data: payload }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });
  const feature = useMutation({
    mutationFn: (payload: { id: string; featured: boolean }) =>
      updateAdminProduct({ data: { id: payload.id, patch: { featured: payload.featured } } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });

  const products = productsQuery.data?.products ?? [];
  const total = productsQuery.data?.total ?? 0;
  const pageSize = productsQuery.data?.pageSize ?? 25;

  return (
    <div className="space-y-6">
      <AdminCard title="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="product-search">Search</Label>
            <Input
              id="product-search"
              placeholder="Name or slug…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Moderation</Label>
            <Select
              value={moderation}
              onValueChange={(v) => {
                setModeration(v);
                setPage(1);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {MODERATION_FILTERS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Seller</Label>
            <Select
              value={sellerId}
              onValueChange={(v) => {
                setSellerId(v);
                setPage(1);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sellers</SelectItem>
                {(sellersQuery.data?.sellers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Products" subtitle={`${total} product(s) match.`}>
        {productsQuery.isPending ? (
          <TableSkeleton />
        ) : productsQuery.isError ? (
          <EmptyState
            title="Could not load products"
            text={errMsg(productsQuery.error)}
          />
        ) : products.length === 0 ? (
          <EmptyState title="No products" text="No products match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Seller</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Moderation</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Visibility</th>
                  <th className="px-3 py-2 font-medium">Featured</th>
                  <th className="px-3 py-2 font-medium text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{pickName(p.name) || p.slug}</p>
                      <p className="text-caption text-muted-foreground">{p.slug} · {fmtDateTime(p.created_at)}</p>
                    </td>
                    <td className="px-3 py-3 text-caption">{sellerName(p.seller_id)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fmtMoney(Number(p.base_price))}
                      {p.compare_at_price ? (
                        <span className="ms-2 text-caption text-muted-foreground line-through">
                          {fmtMoney(Number(p.compare_at_price))}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3"><StatusPill status={p.moderation_status} /></td>
                    <td className="px-3 py-3"><StatusPill status={p.status} /></td>
                    <td className="px-3 py-3"><StatusPill status={p.visibility} /></td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => feature.mutate({ id: p.id, featured: !p.featured })}
                        aria-label={p.featured ? "Unfeature product" : "Feature product"}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {p.featured ? <Star className="size-4 fill-amber-400 text-amber-400" /> : <StarOff className="size-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                        {p.moderation_status !== "approved" ? (
                          <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, decision: "approve" })} disabled={moderate.isPending}>
                            Approve
                          </Button>
                        ) : null}
                        {p.moderation_status === "approved" ? (
                          <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, decision: "hide" })} disabled={moderate.isPending}>
                            Hide
                          </Button>
                        ) : null}
                        {p.moderation_status === "pending" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              mutate("reject-product", () => moderateAdminProduct({ data: { id: p.id, decision: "reject", reason: "Rejected by admin" } }), {
                                confirm: { title: "Reject product?", description: "This hides the product from the storefront until it is resubmitted." },
                              })
                            }
                          >
                            Reject
                          </Button>
                        ) : null}
                        {p.status !== "active" ? (
                          <Button size="sm" variant="ghost" onClick={() => setStatusMut.mutate({ id: p.id, status: "active" })} disabled={setStatusMut.isPending}>
                            Publish
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              mutate("archive-product", () => setProductStatus({ data: { id: p.id, status: "archived" } }), {
                                confirm: { title: "Archive product?", description: "The product will be hidden from the storefront." },
                              })
                            }
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminCard>

      {editing ? <EditProductDialog product={editing} onClose={() => setEditing(null)} onSaved={invalidate} /> : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel="Confirm"
        danger
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      />
    </div>
  );
}

function EditProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [basePrice, setBasePrice] = useState(String(product.base_price ?? ""));
  const [compareAt, setCompareAt] = useState(product.compare_at_price != null ? String(product.compare_at_price) : "");
  const [weight, setWeight] = useState(product.weight_grams != null ? String(product.weight_grams) : "");
  const [categoryId, setCategoryId] = useState<string>(product.category_id ?? "none");
  const [featured, setFeatured] = useState(Boolean(product.featured));
  const [serverError, setServerError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["admin-categories-flat"],
    queryFn: () => listAdminCategories(),
    retry: false,
  });
  const flat = categoriesQuery.data?.flat ?? [];

  const save = useMutation({
    mutationFn: () =>
      updateAdminProduct({
        data: {
          id: product.id as string,
          patch: {
            base_price: basePrice.trim() === "" ? undefined : Number(basePrice),
            compare_at_price: compareAt.trim() === "" ? null : Number(compareAt),
            weight_grams: weight.trim() === "" ? null : Number(weight),
            featured,
            category_id: categoryId === "none" ? null : categoryId,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Product updated.");
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  const priceError =
    basePrice.trim() !== "" && !(Number(basePrice) > 0) ? "Price must be a positive number." : null;
  const compareError =
    compareAt.trim() !== "" && !(Number(compareAt) > 0) ? "Compare-at must be a positive number." : null;
  const weightError =
    weight.trim() !== "" && !(Number.isInteger(Number(weight)) && Number(weight) > 0)
      ? "Weight must be a positive whole number of grams."
      : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-small text-muted-foreground">{pickName(product.name) || product.slug}</p>
          <Field label="Selling price (DZD)" error={priceError ?? undefined}>
            <Input
              inputMode="decimal"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="e.g. 4990"
            />
          </Field>
          <Field label="Compare-at price (DZD, optional)" error={compareError ?? undefined} hint="Must be higher than the selling price. Leave empty to clear.">
            <Input
              inputMode="decimal"
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
              placeholder="Empty = no compare-at price"
            />
          </Field>
          <Field label="Weight (grams, optional)" error={weightError ?? undefined}>
            <Input
              inputMode="numeric"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Empty = unknown"
            />
          </Field>
          <Field label="Category">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {flat.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.parent_id ? "— " : ""}{pickName(c.name) || c.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="product-featured">Featured</Label>
            <Switch id="product-featured" checked={featured} onCheckedChange={setFeatured} />
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">{serverError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (priceError || compareError || weightError) return;
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
