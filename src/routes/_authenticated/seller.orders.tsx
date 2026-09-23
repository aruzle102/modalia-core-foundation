import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { OrdersEmpty, SellerOrdersList } from "@/components/marketplace/order-views";
import { getMySellerOrders } from "@/lib/orders.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

const sellerOrdersQuery = () => queryOptions({ queryKey: ["seller-orders"], queryFn: () => getMySellerOrders({ data: { page: 1, pageSize: 20 } }) });

export const Route = createFileRoute("/_authenticated/seller/orders")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(sellerOrdersQuery()),
  pendingComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">Loading seller orders…</div>,
  errorComponent: () => <div role="alert" className="px-6 py-24 text-center text-muted-foreground">Seller orders could not be loaded.</div>,
  notFoundComponent: () => <div className="px-6 py-24 text-center text-muted-foreground">No seller orders found.</div>,
  head: () => ({ meta: [{ title: "Seller orders — Modalia" }, { name: "description", content: "Manage your store’s order operations." }, { property: "og:title", content: "Seller orders — Modalia" }, { property: "og:description", content: "Manage your store’s order operations." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/seller/orders" }] }),
  component: SellerOrdersPage,
});

function SellerOrdersPage() { const { locale } = Route.useSearch(); const { data } = useSuspenseQuery(sellerOrdersQuery()); const t = getTranslations(locale); return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"><p className="text-eyebrow text-muted-foreground">Seller workspace</p><h1 className="mt-2 text-display text-foreground">Orders</h1><p className="mt-3 text-body text-muted-foreground">Only orders for your own store are shown here.</p><section className="mt-10">{data.orders.length ? <SellerOrdersList orders={data.orders} locale={locale} /> : <OrdersEmpty />}</section></main><SiteFooter t={t} /></div>; }