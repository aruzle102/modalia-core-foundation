import { createFileRoute, Link } from "@tanstack/react-router";
import { SellerShell } from "@/components/seller/SellerShell";
import { NotificationPreferencesForm } from "@/components/notifications/notification-center";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/notifications/preferences")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Notification preferences — Seller — Modalia" }, { name: "description", content: "Choose which store notifications you receive." }] }),
  component: SellerNotificationPreferencesPage,
});

function SellerNotificationPreferencesPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell eyebrow="Seller workspace" title={t.notifications.preferencesTitle}>
        <p className="text-body text-muted-foreground">{t.notifications.preferencesSubtitle}</p>
        <div className="mt-4">
          <Link
            to="/seller/notifications"
            search={{ locale }}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.notifications.title}
          </Link>
        </div>
        <div className="mt-6">
          <NotificationPreferencesForm scope="seller" t={t.notifications} />
        </div>
      </SellerShell>
    </div>
  );
}
