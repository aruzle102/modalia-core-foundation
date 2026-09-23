import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ConfirmationView } from "@/components/marketplace/order-views";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getOrderConfirmation } from "@/lib/orders.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/order-success")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined), order: typeof search["order"] === "string" ? search["order"] : "" }),
  loaderDeps: ({ search }) => ({ order: search.order }),
  loader: ({ context, deps }) => deps.order ? context.queryClient.ensureQueryData(queryOptions({ queryKey: ["order-confirmation", deps.order], queryFn: () => getOrderConfirmation({ data: { orderNumber: deps.order } }) })) : null,
  head: () => ({ meta: [{ title: "Order confirmation — Modalia" }, { name: "description", content: "Your Modalia order confirmation." }, { property: "og:title", content: "Order confirmation — Modalia" }, { property: "og:description", content: "Your Modalia order confirmation." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/order-success" }] }),
  component: OrderSuccessPage,
});
function OrderSuccessPage() { const { locale, order: orderNumber } = Route.useSearch(); const query = queryOptions({ queryKey: ["order-confirmation", orderNumber], queryFn: () => getOrderConfirmation({ data: { orderNumber } }), enabled: Boolean(orderNumber) }); const { data: order } = useSuspenseQuery(query); const t = getTranslations(locale); return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} />{order ? <ConfirmationView {...order} locale={locale} /> : <main className="px-6 py-24 text-center text-muted-foreground">We could not locate this confirmation.</main>}<SiteFooter t={t} /></div>; }
