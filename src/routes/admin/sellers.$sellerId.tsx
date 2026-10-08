import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { strParam } from "@/hooks/use-url-state";
import { BackLink } from "@/components/routing/back-link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  Pencil,
  Power,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { pickName } from "./_shared";
import {
  AdminCard,
  Stat,
  StatusPill,
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  Field,
  fmtMoney,
  fmtDateTime,
  timeAgo,
} from "@/components/admin/ui";
import {
  getSellerProfile,
  getSellerMonthlyProfit,
  getSellerIdentity,
  getSellerCustomers,
  getSellerShipping,
  forceSellerPasswordReset,
  resetSellerOnboarding,
  updateSellerStatus,
  updateStoreVerification,
  updateCommissionRate,
} from "@/lib/admin-sellers.functions";
import {
  grantManualVerification,
  removeVerification,
  suspendSellerVerification,
} from "@/lib/verification.functions";
import { listAdminProducts } from "@/lib/admin-catalog.functions";
import { listAdminOrders } from "@/lib/admin-orders.functions";
import { createSupportSession } from "@/lib/admin-support.functions";
import { EditSellerDialog } from "@/components/admin/EditSellerDialog";
import { StaffPermissionsDialog, type StaffPermissionsInitial } from "@/components/admin/StaffPermissionsDialog";
import { useAdminT } from "@/components/admin/use-admin-t";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations, type SupportedLocale } from "@/lib/i18n";

const TABS = [
  "overview",
  "identity",
  "store",
  "products",
  "orders",
  "customers",
  "analytics",
  "commission",
  "settlements",
  "shipping",
  "staff",
  "reviews",
  "verification",
  "activity",
  "security",
] as const;

type TabId = (typeof TABS)[number];

function isTabId(value: string): value is TabId {
  return (TABS as readonly string[]).includes(value);
}

export const Route = createFileRoute("/admin/sellers/$sellerId")({
  validateSearch: (search: Record<string, unknown>) => ({
    back: strParam(search["back"]),
    tab: strParam(search["tab"], "overview"),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Seller Workspace — Modalia Admin" }],
  }),
  component: SellerWorkspacePage,
});

type Profile = Awaited<ReturnType<typeof getSellerProfile>>;

function productName(value: unknown, fallback: string): string {
  return pickName(value) || fallback;
}

function isOfficialStore(settings: unknown): boolean {
  return (
    !!settings &&
    typeof settings === "object" &&
    (settings as { official?: unknown })["official"] === true
  );
}

type ConfirmKind =
  | "suspend"
  | "disable"
  | "verify"
  | "unverify"
  | "resetOnboarding"
  | "forcePasswordReset"
  | "grantSellerVerification"
  | "removeSellerVerification"
  | "suspendSellerVerification";

