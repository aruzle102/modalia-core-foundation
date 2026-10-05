import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus, X } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCard, EmptyState, Stat, StatusPill } from "@/components/admin/ui";
import {
  adjustInventory,
  getInventoryHistory,
  getInventoryOverview,
} from "@/lib/seller-products.functions";
import { getLocale, localeDirections } from "@/lib/i18n";
import { numParam, strParam, useBackParam, useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller/inventory")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    filter: strParam(search["filter"], "all"),
    historyPage: numParam(search["historyPage"], 1),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: InventoryPage,
});

type OverviewRow = {
  variantId: string;
  sku: string;
  price: number | null;
  productId: string;
  productName: string;
  quantity: number;
  reserved: number;
  available: number;
  threshold: number;
  status: "ok" | "low" | "out";
};

const statusTone: Record<OverviewRow["status"], string> = {
  ok: "text-green-700 dark:text-green-400",
  low: "text-amber-600",
  out: "text-destructive",
};

function InventoryPage() {
  const { locale } = Route.useSearch();
  const queryClient = useQueryClient();
  const backParam = useBackParam();
  const url = useUrlState({ filter: "all", historyPage: 1 });
  const filter = strParam(url.search["filter"], "all") as "all" | "ok" | "low" | "out";
  const historyPage = numParam(url.search["historyPage"], 1);
  const [editing, setEditing] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const setFilter = (next: "all" | "ok" | "low" | "out") => url.set({ filter: next });
  const setHistoryPage = (next: number) => url.set({ historyPage: next }, { push: true });

  const overview = useQuery({
    queryKey: ["seller-inventory"],
    queryFn: () => getInventoryOverview(),
  });
  const history = useQuery({
    queryKey: ["seller-inventory-history", historyPage],
    queryFn: () => getInventoryHistory({ data: { page: historyPage } }),
  });

  const adjustMutation = useMutation({
    mutationFn: (input: { variantId: string; quantity?: number; lowStockThreshold?: number }) =>
      adjustInventory({ data: input }),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["seller-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["seller-inventory-history"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Unable to adjust inventory."),
  });

  const rows = ((overview.data?.rows ?? []) as OverviewRow[]).filter(
    (r) => filter === "all" || r.status === filter,
  );
  const counts = overview.data?.counts ?? { total: 0, ok: 0, low: 0, out: 0 };
  const logs = (history.data?.logs ?? []) as {
    id: string;
    action: string;
    resource_id: string | null;
    metadata: any;
    created_at: string;
  }[];
  const namesByVariant = (history.data?.namesByVariant ?? {}) as Record<
    string,
    { sku: string; productName: string }
  >;
  const historyTotal = history.data?.total ?? 0;

  const startEdit = (row: OverviewRow) => {
    setEditing(row.variantId);
    setQtyInput(String(row.quantity));
    setThresholdInput(String(row.threshold));
  };

  const saveEdit = (row: OverviewRow) => {
    const quantity = Number(qtyInput);
    const lowStockThreshold = Number(thresholdInput);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("Quantity must be a whole number of 0 or more.");
      return;
    }
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      setError("Threshold must be a whole number of 0 or more.");
      return;
    }
    adjustMutation.mutate({
      variantId: row.variantId,
      quantity,
      lowStockThreshold,
    });
  };

  return (
    <SellerShell title="Inventory" eyebrow="Seller OS">
      <div dir={localeDirections[locale]} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Variants tracked" value={counts.total} />
          <Stat label="In stock" value={counts.ok} />
          <Stat label="Low stock" value={counts.low} hint="At or below threshold" />
          <Stat label="Out of stock" value={counts.out} />
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <AdminCard
          title="Stock levels"
          subtitle="Adjust quantities or low-stock thresholds inline"
          actions={
            <div className="flex gap-1.5">
              {(["all", "ok", "low", "out"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : f === "ok" ? "In stock" : f === "low" ? "Low" : "Out"}
                </Button>
              ))}
            </div>
          }
        >
          {overview.isPending ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : overview.isError ? (
            <EmptyState
              title="Could not load inventory"
              text={overview.error instanceof Error ? overview.error.message : "Try again."}
              action={<Button onClick={() => overview.refetch()}>Retry</Button>}
            />
          ) : !rows.length ? (
            <EmptyState
              title={filter === "all" ? "No variants yet" : `No ${filter} variants`}
              text={
                filter === "all"
                  ? "Create a product to start tracking stock."
                  : "Everything looks healthy here."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-b text-start text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 text-start font-medium">Product / SKU</th>
                    <th className="px-3 py-2.5 text-start font-medium">On hand</th>
                    <th className="px-3 py-2.5 text-start font-medium">Reserved</th>
                    <th className="px-3 py-2.5 text-start font-medium">Available</th>
                    <th className="px-3 py-2.5 text-start font-medium">Low at</th>
                    <th className="px-3 py-2.5 text-start font-medium">Status</th>
                    <th className="w-28 px-3 py-2.5 text-end font-medium">Adjust</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isEditing = editing === r.variantId;
                    return (
                      <tr key={r.variantId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-3">
                          <Link
                            to="/seller/products/$productId"
                            params={{ productId: r.productId }}
                            search={{ locale, back: backParam, q: "", status: "", moderation: "", page: 1 }}
                            className="font-medium hover:underline"
                          >
                            {r.productName}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label="Decrease"
                                className="rounded border p-1 hover:bg-muted"
                                onClick={() => setQtyInput(String(Math.max(0, Number(qtyInput || 0) - 1)))}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <Input
                                type="number"
                                min={0}
                                className="h-8 w-20 text-xs"
                                value={qtyInput}
                                onChange={(e) => setQtyInput(e.target.value)}
                              />
                              <button
                                type="button"
                                aria-label="Increase"
                                className="rounded border p-1 hover:bg-muted"
                                onClick={() => setQtyInput(String(Number(qtyInput || 0) + 1))}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            r.quantity
                          )}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-muted-foreground">{r.reserved}</td>
                        <td className="px-3 py-3 tabular-nums font-medium">{r.available}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-20 text-xs"
                              value={thresholdInput}
                              onChange={(e) => setThresholdInput(e.target.value)}
                            />
                          ) : (
                            r.threshold
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("text-xs font-semibold uppercase", statusTone[r.status])}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-end">
                          {isEditing ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => saveEdit(r)}
                                disabled={adjustMutation.isPending}
                                aria-label="Save"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing(null)}
                                aria-label="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                              Adjust
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <AdminCard title="Adjustment history" subtitle="Every stock change is audit-logged">
          {history.isPending ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : !logs.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No inventory adjustments recorded yet.
            </p>
          ) : (
            <>
              <ul className="divide-y">
                {logs.map((log) => {
                  const meta = log.metadata ?? {};
                  const names = log.resource_id ? namesByVariant[log.resource_id] : undefined;
                  const before = meta.before?.quantity;
                  const after = meta.after?.quantity;
                  return (
                    <li key={log.id} className="flex flex-wrap items-center gap-3 py-3">
                      <StatusPill status="inventory" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {names?.productName ?? "Variant"}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {names?.sku ?? log.resource_id?.slice(0, 8)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {before !== undefined && after !== undefined
                            ? `Stock ${before} → ${after}`
                            : log.action}{" "}
                          · {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {historyTotal > 25 ? (
                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {historyPage} of {Math.ceil(historyTotal / 25)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage(historyPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage >= Math.ceil(historyTotal / 25)}
                      onClick={() => setHistoryPage(historyPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </AdminCard>
      </div>
    </SellerShell>
  );
}
