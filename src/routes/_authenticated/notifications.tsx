import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
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
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-eyebrow text-muted-foreground">{t.nav.account}</p>
        <h1 className="mt-2 text-display text-foreground">{t.notifications.title}</h1>
        <p className="mt-3 text-body text-muted-foreground">{t.notifications.subtitle}</p>
        <div className="mt-4">
          <Link
            to="/notifications/preferences"
            search={{ locale }}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.notifications.openPreferences}
          </Link>
        </div>
        <section className="mt-8">
          <NotificationList scope="customer" locale={locale} t={t.notifications} />
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
