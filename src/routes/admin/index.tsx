import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, Stat, StatusPill, EmptyState, TableSkeleton, fmtMoney, fmtDate } from "@/components/admin/ui";
import { SalesChart, DonutChart, TopList } from "@/components/admin/Charts";
import { getAdminDashboard, approveSellerApplication, moderateProduct, updateHomepageSection } from "@/lib/admin.functions";
import { getAdminMetrics } from "@/lib/admin-dashboard.functions";
import { getSiteSettings, updateSiteSettings } from "@/lib/engagement.functions";
import { getLocale } from "@/lib/i18n";
import { formatPrice } from "@/lib/localization";

const adminDashboardKey = ["admin-dashboard"] as const;
const adminMetricsKey = ["admin-metrics"] as const;
const siteSettingsKey = ["site-settings"] as const;

const SITE_SETTING_FIELDS = [
  { key: "contact_email", label: "Contact email", type: "email", placeholder: "contact@modalia.dz" },
  { key: "contact_phone", label: "Contact phone", type: "tel", placeholder: "+213 ..." },
  { key: "contact_address", label: "Contact address", type: "text", placeholder: "Algiers, Algeria" },
  { key: "contact_hours", label: "Contact hours", type: "text", placeholder: "Sat–Thu, 9:00–18:00" },
  { key: "instagram_url", label: "Instagram URL", type: "url", placeholder: "https://instagram.com/..." },
  { key: "facebook_url", label: "Facebook URL", type: "url", placeholder: "https://facebook.com/..." },
  { key: "tiktok_url", label: "TikTok URL", type: "url", placeholder: "https://tiktok.com/@..." },
  { key: "whatsapp_number", label: "WhatsApp number", type: "tel", placeholder: "+213 ..." },
] as const;

const URL_SETTING_KEYS = ["instagram_url", "facebook_url", "tiktok_url"] as const;

function validateSiteSettings(values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = (values["contact_email"] ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors["contact_email"] = "Enter a valid email address.";
  }
  for (const key of URL_SETTING_KEYS) {
    const url = (values[key] ?? "").trim();
    if (url && !/^https:\/\//i.test(url)) {
      errors[key] = "URL must start with https://";
    }
  }
  return errors;
}

