import {
  BadgeCheck,
  BadgeX,
  Bell,
  BellRing,
  EyeOff,
  Megaphone,
  PackageCheck,
  PackageX,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserPlus,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { SupportedLocale } from "@/config/platform";
import type { Translation } from "@/lib/i18n";
import type { Localized, NotificationItem, NotificationScope } from "@/lib/notifications.functions";

export type NotificationsText = Translation["notifications"];

/** Pick the localized string for the active locale, with a sane fallback chain. */
export function pickLocalized(value: Localized, locale: SupportedLocale): string {
  return (
    value[locale] ||
    value.fr ||
    value.en ||
    value.ar ||
    ""
  );
}

/** Compact relative time, e.g. "منذ 5 د" / "il y a 5 min" / "5m ago". */
export function timeAgo(iso: string, locale: SupportedLocale, t: NotificationsText): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  const fill = (template: string) => template.replace("{n}", String(minutes === 0 ? 1 : minutes));
  if (minutes < 1) return t.justNow;
  if (minutes < 60) return fill(t.minutesAgo);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.hoursAgo.replace("{n}", String(hours));
  const days = Math.round(hours / 24);
  return t.daysAgo.replace("{n}", String(days));
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  order_received: ShoppingBag,
  order_status: Truck,
  back_in_stock: PackageCheck,
  promotion: Megaphone,
  new_order: BellRing,
  product_approved: BadgeCheck,
  product_rejected: BadgeX,
  product_hidden: EyeOff,
  settlement_updated: Wallet,
  store_status_changed: Settings2,
  store_verification_changed: ShieldCheck,
  low_stock: Warehouse,
  seller_application: UserPlus,
  operational_alert: Bell,
};

export function typeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? Bell;
}

/** Append the locale search param to an in-app notification link. */
export function localizedLink(link: string | null, locale: SupportedLocale): string | null {
  if (!link) return null;
  return link.includes("?") ? `${link}&locale=${locale}` : `${link}?locale=${locale}`;
}

export type { NotificationItem, NotificationScope };
