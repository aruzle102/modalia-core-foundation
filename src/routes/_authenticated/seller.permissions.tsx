import { createFileRoute } from "@tanstack/react-router";
import { Check, Crown, EyeOff, KeyRound, UserCheck } from "lucide-react";
import { AdminCard, EmptyState, TableSkeleton } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { useSellerSession } from "@/components/seller/ui";
import { RouteError } from "@/components/routing/route-states";
import { getLocale, getTranslations, type SupportedLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ALL_SELLER_PERMISSIONS, type SellerPermission } from "@/lib/seller-auth";

export const Route = createFileRoute("/_authenticated/seller/permissions")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  errorComponent: PermissionsRouteError,
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Permissions — Seller — Modalia" },
      { name: "description", content: "Your seller permissions. Read-only overview." },
    ],
  }),
  component: SellerPermissionsPage,
});

interface PermissionStrings {
  eyebrow: string;
  intro: string;
  roleLabel: string;
  owner: string;
  staff: string;
  supportModeNote: string;
  grantedTitle: (n: number) => string;
  notGrantedTitle: (n: number) => string;
  emptyTitle: string;
  emptyText: string;
  loadError: string;
  descriptions: Record<SellerPermission, string>;
}

/**
 * Local trilingual strings (kept in this file so no other file is touched).
 * The page title itself comes from the existing nav key
 * `sellerDashboardV8.nav.permissions` ("Permissions" / "Permissions" /
 * "الصلاحيات").
 */
const STRINGS: Record<SupportedLocale, PermissionStrings> = {
  en: {
    eyebrow: "Seller workspace",
    intro:
      "Your current role and what you can do. This page is read-only — permissions are assigned on the Staff page.",
    roleLabel: "Your role",
    owner: "Owner",
    staff: "Staff",
    supportModeNote: "Admin support session — read-only access.",
    grantedTitle: (n) => `Granted (${n})`,
    notGrantedTitle: (n) => `Not granted (${n})`,
    emptyTitle: "No permission data",
    emptyText:
      "We couldn't find any permissions for your account. If you believe this is a mistake, contact the store owner.",
    loadError: "Permissions could not be loaded.",
    descriptions: {
      "products.view": "View products",
      "products.edit": "Create and edit products",
      "products.publish": "Publish and unpublish products",
      "orders.view": "View orders",
      "orders.update": "Update order status (fulfill, cancel)",
      "inventory.manage": "Manage inventory and stock levels",
      "coupons.manage": "Create and manage coupons",
      "promotions.manage": "Create and manage promotions",
      "bundles.manage": "Create and manage product bundles",
      "analytics.view": "View sales analytics",
      "store.manage": "Manage the store profile and appearance",
      "customers.view": "View customers",
      "reviews.manage": "Manage product reviews",
      "staff.manage": "Manage staff members and their permissions",
      "finance.view": "View payouts and financial reports",
      "settings.manage": "Manage store settings",
      "support.manage": "Manage customer support tickets",
    },
  },
  fr: {
    eyebrow: "Espace vendeur",
    intro:
      "Votre rôle actuel et ce que vous pouvez faire. Cette page est en lecture seule — les permissions sont attribuées sur la page Équipe.",
    roleLabel: "Votre rôle",
    owner: "Propriétaire",
    staff: "Équipe",
    supportModeNote: "Session de support admin — accès en lecture seule.",
    grantedTitle: (n) => `Accordées (${n})`,
    notGrantedTitle: (n) => `Non accordées (${n})`,
    emptyTitle: "Aucune donnée de permission",
    emptyText:
      "Nous n'avons trouvé aucune permission pour votre compte. Si vous pensez qu'il s'agit d'une erreur, contactez le propriétaire de la boutique.",
    loadError: "Impossible de charger les permissions.",
    descriptions: {
      "products.view": "Voir les produits",
      "products.edit": "Créer et modifier les produits",
      "products.publish": "Publier et dépublier les produits",
      "orders.view": "Voir les commandes",
      "orders.update": "Mettre à jour le statut des commandes (expédition, annulation)",
      "inventory.manage": "Gérer le stock",
      "coupons.manage": "Créer et gérer les coupons",
      "promotions.manage": "Créer et gérer les promotions",
      "bundles.manage": "Créer et gérer les packs de produits",
      "analytics.view": "Voir les statistiques de vente",
      "store.manage": "Gérer le profil et l'apparence de la boutique",
      "customers.view": "Voir les clients",
      "reviews.manage": "Gérer les avis produits",
      "staff.manage": "Gérer les membres de l'équipe et leurs permissions",
      "finance.view": "Voir les paiements et les rapports financiers",
      "settings.manage": "Gérer les paramètres de la boutique",
      "support.manage": "Gérer les tickets de support client",
    },
  },
  ar: {
    eyebrow: "مساحة البائع",
    intro: "دورك الحالي وما يمكنك فعله. هذه الصفحة للقراءة فقط — تُمنح الصلاحيات من صفحة الفريق.",
    roleLabel: "دورك",
    owner: "المالك",
    staff: "عضو فريق",
    supportModeNote: "جلسة دعم إدارية — وصول للقراءة فقط.",
    grantedTitle: (n) => `الممنوحة (${n})`,
    notGrantedTitle: (n) => `غير الممنوحة (${n})`,
    emptyTitle: "لا توجد بيانات صلاحيات",
    emptyText: "لم نعثر على أي صلاحيات لحسابك. إذا كنت تعتقد أن هذا خطأ، تواصل مع مالك المتجر.",
    loadError: "تعذّر تحميل الصلاحيات.",
    descriptions: {
      "products.view": "عرض المنتجات",
      "products.edit": "إنشاء المنتجات وتعديلها",
      "products.publish": "نشر المنتجات وإلغاء نشرها",
      "orders.view": "عرض الطلبات",
      "orders.update": "تحديث حالة الطلبات (تنفيذ، إلغاء)",
      "inventory.manage": "إدارة المخزون",
      "coupons.manage": "إنشاء الكوبونات وإدارتها",
      "promotions.manage": "إنشاء العروض وإدارتها",
      "bundles.manage": "إنشاء حزم المنتجات وإدارتها",
      "analytics.view": "عرض إحصائيات المبيعات",
      "store.manage": "إدارة الملف التجاري ومظهر المتجر",
      "customers.view": "عرض العملاء",
      "reviews.manage": "إدارة تقييمات المنتجات",
      "staff.manage": "إدارة أعضاء الفريق وصلاحياتهم",
      "finance.view": "عرض المدفوعات والتقارير المالية",
      "settings.manage": "إدارة إعدادات المتجر",
      "support.manage": "إدارة تذاكر دعم العملاء",
    },
  },
};

