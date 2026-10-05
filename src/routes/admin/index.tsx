import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, Check, Copy, PackageCheck, RefreshCw, Save, ShieldCheck, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getAdminDashboard, approveSellerApplication, moderateProduct, updateHomepageSection } from "@/lib/admin.functions";
import { getSiteSettings, updateSiteSettings } from "@/lib/engagement.functions";
import { supabase } from "@/integrations/supabase/client";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { formatPrice } from "@/lib/localization";

const adminDashboardKey = ["admin-dashboard"] as const;
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
  const t = getTranslations(locale);
  const queryClient = useQueryClient();
  const [sessionReady, setSessionReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setSessionReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const dashboard = useQuery({
    queryKey: adminDashboardKey,
    queryFn: () => getAdminDashboard(),
    enabled: sessionReady && session !== null,
    retry: false,
  });

  const retryDashboard = () => queryClient.invalidateQueries({ queryKey: adminDashboardKey });

  if (!sessionReady) return <AdminAccessState locale={locale} t={t} state="checking" />;
  if (session === null) return <AdminAccessState locale={locale} t={t} state="signed-out" />;

  if (dashboard.isError) {
    const message = dashboard.error instanceof Error ? dashboard.error.message : String(dashboard.error);
    if (/forbidden/i.test(message)) {
      return (
        <AdminAccessState
          locale={locale}
          t={t}
          state="denied"
          email={session.user.email ?? null}
          userId={session.user.id}
        />
      );
    }
    return <AdminAccessState locale={locale} t={t} state="error" message={message} onRetry={retryDashboard} />;
  }

  if (dashboard.isPending || !dashboard.data) {
    return <AdminAccessState locale={locale} t={t} state="loading" />;
  }

  return <AdminControlCenter locale={locale} t={t} data={dashboard.data} onRetry={retryDashboard} />;
}

type AccessState = "checking" | "loading" | "signed-out" | "denied" | "error";

function AdminAccessState({
  locale,
  t,
  state,
  message,
  email,
  userId,
  onRetry,
}: {
  locale: ReturnType<typeof getLocale>;
  t: ReturnType<typeof getTranslations>;
  state: AccessState;
  message?: string;
  email?: string | null | undefined;
  userId?: string | null | undefined;
  onRetry?: () => void;
}) {
  const isBusy = state === "checking" || state === "loading";
  const title =
    state === "checking"
      ? "Checking secure access"
      : state === "loading"
        ? "Loading dashboard data"
        : state === "signed-out"
          ? "Admin sign-in required"
          : state === "denied"
            ? "Admin access restricted"
            : "Dashboard failed to load";
  const copy =
    state === "checking"
      ? "Please wait while Modalia verifies your session."
      : state === "loading"
        ? "Fetching marketplace data from the secure admin service."
        : state === "signed-out"
          ? "Sign in with an administrator account to access the Modalia Control Center."
          : state === "denied"
            ? "Your account is signed in, but it does not hold the Super Admin role. The server denied access (Forbidden). Follow the steps below to grant the role, then reload this page."
            : "The dashboard could not be loaded. The real error from the server is shown below.";

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-xl items-center px-4 py-12">
        <section className="w-full border border-border bg-card p-7 sm:p-10">
          <div className="flex size-11 items-center justify-center rounded-md bg-muted text-foreground">
            {isBusy ? <ShieldCheck className="size-5 animate-pulse" /> : <AlertCircle className="size-5" />}
          </div>
          <p className="mt-7 text-eyebrow text-muted-foreground">MODALIA CONTROL CENTER</p>
          <h1 className="mt-2 text-display">{title}</h1>
          <p className="mt-4 max-w-lg text-body leading-7 text-muted-foreground">{copy}</p>

          {state === "denied" ? <SuperAdminGrantHelp email={email} userId={userId} /> : null}

          {state === "error" && message ? (
            <div className="mt-6 border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-caption font-semibold text-destructive">Server error</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-small text-destructive">{message}</pre>
            </div>
          ) : null}

          {!isBusy ? (
            <div className="mt-8 flex flex-wrap gap-3">
              {state === "signed-out" ? <Button asChild><Link to="/auth" search={{ locale }}>Sign in <ArrowRight className="size-4" /></Link></Button> : null}
              {state === "error" ? (
                <Button onClick={onRetry}><RefreshCw className="size-4" /> Retry</Button>
              ) : null}
              <Button asChild variant="outline"><Link to="/" search={{ locale }}>Return to Modalia</Link></Button>
            </div>
          ) : null}
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}