export const Route = createFileRoute("/admin/")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [
      { title: "Admin Control Center — Modalia" },
      { name: "description", content: "Secure Modalia operations control center for authorized administrators." },
      { property: "og:title", content: "Admin Control Center — Modalia" },
      { property: "og:description", content: "Secure Modalia operations control center for authorized administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { locale } = Route.useSearch();
  return (
    <AdminGate>
      <DashboardContent locale={locale} />
    </AdminGate>
  );
}

type Locale = ReturnType<typeof getLocale>;

function DashboardContent({ locale }: { locale: Locale }) {
  const queryClient = useQueryClient();

  const dashboard = useQuery({
    queryKey: adminDashboardKey,
    queryFn: () => getAdminDashboard(),
    retry: false,
  });
  const metrics = useQuery({
    queryKey: adminMetricsKey,
    queryFn: () => getAdminMetrics(),
    retry: false,
  });

  const retryAll = () => {
    queryClient.invalidateQueries({ queryKey: adminDashboardKey });
    queryClient.invalidateQueries({ queryKey: adminMetricsKey });
  };

  const approve = useMutation({
    mutationFn: (applicationId: string) => approveSellerApplication({ data: { applicationId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminDashboardKey });
      queryClient.invalidateQueries({ queryKey: adminMetricsKey });
    },
  });
  const home = useMutation({
    mutationFn: (payload: { sectionId: string; enabled: boolean }) => updateHomepageSection({ data: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminDashboardKey }),
  });
  const moderate = useMutation({
    mutationFn: (payload: { productId: string; decision: "approve" | "reject" | "hide" }) => moderateProduct({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminDashboardKey });
      queryClient.invalidateQueries({ queryKey: adminMetricsKey });
    },
  });

  const failedDashboardTables = (dashboard.data?.diagnostics ?? []).filter((d) => !d.ok);
  const failedMetricTables = (metrics.data?.diagnostics ?? []).filter((d) => !d.ok);
  const failedTables = [...failedDashboardTables, ...failedMetricTables];

  const shell = (content: ReactNode) => (
    <AdminShell title="Dashboard" subtitle="Live marketplace operations, moderation and content controls.">
      {content}
    </AdminShell>
  );

  if (dashboard.isPending || metrics.isPending || !dashboard.data || !metrics.data) {
    return shell(
      <div className="space-y-6">
        <TableSkeleton />
      </div>,
    );
  }

  if (dashboard.isError || metrics.isError) {
    const error = dashboard.error ?? metrics.error;
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return shell(
      <div role="alert" className="border border-destructive/40 bg-destructive/5 p-6">
        <p className="font-medium text-destructive">Dashboard failed to load</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-small text-destructive">{message}</pre>
        <Button className="mt-4" onClick={retryAll}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>,
    );
  }

  const data = dashboard.data;
  const m = metrics.data;
  const pendingApplications = data.applications.filter((application) => application.status === "pending");
  const pendingProducts = data.products.filter((product) => product.moderation_status === "pending");

  return shell(
    <>
      {failedTables.length > 0 ? (
        <div role="alert" className="mb-6 border border-amber-500/50 bg-amber-500/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4" />
              {failedTables.length} data source{failedTables.length === 1 ? "" : "s"} failed to load — figures below may be incomplete.
            </p>
            <Button size="sm" variant="outline" onClick={retryAll}>
              <RefreshCw className="size-3.5" /> Retry
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

      <OperationsOverview locale={locale} metrics={m} />

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section className="border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-eyebrow text-muted-foreground">Approval queue</p><h2 className="mt-1 text-h3">Seller applications</h2></div><span className="text-caption text-muted-foreground">{pendingApplications.length} pending</span></div>
          <div className="mt-5 divide-y divide-border">
            {pendingApplications.map((application) => <div key={application.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-medium">{application.proposed_store_name}</p><p className="text-caption text-muted-foreground">{application.first_name} {application.last_name} · {application.email}</p></div><Button size="sm" onClick={() => approve.mutate(application.id)} disabled={approve.isPending}>Approve</Button></div>)}
            {!pendingApplications.length ? <p className="py-8 text-small text-muted-foreground">No seller applications are waiting for review.</p> : null}
          </div>
        </section>
        <section className="border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-eyebrow text-muted-foreground">Trust &amp; safety</p><h2 className="mt-1 text-h3">Product moderation</h2></div><span className="text-caption text-muted-foreground">{pendingProducts.length} pending</span></div>
          <div className="mt-5 divide-y divide-border">
            {pendingProducts.slice(0, 12).map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-medium">{product.name?.[locale] ?? product.name?.["fr"] ?? product.slug}</p><p className="text-caption text-muted-foreground">{formatPrice(Number(product.base_price), locale)}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => moderate.mutate({ productId: product.id, decision: "approve" })}>Approve</Button><Button size="sm" variant="outline" onClick={() => moderate.mutate({ productId: product.id, decision: "reject" })}>Reject</Button></div></div>)}
            {!pendingProducts.length ? <p className="py-8 text-small text-muted-foreground">No products are waiting for moderation.</p> : null}
          </div>
        </section>
      </div>

      <section className="mt-8 border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-eyebrow text-muted-foreground">Homepage builder</p><h2 className="mt-1 text-h3">Live sections</h2></div><p className="text-caption text-muted-foreground">Changes are applied to the customer homepage.</p></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.homepage.map((section) => <div key={section.id} className="flex items-center justify-between gap-3 border border-border p-4"><div><p className="font-medium">{section.section_key}</p><p className="text-caption text-muted-foreground">{section.kind}</p></div><Button size="sm" variant={section.enabled ? "default" : "outline"} onClick={() => home.mutate({ sectionId: section.id, enabled: !section.enabled })} disabled={home.isPending}>{section.enabled ? "Enabled" : "Disabled"}</Button></div>)}
        </div>
      </section>

      <SiteSettingsSection />
    </>,
  );
}

function OperationsOverview({ locale, metrics: m }: { locale: Locale; metrics: Awaited<ReturnType<typeof getAdminMetrics>> }) {
  const stats = [
    { label: "Orders", value: String(m.metrics.ordersTotal), hint: "Parent orders, all statuses" },
    { label: "Sales (delivered)", value: fmtMoney(m.metrics.salesDelivered), hint: "SUM(grand_total), status = delivered" },
    { label: "Commission payable", value: fmtMoney(m.metrics.commissionPayable), hint: "SUM(commission_total), delivered + fulfilled only" },
    { label: "Pending settlements", value: `${m.metrics.pendingSettlementsCount} · ${fmtMoney(m.metrics.pendingSettlementsAmount)}`, hint: "seller_settlements status = pending" },
    { label: "Active sellers", value: String(m.metrics.activeSellers), hint: "sellers.account_status = active" },
    { label: "Pending applications", value: String(m.metrics.pendingApplications), hint: "seller_applications status = pending" },
    { label: "Pending moderation", value: String(m.metrics.pendingModeration), hint: "products.moderation_status ≠ approved" },
    { label: "Low stock", value: String(m.metrics.lowStock), hint: "inventory: 0 < qty ≤ low_stock_threshold" },
    { label: "Out of stock", value: String(m.metrics.outOfStock), hint: "inventory: qty ≤ 0" },
    { label: "Returns", value: String(m.metrics.returnsCount), hint: "order_returns, all statuses" },
    { label: "Cancelled", value: String(m.metrics.cancelledCount), hint: "orders.status = cancelled" },
    { label: "Failed deliveries", value: String(m.metrics.failedDeliveryCount), hint: "orders.status = failed_delivery" },
  ];

  return (
    <section aria-label="Operations overview">
      <div className="mb-5">
        <p className="text-eyebrow text-muted-foreground">Operations overview</p>
        <h2 className="mt-1 text-h3">Marketplace health</h2>
      </div>

      <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stats.map((stat) => (
          <Stat key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <AdminCard title="Sales & orders" subtitle="Last 30 days, daily" className="lg:col-span-2">
          <SalesChart data={m.series} />
        </AdminCard>
        <AdminCard title="Order status" subtitle="Current distribution">
          <DonutChart data={m.statusBreakdown.map((s) => ({ label: s.status.replace(/_/g, " "), value: s.count }))} />
        </AdminCard>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <AdminCard title="Top products" subtitle="By order_items total">
          <TopList title="Top products by sales" rows={m.topProducts} />
        </AdminCard>
        <AdminCard title="Top sellers" subtitle="Delivered seller_orders subtotal">
          <TopList title="Top sellers by delivered subtotal" rows={m.topSellers} />
        </AdminCard>
        <AdminCard title="Top categories" subtitle="By product count">
          <TopList title="Top categories by product count" rows={m.topCategories} />
        </AdminCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <AdminCard title="Recent orders" subtitle="Latest 8 parent orders" className="xl:col-span-2">
          {m.recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Order</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Customer</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Total</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                    <th scope="col" className="py-2 font-medium">Placed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {m.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="py-2.5 pr-4">
                        <a href={`/admin/orders/${order.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {order.orderNumber}
                        </a>
                      </td>
                      <td className="py-2.5 pr-4">{order.customer}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{fmtMoney(order.total)}</td>
                      <td className="py-2.5 pr-4"><StatusPill status={order.status} /></td>
                      <td className="py-2.5 text-muted-foreground">{fmtDate(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No orders yet" text="Recent orders will appear here once customers start ordering." />
          )}
        </AdminCard>

        <div className="space-y-6">
          <AdminCard title="Low-stock alerts" subtitle={`${m.lowStock.length} item${m.lowStock.length === 1 ? "" : "s"} at or below threshold`}>
            {m.lowStock.length > 0 ? (
              <ul className="divide-y divide-border">
                {m.lowStock.map((item) => (
                  <li key={`${item.variantSku}`} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-small font-medium">{item.productName}</p>
                      <p className="text-caption text-muted-foreground">SKU {item.variantSku} · threshold {item.threshold}</p>
                    </div>
                    <StatusPill status={item.outOfStock ? "out of stock" : "low stock"} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Stock looks healthy" text="No variants are at or below their low-stock threshold." />
            )}
          </AdminCard>

          <AdminCard title="Settlement alerts" subtitle={`${m.metrics.pendingSettlementsCount} pending`}>
            {m.pendingSettlements.length > 0 ? (
              <ul className="divide-y divide-border">
                {m.pendingSettlements.slice(0, 6).map((settlement) => (
                  <li key={settlement.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-small font-medium">{settlement.sellerName}</p>
                      <p className="text-caption text-muted-foreground">
                        {settlement.periodStart && settlement.periodEnd
                          ? `${fmtDate(settlement.periodStart)} → ${fmtDate(settlement.periodEnd)}`
                          : `Opened ${fmtDate(settlement.createdAt)}`}
                      </p>
                    </div>
                    <p className="shrink-0 text-small font-semibold tabular-nums">{fmtMoney(settlement.amount)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No pending settlements" text="Sellers are fully settled up." />
            )}
          </AdminCard>
        </div>
      </div>
    </section>
  );
}

function SiteSettingsSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: siteSettingsKey,
    queryFn: () => getSiteSettings(),
    retry: false,
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !touched) {
      setValues({ ...settingsQuery.data.settings });
    }
  }, [settingsQuery.data, touched]);

  const save = useMutation({
    mutationFn: (settings: Record<string, string>) => updateSiteSettings({ data: { settings } }),
    onSuccess: () => {
      toast.success("Site settings saved.");
      queryClient.invalidateQueries({ queryKey: siteSettingsKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    },
  });

  const errors = validateSiteSettings(values);
  const hasErrors = Object.keys(errors).length > 0;

  const setValue = (key: string, value: string) => {
    setTouched(true);
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = () => {
    if (hasErrors || save.isPending) return;
    const trimmed = Object.fromEntries(
      SITE_SETTING_FIELDS.map(({ key }) => [key, (values[key] ?? "").trim()]),
    );
    save.mutate(trimmed);
  };

  return (
    <section className="mt-8 border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow text-muted-foreground">Storefront content</p>
          <h2 className="mt-1 text-h3">Site settings &amp; contact info</h2>
        </div>
        <p className="text-caption text-muted-foreground">Shown on the contact page and site footer.</p>
      </div>

      {settingsQuery.isPending ? (
        <p className="py-8 text-small text-muted-foreground">Loading current settings…</p>
      ) : settingsQuery.isError ? (
        <div className="mt-5 border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-small text-destructive">
            Could not load site settings:{" "}
            {settingsQuery.error instanceof Error ? settingsQuery.error.message : "Unknown error."}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => settingsQuery.refetch()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </div>
      ) : (
        <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {SITE_SETTING_FIELDS.map(({ key, label, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`site-setting-${key}`}>{label}</Label>
                <Input
                  id={`site-setting-${key}`}
                  type={type}
                  dir="ltr"
                  placeholder={placeholder}
                  value={values[key] ?? ""}
                  onChange={(event) => setValue(key, event.target.value)}
                  aria-invalid={Boolean(errors[key])}
                />
                {errors[key] ? <p className="text-caption text-destructive">{errors[key]}</p> : null}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={hasErrors || save.isPending}>
              <Save className="size-4" />
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
            {hasErrors ? (
              <p className="text-caption text-destructive">Fix the highlighted fields before saving.</p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
