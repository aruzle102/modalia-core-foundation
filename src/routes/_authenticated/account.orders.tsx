import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { PageHeader, EmptyState, ErrorState } from "@/components/dashboard";
import { OrderList, OrdersEmpty } from "@/components/marketplace/order-views";
import { getMyOrders } from "@/lib/orders.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

const ordersQuery = () => queryOptions({ queryKey: ["my-orders"], queryFn: () => getMyOrders({ data: { page: 1, pageSize: 10 } }) });
function OrdersLoading() { const { locale } = Route.useSearch(); return <div className="px-6 py-24 text-center text-muted-foreground">{getTranslations(locale).orders.loading}</div>; }
function OrdersError() { const { locale } = Route.useSearch(); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={getTranslations(locale)} /><main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8"><ErrorState title={getTranslations(locale).orders.loadError} /></main><SiteFooter locale={locale} t={getTranslations(locale)} /></div>; }
function OrdersNotFound() { const { locale } = Route.useSearch(); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={getTranslations(locale)} /><main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8"><EmptyState title={getTranslations(locale).orders.notAvailable} /></main><SiteFooter locale={locale} t={getTranslations(locale)} /></div>; }

export const Route = createFileRoute("/_authenticated/account/orders")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ordersQuery()),
  pendingComponent: OrdersLoading,
  errorComponent: OrdersError,
  notFoundComponent: OrdersNotFound,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "My orders — Modalia" }, { name: "description", content: "Review your Modalia orders." }, { property: "og:title", content: "My orders — Modalia" }, { property: "og:description", content: "Review your Modalia orders." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/account/orders" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { locale } = Route.useSearch();
  const { data } = useSuspenseQuery(ordersQuery());
  const t = getTranslations(locale);
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader eyebrow={t.orders.eyebrow} title={t.orders.title} description={t.orders.text} />
        <section className="mt-2">
          {data.orders.length ? <OrderList orders={data.orders} locale={locale} /> : <OrdersEmpty locale={locale} />}
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
