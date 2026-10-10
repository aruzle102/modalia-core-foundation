import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminCard, StatusPill } from "@/components/admin/ui";
import { DataTable, EmptyState, ErrorState } from "@/components/dashboard";
import {
  bulkUpdateProducts,
  duplicateProduct,
  listSellerProducts,
} from "@/lib/seller-products.functions";
import { getLocale, localeDirections } from "@/lib/i18n";
import { numParam, strParam, useBackParam, useDebouncedUrlParam, useUrlState } from "@/hooks/use-url-state";

export const Route = createFileRoute("/_authenticated/seller/products")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    q: strParam(search["q"]),
    status: strParam(search["status"]),
    moderation: strParam(search["moderation"]),
    page: numParam(search["page"], 1),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: ProductsRoute,
});

/** Child routes (new / $productId) render in the Outlet; this route shows the table. */
function ProductsRoute() {
  const child = useMatch({
    from: "/_authenticated/seller/products",
    strict: true,
    shouldThrow: false,
  });
  return child ? <ProductsTable /> : <Outlet />;
}

type ProductRow = {
  id: string;
  slug: string;
  name: unknown;
  sku: string | null;
  base_price: number;
  status: string;
  moderation_status: string;
  publication_status: string;
  visibility: string;
  created_at: string;
  categories: { name: unknown } | null;
  brands: { name: string } | null;
  product_variants: {
    id: string;
    sku: string;
    inventory: { quantity: number; reserved_quantity: number; low_stock_threshold: number }[] | null;
  }[];
};

function localeName(name: unknown, fallback: string): string {
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const n = name as Record<string, unknown>;
    for (const k of ["fr", "en", "ar"]) {
      if (typeof n[k] === "string" && n[k]) return n[k] as string;
    }
  }
  return fallback;
}

function stockTone(p: ProductRow): { label: string; tone: string } {
  let total = 0;
  let low = false;
  for (const v of p.product_variants ?? []) {
    const inv = v.inventory?.[0];
    const available = (inv?.quantity ?? 0) - (inv?.reserved_quantity ?? 0);
    total += Math.max(0, available);
    if (available > 0 && available <= (inv?.low_stock_threshold ?? 0)) low = true;
  }
  if (total <= 0) return { label: "Out of stock", tone: "text-destructive" };
  if (low) return { label: `${total} — low`, tone: "text-amber-600" };
  return { label: String(total), tone: "text-muted-foreground" };
}

