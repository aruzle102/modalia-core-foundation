import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/feedback-states";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getTranslations } from "@/lib/i18n";
import { platformConfig } from "@/config/platform";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — Modalia" }, { name: "description", content: "Saved products will be available after account features launch." }, { property: "og:title", content: "Wishlist — Modalia" }, { property: "og:description", content: "Saved products will be available after account features launch." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/wishlist" }] }),
  component: FoundationPage,
});
function FoundationPage() { const locale = platformConfig.market.defaultLanguage; const t = getTranslations(locale); return <div className="min-h-screen bg-background"><SiteHeader locale={locale} t={t} /><main><EmptyState title="Wishlist">Saved products will be available after account features launch.<div className="mt-7"><Button asChild variant="outline"><Link to="/">{t.shell.back}</Link></Button></div></EmptyState></main><SiteFooter t={t} /></div>; }