function SellerWorkspacePage() {
  const { sellerId } = Route.useParams();
  const { back, tab: tabParam } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locale = useAdminLocale();
  const t = useAdminT().sellers;
  const common = getTranslations(locale).common;
  const p = t.profile;
  const navLabels = getTranslations(locale).adminNav.items;

  const tab: TabId = isTabId(tabParam) ? tabParam : "overview";
  const routeNavigate = Route.useNavigate();
  const setTab = (next: TabId) => {
    void routeNavigate({
      // The generated route types lag behind validateSearch; the runtime
      // shape is { back, tab }.
      search: { back, tab: next } as never,
      replace: true,
    });
  };

  const [confirmAction, setConfirmAction] = useState<null | {
    kind: ConfirmKind;
    title: string;
    description: string;
    confirmLabel: string;
  }>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffPermissionsInitial | null>(null);
  const [commissionInput, setCommissionInput] = useState("");

  const profileQuery = useQuery({
    queryKey: ["admin-seller-profile", sellerId],
    queryFn: () => getSellerProfile({ data: { sellerId } }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-seller-profile", sellerId] });
    queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });
  };

  const statusMutation = useMutation({
    mutationFn: (accountStatus: "pending" | "active" | "suspended" | "disabled") =>
      updateSellerStatus({ data: { sellerId, accountStatus } }),
    onSuccess: (res) => {
      toast.success(t.statusUpdated(res.accountStatus));
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      updateStoreVerification({
        data: { storeId: profile?.store?.id ?? "", verificationStatus: "verified" },
      }),
    onSuccess: () => {
      toast.success(p.verified);
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const unverifyMutation = useMutation({
    mutationFn: () =>
      updateStoreVerification({
        data: { storeId: profile?.store?.id ?? "", verificationStatus: "unverified" },
      }),
    onSuccess: () => {
      toast.success(p.unverified);
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  // ── Seller-level manual verification override (sellers.verification_state)
  const [sellerVerifyNote, setSellerVerifyNote] = useState("");

  const grantSellerVerificationMutation = useMutation({
    mutationFn: (note: string) =>
      grantManualVerification({ data: { sellerId, note: note.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Manual verification granted.");
      setConfirmAction(null);
      setSellerVerifyNote("");
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const removeSellerVerificationMutation = useMutation({
    mutationFn: () => removeVerification({ data: { sellerId } }),
    onSuccess: () => {
      toast.success("Verification removed.");
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const suspendSellerVerificationMutation = useMutation({
    mutationFn: () => suspendSellerVerification({ data: { sellerId } }),
    onSuccess: () => {
      toast.success("Verification suspended.");
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const commissionMutation = useMutation({
    mutationFn: (rate: number) => updateCommissionRate({ data: { sellerId, rate } }),
    onSuccess: (res) => {
      toast.success(p.rateUpdated((res.rate * 100).toFixed(1)));
      setCommissionInput("");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetOnboardingMutation = useMutation({
    mutationFn: () => resetSellerOnboarding({ data: { sellerId } }),
    onSuccess: () => {
      toast.success(p.onboardingReset);
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const forcePasswordResetMutation = useMutation({
    mutationFn: () => forceSellerPasswordReset({ data: { sellerId } }),
    onSuccess: () => {
      toast.success(p.passwordResetForced);
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const profile: Profile | undefined = profileQuery.data;
  const seller = profile?.seller;
  const store = profile?.store;

  const submitCommission = () => {
    const parsed = Number(commissionInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error(p.invalidRate);
      return;
    }
    commissionMutation.mutate(parsed);
  };

  const [supportOpening, setSupportOpening] = useState(false);
  const openSellerDashboard = async () => {
    setSupportOpening(true);
    try {
      const res = await createSupportSession({ data: { sellerId } });
      window.open(`/seller?support=${res.token}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the seller dashboard.");
    } finally {
      setSupportOpening(false);
    }
  };

  const handleConfirm = () => {
    const kind = confirmAction?.kind;
    if (kind === "suspend") statusMutation.mutate("suspended");
    else if (kind === "disable") statusMutation.mutate("disabled");
    else if (kind === "verify") verifyMutation.mutate();
    else if (kind === "unverify") unverifyMutation.mutate();
    else if (kind === "grantSellerVerification") grantSellerVerificationMutation.mutate(sellerVerifyNote);
    else if (kind === "removeSellerVerification") removeSellerVerificationMutation.mutate();
    else if (kind === "suspendSellerVerification") suspendSellerVerificationMutation.mutate();
    else if (kind === "resetOnboarding") resetOnboardingMutation.mutate();
    else if (kind === "forcePasswordReset") forcePasswordResetMutation.mutate();
  };

  const askConfirm = (kind: ConfirmKind, title: string, description: string, confirmLabel: string) =>
    setConfirmAction({ kind, title, description, confirmLabel });

  return (
    <AdminGate>
      <AdminShell
        title={store?.name ?? seller?.legal_name ?? p.couldNotLoad}
        subtitle={p.subtitle}
        breadcrumbs={[
          { label: navLabels.sellers, to: "/admin/sellers", search: { back } },
          { label: store?.name ?? seller?.legal_name ?? p.couldNotLoad },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <BackLink back={back} fallbackTo="/admin/sellers">
              <ArrowLeft className="size-4 me-1.5" />
              {p.backToSellers}
            </BackLink>
          </Button>
        }
      >
        {profileQuery.isLoading ? (
          <TableSkeleton rows={10} />
        ) : profileQuery.isError || !seller ? (
          <AdminCard title={p.couldNotLoad}>
            <EmptyState title={p.couldNotLoad} text={p.couldNotLoadDesc} />
          </AdminCard>
        ) : (
          <div className="space-y-6">
            {/* Header with Section 13 actions */}
            <AdminCard
              title={store?.name ?? seller.legal_name}
              subtitle={seller.email ?? ""}
              actions={
                <div className="flex flex-wrap gap-2">
                  {store?.slug && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/store/$slug" params={{ slug: store.slug }} search={{ locale }}>
                        <ExternalLink className="size-4 me-1.5" />
                        {p.viewPublicStore}
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={openSellerDashboard} disabled={supportOpening}>
                    <LayoutDashboard className="size-4 me-1.5" />
                    {p.openDashboard}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="size-4 me-1.5" />
                    {t.edit}
                  </Button>
                  {seller.account_status !== "active" && (
                    <Button size="sm" onClick={() => statusMutation.mutate("active")} disabled={statusMutation.isPending}>
                      <Power className="size-4 me-1.5" />
                      {p.activate}
                    </Button>
                  )}
                  {seller.account_status === "active" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => askConfirm("suspend", t.confirmSuspendTitle, t.confirmSuspendDesc, t.suspend)}
                      >
                        <Ban className="size-4 me-1.5" />
                        {t.suspend}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => askConfirm("disable", p.confirmDisableTitle, p.confirmDisableDesc, p.disableSeller)}
                      >
                        <Ban className="size-4 me-1.5" />
                        {p.disable}
                      </Button>
                    </>
                  )}
                  {store && store.verification_status === "unverified" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => askConfirm("verify", p.confirmVerifyTitle, p.confirmVerifyDesc(store.name), p.verifyStore)}
                    >
                      <ShieldCheck className="size-4 me-1.5" />
                      {p.verifyStore}
                    </Button>
                  )}
                  {store && store.verification_status === "verified" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => askConfirm("unverify", p.confirmUnverifyTitle, p.confirmUnverifyDesc(store.name), p.removeVerification)}
                    >
                      <ShieldX className="size-4 me-1.5" />
                      {p.unverifyStore}
                    </Button>
                  )}
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={seller.account_status} />
                {store && <StatusPill status={store.verification_status} />}
                {store && isOfficialStore(store.settings) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <BadgeCheck className="size-3.5" />
                    {p.officialStore} ✓
                  </span>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t.legalName}</dt>
                  <dd className="font-medium">{seller.legal_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{p.contact}</dt>
                  <dd>
                    <span className="block" dir="ltr">{seller.phone ?? "—"}</span>
                    <span className="block break-all text-muted-foreground" dir="ltr">
                      {seller.email ?? "—"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{p.sellerSince}</dt>
                  <dd title={fmtDateTime(seller.created_at, locale)}>{timeAgo(seller.created_at, locale)}</dd>
                </div>
              </dl>
            </AdminCard>

            {/* Tab navigation — URL param ?tab= */}
            <Tabs value={tab} onValueChange={(v) => isTabId(v) && setTab(v)}>
              <div className="overflow-x-auto">
                <TabsList>
                  {TABS.map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {p.tabs[id]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>

            {tab === "overview" && <OverviewTab profile={profile} sellerId={sellerId} locale={locale} />}
            {tab === "identity" && <IdentityTab sellerId={sellerId} locale={locale} />}
            {tab === "store" && <StoreTab profile={profile} locale={locale} />}
            {tab === "products" && <ProductsTab sellerId={sellerId} locale={locale} />}
            {tab === "orders" && <OrdersTab sellerId={sellerId} locale={locale} />}
            {tab === "customers" && <CustomersTab sellerId={sellerId} locale={locale} />}
            {tab === "analytics" && <AnalyticsTab profile={profile} sellerId={sellerId} locale={locale} />}
            {tab === "commission" && (
              <CommissionTab
                profile={profile}
                locale={locale}
                commissionInput={commissionInput}
                setCommissionInput={setCommissionInput}
                submitCommission={submitCommission}
                isPending={commissionMutation.isPending}
              />
            )}
            {tab === "settlements" && <SettlementsTab profile={profile} locale={locale} />}
            {tab === "shipping" && <ShippingTab sellerId={sellerId} locale={locale} />}
            {tab === "staff" && <StaffTab profile={profile} locale={locale} onEditStaff={setEditingStaff} />}
            {tab === "reviews" && <ReviewsTab profile={profile} locale={locale} />}
            {tab === "verification" && (
              <VerificationTab
                profile={profile}
                locale={locale}
                onVerify={() => store && askConfirm("verify", p.confirmVerifyTitle, p.confirmVerifyDesc(store.name), p.verifyStore)}
                onUnverify={() => store && askConfirm("unverify", p.confirmUnverifyTitle, p.confirmUnverifyDesc(store.name), p.removeVerification)}
                onGrantSellerVerification={(note) => {
                  setSellerVerifyNote(note);
                  askConfirm(
                    "grantSellerVerification",
                    "Grant manual verification",
                    "This is an ADMIN OVERRIDE: the seller will be marked as manually verified before completing the normal requirements. The grant is audited with your identity and timestamp.",
                    "Grant verification",
                  );
                }}
                onRemoveSellerVerification={() =>
                  askConfirm(
                    "removeSellerVerification",
                    "Remove verification",
                    "The seller's verification override will be removed and set back to unverified.",
                    "Remove verification",
                  )
                }
                onSuspendSellerVerification={() =>
                  askConfirm(
                    "suspendSellerVerification",
                    "Suspend verification",
                    "The seller's verification will be suspended.",
                    "Suspend verification",
                  )
                }
              />
            )}
            {tab === "activity" && <ActivityTab profile={profile} locale={locale} />}
            {tab === "security" && (
              <SecurityTab
                profile={profile}
                locale={locale}
                onResetOnboarding={() => askConfirm("resetOnboarding", p.confirmResetOnboardingTitle, p.confirmResetOnboardingDesc, p.resetOnboarding)}
                onForcePasswordReset={() => askConfirm("forcePasswordReset", p.confirmForcePasswordResetTitle, p.confirmForcePasswordResetDesc, p.forcePasswordReset)}
                onSuspend={() => askConfirm("suspend", t.confirmSuspendTitle, t.confirmSuspendDesc, t.suspend)}
                isSuspended={seller.account_status === "suspended"}
              />
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmAction !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmAction?.title ?? ""}
          description={confirmAction?.description ?? ""}
          confirmLabel={confirmAction?.confirmLabel}
          onConfirm={handleConfirm}
        />
        {editOpen && seller ? (
          <EditSellerDialog
            sellerId={seller.id}
            initial={{
              legal_name: seller.legal_name,
              first_name: seller.first_name,
              last_name: seller.last_name,
              phone: seller.phone,
              email: seller.email,
            }}
            onClose={() => setEditOpen(false)}
            onSaved={refresh}
          />
        ) : null}
        {editingStaff ? (
          <StaffPermissionsDialog
            staff={editingStaff}
            onClose={() => setEditingStaff(null)}
            onSaved={refresh}
          />
        ) : null}
      </AdminShell>
    </AdminGate>
  );
}

/* ------------------------------------------------------------------ */
/* Tab panels — each loads its data lazily                             */
/* ------------------------------------------------------------------ */

function useWorkspaceT(locale: SupportedLocale) {
  const t = useAdminT().sellers;
  return { t, p: t.profile, common: getTranslations(locale).common };
}

function OverviewTab({ profile, sellerId, locale }: { profile: Profile; sellerId: string; locale: SupportedLocale }) {
  const { p, common } = useWorkspaceT(locale);
  const now = new Date();
  const [profitYear, setProfitYear] = useState(now.getFullYear());
  const [profitMonth, setProfitMonth] = useState(now.getMonth() + 1);
  const profitQuery = useQuery({
    queryKey: ["admin-seller-monthly-profit", sellerId, profitYear, profitMonth],
    queryFn: () => getSellerMonthlyProfit({ data: { sellerId, year: profitYear, month: profitMonth } }),
  });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={p.products} value={String(profile.stats.productCount)} hint={p.liveCatalogHint} />
        <Stat label={p.deliveredSales} value={fmtMoney(profile.stats.salesTotal, "DZD", locale)} hint={p.deliveredSalesHint} />
        <Stat
          label={p.commissionPayable}
          value={fmtMoney(profile.stats.commissionPayable, "DZD", locale)}
          hint={p.commissionPayableHint}
        />
      </div>

      <AdminCard
        title={p.monthlyProfit}
        subtitle={p.monthlyProfitHint}
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label={p.month}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={profitMonth}
              onChange={(e) => setProfitMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString(locale, { month: "long" })}
                </option>
              ))}
            </select>
            <select
              aria-label={p.year}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={profitYear}
              onChange={(e) => setProfitYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {profitQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{common.loading}</p>
        ) : profitQuery.isError ? (
          <EmptyState
            title={common.loadError}
            action={
              <Button variant="outline" size="sm" onClick={() => profitQuery.refetch()}>
                {common.retry}
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label={p.revenue} value={fmtMoney(profitQuery.data.revenue, "DZD", locale)} hint={p.revenueHint} />
              <Stat label={p.costTotal} value={fmtMoney(profitQuery.data.costTotal, "DZD", locale)} hint={p.costTotalHint} />
              <Stat label={p.sellerProfit} value={fmtMoney(profitQuery.data.sellerProfit, "DZD", locale)} hint={p.sellerProfitHint} />
              <Stat label={p.platformProfit} value={fmtMoney(profitQuery.data.platformProfit, "DZD", locale)} hint={p.platformProfitHint} />
            </div>
            <p className="text-xs text-muted-foreground">
              {p.ordersCount}: <span className="font-semibold tabular-nums">{profitQuery.data.orderCount}</span>
              {" — "}
              {p.costEstimatedNote}
            </p>
          </div>
        )}
      </AdminCard>

      <AdminCard title={p.ordersByStatus} subtitle={p.ordersByStatusHint}>
        {profile.orderStatusCounts.length === 0 ? (
          <EmptyState title={p.noOrders} />
        ) : (
          <div className="flex flex-wrap gap-3">
            {profile.orderStatusCounts.map(({ status, count }) => (
              <span key={status} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <StatusPill status={status} />
                <span className="font-semibold tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </AdminCard>

      {profile.application && (
        <AdminCard title={p.application} subtitle={p.applicationSubtitle}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <StatusPill status={profile.application.status} />
              <span className="font-medium">
                {profile.application.first_name} {profile.application.last_name}
              </span>
              <span className="text-muted-foreground">{profile.application.proposed_store_name}</span>
            </div>
            <Link to="/admin/applications" search={{ q: "", status: "all", page: 1, application: "" }}>
              <Button variant="outline" size="sm">
                {p.openApplications}
              </Button>
            </Link>
          </div>
        </AdminCard>
      )}
    </div>
  );
}

function IdentityTab({ sellerId, locale }: { sellerId: string; locale: SupportedLocale }) {
  const { t, p, common } = useWorkspaceT(locale);
  const identityQuery = useQuery({
    queryKey: ["admin-seller-identity", sellerId],
    queryFn: () => getSellerIdentity({ data: { sellerId } }),
  });
  if (identityQuery.isPending) return <TableSkeleton rows={6} />;
  if (identityQuery.isError || !identityQuery.data) {
    return (
      <AdminCard title={p.tabs.identity}>
        <EmptyState
          title={common.loadError}
          action={
            <Button variant="outline" size="sm" onClick={() => identityQuery.refetch()}>
              {common.retry}
            </Button>
          }
        />
      </AdminCard>
    );
  }
  const { account, seller } = identityQuery.data;
  return (
    <AdminCard title={p.tabs.identity} subtitle={p.subtitle}>
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t.legalName}</dt>
          <dd className="font-medium">{seller.legal_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.username}</dt>
          <dd className="font-mono" dir="ltr">{account?.username ?? p.noUsername}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.loginMethod}</dt>
          <dd>{account?.login_method ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.contact}</dt>
          <dd>
            <span className="block break-all" dir="ltr">{seller.email ?? "—"}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs">
              {account?.email_verified_at ? (
                <>
                  <BadgeCheck className="size-3.5 text-emerald-600" />
                  {p.emailVerified}
                </>
              ) : (
                <span className="text-muted-foreground">{p.notVerified}</span>
              )}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.authUserId}</dt>
          <dd className="font-mono text-xs" dir="ltr">{account?.auth_user_id ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.accountStatus}</dt>
          <dd><StatusPill status={seller.account_status} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.mustChangePassword}</dt>
          <dd>{seller.must_reset_password ? "✓" : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.onboardingStatus}</dt>
          <dd>{seller.onboarded_at ? p.onboardingComplete : p.onboardingIncomplete}</dd>
        </div>
      </dl>
    </AdminCard>
  );
}

function StoreTab({ profile, locale }: { profile: Profile; locale: SupportedLocale }) {
  const { p } = useWorkspaceT(locale);
  const store = profile.store;
  return (
    <AdminCard
      title={p.store}
      subtitle={p.storeSubtitle}
      actions={
        store?.slug ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/store/$slug" params={{ slug: store.slug }} search={{ locale }}>
              <ExternalLink className="size-4 me-1.5" />
              {p.viewPublicStore}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {store ? (
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{p.name}</dt>
            <dd className="font-medium">{store.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{p.slug}</dt>
            <dd className="font-mono text-xs" dir="ltr">/store/{store.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{p.description}</dt>
            <dd className="whitespace-pre-wrap text-muted-foreground">{store.description ?? "—"}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">{p.logoPath}</dt>
              <dd className="break-all font-mono text-xs" dir="ltr">{store.logo_path ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{p.bannerPath}</dt>
              <dd className="break-all font-mono text-xs" dir="ltr">{store.banner_path ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-xs text-muted-foreground">{p.verification}</dt>
            <dd><StatusPill status={store.verification_status} /></dd>
          </div>
        </dl>
      ) : (
        <EmptyState title={p.noStore} text={p.noStoreDesc} />
      )}
    </AdminCard>
  );
}

function ProductsTab({ sellerId, locale }: { sellerId: string; locale: SupportedLocale }) {
  const { p, common } = useWorkspaceT(locale);
  const [page, setPage] = useState(1);
  const productsQuery = useQuery({
    queryKey: ["admin-seller-products", sellerId, page],
    queryFn: () => listAdminProducts({ data: { sellerId, page } }),
  });
  const total = productsQuery.data?.total ?? 0;
  return (
    <AdminCard
      title={p.products}
      subtitle={p.productsSubtitle}
      actions={
        <Link to="/admin/products" search={{ q: "", moderation: "all", status: "all", sellerId, page: 1, create: "" }}>
          <Button variant="outline" size="sm">{p.viewProducts}</Button>
        </Link>
      }
    >
      {productsQuery.isPending ? (
        <TableSkeleton rows={6} />
      ) : productsQuery.isError ? (
        <EmptyState
          title={common.loadError}
          action={
            <Button variant="outline" size="sm" onClick={() => productsQuery.refetch()}>{common.retry}</Button>
          }
        />
      ) : productsQuery.data.products.length === 0 ? (
        <EmptyState title={p.noProducts} />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pe-3 text-start font-medium">{p.name}</th>
                  <th className="py-1.5 pe-3 text-start font-medium">{p.status}</th>
                  <th className="py-1.5 text-start font-medium">{p.date}</th>
                </tr>
              </thead>
              <tbody>
                {productsQuery.data.products.map((prod) => (
                  <tr key={prod.id} className="border-b last:border-0">
                    <td className="py-1.5 pe-3 font-medium">{productName(prod.name, common.unnamedProduct)}</td>
                    <td className="py-1.5 pe-3"><StatusPill status={prod.moderation_status ?? prod.status} /></td>
                    <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(prod.created_at, locale)}>
                      {timeAgo(prod.created_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{total} {p.productsSubtitle}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>→</Button>
            </div>
          </div>
        </div>
      )}
    </AdminCard>
  );
}

function OrdersTab({ sellerId, locale }: { sellerId: string; locale: SupportedLocale }) {
  const { p, common } = useWorkspaceT(locale);
  const [page, setPage] = useState(1);
  const ordersQuery = useQuery({
    queryKey: ["admin-seller-orders", sellerId, page],
    queryFn: () => listAdminOrders({ data: { sellerId, page } }),
  });
  const total = ordersQuery.data?.total ?? 0;
  return (
    <AdminCard
      title={p.recentOrders}
      subtitle={p.recentOrdersSubtitle}
      actions={
        <Link
          to="/admin/orders"
          search={{ locale, q: "", status: "", sellerId, wilaya: "", paymentMethod: "", minTotal: "", maxTotal: "", from: "", to: "", page: 1 }}
        >
          <Button variant="outline" size="sm">{p.viewAllOrders}</Button>
        </Link>
      }
    >
      {ordersQuery.isPending ? (
        <TableSkeleton rows={6} />
      ) : ordersQuery.isError ? (
        <EmptyState
          title={common.loadError}
          action={
            <Button variant="outline" size="sm" onClick={() => ordersQuery.refetch()}>{common.retry}</Button>
          }
        />
      ) : ordersQuery.data.orders.length === 0 ? (
        <EmptyState title={p.noOrders} />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pe-3 text-start font-medium">{p.order}</th>
                  <th className="py-1.5 pe-3 text-start font-medium">{p.status}</th>
                  <th className="py-1.5 pe-3 text-start font-medium">{p.subtotal}</th>
                  <th className="py-1.5 text-start font-medium">{p.date}</th>
                </tr>
              </thead>
              <tbody>
                {ordersQuery.data.orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">{o.orderNumber ?? o.id.slice(0, 8)}</td>
                    <td className="py-1.5 pe-3"><StatusPill status={o.status} /></td>
                    <td className="py-1.5 pe-3 whitespace-nowrap">{fmtMoney(o.grandTotal, "DZD", locale)}</td>
                    <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(o.createdAt, locale)}>
                      {timeAgo(o.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>→</Button>
          </div>
        </div>
      )}
    </AdminCard>
  );
}

function CustomersTab({ sellerId, locale }: { sellerId: string; locale: SupportedLocale }) {
  const { p, common } = useWorkspaceT(locale);
  const customersQuery = useQuery({
    queryKey: ["admin-seller-customers", sellerId],
    queryFn: () => getSellerCustomers({ data: { sellerId } }),
  });
  return (
    <AdminCard title={p.tabs.customers} subtitle={p.customersSubtitle}>
      {customersQuery.isPending ? (
        <TableSkeleton rows={6} />
      ) : customersQuery.isError ? (
        <EmptyState
          title={common.loadError}
          action={
            <Button variant="outline" size="sm" onClick={() => customersQuery.refetch()}>{common.retry}</Button>
          }
        />
      ) : customersQuery.data.customers.length === 0 ? (
        <EmptyState title={p.noCustomers} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-96 text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pe-3 text-start font-medium">{p.user}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.ordersCount}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.totalSpent}</th>
                <th className="py-1.5 text-start font-medium">{p.lastOrder}</th>
              </tr>
            </thead>
            <tbody>
              {customersQuery.data.customers.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 pe-3">
                    <span className="block font-medium">{String(c.name)}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">
                      {String(c.email ?? c.phone ?? "")}
                    </span>
                  </td>
                  <td className="py-1.5 pe-3 tabular-nums">{String(c.orders)}</td>
                  <td className="py-1.5 pe-3 whitespace-nowrap">{fmtMoney(Number(c.spent), "DZD", locale)}</td>
                  <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                    {c.lastOrderAt ? timeAgo(String(c.lastOrderAt), locale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

function AnalyticsTab({ profile, sellerId, locale }: { profile: Profile; sellerId: string; locale: SupportedLocale }) {
  const { p, common } = useWorkspaceT(locale);
  const now = new Date();
  const [profitYear, setProfitYear] = useState(now.getFullYear());
  const [profitMonth, setProfitMonth] = useState(now.getMonth() + 1);
  const profitQuery = useQuery({
    queryKey: ["admin-seller-monthly-profit", sellerId, profitYear, profitMonth],
    queryFn: () => getSellerMonthlyProfit({ data: { sellerId, year: profitYear, month: profitMonth } }),
  });
  return (
    <div className="space-y-6">
      <AdminCard title={p.ordersByStatus} subtitle={p.ordersByStatusHint}>
        {profile.orderStatusCounts.length === 0 ? (
          <EmptyState title={p.noOrders} />
        ) : (
          <div className="flex flex-wrap gap-3">
            {profile.orderStatusCounts.map(({ status, count }) => (
              <span key={status} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <StatusPill status={status} />
                <span className="font-semibold tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </AdminCard>
      <AdminCard
        title={p.monthlyProfit}
        subtitle={p.monthlyProfitHint}
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label={p.month}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={profitMonth}
              onChange={(e) => setProfitMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString(locale, { month: "long" })}
                </option>
              ))}
            </select>
            <select
              aria-label={p.year}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={profitYear}
              onChange={(e) => setProfitYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {profitQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{common.loading}</p>
        ) : profitQuery.isError ? (
          <EmptyState
            title={common.loadError}
            action={
              <Button variant="outline" size="sm" onClick={() => profitQuery.refetch()}>{common.retry}</Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={p.revenue} value={fmtMoney(profitQuery.data.revenue, "DZD", locale)} hint={p.revenueHint} />
            <Stat label={p.costTotal} value={fmtMoney(profitQuery.data.costTotal, "DZD", locale)} hint={p.costTotalHint} />
            <Stat label={p.sellerProfit} value={fmtMoney(profitQuery.data.sellerProfit, "DZD", locale)} hint={p.sellerProfitHint} />
            <Stat label={p.platformProfit} value={fmtMoney(profitQuery.data.platformProfit, "DZD", locale)} hint={p.platformProfitHint} />
          </div>
        )}
      </AdminCard>
    </div>
  );
}

function CommissionTab({
  profile,
  locale,
  commissionInput,
  setCommissionInput,
  submitCommission,
  isPending,
}: {
  profile: Profile;
  locale: SupportedLocale;
  commissionInput: string;
  setCommissionInput: (v: string) => void;
  submitCommission: () => void;
  isPending: boolean;
}) {
  const { p } = useWorkspaceT(locale);
  const seller = profile.seller;
  return (
    <AdminCard title={p.commission} subtitle={p.commissionSubtitle}>
      <div className="flex items-end gap-2">
        <div className="text-3xl font-bold">{(Number(seller.commission_rate) * 100).toFixed(1)}%</div>
        <span className="pb-1 text-xs text-muted-foreground">{p.currentRate}</span>
      </div>
      <div className="mt-4">
        <Field label={p.newRateLabel} hint={p.newRateHint}>
          <div className="flex gap-2">
            <Input
              value={commissionInput}
              onChange={(e) => setCommissionInput(e.target.value)}
              placeholder={p.newRatePlaceholder}
              inputMode="decimal"
              dir="ltr"
              className="max-w-40"
            />
            <Button onClick={submitCommission} disabled={isPending || !commissionInput.trim()}>
              {isPending ? p.saving : p.updateRate}
            </Button>
          </div>
        </Field>
      </div>
      <h4 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {p.rateHistory}
      </h4>
      {profile.commissionHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p.noRateHistory}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-72 text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pe-3 text-start font-medium">{p.rate}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.effectiveFrom}</th>
                <th className="py-1.5 text-start font-medium">{p.changedBy}</th>
              </tr>
            </thead>
            <tbody>
              {profile.commissionHistory.map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-1.5 pe-3 font-medium">{(Number(h.rate) * 100).toFixed(1)}%</td>
                  <td className="py-1.5 pe-3 text-muted-foreground" title={fmtDateTime(h.effective_from, locale)}>
                    {timeAgo(h.effective_from, locale)}
                  </td>
                  <td className="py-1.5 font-mono text-xs text-muted-foreground">
                    {h.changed_by ? String(h.changed_by).slice(0, 8) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

function SettlementsTab({ profile, locale }: { profile: Profile; locale: SupportedLocale }) {
  const { p } = useWorkspaceT(locale);
  return (
    <AdminCard title={p.settlements} subtitle={p.settlementsSubtitle}>
      {profile.settlements.length === 0 ? (
        <EmptyState title={p.noSettlements} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-96 text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pe-3 text-start font-medium">{p.amount}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.status}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.reference}</th>
                <th className="py-1.5 text-start font-medium">{p.settled}</th>
              </tr>
            </thead>
            <tbody>
              {profile.settlements.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-1.5 pe-3 font-medium whitespace-nowrap">
                    {fmtMoney(s.amount, "DZD", locale)} {s.currency}
                  </td>
                  <td className="py-1.5 pe-3"><StatusPill status={s.status} /></td>
                  <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">{s.payment_reference ?? "—"}</td>
                  <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                    {s.settled_at ? timeAgo(s.settled_at, locale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

function ShippingTab({ sellerId, locale }: { sellerId: string; locale: SupportedLocale }) {
  const { p, common } = useWorkspaceT(locale);
  const shippingQuery = useQuery({
    queryKey: ["admin-seller-shipping", sellerId],
    queryFn: () => getSellerShipping({ data: { sellerId } }),
  });
  return (
    <AdminCard title={p.tabs.shipping} subtitle={p.shippingSubtitle}>
      {shippingQuery.isPending ? (
        <TableSkeleton rows={4} />
      ) : shippingQuery.isError ? (
        <EmptyState
          title={common.loadError}
          action={
            <Button variant="outline" size="sm" onClick={() => shippingQuery.refetch()}>{common.retry}</Button>
          }
        />
      ) : shippingQuery.data.offices.length === 0 ? (
        <EmptyState title={p.noOffices} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-96 text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pe-3 text-start font-medium">{p.officeName}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.wilaya}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.status}</th>
                <th className="py-1.5 text-start font-medium">{p.date}</th>
              </tr>
            </thead>
            <tbody>
              {shippingQuery.data.offices.map((o) => (
                <tr key={String(o.id)} className="border-b last:border-0">
                  <td className="py-1.5 pe-3 font-medium">{String(o.name ?? "—")}</td>
                  <td className="py-1.5 pe-3" dir="ltr">{String(o.wilaya_id ?? "—")}</td>
                  <td className="py-1.5 pe-3">
                    <StatusPill status={o.active ? "active" : "inactive"} />
                  </td>
                  <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                    {o.created_at ? timeAgo(String(o.created_at), locale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

function StaffTab({
  profile,
  locale,
  onEditStaff,
}: {
  profile: Profile;
  locale: SupportedLocale;
  onEditStaff: (s: StaffPermissionsInitial) => void;
}) {
  const { p } = useWorkspaceT(locale);
  return (
    <AdminCard title={p.staff} subtitle={p.staffSubtitle}>
      {profile.staff.length === 0 ? (
        <EmptyState title={p.noStaff} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-72 text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pe-3 text-start font-medium">{p.user}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.role}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{p.added}</th>
                <th className="py-1.5 text-end font-medium">
                  <span className="sr-only">{p.editPerms}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {profile.staff.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">{m.user_id.slice(0, 8)}…</td>
                  <td className="py-1.5 pe-3"><StatusPill status={m.role} /></td>
                  <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(m.created_at, locale)}>
                    {timeAgo(m.created_at, locale)}
                  </td>
                  <td className="py-1.5 text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onEditStaff({
                          id: m.id,
                          title: m.title ?? null,
                          permissions: Array.isArray(m.permissions)
                            ? m.permissions.filter((x): x is string => typeof x === "string")
                            : [],
                          active: m.active !== false,
                          staffRole: typeof m.staff_role === "string" ? m.staff_role : null,
                        })
                      }
                    >
                      {p.editPerms}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

function ReviewsTab({ profile, locale }: { profile: Profile; locale: SupportedLocale }) {
  const { p, common } = useWorkspaceT(locale);
  return (
    <AdminCard title={p.recentReviews} subtitle={p.recentReviewsSubtitle}>
      {profile.reviews.length === 0 ? (
        <EmptyState title={p.noReviews} />
      ) : (
        <ul className="space-y-3">
          {profile.reviews.map((r) => (
            <li key={String(r.id)} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {productName((r.products as { name?: unknown } | null)?.name, common.unnamedProduct)}
                </span>
                <span className="inline-flex items-center gap-1 text-brand">
                  <Star className="size-3.5 fill-current" />
                  {String(r.rating)}
                </span>
              </div>
              {r.body ? (
                <p className="mt-1 line-clamp-2 text-muted-foreground">{String(r.body)}</p>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <StatusPill status={String(r.moderation_status ?? r.status ?? "—")} />
                <span className="text-xs text-muted-foreground">{timeAgo(String(r.created_at), locale)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}

function VerificationTab({
  profile,
  locale,
  onVerify,
  onUnverify,
  onGrantSellerVerification,
  onRemoveSellerVerification,
  onSuspendSellerVerification,
}: {
  profile: Profile;
  locale: SupportedLocale;
  onVerify: () => void;
  onUnverify: () => void;
  onGrantSellerVerification: (note: string) => void;
  onRemoveSellerVerification: () => void;
  onSuspendSellerVerification: () => void;
}) {
  const { p } = useWorkspaceT(locale);
  const store = profile.store;
  const seller = profile.seller;
  const sellerState = (seller as { verification_state?: string } | null)?.verification_state ?? "unverified";
  const sellerNote = (seller as { verification_note?: string | null } | null)?.verification_note ?? null;
  const sellerVerifiedAt = (seller as { verified_at?: string | null } | null)?.verified_at ?? null;
  const [note, setNote] = useState("");
  return (
    <div className="space-y-6">
    <AdminCard title={p.verification}>
      {!store ? (
        <EmptyState title={p.noStore} text={p.noStoreDesc} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{p.verification}:</span>
            <StatusPill status={store.verification_status} />
            {store.verification_status === "manual" && (
              <span className="text-xs text-muted-foreground">✓ {p.manuallyVerified}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {store.verification_status === "verified" || store.verification_status === "manual"
              ? p.verified
              : p.unverified}
          </p>
          <div className="flex flex-wrap gap-2">
            {store.verification_status === "unverified" || store.verification_status === "suspended" ? (
              <Button size="sm" variant="secondary" onClick={onVerify}>
                <ShieldCheck className="size-4 me-1.5" />
                {p.verifyStore}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onUnverify}>
                <ShieldX className="size-4 me-1.5" />
                {p.unverifyStore}
              </Button>
            )}
          </div>
        </div>
      )}
    </AdminCard>

    {/* Seller-level manual verification override (sellers.verification_state).
        Explicit ADMIN OVERRIDE — does not change the normal requirements flow. */}
    <AdminCard title="Seller verification override">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Seller verification:</span>
          <StatusPill status={sellerState} />
          {sellerState === "manual" && (
            <span className="text-xs text-muted-foreground">✓ Manually verified (admin override)</span>
          )}
        </div>
        {sellerNote ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Note:</span> {sellerNote}
          </p>
        ) : null}
        {sellerVerifiedAt ? (
          <p className="text-xs text-muted-foreground">Granted at {fmtDateTime(sellerVerifiedAt, locale)}</p>
        ) : null}
        <div className="space-y-2">
          <Field label="Override reason / note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Strategic partner — verified before requirements"
              maxLength={500}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {sellerState === "unverified" || sellerState === "suspended" ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onGrantSellerVerification(note);
                setNote("");
              }}
            >
              <ShieldCheck className="size-4 me-1.5" />
              Grant verification
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onRemoveSellerVerification}>
                <ShieldX className="size-4 me-1.5" />
                Remove verification
              </Button>
              {sellerState !== "suspended" ? (
                <Button size="sm" variant="outline" onClick={onSuspendSellerVerification}>
                  <Ban className="size-4 me-1.5" />
                  Suspend verification
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </AdminCard>
    </div>
  );
}

function ActivityTab({ profile, locale }: { profile: Profile; locale: SupportedLocale }) {
  const { p } = useWorkspaceT(locale);
  return (
    <AdminCard title={p.activity} subtitle={p.activitySubtitle}>
      {profile.auditLogs.length === 0 ? (
        <EmptyState title={p.noActivity} />
      ) : (
        <ul className="space-y-2.5">
          {profile.auditLogs.map((log) => (
            <li key={log.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-mono text-xs" dir="ltr">{log.action}</p>
                <p className="text-xs text-muted-foreground">
                  {log.resource}
                  {log.actor_id ? ` · by ${log.actor_id.slice(0, 8)}…` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground" title={fmtDateTime(log.created_at, locale)}>
                {timeAgo(log.created_at, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}

function SecurityTab({
  profile,
  locale,
  onResetOnboarding,
  onForcePasswordReset,
  onSuspend,
  isSuspended,
}: {
  profile: Profile;
  locale: SupportedLocale;
  onResetOnboarding: () => void;
  onForcePasswordReset: () => void;
  onSuspend: () => void;
  isSuspended: boolean;
}) {
  const { p } = useWorkspaceT(locale);
  const seller = profile.seller;
  const loginEvents = profile.auditLogs.filter((l) => /login|session|password/i.test(l.action));
  return (
    <div className="space-y-6">
      <AdminCard title={p.tabs.security}>
        <p className="text-sm text-muted-foreground">{p.securityNote}</p>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{p.accountStatus}</dt>
            <dd><StatusPill status={seller.account_status} /></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{p.mustChangePassword}</dt>
            <dd>{seller.must_reset_password ? "✓" : "—"}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onForcePasswordReset}>
            <KeyRound className="size-4 me-1.5" />
            {p.forcePasswordReset}
          </Button>
          <Button size="sm" variant="outline" onClick={onResetOnboarding}>
            <RefreshCcw className="size-4 me-1.5" />
            {p.resetOnboarding}
          </Button>
          {!isSuspended && (
            <Button size="sm" variant="outline" onClick={onSuspend}>
              <Ban className="size-4 me-1.5" />
              {p.disable}
            </Button>
          )}
        </div>
      </AdminCard>
      <AdminCard title={p.loginHistory}>
        {loginEvents.length === 0 ? (
          <EmptyState title={p.noLoginHistory} />
        ) : (
          <ul className="space-y-2.5">
            {loginEvents.map((log) => (
              <li key={log.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-mono text-xs" dir="ltr">{log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.actor_id ? `by ${log.actor_id.slice(0, 8)}…` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground" title={fmtDateTime(log.created_at, locale)}>
                  {timeAgo(log.created_at, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}
