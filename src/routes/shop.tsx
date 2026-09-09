import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/feedback-states";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getTranslations } from "@/lib/i18n";
import { platformConfig } from "@/config/platform";

export const Route = createFileRoute("/shop")({
  head: () => ({ meta: [{ title: "Shop — Modalia" }, { name: "description", content: "The curated Modalia catalogue will be available here." }, { property: "og:title", content: "Shop — Modalia" }, { property: "og:description", content: "The curated Modalia catalogue will be available here." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/shop" }] }),
  component: FoundationPage,
});
function FoundationPage() { const locale = platformConfig.market.defaultLanguage; const t = getTranslations(locale); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main><EmptyState title="Shop">The curated Modalia catalogue will be available here.<div className="mt-7"><Button asChild variant="outline"><Link to="/">{t.shell.back}</Link></Button></div></EmptyState></main><SiteFooter t={t} /></div>; }
