import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  head: () => ({ meta: [{ title: "Modalia — Premium marketplace" }, { name: "description", content: "Modalia is a premium, global-ready multi-vendor marketplace." }, { property: "og:title", content: "Modalia — Premium marketplace" }, { property: "og:description", content: "A premium, global-ready multi-vendor marketplace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: "/" }] }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main>
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-4 py-24 sm:px-6 lg:px-8">
          <p className="text-eyebrow text-muted-foreground">Modalia / foundation</p>
          <h1 className="mt-5 max-w-3xl text-display text-foreground sm:text-6xl">A considered place for what matters.</h1>
          <p className="mt-6 max-w-xl text-body text-muted-foreground">The multi-vendor marketplace foundation is ready. Product discovery, stores, and commerce will be introduced in the next phase.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Button asChild><Link to="/shop">{t.shell.explore}<ArrowUpRight /></Link></Button><Button asChild variant="outline"><Link to="/become-a-seller">{t.nav.sellers}</Link></Button></div>
        </section>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
