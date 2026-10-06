import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  Field,
  fmtDateTime,
  fmtMoney,
} from "@/components/admin/ui";
import {
  getSellerOrderDetail,
  updateSellerOrderStatus,
  addSellerOrderNote,
} from "@/lib/seller-orders.functions";
import { getLocale } from "@/lib/i18n";
import { strParam } from "@/hooks/use-url-state";
import { BackLink } from "@/components/routing/back-link";
import { SellerShell } from "@/components/seller/SellerShell";
import { errMsg } from "../admin/_shared";

const detailQuery = (sellerOrderId: string) =>
  queryOptions({
    queryKey: ["seller-order-detail", sellerOrderId],
    queryFn: () => getSellerOrderDetail({ data: { sellerOrderId } }),
    retry: false,
  });

export const Route = createFileRoute("/_authenticated/seller/orders/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    back: strParam(search["back"]),
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(detailQuery(params.orderId)),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Order detail — Seller — Modalia" },
    ],
  }),
  pendingComponent: () => (
    <SellerShell eyebrow="Seller workspace" title="Order">
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </SellerShell>
  ),
  errorComponent: () => (
    <SellerShell eyebrow="Seller workspace" title="Order">
      <AdminCard>
        <EmptyState
          title="Order could not be loaded"
          text="Please check your connection and try again."
        />
      </AdminCard>
    </SellerShell>
  ),
  component: SellerOrderDetailPage,
});

function SellerOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { locale, back } = Route.useSearch();
  const { data } = useSuspenseQuery(detailQuery(orderId));
  const queryClient = useQueryClient();

  const [pendingTransition, setPendingTransition] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["seller-order-detail", orderId] });
    queryClient.invalidateQueries({ queryKey: ["seller-orders"] });
  };

  const transition = useMutation({
    mutationFn: (payload: { status: string; note?: string }) =>
      updateSellerOrderStatus({
        data: {
          sellerOrderId: orderId,
          status: payload.status,
          ...(payload.note ? { note: payload.note } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(`Order moved to ${result.status.replace(/_/g, " ")}.`);
      setPendingTransition(null);
      setTransitionNote("");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addNote = useMutation({
    mutationFn: (body: string) => addSellerOrderNote({ data: { sellerOrderId: orderId, body } }),
    onSuccess: () => {
      toast.success("Note saved.");
      setNoteBody("");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!data) {
    return (
      <SellerShell eyebrow="Seller workspace" title="Order">
        <AdminCard>
          <EmptyState
            title="Order not found"
            text="This order does not exist or does not belong to your store."
          />
        </AdminCard>
      </SellerShell>
    );
  }

  const customerName = [data.firstName, data.lastName].filter(Boolean).join(" ") || "—";
  const isDanger = (status: string) => status === "cancelled";

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title={`Order ${data.orderNumber}`}
      breadcrumbs={[
        { label: "Orders", to: "/seller/orders", search: { locale } },
        { label: `Order ${data.orderNumber}` },
      ]}
      actions={
        <Button asChild variant="outline" size="sm">
          <BackLink back={back} fallbackTo="/seller/orders" fallbackSearch={{ locale }}>
            <ArrowLeft className="size-4" />
            All orders
          </BackLink>
        </Button>
      }
    >
      <p className="text-body text-muted-foreground">{`Placed ${fmtDateTime(data.createdAt)} · Marketplace status: ${data.parentStatus.replace(/_/g, " ")}`}</p>
      {/* Status + allowed transitions */}
      <AdminCard title="Fulfilment status" actions={<StatusPill status={data.status} />}>
        {data.allowedTransitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This order is in a final state for sellers. Further updates (courier scan, delivery) are
            handled by the platform.
          </p>
        ) : pendingTransition ? (
          <div className="space-y-4 rounded-2xl border border-border p-4">
            <p className="text-sm font-medium">
              Move order to{" "}
              <span className="font-semibold">“{pendingTransition.replace(/_/g, " ")}”</span>? This
              is recorded in the order timeline.
            </p>
            <Field label="Note for the timeline (optional)">
              <Input
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="e.g. Packing started…"
                maxLength={500}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={pendingTransition === "cancelled" ? "destructive" : "default"}
                disabled={transition.isPending}
                onClick={() =>
                  transition.mutate({
                    status: pendingTransition,
                    ...(transitionNote.trim() ? { note: transitionNote.trim() } : {}),
                  })
                }
              >
                {transition.isPending ? "Updating…" : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPendingTransition(null);
                  setTransitionNote("");
                }}
              >
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">You may move this order to:</p>
            <div className="flex flex-wrap gap-2">
              {data.allowedTransitions.map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant={isDanger(next) ? "destructive" : "outline"}
                  onClick={() => setPendingTransition(next)}
                >
                  {next.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>
        )}
      </AdminCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Customer */}
        <AdminCard title="Customer">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Name</dt>
              <dd className="mt-0.5 font-medium">{customerName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Phone</dt>
              <dd className="mt-0.5" dir="ltr">
                {data.phone ?? "—"}
              </dd>
            </div>
            {data.email ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
                <dd className="mt-0.5">{data.email}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Delivery address
              </dt>
              <dd className="mt-0.5">
                {[data.wilaya, data.commune, data.addressLine].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
            {data.deliveryMethod ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Delivery method
                </dt>
                <dd className="mt-0.5">{data.deliveryMethod.replace(/_/g, " ")}</dd>
              </div>
            ) : null}
            {data.customerNote ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Customer note
                </dt>
                <dd className="mt-0.5 rounded-lg bg-muted p-3 text-sm">{data.customerNote}</dd>
              </div>
            ) : null}
          </dl>
        </AdminCard>

        {/* Totals + commission snapshot */}
        <AdminCard title="Totals & commission">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Items subtotal</dt>
              <dd className="tabular-nums">{fmtMoney(data.subtotal, data.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="tabular-nums">{fmtMoney(data.shippingTotal, data.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Platform commission</dt>
              <dd className="tabular-nums text-destructive">
                −{fmtMoney(data.commissionTotal, data.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2.5 font-semibold">
              <dt>Your estimated payout</dt>
              <dd className="tabular-nums">{fmtMoney(data.estimatedPayout, data.currency)}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <p>
              Payment method:{" "}
              <span className="font-medium text-foreground">{data.paymentMethod}</span>
            </p>
            <p>
              Payment status:{" "}
              <span className="font-medium text-foreground">{data.paymentStatus}</span>
            </p>
          </div>
          {data.shippingSnapshot ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Shipping snapshot (as booked)
              </summary>
              <pre
                className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5"
                dir="ltr"
              >
                {JSON.stringify(data.shippingSnapshot, null, 2)}
              </pre>
            </details>
          ) : null}
        </AdminCard>
      </div>

      {/* Items */}
      <AdminCard title={`Items (${data.items.length})`} className="mt-6 overflow-x-auto">
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items on this order.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pe-4 text-start font-medium">Product</th>
                <th className="py-3 pe-4 text-start font-medium">SKU</th>
                <th className="py-3 pe-4 text-start font-medium">Qty</th>
                <th className="py-3 pe-4 text-start font-medium">Unit price</th>
                <th className="py-3 text-start font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-3 pe-4">
                    <p className="font-medium">{item.title}</p>
                    {renderOptions(item.options)}
                  </td>
                  <td className="py-3 pe-4 text-xs text-muted-foreground" dir="ltr">
                    {item.sku ?? "—"}
                  </td>
                  <td className="py-3 pe-4 tabular-nums">{item.quantity}</td>
                  <td className="py-3 pe-4 tabular-nums">
                    {fmtMoney(item.unitPrice, data.currency)}
                  </td>
                  <td className="py-3 tabular-nums font-medium">
                    {fmtMoney(item.total, data.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Timeline */}
        <AdminCard title="Status timeline">
          {data.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
          ) : (
            <ol className="relative space-y-5 border-s border-border ps-5">
              {data.history.map((entry) => (
                <li key={entry.id} className="relative">
                  <span className="absolute -start-[26px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-primary/15" />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={entry.newStatus} />
                    <span className="text-xs text-muted-foreground">
                      {entry.actorType === "seller" ? "You" : entry.actorType} ·{" "}
                      {fmtDateTime(entry.createdAt)}
                    </span>
                  </div>
                  {entry.previousStatus ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      from {entry.previousStatus.replace(/_/g, " ")}
                    </p>
                  ) : null}
                  {entry.note ? <p className="mt-1 text-sm">{entry.note}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </AdminCard>

        {/* Internal notes */}
        <AdminCard title="Internal notes" subtitle="Only visible to your store team.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (noteBody.trim()) addNote.mutate(noteBody.trim());
            }}
          >
            <Field label="Add a note">
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="e.g. Called customer to confirm wilaya…"
                rows={3}
                maxLength={2000}
              />
            </Field>
            <Button type="submit" size="sm" disabled={!noteBody.trim() || addNote.isPending}>
              {addNote.isPending ? "Saving…" : "Save note"}
            </Button>
          </form>
          <div className="mt-6 space-y-4">
            {data.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              data.notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm">{note.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {fmtDateTime(note.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </div>
    </SellerShell>
  );
}

function renderOptions(options: unknown): React.ReactNode {
  const entries = Object.entries(options as Record<string, unknown>).filter(
    ([, v]) => typeof v === "string" || typeof v === "number",
  );
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {key}: {String(value)}
        </span>
      ))}
    </div>
  );
}
