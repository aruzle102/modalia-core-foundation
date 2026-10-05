import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { NotificationList } from "@/components/notifications/notification-center";
import { getTranslations } from "@/lib/i18n";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Admin — Modalia" }, { name: "description", content: "Operational notifications for administrators." }] }),
  component: AdminNotificationsPage,
});

function AdminNotificationsPage() {
  const t = getTranslations("en");
  return (
    <AdminGate>
      <AdminShell
        title={t.notifications.title}
        subtitle="Seller applications, moderation and operational alerts."
      >
        <NotificationList scope="admin" locale="en" t={t.notifications} />
      </AdminShell>
    </AdminGate>
  );
}
