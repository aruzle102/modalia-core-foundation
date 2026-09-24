import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/order-success")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined), order: typeof search["order"] === "string" ? search["order"] : "" }),
  head: () => ({ meta: [{ title: "Order confirmation — Modalia" }, { name: "description", content: "Your Modalia order confirmation." }, { property: "og:title", content: "Order confirmation — Modalia" }, { property: "og:description", content: "Your Modalia order confirmation." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/order-success" }] }),
  component: OrderSuccessPage,
});
function OrderSuccessPage() { const { locale, order: orderNumber } = Route.useSearch(); const t = getTranslations(locale); return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-3xl items-center px-4 py-10 sm:px-6"><div className="w-full text-center"><p className="text-eyebrow text-muted-foreground">Order received</p><h1 className="mt-3 text-display text-foreground">Thank you for your order.</h1><p className="mx-auto mt-4 max-w-lg text-body text-muted-foreground">Your confirmation is ready in your account. Keep your order code for future tracking.</p>{orderNumber ? <p className="mt-7 text-h3 text-foreground">{orderNumber}</p> : null}<div className="mt-8 flex flex-wrap justify-center gap-3"><Button asChild><Link to="/shop" search={{ locale, q: "", category: "", sort: "newest", page: 1, focus: "", view: "" }}>Continue shopping</Link></Button><Button asChild variant="outline"><Link to="/account/orders" search={{ locale }}>View my orders</Link></Button></div></div></main><SiteFooter t={t} /></div>; }
