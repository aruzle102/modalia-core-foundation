import { createFileRoute, Link } from "@tanstack/react-router";
import { SellerShell } from "@/components/seller/SellerShell";
import { NotificationList } from "@/components/notifications/notification-center";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller/notifications")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  head: () => ({ meta: [{ title: "Notifications — Seller — Modalia" }, { name: "description", content: "Notifications for your store." }] }),
  component: SellerNotificationsPage,
});

function SellerNotificationsPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div dir={localeDirections[locale]} lang={locale}>
      <SellerShell
        eyebrow="Seller workspace"
        title={t.notifications.title}
        actions={
          <Link
            to="/seller/notifications/preferences"
            search={{ locale }}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.notifications.openPreferences}
          </Link>
        }
      >
        <p className="text-body text-muted-foreground">{t.notifications.subtitle}</p>
        <div className="mt-6">
          <NotificationList scope="seller" locale={locale} t={t.notifications} />
        </div>
      </SellerShell>
    </div>
  );
}
