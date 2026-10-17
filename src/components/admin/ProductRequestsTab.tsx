import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminCard, StatusPill, TableSkeleton, fmtMoney, fmtDateTime } from "@/components/admin/ui";
import { EmptyState } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listProductRequests,
  moderateAdminProduct,
} from "@/lib/admin-catalog.functions";
import { pickName } from "@/routes/admin/_shared";
import { useAdminLocale } from "./useAdminLocale";

type RequestItem = {
  id: string;
  name: unknown;
  description: unknown;
  base_price: number;
  compare_at_price: number | null;
  weight_grams: number | null;
  moderation_reason: string | null;
  created_at: string;
  sellers: { legal_name: string; commission_rate: number | null };
  product_images: Array<{ storage_path: string; is_primary: boolean | null }>;
  product_variants: Array<{
    id: string;
    sku: string | null;
    price: number | null;
    attributes: unknown;
  }>;
};

/**
 * Rich product requests tab: pending products with full detail.
 * Image, info, price, profit, shipping, sizes + Accept / Reject / Request Fix.
 */
export function ProductRequestsTab() {
  const locale = useAdminLocale();
  const queryClient = useQueryClient();
  const requestsQuery = useQuery({
    queryKey: ["admin-product-requests"],
    queryFn: () => listProductRequests(),
    retry: false,
  });
  const requests = (requestsQuery.data?.requests ?? []) as unknown as RequestItem[];
  const [fixNote, setFixNote] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-product-requests"] });
  };

  const act = (id: string, decision: "approve" | "reject" | "request_changes", reason?: string) => {
    setActing(id);
    toast.promise(
      moderateAdminProduct({ data: { id, decision, reason } }),
      {
        loading: "Processing...",
        success: () => {
          setActing(null);
          refresh();
          return decision === "approve"
            ? "Product approved and published. Seller notified."
            : decision === "reject"
              ? "Product rejected. Seller notified (can appeal)."
              : "Fix requested. Seller notified with your note.";
        },
        error: (e) => {
          setActing(null);
          return e instanceof Error ? e.message : "Failed.";
        },
      },
    );
  };

  if (requestsQuery.isLoading) return <TableSkeleton rows={4} />;
  if (requestsQuery.isError) {
    return <EmptyState title="Could not load requests" description="Please try again." />;
  }
  if (requests.length === 0) {
    return <EmptyState title="No pending requests" description="All products have been reviewed." />;
  }

  return (
    <div className="space-y-6">
      {requests.map((p) => {
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
        const sellerNet = p.base_price - profit;
        const variants = p.product_variants ?? [];
        const note = fixNote[p.id] ?? "";

        return (
          <AdminCard key={p.id} title={name}>
            <div className="grid gap-6 md:grid-cols-[240px_1fr]">
              {/* Image */}
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900">
                {mainImage ? (
                  <img src={mainImage} alt={name} className="h-60 w-full object-cover" />
                ) : (
                  <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                    No image
                  </div>
                )}
                {images.length > 1 ? (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    +{images.length - 1} more images
                  </p>
                ) : null}
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Seller</p>
                  <p className="font-semibold">{p.sellers.legal_name}</p>
                </div>
                {desc ? (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Description</p>
                    <p className="line-clamp-3 text-sm">{desc}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Price</p>
                    <p className="text-lg font-bold">{fmtMoney(p.base_price, "DZD", locale)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Platform profit ({commissionRate}%)
                    </p>
                    <p className="text-lg font-bold text-green-600">{fmtMoney(profit, "DZD", locale)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Seller net</p>
                    <p className="text-lg font-bold">{fmtMoney(sellerNet, "DZD", locale)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Weight</p>
                    <p className="font-medium">{p.weight_grams ? `${p.weight_grams}g` : "—"}</p>
                  </div>
                </div>
                {variants.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Variants / Sizes ({variants.length})
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {variants.map((v) => (
                        <span
                          key={v.id}
                          className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                        >
                          {typeof v.attributes === "object" && v.attributes
                            ? Object.values(v.attributes as Record<string, unknown>).join(" / ")
                            : v.sku ?? "Variant"}
                          {v.price ? ` — ${fmtMoney(v.price, "DZD", locale)}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {p.moderation_reason ? (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                    <strong>Previous note:</strong> {p.moderation_reason}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Submitted {fmtDateTime(p.created_at)}
                </p>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    size="sm"
                    onClick={() => act(p.id, "approve")}
                    disabled={acting === p.id}
                  >
                    Accept & Publish
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (!confirm(`Reject "${name}"? Seller will be notified and can appeal.`)) return;
                      act(p.id, "reject", "Does not meet marketplace standards.");
                    }}
                    disabled={acting === p.id}
                  >
                    Reject
                  </Button>
                </div>
                <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
                  <p className="text-sm font-medium">Request fix</p>
                  <Textarea
                    placeholder="Write what the seller must fix... (seller will see this)"
                    value={note}
                    onChange={(e) => setFixNote({ ...fixNote, [p.id]: e.target.value })}
                    rows={2}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!note.trim() || acting === p.id}
                    onClick={() => {
                      act(p.id, "request_changes", note.trim());
                      setFixNote({ ...fixNote, [p.id]: "" });
                    }}
                  >
                    Send fix request
                  </Button>
                </div>
              </div>
            </div>
          </AdminCard>
        );
      })}
    </div>
  );
}