function SuperAdminGrantHelp({ email, userId }: { email?: string | null | undefined; userId?: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  const snippet = [
    "-- Run in the Supabase Dashboard -> SQL Editor, signed in as the project owner.",
    "-- Grants the super_admin role to this account (idempotent, safe to re-run).",
    "INSERT INTO public.user_roles (user_id, role)",
    `VALUES ('${userId ?? "PASTE_USER_ID_HERE"}', 'super_admin')`,
    "ON CONFLICT (user_id, role) DO NOTHING;",
    "",
    "-- Verify the grant:",
    "SELECT user_id, role, created_at",
    "FROM public.user_roles",
    `WHERE user_id = '${userId ?? "PASTE_USER_ID_HERE"}';`,
  ].join("\n");

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (non-secure context); the snippet is still selectable above.
    }
  };

  return (
    <div className="mt-6 space-y-4 border border-border bg-muted/40 p-5">
      <div>
        <p className="text-caption font-semibold text-foreground">Signed in as</p>
        <p className="mt-1 break-all text-small text-muted-foreground">{email ?? "unknown email"}</p>
        {userId ? <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{userId}</p> : null}
      </div>
      <div>
        <p className="text-caption font-semibold text-foreground">How to fix this yourself</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-small leading-6 text-muted-foreground">
          <li>Open the Supabase Dashboard for this project and go to <strong>SQL Editor</strong>.</li>
          <li>Copy the snippet below and run it. It inserts one row into <code className="font-mono text-xs">public.user_roles</code>.</li>
          <li>Come back here and reload the page.</li>
        </ol>
      </div>
      <div className="border border-border bg-background">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-caption text-muted-foreground">Copy-ready SQL</p>
          <Button size="sm" variant="outline" onClick={copySnippet}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-5">{snippet}</pre>
      </div>
      <p className="text-caption leading-5 text-muted-foreground">
        Keep super admins to the smallest number of people you fully trust. A ready-to-run
        version with full instructions is also saved at <code className="font-mono text-xs">supabase/super_admin_bootstrap.sql</code>.
      </p>
    </div>
  );
}

function AdminControlCenter({
  locale,
  t,
  data,
  onRetry,
}: {
  locale: ReturnType<typeof getLocale>;
  t: ReturnType<typeof getTranslations>;
  data: Awaited<ReturnType<typeof getAdminDashboard>>;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: (applicationId: string) => approveSellerApplication({ data: { applicationId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminDashboardKey }),
  });
  const home = useMutation({
    mutationFn: (payload: { sectionId: string; enabled: boolean }) => updateHomepageSection({ data: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminDashboardKey }),
  });
  const moderate = useMutation({
    mutationFn: (payload: { productId: string; decision: "approve" | "reject" | "hide" }) => moderateProduct({ data: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminDashboardKey }),
  });
  const pendingApplications = data.applications.filter((application) => application.status === "pending");
  const pendingProducts = data.products.filter((product) => product.moderation_status === "pending");
  const failedTables = data.diagnostics.filter((diagnostic) => !diagnostic.ok);

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {failedTables.length > 0 ? (
          <div role="alert" className="mb-6 border border-amber-500/50 bg-amber-500/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-4" />
                {failedTables.length} of {data.diagnostics.length} data sources failed to load — figures below may be incomplete.
              </p>
              <Button size="sm" variant="outline" onClick={onRetry}>
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

        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
          <div>
            <p className="text-eyebrow text-muted-foreground">Private operations workspace</p>
            <h1 className="mt-2 text-display">Control Center</h1>
            <p className="mt-3 max-w-2xl text-body text-muted-foreground">Live marketplace operations, moderation and content controls.</p>
          </div>
          <div className="flex items-center gap-2 border border-border px-3 py-2 text-caption text-muted-foreground"><ShieldCheck className="size-4" /> Server-authorized</div>
        </header>

        <section aria-label="Marketplace overview" className="mt-7 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric icon={Users} label="Active sellers" value={String(data.sellers.filter((seller) => seller.account_status === "active").length)} />
          <Metric icon={Store} label="Applications" value={String(pendingApplications.length)} />
          <Metric icon={PackageCheck} label="Products" value={String(data.products.length)} />
          <Metric icon={ShoppingBag} label="Orders" value={String(data.orders.length)} />
          <Metric icon={Wallet} label="Order value" value={formatPrice(data.orders.reduce((total, order) => total + Number(order.grand_total || 0), 0), locale)} />
          <Metric icon={ShieldCheck} label="Review queue" value={String(data.reviews.filter((review) => review.moderation_status !== "approved").length)} />
        </section>

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
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
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

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="bg-card p-4"><Icon className="size-4 text-muted-foreground" /><p className="mt-6 text-caption text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-semibold">{value}</p></div>;
}
