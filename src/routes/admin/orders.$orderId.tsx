import { createFileRoute } from "@tanstack/react-router";
import { strParam } from "@/hooks/use-url-state";
import { BackLink } from "@/components/routing/back-link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CreditCard,
  History,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  StickyNote,
  Truck,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  Field,
  ConfirmDialog,
  fmtMoney,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import {
  addOrderNote,
  getAdminOrder,
  processReturn,
  updateOrderStatus,
  type AdminOrderDetail,
  type AdminSellerOrder,
} from "@/lib/admin-orders.functions";

export const Route = createFileRoute("/admin/orders/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    back: strParam(search["back"]),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Order details — Admin — Modalia" },
      { name: "description", content: "Inspect and operate on a customer order." },
    ],
  }),
  component: OrderDetailPage,
});

function prettyStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function snapshotText(snapshot: unknown, key: string): string {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return "";
  const value = (snapshot as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function optionsText(options: unknown): string {
  if (!options || Array.isArray(options) || typeof options !== "object") return "";
  return Object.values(options as Record<string, unknown>)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" · ");
}

type TransitionRequest = { scope: "parent" | "seller"; id: string; newStatus: string };

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { back } = Route.useSearch();
  const queryClient = useQueryClient();
  const orderQuery = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => getAdminOrder({ data: { orderId } }),
  });

  const [confirm, setConfirm] = useState<TransitionRequest | null>(null);
  const [transitionNotes, setTransitionNotes] = useState<Record<string, string>>({});
  const [rejectReturn, setRejectReturn] = useState<{ returnId: string; note: string } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const statusMutation = useMutation({
    mutationFn: (input: TransitionRequest & { note?: string }) => updateOrderStatus({ data: input }),
    onSuccess: (result) => {
      refresh();
      setTransitionNotes((current) => ({ ...current, [result.id]: "" }));
      setConfirm(null);
      const cascaded = (result as { cascadedSellerOrders?: number }).cascadedSellerOrders ?? 0;
      toast.success(
        `Status updated to ${prettyStatus(result.status)}.` +
          (cascaded > 0 ? ` ${cascaded} seller order${cascaded === 1 ? "" : "s"} cancelled with it.` : ""),
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Status could not be updated."),
  });

  const noteMutation = useMutation({
    mutationFn: (input: { sellerOrderId: string; body: string }) => addOrderNote({ data: input }),
    onSuccess: (_result, variables) => {
      refresh();
      setNoteDrafts((current) => ({ ...current, [variables.sellerOrderId]: "" }));
      toast.success("Internal note added.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Note could not be saved."),
  });

  const returnMutation = useMutation({
    mutationFn: (input: { returnId: string; decision: "approve" | "reject"; note?: string }) =>
      processReturn({ data: input }),
    onSuccess: (result) => {
      refresh();
      setRejectReturn(null);
      toast.success(result.status === "approved" ? "Return approved." : "Return rejected.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Return could not be processed."),
  });

  const requestTransition = (request: TransitionRequest) => {
    if (request.newStatus === "cancelled") {
      setConfirm(request);
      return;
    }
    const note = transitionNotes[request.id]?.trim();
    statusMutation.mutate(note ? { ...request, note } : request);
  };

  const order = orderQuery.data ?? null;

  return (
    <AdminGate>
      <AdminShell
        title="Order details"
        subtitle="Inspect, advance and audit every part of an order."
        breadcrumbs={[
          { label: "Orders", to: "/admin/orders", back },
          { label: order?.orderNumber ? `#${order.orderNumber}` : "Order details" },
        ]}
      >
        <BackLink
          back={back}
          fallbackTo="/admin/orders"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to orders
        </BackLink>

        {orderQuery.isLoading ? (
          <OrderDetailSkeleton />
        ) : orderQuery.isError ? (
          <EmptyState
            title="Order could not be loaded"
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => orderQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !order ? (
          <EmptyState
            title="Order not found"
            action={
              <Button type="button" variant="outline" size="sm" asChild>
                <BackLink back={back} fallbackTo="/admin/orders">Back to orders</BackLink>
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            <OrderHeaderCard order={order} />
            <CustomerCard order={order} />
            <ParentStatusCard
              order={order}
              note={transitionNotes[order.id] ?? ""}
              onNoteChange={(value) => setTransitionNotes((current) => ({ ...current, [order.id]: value }))}
              onTransition={(newStatus) => requestTransition({ scope: "parent", id: order.id, newStatus })}
              pending={statusMutation.isPending}
            />
            {order.sellerOrders.map((sellerOrder) => (
              <SellerOrderCard
                key={sellerOrder.id}
                sellerOrder={sellerOrder}
                order={order}
                note={transitionNotes[sellerOrder.id] ?? ""}
                onNoteChange={(value) =>
                  setTransitionNotes((current) => ({ ...current, [sellerOrder.id]: value }))
                }
                onTransition={(newStatus) =>
                  requestTransition({ scope: "seller", id: sellerOrder.id, newStatus })
                }
                pending={statusMutation.isPending}
                noteDraft={noteDrafts[sellerOrder.id] ?? ""}
                onNoteDraftChange={(value) =>
                  setNoteDrafts((current) => ({ ...current, [sellerOrder.id]: value }))
                }
                onAddNote={(body) => noteMutation.mutate({ sellerOrderId: sellerOrder.id, body })}
                notePending={noteMutation.isPending}
                onApproveReturn={(returnId, note) => {
                  const trimmed = note.trim();
                  returnMutation.mutate(trimmed ? { returnId, decision: "approve", note: trimmed } : { returnId, decision: "approve" });
                }}
                onRejectReturn={(returnId, note) => setRejectReturn({ returnId, note })}
                returnPending={returnMutation.isPending}
              />
            ))}
            <HistoryCard order={order} />
          </div>
        )}

        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(open) => { if (!open) setConfirm(null); }}
          title={confirm?.scope === "parent" ? "Cancel this order?" : "Cancel this seller order?"}
          description="Cancelling cannot be undone. The order will be marked as cancelled for the customer and the sellers."
          confirmLabel="Cancel order"
          onConfirm={() => {
            if (!confirm) return;
            const note = transitionNotes[confirm.id]?.trim();
            statusMutation.mutate(note ? { ...confirm, note } : confirm);
          }}
        />

        <ConfirmDialog
          open={rejectReturn !== null}
          onOpenChange={(open) => { if (!open) setRejectReturn(null); }}
          title="Reject this return request?"
          description="The customer will be told the return request was rejected."
          confirmLabel="Reject return"
          onConfirm={() => {
            if (!rejectReturn) return;
            const note = rejectReturn.note.trim();
            returnMutation.mutate(note ? { returnId: rejectReturn.returnId, decision: "reject", note } : { returnId: rejectReturn.returnId, decision: "reject" });
          }}
        />
      </AdminShell>
    </AdminGate>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="animate-pulse rounded-xl border border-border bg-card p-6">
          <div className="h-5 w-1/3 rounded bg-muted" />
          <div className="mt-4 h-4 w-2/3 rounded bg-muted" />
          <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function OrderHeaderCard({ order }: { order: AdminOrderDetail }) {
  const locale = useAdminLocale();
  return (
    <AdminCard
      title={order.orderNumber}
      actions={<StatusPill status={order.status} />}
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Placed</dt>
          <dd className="mt-1 text-sm" title={fmtDateTime(order.createdAt, locale)}>{timeAgo(order.createdAt, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</dt>
          <dd className="mt-1 text-sm tabular-nums">{fmtMoney(order.subtotal, "DZD", locale)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Shipping</dt>
          <dd className="mt-1 text-sm tabular-nums">{fmtMoney(order.shippingTotal, "DZD", locale)}</dd>
        </div>
        {order.discountTotal > 0 ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Discount</dt>
            <dd className="mt-1 text-sm tabular-nums">−{fmtMoney(order.discountTotal, "DZD", locale)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Grand total</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums">{fmtMoney(order.grandTotal, "DZD", locale)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Truck className="size-4" />
          {order.deliveryMethod === "office" ? "Office / pickup" : "Home delivery"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CreditCard className="size-4" />
          {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod} · {prettyStatus(order.paymentStatus)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Package className="size-4" />
          {order.sellerOrders.reduce((sum, so) => sum + so.items.length, 0)} item(s) across {order.sellerOrders.length} seller order(s)
        </span>
      </div>
      {order.cancelledAt ? (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Cancelled {timeAgo(order.cancelledAt, locale)}{order.cancellationReason ? ` — ${order.cancellationReason}` : ""}
        </p>
      ) : null}
      {order.failedDeliveryAt ? (
        <p className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          Failed delivery {timeAgo(order.failedDeliveryAt, locale)}{order.failedDeliveryReason ? ` — ${order.failedDeliveryReason}` : ""}
        </p>
      ) : null}
    </AdminCard>
  );
}

function CustomerCard({ order }: { order: AdminOrderDetail }) {
  const fullName = [order.firstName, order.lastName].filter(Boolean).join(" ");
  return (
    <AdminCard title="Customer">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <User className="size-3.5" /> Name
          </dt>
          <dd className="mt-1 text-sm">{fullName || "—"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Phone className="size-3.5" /> Phone
          </dt>
          <dd className="mt-1 text-sm" dir="ltr">{order.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
          <dd className="mt-1 text-sm" dir="ltr">{order.email ?? "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <MapPin className="size-3.5" /> Delivery address
          </dt>
          <dd className="mt-1 text-sm">
            {order.addressLine || "—"}
            <br />
            <span className="text-muted-foreground">
              {[order.commune, order.wilaya].filter(Boolean).join(", ") || "—"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Customer note</dt>
          <dd className="mt-1 text-sm text-muted-foreground">{order.customerNote || "—"}</dd>
        </div>
      </dl>
    </AdminCard>
  );
}

function TransitionButtonRow({
  allowed,
  onTransition,
  pending,
  size = "sm",
}: {
  allowed: string[];
  onTransition: (newStatus: string) => void;
  pending: boolean;
  size?: "sm" | "default";
}) {
  if (allowed.length === 0) {
    return <p className="text-sm text-muted-foreground">This is a terminal status — no further transitions.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((next) => (
        <Button
          key={next}
          type="button"
          size={size}
          variant={next === "cancelled" ? "destructive" : "outline"}
          disabled={pending}
          onClick={() => onTransition(next)}
          className="capitalize"
        >
          {prettyStatus(next)}
        </Button>
      ))}
    </div>
  );
}

function ParentStatusCard({
  order,
  note,
  onNoteChange,
  onTransition,
  pending,
}: {
  order: AdminOrderDetail;
  note: string;
  onNoteChange: (value: string) => void;
  onTransition: (newStatus: string) => void;
  pending: boolean;
}) {
  const locale = useAdminLocale();
  const parentHistory = order.history.filter((entry) => entry.sellerOrderId === null);
  return (
    <AdminCard title="Order status" actions={<StatusPill status={order.status} />}>
      <Field label="Advance status">
        <TransitionButtonRow allowed={order.parentAllowedTransitions} onTransition={onTransition} pending={pending} />
      </Field>
      <div className="mt-3 max-w-xl">
        <Field label="Note for this action (optional)">
          <Input
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Reason recorded in the status history…"
            maxLength={500}
          />
        </Field>
      </div>
      {parentHistory.length > 0 ? (
        <ol className="mt-5 space-y-3 border-s-2 border-border ps-4">
          {parentHistory.map((entry) => (
            <li key={entry.id} className="text-sm">
              <p>
                <span className="font-medium capitalize">{prettyStatus(entry.newStatus)}</span>
                {entry.previousStatus ? (
                  <span className="text-muted-foreground"> from {prettyStatus(entry.previousStatus)}</span>
                ) : null}
                <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {entry.actorType}
                </span>
              </p>
              {entry.note ? <p className="mt-0.5 text-muted-foreground">{entry.note}</p> : null}
              <p className="mt-0.5 text-xs text-muted-foreground" title={fmtDateTime(entry.createdAt, locale)}>
                {timeAgo(entry.createdAt, locale)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No recorded status changes yet.</p>
      )}
    </AdminCard>
  );
}

function SellerOrderCard({
  sellerOrder,
  order,
  note,
  onNoteChange,
  onTransition,
  pending,
  noteDraft,
  onNoteDraftChange,
  onAddNote,
  notePending,
  onApproveReturn,
  onRejectReturn,
  returnPending,
}: {
  sellerOrder: AdminSellerOrder;
  order: AdminOrderDetail;
  note: string;
  onNoteChange: (value: string) => void;
  onTransition: (newStatus: string) => void;
  pending: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onAddNote: (body: string) => void;
  notePending: boolean;
  onApproveReturn: (returnId: string, note: string) => void;
  onRejectReturn: (returnId: string, note: string) => void;
  returnPending: boolean;
}) {
  const locale = useAdminLocale();
  const notes = order.notes.filter((entry) => entry.sellerOrderId === sellerOrder.id);
  const returns = order.returns.filter((entry) => entry.sellerOrderId === sellerOrder.id);
  const history = order.history.filter((entry) => entry.sellerOrderId === sellerOrder.id);
  const shippingMethod = snapshotText(sellerOrder.shippingSnapshot, "delivery_method");
  const shippingWeight = snapshotText(sellerOrder.shippingSnapshot, "weight_grams");
  const shippingPrice = snapshotText(sellerOrder.shippingSnapshot, "price");
  const shippingWeightKg = Number(shippingWeight);
  const shippingWeightLabel = shippingWeight && Number.isFinite(shippingWeightKg) ? `${(shippingWeightKg / 1000).toFixed(2)} kg` : null;
  const shippingPriceNum = Number(shippingPrice);
  const shippingPriceLabel = shippingPrice && Number.isFinite(shippingPriceNum) ? fmtMoney(shippingPriceNum, "DZD", locale) : null;
  const itemsMismatch = Math.abs(sellerOrder.itemsTotal - sellerOrder.subtotal) > 0.01;
  const [returnNote, setReturnNote] = useState("");

  return (
    <AdminCard
      title={sellerOrder.storeName}
      actions={<StatusPill status={sellerOrder.status} />}
    >
      <p className="text-sm text-muted-foreground">
        Seller: <span className="font-medium text-foreground">{sellerOrder.sellerName}</span>
        {" · "}Placed {timeAgo(sellerOrder.createdAt, locale)}
      </p>

      <div className="mt-5">
        <DataTable>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="px-4 py-3 text-start">Product</th>
                <th className="px-4 py-3 text-start">Variant</th>
                <th className="px-4 py-3 text-end">Qty</th>
                <th className="px-4 py-3 text-end">Unit price</th>
                <th className="px-4 py-3 text-end">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {sellerOrder.items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.title}</p>
                    {item.sku ? <p className="text-xs text-muted-foreground">SKU: {item.sku}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{optionsText(item.options) || "—"}</td>
                  <td className="px-4 py-3 text-end tabular-nums">{item.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-end tabular-nums">{fmtMoney(item.unitPrice, "DZD", locale)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-end font-medium tabular-nums">{fmtMoney(item.total, "DZD", locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>

      <dl className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Items subtotal</dt>
          <dd className="mt-1 font-medium tabular-nums">{fmtMoney(sellerOrder.subtotal, "DZD", locale)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Shipping</dt>
          <dd className="mt-1 font-medium tabular-nums">{fmtMoney(sellerOrder.shippingTotal, "DZD", locale)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Commission (snapshot at order time)</dt>
          <dd className="mt-1 font-medium tabular-nums">{fmtMoney(sellerOrder.commissionTotal, "DZD", locale)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Shipping detail</dt>
          <dd className="mt-1 text-muted-foreground">
            {[shippingMethod ? (shippingMethod === "office" ? "Office / pickup" : "Home delivery") : null,
              shippingWeightLabel,
              shippingPriceLabel].filter(Boolean).join(" · ") || "—"}
          </dd>
        </div>
      </dl>
      {itemsMismatch ? (
        <p className="mt-2 text-xs text-brand">
          Items sum ({fmtMoney(sellerOrder.itemsTotal, "DZD", locale)}) differs from the stored subtotal — review before acting.
        </p>
      ) : null}

      <div className="mt-4">
        <Field label="Seller order status">
          <TransitionButtonRow allowed={sellerOrder.allowedTransitions} onTransition={onTransition} pending={pending} />
        </Field>
        <div className="mt-3 max-w-xl">
          <Field label="Note for this action (optional)">
            <Input
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Reason recorded in the status history…"
              maxLength={500}
            />
          </Field>
        </div>
      </div>

      {history.length > 0 ? (
        <div className="mt-4">
          <h4 className="flex items-center gap-1.5 text-sm font-medium">
            <History className="size-4" /> Status history
          </h4>
          <ol className="mt-2 space-y-2 border-s-2 border-border ps-4">
            {history.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="font-medium capitalize">{prettyStatus(entry.newStatus)}</span>
                {entry.previousStatus ? (
                  <span className="text-muted-foreground"> from {prettyStatus(entry.previousStatus)}</span>
                ) : null}
                <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{entry.actorType}</span>
                <span className="ms-2 text-xs text-muted-foreground" title={fmtDateTime(entry.createdAt, locale)}>{timeAgo(entry.createdAt, locale)}</span>
                {entry.note ? <p className="text-muted-foreground">{entry.note}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-4">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <StickyNote className="size-4" /> Internal notes
        </h4>
        {notes.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {notes.map((entry) => (
              <li key={entry.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap">{entry.body}</p>
                <p className="mt-1 text-xs text-muted-foreground" title={fmtDateTime(entry.createdAt, locale)}>
                  Internal · {timeAgo(entry.createdAt, locale)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No internal notes yet.</p>
        )}
        <div className="mt-3 flex max-w-xl flex-col gap-2">
          <Textarea
            value={noteDraft}
            onChange={(event) => onNoteDraftChange(event.target.value)}
            placeholder="Add an internal note visible only to admins and the seller…"
            maxLength={2000}
            rows={2}
          />
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={notePending || noteDraft.trim().length === 0}
            onClick={() => onAddNote(noteDraft.trim())}
          >
            Add note
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <RotateCcw className="size-4" /> Returns
        </h4>
        {returns.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No return requests for this seller order.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {returns.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={entry.status} />
                  <span className="text-xs text-muted-foreground" title={fmtDateTime(entry.requestedAt, locale)}>
                    Requested {timeAgo(entry.requestedAt, locale)}
                  </span>
                </div>
                <p className="mt-2"><span className="text-muted-foreground">Reason: </span>{entry.reason}</p>
                {entry.notes ? <p className="mt-1 text-muted-foreground">Admin note: {entry.notes}</p> : null}
                {entry.processedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground" title={fmtDateTime(entry.processedAt, locale)}>
                    Processed {timeAgo(entry.processedAt, locale)}
                  </p>
                ) : null}
                {entry.status === "requested" ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <Input
                      value={returnNote}
                      onChange={(event) => setReturnNote(event.target.value)}
                      placeholder="Decision note (optional)…"
                      maxLength={1000}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={returnPending}
                        onClick={() => onApproveReturn(entry.id, returnNote)}
                      >
                        <Check className="size-4" /> Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={returnPending}
                        onClick={() => onRejectReturn(entry.id, returnNote)}
                      >
                        <X className="size-4" /> Reject
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminCard>
  );
}


function HistoryCard({ order }: { order: AdminOrderDetail }) {
  const locale = useAdminLocale();
  const storeNameById = new Map(order.sellerOrders.map((so) => [so.id, so.storeName]));
  return (
    <AdminCard title="Full status timeline">
      {order.history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No status changes recorded.</p>
      ) : (
        <ol className="space-y-4">
          {order.history.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p>
                  <span className="font-medium capitalize">{prettyStatus(entry.newStatus)}</span>
                  {entry.previousStatus ? (
                    <span className="text-muted-foreground"> from {prettyStatus(entry.previousStatus)}</span>
                  ) : null}
                  <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {entry.sellerOrderId ? storeNameById.get(entry.sellerOrderId) ?? "Seller order" : "Order"}
                    {" · "}
                    {entry.actorType}
                  </span>
                </p>
                {entry.note ? <p className="mt-0.5 text-muted-foreground">{entry.note}</p> : null}
                <p className="mt-0.5 text-xs text-muted-foreground" title={fmtDateTime(entry.createdAt, locale)}>
                  {timeAgo(entry.createdAt, locale)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AdminCard>
  );
}
