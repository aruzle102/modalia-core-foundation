import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  ConfirmDialog,
  Field,
  StatusPill,
  TableSkeleton,
  EmptyState,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProductEditor } from "@/components/seller/ProductEditor";
import {
  moderateAdminProduct,
  setProductStatus,
  updateAdminProduct,
} from "@/lib/admin-catalog.functions";
import { getAdminProductEditor } from "@/lib/admin-products.functions";
import { useAdminT } from "@/components/admin/use-admin-t";
import { errMsg, pickName } from "./_shared";
import { strParam } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/products/$productId")({
  validateSearch: (search: Record<string, unknown>) => ({
    back: strParam(search["back"]),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Edit product — Modalia Admin" }],
  }),
  component: AdminProductEditPage,
});

function AdminProductEditPage() {
  const { productId } = Route.useParams();
  const { back } = Route.useSearch();
  const t = useAdminT().products;
  return (
    <AdminGate>
      <AdminShell
        title={t.editTitle}
        subtitle={t.editSubtitle}
        breadcrumbs={[{ label: t.title, to: "/admin/products", back: back || "/admin/products" }, { label: t.editTitle }]}
      >
        <div className="space-y-6">
          <AdminControls productId={productId} />
          <ProductEditor mode="edit" productId={productId} adminMode />
        </div>
      </AdminShell>
    </AdminGate>
  );
}

/**
 * Admin-only controls that live outside the product editor steps:
 * moderation decisions, lifecycle status and the featured flag. Every action
 * is server-authorized and audit-logged by the underlying admin functions.
 */
function AdminControls({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const t = useAdminT().products;
  const [rejectReason, setRejectReason] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);

  const productQuery = useQuery({
    queryKey: ["admin-product-editor", productId],
    queryFn: () => getAdminProductEditor({ data: { productId } }),
    retry: false,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-product-editor", productId] });
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const moderate = useMutation({
    mutationFn: (payload: { decision: "approve" | "reject" | "hide"; reason?: string }) =>
      moderateAdminProduct({ data: { id: productId, ...payload } }),
    onSuccess: () => {
      toast.success(t.done);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatus = useMutation({
    mutationFn: (status: "draft" | "active" | "archived") =>
      setProductStatus({ data: { id: productId, status } }),
    onSuccess: () => {
      toast.success(t.done);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const feature = useMutation({
    mutationFn: (featured: boolean) =>
      updateAdminProduct({ data: { id: productId, patch: { featured } } }),
    onSuccess: () => {
      toast.success(t.done);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const ask = (title: string, description: string, run: () => void) =>
    setConfirm({ title, description, run });
  const busy = moderate.isPending || setStatus.isPending || feature.isPending;

  const product: any = productQuery.data?.product;

  return (
    <AdminCard title={t.adminControls} subtitle={t.adminControlsHint}>
      {productQuery.isPending ? (
        <TableSkeleton rows={2} />
      ) : productQuery.isError || !product ? (
        <EmptyState title={t.notFound} text={errMsg(productQuery.error)} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={product.status} />
            <StatusPill status={product.moderation_status} />
            <StatusPill status={product.visibility} />
            <span className="ms-2 text-caption text-muted-foreground">
              {pickName(product.name) || product.slug}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small font-medium">{t.moderationLabel}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => moderate.mutate({ decision: "approve" })}
            >
              {t.approvePublish}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => moderate.mutate({ decision: "hide" })}
            >
              {t.hide}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !rejectReason.trim()}
              onClick={() =>
                ask(t.rejectTitle, t.rejectDesc, () =>
                  moderate.mutate({ decision: "reject", reason: rejectReason.trim() }),
                )
              }
            >
              {t.reject}
            </Button>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t.rejectReasonPlaceholder}
              className="max-w-xs"
              aria-label={t.rejectReasonPlaceholder}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small font-medium">{t.statusLabel}</span>
            {(["draft", "active", "archived"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={product.status === s ? "default" : "outline"}
                disabled={busy || product.status === s}
                onClick={() =>
                  ask(t.statusConfirmTitle, t.statusConfirmDesc, () => setStatus.mutate(s))
                }
              >
                {t[`status_${s}` as "status_draft" | "status_active" | "status_archived"]}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Label htmlFor="admin-featured">{t.featured}</Label>
            <Switch
              id="admin-featured"
              checked={Boolean(product.featured)}
              disabled={busy}
              onCheckedChange={(v) => feature.mutate(v)}
            />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={t.confirm}
        danger
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      />
    </AdminCard>
  );
}
