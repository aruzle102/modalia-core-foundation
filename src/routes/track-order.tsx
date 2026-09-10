import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/feedback-states";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getTranslations } from "@/lib/i18n";
import { platformConfig } from "@/config/platform";

export const Route = createFileRoute("/track-order")({
  head: () => ({ meta: [{ title: "Track order — Modalia" }, { name: "description", content: "Order tracking will be available after order operations launch." }, { property: "og:title", content: "Track order — Modalia" }, { property: "og:description", content: "Order tracking will be available after order operations launch." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/track-order" }] }),
  component: FoundationPage,
});
function FoundationPage() { const locale = platformConfig.market.defaultLanguage; const t = getTranslations(locale); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main><EmptyState title="Track order">Order tracking will be available after order operations launch.<div className="mt-7"><Button asChild variant="outline"><Link to="/" search={{ locale: "fr" }}>{t.shell.back}</Link></Button></div></EmptyState></main><SiteFooter t={t} /></div>; }
