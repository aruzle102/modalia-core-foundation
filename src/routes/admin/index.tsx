import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutGrid,
  Package,
  PackageMinus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  Stat,
  StatusPill,
  TableSkeleton,
  fmtDateTime,
  fmtMoney,
} from "@/components/admin/ui";
import { SalesChart } from "@/components/admin/Charts";
import { getAdminMetrics } from "@/lib/admin-dashboard.functions";
import { listAuditLogs } from "@/lib/admin-catalog.functions";
import { getLocale } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

/* ---------------------------------------------------------------------------
 * Simple admin dashboard. Everything here is a real number from a server
 * function — no invented figures. Empty data renders as zero / empty states.
 * ------------------------------------------------------------------------- */

const STR = {
  ar: {
    title: "لوحة التحكم",
    subtitle: "نظرة عامة على السوق: اليوم وما يحتاج انتباهك.",
    loadingError: "تعذّر تحميل لوحة التحكم",
    retry: "حاول مجددًا",
    incomplete: (n: number) =>
      `${n} مصدر ${n === 1 ? "بيانات" : "بيانات"} تعذّر تحميلها — قد تكون الأرقام أدناه ناقصة.`,
    failedToLoad: "تعذّر التحميل",
    today: "اليوم",
    todayHint: "أرقام مباشرة من قاعدة البيانات",
    orders: "الطلبات",
    ordersHint: "كل الطلبات، كل الحالات",
    revenue: "الإيرادات",
    revenueHint: "الطلبات المسلَّمة",
    activeSellers: "البائعون النشطون",
    pendingOrders: "طلبات معلقة",
    pendingOrdersHint: "بحالة pending",
    needsAttention: "يحتاج انتباهك",
    applications: "طلبات البائعين",
    moderation: "المنتجات بانتظار المراجعة",
    settlements: "التسويات المعلقة",
    lowStock: "المخزون منخفض",
    failedDeliveries: "توصيل فشل",
    allClear: "كل شيء تحت السيطرة. لا يوجد ما يحتاج انتباهك الآن.",
    sales: "المبيعات",
    salesSubtitle: "آخر 30 يومًا — الطلبات المسلَّمة",
    recentActivity: "النشاط الأخير",
    recentActivitySubtitle: "من سجل التدقيق",
    viewAllAudit: "عرض سجل التدقيق",
    noActivity: "لا يوجد نشاط بعد",
    noActivityText: "ستظهر هنا إجراءات المشرفين فور حدوثها.",
    quickActions: "إجراءات سريعة",
    reviewOrders: "مراجعة الطلبات",
    reviewApplications: "مراجعة طلبات البائعين",
    moderateProducts: "مراجعة المنتجات",
    reviewSettlements: "مراجعة التسويات",
    homepage: "الصفحة الرئيسية",
  },
  fr: {
    title: "Tableau de bord",
    subtitle: "Vue d'ensemble du marketplace : aujourd'hui et ce qui demande votre attention.",
    loadingError: "Échec du chargement du tableau de bord",
    retry: "Réessayer",
    incomplete: (n: number) =>
      `${n} source${n === 1 ? "" : "s"} de données ont échoué — les chiffres ci-dessous peuvent être incomplets.`,
    failedToLoad: "Échec du chargement",
    today: "Aujourd'hui",
    todayHint: "Chiffres réels depuis la base de données",
    orders: "Commandes",
    ordersHint: "Toutes commandes, tous statuts",
    revenue: "Revenus",
    revenueHint: "Commandes livrées",
    activeSellers: "Vendeurs actifs",
    pendingOrders: "Commandes en attente",
    pendingOrdersHint: "Statut pending",
    needsAttention: "À surveiller",
    applications: "Demandes vendeurs",
    moderation: "Produits en attente de modération",
    settlements: "Règlements en attente",
    lowStock: "Stock faible",
    failedDeliveries: "Livraisons échouées",
    allClear: "Tout est sous contrôle. Rien ne demande votre attention pour l'instant.",
    sales: "Ventes",
    salesSubtitle: "30 derniers jours — commandes livrées",
    recentActivity: "Activité récente",
    recentActivitySubtitle: "Depuis le journal d'audit",
    viewAllAudit: "Voir le journal d'audit",
    noActivity: "Aucune activité pour l'instant",
    noActivityText: "Les actions des administrateurs apparaîtront ici.",
    quickActions: "Actions rapides",
    reviewOrders: "Voir les commandes",
    reviewApplications: "Voir les demandes vendeurs",
    moderateProducts: "Modérer les produits",
    reviewSettlements: "Voir les règlements",
    homepage: "Page d'accueil",
  },
  en: {
    title: "Dashboard",
    subtitle: "Marketplace overview: today and what needs your attention.",
    loadingError: "Dashboard failed to load",
    retry: "Retry",
    incomplete: (n: number) =>
      `${n} data source${n === 1 ? "" : "s"} failed to load — figures below may be incomplete.`,
    failedToLoad: "Failed to load",
    today: "Today",
    todayHint: "Live numbers from the database",
    orders: "Orders",
    ordersHint: "All parent orders, all statuses",
    revenue: "Revenue",
    revenueHint: "Delivered orders",
    activeSellers: "Active sellers",
    pendingOrders: "Pending orders",
    pendingOrdersHint: "Status = pending",
    needsAttention: "Needs attention",
    applications: "Seller applications",
    moderation: "Products awaiting moderation",
    settlements: "Pending settlements",
    lowStock: "Low stock",
    failedDeliveries: "Failed deliveries",
    allClear: "All clear. Nothing needs your attention right now.",
    sales: "Sales",
    salesSubtitle: "Last 30 days — delivered orders",
    recentActivity: "Recent activity",
    recentActivitySubtitle: "From the audit log",
    viewAllAudit: "View audit log",
    noActivity: "No activity yet",
    noActivityText: "Admin actions will appear here as they happen.",
    quickActions: "Quick actions",
    reviewOrders: "Review orders",
    reviewApplications: "Review seller applications",
    moderateProducts: "Moderate products",
    reviewSettlements: "Review settlements",
    homepage: "Homepage",
  },
} as const;