function ProductsTable() {
  const { locale } = Route.useSearch();
  const queryClient = useQueryClient();
  const backParam = useBackParam();
  const url = useUrlState({ status: "", moderation: "", page: 1 });
  const q = strParam(url.search["q"]);
  const status = strParam(url.search["status"]);
  const moderation = strParam(url.search["moderation"]);
  const page = numParam(url.search["page"], 1);
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const setFilter = (patch: Record<string, string>) => url.set({ ...patch, page: 1 });
  const hasFilters = q !== "" || status !== "" || moderation !== "";
  const clearFilters = () => {
    setSearchInput("");
    url.set({ q: "", status: "", moderation: "", page: 1 });
  };

  const query = useQuery({
    queryKey: ["seller-products", q, status, moderation, page],
    queryFn: () =>
      listSellerProducts({
        data: {
          q: q || undefined,
          status: (status || undefined) as "draft" | "active" | "archived" | undefined,
          moderation: moderation || undefined,
          page,
        },
      }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["seller-products"] });

  const bulkMutation = useMutation({
    mutationFn: (action: "archive" | "hide" | "submit") =>
      bulkUpdateProducts({ data: { ids: selected, action } }),
    onSuccess: () => {
      setSelected([]);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Bulk action failed."),
  });

  const duplicateMutation = useMutation({
    mutationFn: (productId: string) => duplicateProduct({ data: { productId } }),
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof Error ? e.message : "Duplicate failed."),
  });

  const products = (query.data?.products ?? []) as ProductRow[];
  const total = query.data?.total ?? 0;
  const pageSize = query.data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? products.map((p) => p.id) : []);

  return (
    <SellerShell
      title="Products"
      eyebrow="Seller OS"
      actions={
        <Button asChild>
          <Link to="/seller/products/new" search={{ locale, back: backParam, q, status, moderation, page }}>
            <Plus className="me-1.5 h-4 w-4" /> New product
          </Link>
        </Button>
      }
    >
      <div dir={localeDirections[locale]} className="space-y-4">
        <AdminCard>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-9"
                placeholder="Search name or SKU…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={status || "all"}
                onValueChange={(v) => setFilter({ status: v === "all" ? "" : v })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={moderation || "all"}
                onValueChange={(v) => setFilter({ moderation: v === "all" ? "" : v })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Moderation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All moderation</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </AdminCard>

        {error ? (
          <ErrorState title="Action failed" description={error} />
        ) : null}

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="text-sm font-medium">{selected.length} selected</span>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("submit")}
            >
              Submit for review
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("hide")}
            >
              Hide
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("archive")}
            >
              Archive
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}

        {query.isPending ? (
          <DataTable>
            <div className="space-y-3 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </DataTable>
        ) : query.isError ? (
          <DataTable>
            <EmptyState
              title="Could not load products"
              description={query.error instanceof Error ? query.error.message : "Try again."}
              action={<Button onClick={() => query.refetch()}>Retry</Button>}
            />
          </DataTable>
        ) : !products.length ? (
          <DataTable>
            <EmptyState
              title="No products yet"
              description="Create your first product to start selling."
              action={
                <Button asChild>
                  <Link to="/seller/products/new" search={{ locale, back: backParam, q, status, moderation, page }}>
                    <Plus className="me-1.5 h-4 w-4" /> New product
                  </Link>
                </Button>
              }
            />
          </DataTable>
        ) : (
          <DataTable>
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={selected.length > 0 && selected.length === products.length}
                      onCheckedChange={(c) => toggleAll(c === true)}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-3 text-start">Product</th>
                  <th className="px-3 py-3 text-end">Price</th>
                  <th className="px-3 py-3 text-start">Stock</th>
                  <th className="px-3 py-3 text-start">Status</th>
                  <th className="px-3 py-3 text-start">Moderation</th>
                  <th className="w-24 px-3 py-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {products.map((p) => {
                  const stock = stockTone(p);
                  return (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selected.includes(p.id)}
                          onCheckedChange={(c) =>
                            setSelected((s) =>
                              c === true ? [...s, p.id] : s.filter((id) => id !== p.id),
                            )
                          }
                          aria-label={`Select ${p.slug}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          to="/seller/products/$productId"
                          params={{ productId: p.id }}
                          search={{ locale, back: backParam, q, status, moderation, page }}
                          className="font-medium hover:underline"
                        >
                          {localeName(p.name, p.slug)}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">
                          {p.sku ?? "No SKU"} · {p.product_variants?.length ?? 0} variant
                          {(p.product_variants?.length ?? 0) === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        {Number(p.base_price).toLocaleString()} DZD
                      </td>
                        <td className="px-3 py-3">
                          <span className={stock.tone}>{stock.label}</span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={p.status} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1.5">
                            <StatusPill status={p.moderation_status} />
                            <StatusPill status={p.visibility} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link
                                  to="/seller/products/$productId"
                                  params={{ productId: p.id }}
                                  search={{ locale, back: backParam, q, status, moderation, page }}
                                >
                                  <Pencil className="me-2 h-4 w-4" /> Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => duplicateMutation.mutate(p.id)}
                                disabled={duplicateMutation.isPending}
                              >
                                {duplicateMutation.isPending ? (
                                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Copy className="me-2 h-4 w-4" />
                                )}
                                Duplicate
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </DataTable>
          )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {total} products
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </SellerShell>
  );
}
