import { ReceiptText } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, FormSection } from "@/components/dashboard";
import { StatusPill } from "@/components/admin/ui";
import { formatDate, formatPrice } from "@/lib/i18n/format";
import { getTranslations } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";
import type { CustomerOrderCard, CustomerOrderDetail } from "@/lib/orders.functions";

function addressName(address: unknown, key: "wilaya" | "commune", locale: SupportedLocale) { if (!address || Array.isArray(address) || typeof address !== "object") return ""; const value = (address as Record<string, unknown>)[key]; if (!value || Array.isArray(value) || typeof value !== "object") return typeof value === "string" ? value : ""; const labels = value as Record<string, unknown>; for (const code of [locale, "fr", "en", "ar"]) { if (typeof labels[code] === "string") return labels[code] as string; } return ""; }

const columnHeader = "px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function OrderList({ orders, locale }: { orders: CustomerOrderCard[]; locale: SupportedLocale }) {
  const t = getTranslations(locale).orders;
  const track = getTranslations(locale).trackOrder;
  return (
    <DataTable>
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={columnHeader}>{t.orderEyebrow}</th>
            <th scope="col" className={columnHeader}>{t.items}</th>
            <th scope="col" className={columnHeader}>{track.timelineCurrent}</th>
            <th scope="col" className={`${columnHeader} text-end`}>{t.total}</th>
            <th scope="col"><span className="sr-only">{t.view}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <tr key={order.id} className="transition-colors hover:bg-accent/40">
              <td className="px-4 py-3.5">
                <p className="font-medium text-foreground">{order.orderNumber}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.createdAt, locale)}</p>
              </td>
              <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{t.itemsCount(order.itemCount)}</td>
              <td className="px-4 py-3.5">
                <StatusPill status={order.status} label={t.statusLabel(order.status)} />
              </td>
              <td className="px-4 py-3.5 text-end font-semibold tabular-nums text-foreground">
                {formatPrice(order.total, locale)}
              </td>
              <td className="px-4 py-3.5 text-end">
                <Button asChild variant="outline" size="sm">
                  <Link to="/account/orders/$orderId" params={{ orderId: order.id }} search={{ locale }}>
                    {t.view}
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}

export function OrderDetailView({ order, locale }: { order: CustomerOrderDetail; locale: SupportedLocale }) {
  const full = getTranslations(locale);
  const t = full.orders;
  const tc = full.checkout;
  const addressLine = order.address && !Array.isArray(order.address) && typeof order.address === "object" ? (order.address as Record<string, unknown>)["address_line"] : "";
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.orderEyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{order.orderNumber}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {formatDate(order.createdAt, locale)} · {t.itemsCount(order.items.length)}
          </p>
          <div className="mt-3">
            <StatusPill status={order.status} label={t.statusLabel(order.status)} />
          </div>
        </div>
        <p className="text-xl font-bold tabular-nums text-foreground">{formatPrice(order.total, locale)}</p>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.items}</h2>
        <div className="mt-3">
          <DataTable>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={columnHeader}>{t.products}</th>
                  <th scope="col" className={columnHeader}>{t.quantity}</th>
                  <th scope="col" className={`${columnHeader} text-end`}>{t.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {item.imagePath ? <img src={item.imagePath} alt="" className="size-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{item.title}</p>
                          {item.sku ? <p className="mt-0.5 text-xs text-muted-foreground">{item.sku}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{item.quantity}</td>
                    <td className="px-4 py-3.5 text-end font-medium tabular-nums text-foreground">
                      {formatPrice(item.total, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </div>
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <FormSection title={t.delivery}>
          <p className="text-sm text-muted-foreground">
            {typeof addressLine === "string" ? addressLine : ""}
            <br />
            {addressName(order.address, "commune", locale)} {addressName(order.address, "wilaya", locale)}
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">
            {order.deliveryMethod === "office" ? tc.officePickup : tc.homeDelivery}
          </p>
        </FormSection>
        <FormSection title={t.payment}>
          <p className="text-sm font-medium text-foreground">{t.cashOnDelivery}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t.paymentStatusLabel(order.paymentStatus)}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t.products}</dt>
              <dd className="tabular-nums">{formatPrice(order.subtotal, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t.shipping}</dt>
              <dd className="tabular-nums">{formatPrice(order.shippingTotal, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold">
              <dt>{t.total}</dt>
              <dd className="tabular-nums">{formatPrice(order.total, locale)}</dd>
            </div>
          </dl>
        </FormSection>
      </div>
    </main>
  );
}

export function OrdersEmpty({ locale }: { locale: SupportedLocale }) {
  const t = getTranslations(locale).orders;
  return <EmptyState icon={<ReceiptText className="h-5 w-5" />} title={t.emptyTitle} description={t.emptyText} />;
}
