import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/feedback-states";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getTranslations } from "@/lib/i18n";
import { platformConfig } from "@/config/platform";

export const Route = createFileRoute("/become-a-seller")({
  head: () => ({ meta: [{ title: "Become a seller — Modalia" }, { name: "description", content: "Seller onboarding is prepared for the next operational phase." }, { property: "og:title", content: "Become a seller — Modalia" }, { property: "og:description", content: "Seller onboarding is prepared for the next operational phase." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/become-a-seller" }] }),
  component: FoundationPage,
});
function FoundationPage() { const locale = platformConfig.market.defaultLanguage; const t = getTranslations(locale); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main><EmptyState title="Become a seller">Seller onboarding is prepared for the next operational phase.<div className="mt-7"><Button asChild variant="outline"><Link to="/" search={{ locale: "fr" }}>{t.shell.back}</Link></Button></div></EmptyState></main><SiteFooter t={t} /></div>; }
