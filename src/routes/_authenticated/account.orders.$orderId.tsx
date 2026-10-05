import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { OrderDetailView } from "@/components/marketplace/order-views";
import { getMyOrder } from "@/lib/orders.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { strParam } from "@/hooks/use-url-state";
import { BackLink } from "@/components/routing/back-link";

const orderQuery = (orderId: string) => queryOptions({ queryKey: ["my-order", orderId], queryFn: () => getMyOrder({ data: { orderId } }) });
function OrderLoading() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.orderLoading}</div>; }
function OrderLoadError() { const { locale } = Route.useSearch(); return <div role="alert" className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.orderLoadError}</div>; }
function OrderNotFound() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.orderNotFound}</div>; }

export const Route = createFileRoute("/_authenticated/account/orders/$orderId")({
  validateSearch: (search: Record<string, unknown>): { locale: ReturnType<typeof getLocale>; back?: string | undefined } => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    back: strParam(search["back"]) || undefined,
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(orderQuery(params.orderId)),
  pendingComponent: OrderLoading,
  errorComponent: OrderLoadError,
  notFoundComponent: OrderNotFound,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Order details — Modalia" }, { name: "description", content: "Review your Modalia order." }, { property: "og:title", content: "Order details — Modalia" }, { property: "og:description", content: "Review your Modalia order." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: OrderPage,
});

function OrderPage() { const { orderId } = Route.useParams(); const { locale, back } = Route.useSearch(); const { data: order } = useSuspenseQuery(orderQuery(orderId)); const t = getTranslations(locale); return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8"><BackLink back={back} fallbackTo="/account/orders" fallbackSearch={{ locale }} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t.orders.backToOrders}</BackLink></div>{order ? <OrderDetailView order={order} locale={locale} /> : <main id="main-content" tabIndex={-1} className="px-6 py-24 text-center text-muted-foreground">{t.orders.orderNotFound}</main>}<SiteFooter locale={locale} t={t} /></div>; }