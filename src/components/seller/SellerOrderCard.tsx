import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, Package, Truck, CheckCircle, Clock } from "lucide-react";
import { StatusPill, fmtDateTime, fmtMoney } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { updateSellerOrderStatus, type SellerOrderListItem } from "@/lib/seller-orders.functions";
import type { SupportedLocale } from "@/lib/i18n";

const STATUS_FLOW: Record<string, { next: string; label: string; icon: typeof Clock }[]> = {
  pending: [
    { next: "accepted", label: "Confirm Order (call customer)", icon: Phone },
  ],
  accepted: [
    { next: "processing", label: "Start Preparing", icon: Package },
  ],
  processing: [
    { next: "ready_for_shipping", label: "Ready for Shipping", icon: Truck },
  ],
  ready_for_shipping: [
    { next: "handed_to_courier", label: "Hand to Courier", icon: Truck },
  ],
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  processing: "Preparing",
  ready_for_shipping: "Ready to Ship",
  handed_to_courier: "With Courier",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

/**
 * Professional seller order card: tracking code, buyer info,
 * product images, status workflow buttons.
 */
export function SellerOrderCard({
  order,
  locale,
  back,
  q,
  status,
  page,
}: {
  order: SellerOrderListItem;
  locale: SupportedLocale;
  back: string;
  q: string;
  status: string;
  page: number;
}) {
  const queryClient = useQueryClient();
  const [acting, setActing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (status: string) =>
      updateSellerOrderStatus({ data: { sellerOrderId: order.id, status: status as never } }),
    onSuccess: () => {
      toast.success("Order status updated.");
      void queryClient.invalidateQueries({ queryKey: ["seller-orders"] });
      setActing(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed.");
      setActing(false);
    },
  });

  const actions = STATUS_FLOW[order.status] ?? [];
  const buyerName = [order.firstName, order.lastName].filter(Boolean).join(" ") || "—";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      {/* Header: tracking code + status + date */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tracking Code
          </p>
          <Link
            to="/seller/orders/$orderId"
            params={{ orderId: order.id }}
            search={{ locale, back, q, status, page }}
            className="mt-1 block font-mono text-lg font-bold text-primary hover:underline"
          >
            {order.orderNumber}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(order.createdAt, locale)}</p>
        </div>
        <StatusPill status={STATUS_LABELS[order.status] ?? order.status} />
      </div>

      {/* Buyer info */}
      <div className="grid gap-4 py-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Buyer</p>
          <p className="mt-1 font-semibold">{buyerName}</p>
          {order.phone ? (
            <a href={`tel:${order.phone}`} className="mt-0.5 flex items-center gap-1.5 text-sm text-primary hover:underline" dir="ltr">
              <Phone className="h-3.5 w-3.5" /> {order.phone}
            </a>
          ) : null}
        </div>
        <div className="text-end">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="mt-1 text-xl font-bold">{fmtMoney(order.subtotal + order.shippingTotal, "DZD", locale)}</p>
        </div>
      </div>

      {/* Products */}
      <div className="space-y-3 border-t pt-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-neutral-100 dark:bg-neutral-900">
              {item.imagePath ? (
                <img src={item.imagePath} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No img
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.productName}</p>
              <p className="text-xs text-muted-foreground">
                Qty: {item.quantity} × {fmtMoney(item.unitPrice, "DZD", locale)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Status actions */}
      {actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {actions.map(({ next, label, icon: Icon }) => (
            <Button
              key={next}
              size="sm"
              disabled={acting}
              onClick={() => {
                setActing(true);
                updateMutation.mutate(next);
              }}
            >
              <Icon className="me-1.5 h-4 w-4" />
              {label}
            </Button>
          ))}
          {order.status === "pending" || order.status === "accepted" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => {
                if (!confirm("Cancel this order?")) return;
                setActing(true);
                updateMutation.mutate("cancelled");
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : order.status === "delivered" ? (
        <div className="mt-4 flex items-center gap-2 border-t pt-4 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" /> Delivered — completed
        </div>
      ) : null}
    </div>
  );
}
