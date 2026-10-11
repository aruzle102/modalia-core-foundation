import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { NotificationList } from "@/components/notifications/notification-center";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/notifications")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Notifications — Modalia" }, { name: "description", content: "Your Modalia notifications." }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={t.nav.account}
          title={t.notifications.title}
          description={t.notifications.subtitle}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/notifications/preferences" search={{ locale }}>
                {t.notifications.openPreferences}
              </Link>
            </Button>
          }
        />
        <section className="mt-2">
          <NotificationList scope="customer" locale={locale} t={t.notifications} />
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