type Locale = keyof typeof STR;
type Str = (typeof STR)[Locale];

const metricsKey = ["admin-metrics"] as const;
const auditKey = ["admin-dashboard-recent-activity"] as const;

export const Route = createFileRoute("/admin/")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Dashboard — Admin — Modalia" },
      { name: "description", content: "Marketplace overview: key numbers, items needing attention and recent activity." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { locale } = Route.useSearch();
  return (
    <AdminGate>
      <DashboardContent locale={locale as Locale} />
    </AdminGate>
  );
}

function DashboardContent({ locale }: { locale: Locale }) {
  const s: Str = STR[locale] ?? STR.en;
  const queryClient = useQueryClient();

  const metrics = useQuery({
    queryKey: metricsKey,
    queryFn: () => getAdminMetrics(),
    retry: false,
  });
  const activity = useQuery({
    queryKey: auditKey,
    queryFn: () => listAuditLogs({ data: { page: 1 } }),
    retry: false,
  });

  const retryAll = () => {
    queryClient.invalidateQueries({ queryKey: metricsKey });
    queryClient.invalidateQueries({ queryKey: auditKey });
  };

  const shell = (content: ReactNode) => (
    <AdminShell title={s.title} subtitle={s.subtitle}>
      {content}
    </AdminShell>
  );

  if (metrics.isPending || metrics.data === undefined) {
    return shell(
      <div className="space-y-6">
        <TableSkeleton />
      </div>,
    );
  }

  if (metrics.isError) {
    const error = metrics.error;
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return shell(
      <div role="alert" className="border border-destructive/40 bg-destructive/5 p-6">
        <p className="font-medium text-destructive">{s.loadingError}</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-small text-destructive">{message}</pre>
        <Button className="mt-4" onClick={retryAll}>
          <RefreshCw className="size-4" /> {s.retry}
        </Button>
      </div>,
    );
  }

  const m = metrics.data;
  const failedTables = m.diagnostics.filter((d) => !d.ok);
  const pendingOrdersCount =
    m.statusBreakdown.find((entry) => entry.status === "pending")?.count ?? 0;

  type AttentionItem =
    | { key: string; icon: LucideIcon; label: string; count: number; to: "/admin/applications"; search: { q: string; status: string; page: number; application: string } }
    | { key: string; icon: LucideIcon; label: string; count: number; to: "/admin/products"; search: { q: string; moderation: string; status: string; sellerId: string; page: number; create: string } }
    | { key: string; icon: LucideIcon; label: string; count: number; to: "/admin/settlements"; search: { status: string; sellerId: string; page: number } }
    | { key: string; icon: LucideIcon; label: string; count: number; to: "/admin/orders"; search: { q: string; status: string; sellerId: string; wilaya: string; paymentMethod: string; minTotal: string; maxTotal: string; from: string; to: string; page: number } };
  const attention: Array<AttentionItem> = [
    { key: "applications", icon: FileText, label: s.applications, count: m.metrics.pendingApplications, to: "/admin/applications", search: { q: "", status: "pending", page: 1, application: "" } },
    { key: "moderation", icon: ShieldCheck, label: s.moderation, count: m.metrics.pendingModeration, to: "/admin/products", search: { q: "", moderation: "pending", status: "all", sellerId: "all", page: 1, create: "" } },
    { key: "settlements", icon: Wallet, label: s.settlements, count: m.metrics.pendingSettlementsCount, to: "/admin/settlements", search: { status: "pending", sellerId: "all", page: 1 } },
    { key: "lowStock", icon: PackageMinus, label: s.lowStock, count: m.metrics.lowStock + m.metrics.outOfStock, to: "/admin/products", search: { q: "", moderation: "all", status: "all", sellerId: "all", page: 1, create: "" } },
    { key: "failedDeliveries", icon: Truck, label: s.failedDeliveries, count: m.metrics.failedDeliveryCount, to: "/admin/orders", search: { q: "", status: "failed_delivery", sellerId: "", wilaya: "", paymentMethod: "", minTotal: "", maxTotal: "", from: "", to: "", page: 1 } },
  ];
  const attentionTotal = attention.reduce((sum, item) => sum + item.count, 0);

  type QuickAction =
    | { key: string; icon: LucideIcon; label: string; to: "/admin/orders"; search: { q: string; status: string; sellerId: string; wilaya: string; paymentMethod: string; minTotal: string; maxTotal: string; from: string; to: string; page: number } }
    | { key: string; icon: LucideIcon; label: string; to: "/admin/applications"; search: { q: string; status: string; page: number; application: string } }
    | { key: string; icon: LucideIcon; label: string; to: "/admin/products"; search: { q: string; moderation: string; status: string; sellerId: string; page: number; create: string } }
    | { key: string; icon: LucideIcon; label: string; to: "/admin/settlements"; search: { status: string; sellerId: string; page: number } }
    | { key: string; icon: LucideIcon; label: string; to: "/admin/homepage/builder"; search: { locale: SupportedLocale; create: string } };
  const quickActions: Array<QuickAction> = [
    { key: "orders", icon: ClipboardList, label: s.reviewOrders, to: "/admin/orders", search: { q: "", status: "", sellerId: "", wilaya: "", paymentMethod: "", minTotal: "", maxTotal: "", from: "", to: "", page: 1 } },
    { key: "applications", icon: Users, label: s.reviewApplications, to: "/admin/applications", search: { q: "", status: "all", page: 1, application: "" } },
    { key: "products", icon: Package, label: s.moderateProducts, to: "/admin/products", search: { q: "", moderation: "pending", status: "all", sellerId: "all", page: 1, create: "" } },
    { key: "settlements", icon: Wallet, label: s.reviewSettlements, to: "/admin/settlements", search: { status: "all", sellerId: "all", page: 1 } },
    { key: "homepage", icon: LayoutGrid, label: s.homepage, to: "/admin/homepage/builder", search: { locale, create: "" } },
  ];

  type CreateAction =
    | { key: string; icon: LucideIcon; label: string; to: "/admin/products"; search: { q: string; moderation: string; status: string; sellerId: string; page: number; create: string } }
    | { key: string; icon: LucideIcon; label: string; to: "/admin/sellers"; search: { q: string; status: string; page: number; create: string } }
    | { key: string; icon: LucideIcon; label: string; to: "/admin/stores"; search: { q: string; page: number; create: string } }
    | { key: string; icon: LucideIcon; label: string; to: "/admin/coupons"; search: { q: string; page: number; create: string } };
  const createActions: Array<CreateAction> = [
    { key: "create-product", icon: Plus, label: "Create Product", to: "/admin/products", search: { q: "", moderation: "all", status: "all", sellerId: "all", page: 1, create: "product" } },
    { key: "create-seller", icon: Plus, label: "Create Seller", to: "/admin/sellers", search: { q: "", status: "all", page: 1, create: "seller" } },
    { key: "create-store", icon: Plus, label: "Create Store", to: "/admin/stores", search: { q: "", page: 1, create: "store" } },
    { key: "create-coupon", icon: Plus, label: "Create Coupon", to: "/admin/coupons", search: { q: "", page: 1, create: "coupon" } },
  ];

  const activityLogs = (activity.data?.logs ?? []).slice(0, 8);

  return shell(
    <>
      {failedTables.length > 0 ? (
        <div role="alert" className="mb-6 border border-amber-500/50 bg-amber-500/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4" />
              {s.incomplete(failedTables.length)}
            </p>
            <Button size="sm" variant="outline" onClick={retryAll}>
              <RefreshCw className="size-3.5" /> {s.retry}
            </Button>
          </div>
          <ul className="mt-3 space-y-1">
            {failedTables.map((diagnostic) => (
              <li key={diagnostic.table} className="text-small text-amber-900/80 dark:text-amber-200/80">
                <code className="font-mono text-xs">{diagnostic.table}</code>
                {diagnostic.message ? `: ${diagnostic.message}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ------------------------------ Today ------------------------------ */}
      <section aria-label={s.today}>
        <div className="mb-4">
          <h2 className="text-h3">{s.today}</h2>
          <p className="mt-0.5 text-caption text-muted-foreground">{s.todayHint}</p>
        </div>
        <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={s.orders} value={String(m.metrics.ordersTotal)} hint={s.ordersHint} />
          <Stat label={s.revenue} value={fmtMoney(m.metrics.salesDelivered)} hint={s.revenueHint} />
          <Stat label={s.activeSellers} value={String(m.metrics.activeSellers)} />
          <Stat label={s.pendingOrders} value={String(pendingOrdersCount)} hint={s.pendingOrdersHint} />
        </div>
      </section>

      {/* -------------------------- Needs attention ------------------------- */}
      <section aria-label={s.needsAttention} className="mt-10">
        <h2 className="mb-4 text-h3">{s.needsAttention}</h2>
        {attentionTotal > 0 ? (
          <div className="divide-y divide-border border border-border bg-card">
            {attention.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                search={item.search}
                className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:px-5"
              >
                <item.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-small font-semibold tabular-nums ${
                    item.count > 0 ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.count}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        ) : (
          <p className="border border-border bg-card px-5 py-8 text-small text-muted-foreground">{s.allClear}</p>
        )}
      </section>

      {/* ----------------------------- Sales chart --------------------------- */}
      <section aria-label={s.sales} className="mt-10">
        <AdminCard title={s.sales} subtitle={s.salesSubtitle}>
          <SalesChart data={m.series} />
        </AdminCard>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-5">
        {/* --------------------------- Recent activity ------------------------ */}
        <AdminCard
          title={s.recentActivity}
          subtitle={s.recentActivitySubtitle}
          className="lg:col-span-3"
        >
          {activity.isPending ? (
            <TableSkeleton rows={5} />
          ) : activity.isError ? (
            <EmptyState
              title={s.failedToLoad}
              text={activity.error instanceof Error ? activity.error.message : undefined}
            />
          ) : activityLogs.length > 0 ? (
            <div>
              <ul className="divide-y divide-border">
                {activityLogs.map((log) => (
                  <li key={log.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-small font-medium">{log.action.replace(/_/g, " ")}</p>
                      <p className="text-caption text-muted-foreground">
                        <StatusPill status={log.resource ?? ""} className="mr-1.5" />
                        {fmtDateTime(log.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                to="/admin/audit"
                search={{ action: "", resource: "", page: 1 }}
                className="mt-3 inline-flex items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline"
              >
                {s.viewAllAudit} <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          ) : (
            <EmptyState title={s.noActivity} text={s.noActivityText} />
          )}
        </AdminCard>

        {/* --------------------------- Quick actions -------------------------- */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-h3">{s.quickActions}</h2>
          <div className="grid gap-3">
            {createActions.map((action) => (
              <Link
                key={action.key}
                to={action.to}
                search={action.search}
                className="flex items-center gap-3 border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:border-primary/60 hover:bg-primary/10"
              >
                <action.icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="flex-1 text-small font-medium">{action.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
            {quickActions.map((action) => (
              <Link
                key={action.key}
                to={action.to}
                search={action.search}
                className="flex items-center gap-3 border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <action.icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="flex-1 text-small font-medium">{action.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>,
  );
}
