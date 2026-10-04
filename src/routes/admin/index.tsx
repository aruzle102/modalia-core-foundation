import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, PackageCheck, ShieldCheck, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getAdminDashboard, approveSellerApplication, moderateProduct, updateHomepageSection } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { formatPrice } from "@/lib/localization";

const adminDashboardKey = ["admin-dashboard"] as const;

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
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(Boolean(session));
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
    enabled: sessionReady && signedIn,
    retry: false,
  });

  if (!sessionReady) return <AdminAccessState locale={locale} t={t} state="checking" />;
  if (!signedIn) return <AdminAccessState locale={locale} t={t} state="signed-out" />;
  if (dashboard.isError) return <AdminAccessState locale={locale} t={t} state="denied" />;
  if (!dashboard.data) return <AdminAccessState locale={locale} t={t} state="checking" />;

  return <AdminControlCenter locale={locale} t={t} data={dashboard.data} />;
}

function AdminAccessState({ locale, t, state }: { locale: ReturnType<typeof getLocale>; t: ReturnType<typeof getTranslations>; state: "checking" | "signed-out" | "denied" }) {
  const isChecking = state === "checking";
  const isSignedOut = state === "signed-out";
  const title = isChecking ? "Checking secure access" : isSignedOut ? "Admin sign-in required" : "Admin access restricted";
  const copy = isChecking
    ? "Please wait while Modalia verifies your session."
    : isSignedOut
      ? "Sign in with an administrator account to access the Modalia Control Center."
      : "Your account is signed in but does not have Super Admin access. Contact the Modalia owner if this seems incorrect.";

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-xl items-center px-4 py-12">
        <section className="w-full border border-border bg-card p-7 sm:p-10">
          <div className="flex size-11 items-center justify-center rounded-md bg-muted text-foreground">
            {isChecking ? <ShieldCheck className="size-5 animate-pulse" /> : <AlertCircle className="size-5" />}
          </div>
          <p className="mt-7 text-eyebrow text-muted-foreground">MODALIA CONTROL CENTER</p>
          <h1 className="mt-2 text-display">{title}</h1>
          <p className="mt-4 max-w-lg text-body leading-7 text-muted-foreground">{copy}</p>
          {!isChecking ? (
            <div className="mt-8 flex flex-wrap gap-3">
              {isSignedOut ? <Button asChild><Link to="/auth" search={{ locale }}>Sign in <ArrowRight className="size-4" /></Link></Button> : null}
              <Button asChild variant="outline"><Link to="/" search={{ locale }}>Return to Modalia</Link></Button>
            </div>
          ) : null}
        </section>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}

function AdminControlCenter({ locale, t, data }: { locale: ReturnType<typeof getLocale>; t: ReturnType<typeof getTranslations>; data: Awaited<ReturnType<typeof getAdminDashboard>> }) {
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

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
              {pendingProducts.slice(0, 12).map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-medium">{product.name?.[locale] ?? product.name?.fr ?? product.slug}</p><p className="text-caption text-muted-foreground">{formatPrice(Number(product.base_price), locale)}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => moderate.mutate({ productId: product.id, decision: "approve" })}>Approve</Button><Button size="sm" variant="outline" onClick={() => moderate.mutate({ productId: product.id, decision: "reject" })}>Reject</Button></div></div>)}
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
      </main>
      <SiteFooter t={t} />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="bg-card p-4"><Icon className="size-4 text-muted-foreground" /><p className="mt-6 text-caption text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-semibold">{value}</p></div>;
}