import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/feedback-states";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getTranslations } from "@/lib/i18n";
import { platformConfig } from "@/config/platform";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Cart — Modalia" }, { name: "description", content: "Your cart is ready for the upcoming commerce experience." }, { property: "og:title", content: "Cart — Modalia" }, { property: "og:description", content: "Your cart is ready for the upcoming commerce experience." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/cart" }] }),
  component: FoundationPage,
});
function FoundationPage() { const locale = platformConfig.market.defaultLanguage; const t = getTranslations(locale); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main><EmptyState title="Cart">Your cart is ready for the upcoming commerce experience.<div className="mt-7"><Button asChild variant="outline"><Link to="/" search={{ locale: "fr" }}>{t.shell.back}</Link></Button></div></EmptyState></main><SiteFooter t={t} /></div>; }