function PermissionsRouteError({ reset }: { reset: () => void }) {
  const locale = getLocale(undefined);
  const title = getTranslations(locale).sellerDashboardV8.nav.permissions;
  const t = STRINGS[locale];
  return (
    <SellerShell eyebrow={t.eyebrow} title={title}>
      <RouteError message={t.loadError} reset={reset} />
    </SellerShell>
  );
}

function SellerPermissionsPage() {
  const { locale } = Route.useSearch();
  const title = getTranslations(locale).sellerDashboardV8.nav.permissions;
  const t = STRINGS[locale];
  const { status, error, seller, retry } = useSellerSession();

  return (
    <SellerShell eyebrow={t.eyebrow} title={title}>
      <p className="text-body text-muted-foreground">{t.intro}</p>

      <div className="mt-6">
        {status === "checking" ? (
          <TableSkeleton rows={6} />
        ) : status === "error" ? (
          <RouteError message={error ?? t.loadError} reset={retry} />
        ) : !seller || !Array.isArray(seller.permissions) || seller.permissions.length === 0 ? (
          <AdminCard>
            <EmptyState
              title={t.emptyTitle}
              text={t.emptyText}
              icon={<KeyRound className="size-5 text-muted-foreground" />}
            />
          </AdminCard>
        ) : (
          <PermissionsBody seller={seller} t={t} />
        )}
      </div>
    </SellerShell>
  );
}

function PermissionsBody({
  seller,
  t,
}: {
  seller: NonNullable<ReturnType<typeof useSellerSession>["seller"]>;
  t: PermissionStrings;
}) {
  const granted = ALL_SELLER_PERMISSIONS.filter((p) => seller.permissions.includes(p));
  const notGranted = ALL_SELLER_PERMISSIONS.filter((p) => !seller.permissions.includes(p));

  return (
    <div className="space-y-6">
      <AdminCard title={t.roleLabel}>
        <div className="flex flex-wrap items-center gap-3">
          {seller.isOwner ? (
            <Crown className="size-5 shrink-0 text-amber-500" aria-hidden />
          ) : (
            <UserCheck className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{seller.isOwner ? t.owner : t.staff}</p>
            <p className="truncate text-xs text-muted-foreground">{seller.legalName}</p>
            {seller.supportMode ? (
              <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {t.supportModeNote}
              </p>
            ) : null}
          </div>
        </div>
      </AdminCard>

      <AdminCard title={t.grantedTitle(granted.length)}>
        <ul className="divide-y divide-border">
          {granted.map((p) => (
            <PermissionRow key={p} permission={p} description={t.descriptions[p]} granted />
          ))}
        </ul>
      </AdminCard>

      {notGranted.length > 0 ? (
        <AdminCard title={t.notGrantedTitle(notGranted.length)}>
          <ul className="divide-y divide-border">
            {notGranted.map((p) => (
              <PermissionRow key={p} permission={p} description={t.descriptions[p]} granted={false} />
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </div>
  );
}

function PermissionRow({
  permission,
  description,
  granted,
}: {
  permission: SellerPermission;
  description: string;
  granted: boolean;
}) {
  return (
    <li className={cn("flex items-start gap-3 py-3", !granted && "opacity-50")}>
      {granted ? (
        <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
      ) : (
        <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium">{permission}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}
