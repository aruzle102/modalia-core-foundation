import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { OrderList, OrdersEmpty } from "@/components/marketplace/order-views";
import { getMyOrders } from "@/lib/orders.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

const ordersQuery = () => queryOptions({ queryKey: ["my-orders"], queryFn: () => getMyOrders({ data: { page: 1, pageSize: 10 } }) });
function OrdersLoading() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.loading}</div>; }
function OrdersError() { const { locale } = Route.useSearch(); return <div role="alert" className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.loadError}</div>; }
function OrdersNotFound() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.notAvailable}</div>; }

export const Route = createFileRoute("/_authenticated/account/orders")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ordersQuery()),
  pendingComponent: OrdersLoading,
  errorComponent: OrdersError,
  notFoundComponent: OrdersNotFound,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "My orders — Modalia" }, { name: "description", content: "Review your Modalia orders." }, { property: "og:title", content: "My orders — Modalia" }, { property: "og:description", content: "Review your Modalia orders." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/account/orders" }] }),
  component: OrdersPage,
});

function OrdersPage() { const { locale } = Route.useSearch(); const { data } = useSuspenseQuery(ordersQuery()); const t = getTranslations(locale); return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"><p className="text-eyebrow text-muted-foreground">{t.orders.eyebrow}</p><h1 className="mt-2 text-display text-foreground">{t.orders.title}</h1><p className="mt-3 text-body text-muted-foreground">{t.orders.text}</p><section className="mt-10">{data.orders.length ? <OrderList orders={data.orders} locale={locale} /> : <OrdersEmpty locale={locale} />}</section></main><SiteFooter locale={locale} t={t} /></div>; }