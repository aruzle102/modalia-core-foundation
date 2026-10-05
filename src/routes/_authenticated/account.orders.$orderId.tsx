import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { OrderDetailView } from "@/components/marketplace/order-views";
import { getMyOrder } from "@/lib/orders.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

const orderQuery = (orderId: string) => queryOptions({ queryKey: ["my-order", orderId], queryFn: () => getMyOrder({ data: { orderId } }) });
function OrderLoading() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.orderLoading}</div>; }
function OrderLoadError() { const { locale } = Route.useSearch(); return <div role="alert" className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.orderLoadError}</div>; }
function OrderNotFound() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.orderNotFound}</div>; }

export const Route = createFileRoute("/_authenticated/account/orders/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(orderQuery(params.orderId)),
  pendingComponent: OrderLoading,
  errorComponent: OrderLoadError,
  notFoundComponent: OrderNotFound,
  head: () => ({ meta: [{ title: "Order details — Modalia" }, { name: "description", content: "Review your Modalia order." }, { property: "og:title", content: "Order details — Modalia" }, { property: "og:description", content: "Review your Modalia order." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: OrderPage,
});

function OrderPage() { const { orderId } = Route.useParams(); const { locale } = Route.useSearch(); const { data: order } = useSuspenseQuery(orderQuery(orderId)); const t = getTranslations(locale); return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} />{order ? <OrderDetailView order={order} locale={locale} /> : <main id="main-content" tabIndex={-1} className="px-6 py-24 text-center text-muted-foreground">{t.orders.orderNotFound}</main>}<SiteFooter locale={locale} t={t} /></div>; }