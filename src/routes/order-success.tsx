import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/feedback-states";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getTranslations } from "@/lib/i18n";
import { platformConfig } from "@/config/platform";

export const Route = createFileRoute("/order-success")({
  head: () => ({ meta: [{ title: "Order confirmation — Modalia" }, { name: "description", content: "Order confirmation is prepared for the commerce phase." }, { property: "og:title", content: "Order confirmation — Modalia" }, { property: "og:description", content: "Order confirmation is prepared for the commerce phase." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/order-success" }] }),
  component: FoundationPage,
});
function FoundationPage() { const locale = platformConfig.market.defaultLanguage; const t = getTranslations(locale); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main><EmptyState title="Order confirmation">Order confirmation is prepared for the commerce phase.<div className="mt-7"><Button asChild variant="outline"><Link to="/">{t.shell.back}</Link></Button></div></EmptyState></main><SiteFooter t={t} /></div>; }
