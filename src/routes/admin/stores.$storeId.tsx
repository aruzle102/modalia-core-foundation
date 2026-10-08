import { createFileRoute, Link } from "@tanstack/react-router";
import { strParam } from "@/hooks/use-url-state";
import { BackLink } from "@/components/routing/back-link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  ExternalLink,
  EyeOff,
  Power,
  Send,
  ShieldCheck,
  ShieldX,
  Star,
  X,
  Tag,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  fmtMoney,
  fmtDateTime,
  timeAgo,
  SegmentedControl,
} from "@/components/admin/ui";
import { getStoreProfile, updateStoreStatus } from "@/lib/admin-stores.functions";
import { updateStoreVerification } from "@/lib/admin-sellers.functions";
import { useAdminT } from "@/components/admin/use-admin-t";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { accentById, normalizeStoreSettings, type TrilingualText } from "@/lib/store-settings";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SalesChart } from "@/components/admin/Charts";
import { moderateAdminProduct } from "@/lib/admin-catalog.functions";
import {
  getStoreAnalytics,
  getStoreFinance,
  getStoreOrders,
  getStoreProducts,
  sendStoreNotification,
  type StoreOrderRow,
  type StoreProductRow,
} from "@/lib/admin-store.functions";

export const Route = createFileRoute("/admin/stores/$storeId")({
  validateSearch: (search: Record<string, unknown>) => ({
    back: strParam(search["back"]),
    tab: strParam(search["tab"], "overview"),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Store Profile — Modalia Admin" }],
  }),
  component: StoreProfilePage,
});

type Profile = Awaited<ReturnType<typeof getStoreProfile>>;
type StoreStatus = "draft" | "active" | "suspended" | "closed";

function isOfficialStore(settings: unknown): boolean {
  return (
    !!settings &&
    typeof settings === "object" &&
    (settings as { official?: unknown })["official"] === true
  );
}

function isAbsoluteUrl(value: string | null | undefined): value is string {
  return !!value && (value.startsWith("http://") || value.startsWith("https://"));
}

function trilingualText(value: TrilingualText, locale: string): string {
  return value[locale as keyof TrilingualText] || value.fr || value.en || value.ar || "";
}

function productName(value: unknown, fallback: string): string {
  return pickName(value) || fallback;
}

const TABS = [
  "overview",
  "analytics",
  "products",
  "orders",
  "finance",
  "seller",
  "notifications",
] as const;

type TabId = (typeof TABS)[number];

function isTabId(value: string): value is TabId {
  return (TABS as readonly string[]).includes(value);
}

const TAB_LABELS: Record<TabId, { ar: string; fr: string; en: string }> = {
  overview: { ar: "نظرة عامة", fr: "Aperçu", en: "Overview" },
  analytics: { ar: "التحليلات", fr: "Analyses", en: "Analytics" },
  products: { ar: "المنتجات", fr: "Produits", en: "Products" },
  orders: { ar: "الطلبات", fr: "Commandes", en: "Orders" },
  finance: { ar: "المالية", fr: "Finances", en: "Finance" },
  seller: { ar: "البائع", fr: "Vendeur", en: "Seller" },
  notifications: { ar: "الإشعارات", fr: "Notifications", en: "Notifications" },
};

function StoreProfilePage() {
  const { storeId } = Route.useParams();
  const { back, tab: tabParam } = Route.useSearch();
  const queryClient = useQueryClient();
  const locale = useAdminLocale();
  const adminT = useAdminT();
  const common = getTranslations(locale).common;
  const p = getTranslations(locale).admin.stores.profile;
  const sellerT = {
    ...adminT.sellers.profile,
    manualVerified: "Store manually verified.",
    verificationSuspended: "Store verification suspended.",
    manualVerifyStore: "Manually verify store",
    confirmSuspendVerifyTitle: "Suspend store verification?",
    confirmSuspendVerifyDesc: (_storeName: string) => "The store will no longer show as verified.",
    suspendVerification: "Suspend verification",
    manuallyVerified: "Manually verified",
    manualOverride: "Manual override",
    confirmManualVerifyTitle: "Manually verify store?",
    confirmManualVerifyDesc: (_storeName: string) => "This adds an administrator verification override.",
    verificationNote: "Verification note",
    verificationNotePlaceholder: "Reason for the manual verification",
    verificationExpires: "Verification expiry",
  };
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
    kind: "status" | "verify" | "unverify" | "suspendVerify";
    status?: StoreStatus;
    title: string;
    description: string;
    confirmLabel: string;
  }>(null);
  const [manualForm, setManualForm] = useState<{ note: string; expiresAt: string } | null>(null);

  const profileQuery = useQuery({
    queryKey: ["admin-store-profile", storeId],
    queryFn: () => getStoreProfile({ data: { storeId } }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-store-profile", storeId] });
    queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: StoreStatus) => updateStoreStatus({ data: { storeId, status } }),
    onSuccess: (res) => {
      toast.success(p.statusUpdated(res.status));
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => updateStoreVerification({ data: { storeId, verificationStatus: "verified" } }),
    onSuccess: () => {
      toast.success(sellerT.verified);
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const unverifyMutation = useMutation({
    mutationFn: () => updateStoreVerification({ data: { storeId, verificationStatus: "unverified" } }),
    onSuccess: () => {
      toast.success(sellerT.unverified);
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const manualVerifyMutation = useMutation({
    mutationFn: (input: { note: string; expiresAt: string }) =>
      updateStoreVerification({
        data: {
          storeId,
          verificationStatus: "manual",
          note: input.note.trim() || undefined,
          expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(sellerT.manualVerified);
      setManualForm(null);
      refresh();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const suspendVerifyMutation = useMutation({
    mutationFn: () => updateStoreVerification({ data: { storeId, verificationStatus: "suspended" } }),
    onSuccess: () => {
      toast.success(sellerT.verificationSuspended);
      setConfirmAction(null);
      refresh();
    },
    onError: (err: Error) => {
      setConfirmAction(null);
      toast.error(err.message);
    },
  });

  const profile: Profile | undefined = profileQuery.data;
  const store = profile?.store;
  const seller = profile?.seller;
  const settings = store ? normalizeStoreSettings(store.settings) : null;
  const accent = settings ? accentById(settings.accent) : null;
  const announcementText = settings ? trilingualText(settings.announcement, locale) : "";
  const collections = settings
    ? [
        ...settings.official_collections.map((c) => ({ ...c, kind: "official" as const })),
        ...settings.seller_collections.map((c) => ({ ...c, kind: "seller" as const })),
      ]
    : [];

  const setStatus = (status: StoreStatus, title: string, description: string, confirmLabel: string) =>
    setConfirmAction({ kind: "status", status, title, description, confirmLabel });

  return (
    <AdminGate>
      <AdminShell
        title={store?.name ?? p.couldNotLoad}
        subtitle={p.subtitle}
        breadcrumbs={[
          { label: navLabels.stores, to: "/admin/stores", back },
          { label: store?.name ?? p.couldNotLoad },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <BackLink back={back} fallbackTo="/admin/stores">
              <ArrowLeft className="size-4 me-1.5" />
              {p.backToStores}
            </BackLink>
          </Button>
        }
      >
        {profileQuery.isLoading ? (
          <TableSkeleton rows={10} />
        ) : profileQuery.isError || !store ? (
          <AdminCard title={p.couldNotLoad}>
            <EmptyState title={p.couldNotLoad} text={p.couldNotLoadDesc} />
          </AdminCard>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <AdminCard
              title={store.name}
              subtitle={store.slug}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/store/$slug" params={{ slug: store.slug }} search={{ locale }}>
                      <ExternalLink className="size-4 me-1.5" />
                      {p.viewPublicStore}
                    </Link>
                  </Button>
                  {seller && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/admin/sellers/$sellerId"
                        params={{ sellerId: seller.id }}
                        search={{ back, tab: "overview", q: "", status: "all", page: 1, create: "" }}
                      >
                        <UserRound className="size-4 me-1.5" />
                        {p.viewSeller}
                      </Link>
                    </Button>
                  )}
                  {seller && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/admin/products"
                        search={{ q: "", moderation: "all", status: "all", sellerId: seller.id, page: 1, create: "" }}
                      >
                        <Tag className="size-4 me-1.5" />
                        {p.manageProducts}
                      </Link>
                    </Button>
                  )}
                  {seller && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/admin/orders"
                        search={{
                          locale,
                          q: "",
                          status: "",
                          sellerId: seller.id,
                          wilaya: "",
                          paymentMethod: "",
                          minTotal: "",
                          maxTotal: "",
                          from: "",
                          to: "",
                          page: 1,
                        }}
                      >
                        {p.viewAllOrders}
                      </Link>
                    </Button>
                  )}
                  {store.status !== "active" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setStatus("active", p.confirmActivateTitle, p.confirmActivateDesc, p.activate)
                      }
                    >
                      <Power className="size-4 me-1.5" />
                      {p.activate}
                    </Button>
                  )}
                  {store.status === "active" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setStatus("suspended", p.confirmSuspendTitle, p.confirmSuspendDesc, p.suspendStore)
                        }
                      >
                        <Ban className="size-4 me-1.5" />
                        {p.suspendStore}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setStatus("closed", p.confirmCloseTitle, p.confirmCloseDesc, p.closeStore)
                        }
                      >
                        <Ban className="size-4 me-1.5" />
                        {p.closeStore}
                      </Button>
                    </>
                  )}
                  {(store.verification_status === "unverified" ||
                    store.verification_status === "suspended") && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setConfirmAction({
                            kind: "verify",
                            title: sellerT.confirmVerifyTitle,
                            description: sellerT.confirmVerifyDesc(store.name),
                            confirmLabel: sellerT.verifyStore,
                          })
                        }
                      >
                        <ShieldCheck className="size-4 me-1.5" />
                        {sellerT.verifyStore}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setManualForm({ note: "", expiresAt: "" })}
                      >
                        <BadgeCheck className="size-4 me-1.5" />
                        {sellerT.manualVerifyStore}
                      </Button>
                    </>
                  )}
                  {(store.verification_status === "verified" ||
                    store.verification_status === "manual") && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirmAction({
                            kind: "unverify",
                            title: sellerT.confirmUnverifyTitle,
                            description: sellerT.confirmUnverifyDesc(store.name),
                            confirmLabel: sellerT.removeVerification,
                          })
                        }
                      >
                        <ShieldX className="size-4 me-1.5" />
                        {sellerT.unverifyStore}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirmAction({
                            kind: "suspendVerify",
                            title: sellerT.confirmSuspendVerifyTitle,
                            description: sellerT.confirmSuspendVerifyDesc(store.name),
                            confirmLabel: sellerT.suspendVerification,
                          })
                        }
                      >
                        <Ban className="size-4 me-1.5" />
                        {sellerT.suspendVerification}
                      </Button>
                    </>
                  )}
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={store.status} />
                <StatusPill status={store.verification_status} />
                {store.verification_status === "manual" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <BadgeCheck className="size-3.5" />
                    {sellerT.manuallyVerified} ✓
                  </span>
                )}
                {store.verification_status === "manual" && (
                  <span className="text-xs text-muted-foreground">{sellerT.manualOverride}</span>
                )}
                {isOfficialStore(store.settings) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <BadgeCheck className="size-3.5" />
                    {p.officialStore} ✓
                  </span>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{p.storeSince}</dt>
                  <dd title={fmtDateTime(store.created_at, locale)}>{timeAgo(store.created_at, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{p.contactEmail}</dt>
                  <dd className="break-all" dir="ltr">{store.contact_email ?? p.notSet}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{p.contactPhone}</dt>
                  <dd dir="ltr">{store.contact_phone ?? p.notSet}</dd>
                </div>
              </dl>
            </AdminCard>

            {/* Tab navigation — URL param ?tab= */}
            <Tabs value={tab} onValueChange={(v) => isTabId(v) && setTab(v)}>
              <div className="overflow-x-auto">
                <TabsList>
                  {TABS.map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {TAB_LABELS[id][locale]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>

            {tab === "overview" && profile && (
              <OverviewTab profile={profile} storeId={storeId} back={back} locale={locale} />
            )}
            {tab === "analytics" && <AnalyticsTab storeId={storeId} locale={locale} />}
            {tab === "products" && (
              <ProductsTab
                storeId={storeId}
                back={back}
                locale={locale}
                sellerId={seller?.id ?? null}
              />
            )}
            {tab === "orders" && <OrdersTab storeId={storeId} locale={locale} />}
            {tab === "finance" && <FinanceTab storeId={storeId} locale={locale} />}
            {tab === "seller" && profile && (
              <SellerTab profile={profile} storeId={storeId} back={back} locale={locale} />
            )}
            {tab === "notifications" && (
              <NotificationsTab
                storeId={storeId}
                storeName={store.name}
                sellerName={seller?.legal_name ?? null}
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
          onConfirm={() => {
            if (confirmAction?.kind === "status" && confirmAction.status) {
              statusMutation.mutate(confirmAction.status);
            } else if (confirmAction?.kind === "verify") {
              verifyMutation.mutate();
            } else if (confirmAction?.kind === "unverify") {
              unverifyMutation.mutate();
            } else if (confirmAction?.kind === "suspendVerify") {
              suspendVerifyMutation.mutate();
            }
          }}
        />
        {manualForm !== null && store ? (
          <div className="mt-4 rounded-lg border border-dashed p-4">
            <p className="mb-3 text-sm font-semibold">{sellerT.confirmManualVerifyTitle}</p>
            <p className="mb-3 text-sm text-muted-foreground">
              {sellerT.confirmManualVerifyDesc(store.name)}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{sellerT.verificationNote}</span>
                <textarea
                  value={manualForm.note}
                  onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })}
                  placeholder={sellerT.verificationNotePlaceholder}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{sellerT.verificationExpires}</span>
                <input
                  type="datetime-local"
                  value={manualForm.expiresAt}
                  onChange={(e) => setManualForm({ ...manualForm, expiresAt: e.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={!manualForm.note.trim() || manualVerifyMutation.isPending}
                onClick={() => manualVerifyMutation.mutate(manualForm)}
              >
                <BadgeCheck className="size-4 me-1.5" />
                {sellerT.manualVerifyStore}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setManualForm(null)}>
                {common.cancel}
              </Button>
            </div>
          </div>
        ) : null}
      </AdminShell>
    </AdminGate>
  );
}

/* ------------------------------------------------------------------ */
/* Overview tab                                                        */
/* ------------------------------------------------------------------ */

function OverviewTab({
  profile,
  storeId,
  back,
  locale,
}: {
  profile: NonNullable<Profile>;
  storeId: string;
  back: string;
  locale: "ar" | "fr" | "en";
}) {
  const common = getTranslations(locale).common;
  const p = getTranslations(locale).admin.stores.profile;
  const store = profile.store;
  const seller = profile.seller;
  const settings = normalizeStoreSettings(store.settings);
  const accent = accentById(settings.accent);
  const announcementText = trilingualText(settings.announcement, locale);
  const collections = [
    ...settings.official_collections.map((c) => ({ ...c, kind: "official" as const })),
    ...settings.seller_collections.map((c) => ({ ...c, kind: "seller" as const })),
  ];

  return (
    <div className="space-y-6">
      {/* Identity + Seller */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminCard title={p.identity} subtitle={p.identitySubtitle}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{p.logo}</p>
                {isAbsoluteUrl(store.logo_path) ? (
                  <img
                    src={store.logo_path}
                    alt={`${store.name} logo`}
                    className="size-16 rounded-md border object-contain"
                    loading="lazy"
                  />
                ) : (
                  <p className="max-w-48 break-all font-mono text-xs text-muted-foreground" dir="ltr">
                    {store.logo_path ?? p.notSet}
                  </p>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs text-muted-foreground">{p.banner}</p>
                {isAbsoluteUrl(store.banner_path) ? (
                  <img
                    src={store.banner_path}
                    alt={`${store.name} banner`}
                    className="aspect-[21/9] w-full max-w-72 rounded-md border object-cover"
                    loading="lazy"
                  />
                ) : (
                  <p className="break-all font-mono text-xs text-muted-foreground" dir="ltr">
                    {store.banner_path ?? p.notSet}
                  </p>
                )}
              </div>
            </div>
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
                <dd className="whitespace-pre-wrap text-muted-foreground">
                  {store.description ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
        </AdminCard>

        <AdminCard title={p.seller} subtitle={p.sellerSubtitle}>
          {seller ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{p.name}</dt>
                <dd className="font-medium">
                  <Link
                    to="/admin/sellers/$sellerId"
                    params={{ sellerId: seller.id }}
                    search={{ back, tab: "overview", q: "", status: "all", page: 1, create: "" }}
                    className="underline-offset-4 hover:underline"
                  >
                    {seller.legal_name}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-xs text-muted-foreground">{p.accountStatus}</dt>
                <dd>
                  <StatusPill status={seller.account_status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{p.commission}</dt>
                <dd className="font-medium">{(Number(seller.commission_rate) * 100).toFixed(1)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{p.sellerSince}</dt>
                <dd title={fmtDateTime(seller.created_at, locale)}>{timeAgo(seller.created_at, locale)}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState title={p.couldNotLoad} />
          )}
        </AdminCard>
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={p.productsCount} value={String(profile.stats.productCount)} hint={p.productsHint} />
        <Stat label={p.ordersCount} value={String(profile.stats.orderCount)} hint={p.ordersHint} />
        <Stat label={p.deliveredSales} value={fmtMoney(profile.stats.salesTotal, "DZD", locale)} hint={p.deliveredSalesHint} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={p.reviewsCount} value={String(profile.stats.reviewCount)} hint={p.reviewsHint} />
        <Stat
          label={p.avgRating}
          value={profile.stats.avgRating !== null ? profile.stats.avgRating.toFixed(1) : "—"}
          hint={p.avgRatingHint}
        />
        <Stat label={p.activeOffers} value={String(profile.stats.activeOfferCount)} hint={p.activeOffersHint} />
      </div>

      {/* Orders by status */}
      <AdminCard title={p.ordersByStatus} subtitle={p.ordersByStatusHint}>
        {profile.orderStatusCounts.length === 0 ? (
          <EmptyState title={p.noOrders} />
        ) : (
          <div className="flex flex-wrap gap-3">
            {profile.orderStatusCounts.map(({ status, count }) => (
              <span
                key={status}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
              >
                <StatusPill status={status} />
                <span className="font-semibold tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </AdminCard>

      {/* Appearance + Collections */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminCard title={p.appearance} subtitle={p.appearanceSubtitle}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-xs text-muted-foreground">{p.accent}</dt>
              <dd className="inline-flex items-center gap-1.5">
                <span
                  className="size-4 rounded-full border"
                  style={{ backgroundColor: accent?.swatch }}
                />
                <span className="font-medium">{accent?.label ?? "—"}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{p.announcement}</dt>
              <dd className="text-muted-foreground">{announcementText || p.notSet}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">{p.featuredProducts}</dt>
                <dd className="font-medium tabular-nums">{settings.featured_product_ids.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{p.featuredCategories}</dt>
                <dd className="font-medium tabular-nums">{settings.featured_category_ids.length}</dd>
              </div>
            </div>
            <div>
              <dt className="mb-2 text-xs text-muted-foreground">{p.sections}</dt>
              {settings.sections.length === 0 ? (
                <dd className="text-muted-foreground">{p.noSections}</dd>
              ) : (
                <dd className="space-y-1.5">
                  {settings.sections.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {trilingualText(s.title, locale) || s.id}
                        <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                          {s.kind}
                        </span>
                      </span>
                      <StatusPill status={s.enabled ? "enabled" : "disabled"} />
                    </div>
                  ))}
                </dd>
              )}
            </div>
          </dl>
        </AdminCard>

        <AdminCard title={p.collections} subtitle={p.collectionsSubtitle}>
          {collections.length === 0 ? (
            <EmptyState title={p.noCollections} />
          ) : (
            <ul className="space-y-3">
              {collections.map((c) => (
                <li key={c.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{trilingualText(c.title, locale) || c.id}</span>
                    <StatusPill status={c.enabled ? "enabled" : "disabled"} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {c.kind === "official" ? p.official : p.sellerCollections}
                    </span>
                    <span className="tabular-nums">{c.product_ids.length}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      {/* Offers */}
      <AdminCard title={p.offers} subtitle={p.offersSubtitle}>
        {profile.promotions.length === 0 ? (
          <EmptyState title={p.noOffers} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pe-3 text-start font-medium">{p.name}</th>
                  <th className="py-1.5 pe-3 text-start font-medium">{p.salePrice}</th>
                  <th className="py-1.5 text-start font-medium">{p.endsAt}</th>
                </tr>
              </thead>
              <tbody>
                {profile.promotions.map((promo) => (
                  <tr key={promo.id} className="border-b last:border-0">
                    <td className="py-1.5 pe-3">
                      {promo.product ? (
                        <Link
                          to="/admin/products/$productId"
                          params={{ productId: promo.product.id }}
                          search={{ back, q: "", moderation: "all", status: "all", sellerId: "all", page: 1, create: "" }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {productName(promo.product.name, common.unnamedProduct)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs" dir="ltr">{promo.product_id}</span>
                      )}
                    </td>
                    <td className="py-1.5 pe-3 whitespace-nowrap font-medium">
                      {fmtMoney(promo.sale_price, "DZD", locale)}
                    </td>
                    <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(promo.ends_at, locale)}>
                      {timeAgo(promo.ends_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Recent products + recent orders */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminCard
          title={p.recentProducts}
          subtitle={`${profile.stats.productCount} — ${p.productsHint}`}
        >
          {profile.recentProducts.length === 0 ? (
            <EmptyState title={p.noProducts} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-96 text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pe-3 text-start font-medium">{p.name}</th>
                    <th className="py-1.5 pe-3 text-start font-medium">{p.price}</th>
                    <th className="py-1.5 pe-3 text-start font-medium">{p.moderation}</th>
                    <th className="py-1.5 text-start font-medium">{p.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.recentProducts.map((prod) => (
                    <tr key={prod.id} className="border-b last:border-0">
                      <td className="py-1.5 pe-3">
                        <Link
                          to="/admin/products/$productId"
                          params={{ productId: prod.id }}
                          search={{ back, q: "", moderation: "all", status: "all", sellerId: "all", page: 1, create: "" }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {productName(prod.name, common.unnamedProduct)}
                        </Link>
                      </td>
                      <td className="py-1.5 pe-3 whitespace-nowrap">{fmtMoney(prod.base_price, "DZD", locale)}</td>
                      <td className="py-1.5 pe-3">
                        <StatusPill status={prod.moderation_status} />
                      </td>
                      <td className="py-1.5">
                        <StatusPill status={prod.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <AdminCard title={p.recentOrders} subtitle={p.recentOrdersSubtitle}>
          {profile.recentOrders.length === 0 ? (
            <EmptyState title={p.noOrders} />
          ) : (
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
                  {profile.recentOrders.map((o) => {
                    const orderNumber =
                      (o.orders as { order_number?: string } | null)?.order_number ?? o.order_id.slice(0, 8);
                    return (
                      <tr key={o.id} className="border-b last:border-0">
                        <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">{orderNumber}</td>
                        <td className="py-1.5 pe-3">
                          <StatusPill status={o.status} />
                        </td>
                        <td className="py-1.5 pe-3 whitespace-nowrap">{fmtMoney(o.subtotal, "DZD", locale)}</td>
                        <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(o.created_at, locale)}>
                          {timeAgo(o.created_at, locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>

      {/* Reviews + Activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                    <span className="inline-flex items-center gap-1 text-amber-500">
                      <Star className="size-3.5 fill-current" />
                      {String(r.rating)}
                    </span>
                  </div>
                  {r.body ? (
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{String(r.body)}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <StatusPill status={String(r.moderation_status ?? "—")} />
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(String(r.created_at), locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

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
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analytics tab                                                       */
/* ------------------------------------------------------------------ */

function AnalyticsTab({
  storeId,
  locale,
}: {
  storeId: string;
  locale: "ar" | "fr" | "en";
}) {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const analyticsQuery = useQuery({
    queryKey: ["admin-store-analytics", storeId, days],
    queryFn: () => getStoreAnalytics({ data: { storeId, days: Number(days) } }),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <AdminCard
        title="Sales & orders"
        subtitle={`Last ${days} days — delivered sales and order counts`}
        actions={
          <SegmentedControl
            ariaLabel="Date range"
            value={days}
            onChange={setDays}
            options={[
              { value: "7", label: "7D" },
              { value: "30", label: "30D" },
              { value: "90", label: "90D" },
            ]}
          />
        }
      >
        {analyticsQuery.isPending ? (
          <TableSkeleton rows={4} />
        ) : analyticsQuery.isError ? (
          <EmptyState title="Could not load analytics" text="Please try again." />
        ) : (
          <SalesChart data={analyticsQuery.data.series} />
        )}
      </AdminCard>

      <AdminCard title="Top products" subtitle="By revenue in the selected period">
        {analyticsQuery.isPending ? (
          <TableSkeleton rows={6} />
        ) : analyticsQuery.isError || analyticsQuery.data.topProducts.length === 0 ? (
          <EmptyState title="No product sales" text="No order items found in the selected period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pe-3 text-start font-medium">Product</th>
                  <th className="py-1.5 pe-3 text-start font-medium">Units</th>
                  <th className="py-1.5 text-start font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {analyticsQuery.data.topProducts.map((tp: { product_id: string; title: unknown; units: number; revenue: number }) => (
                  <tr key={tp.product_id} className="border-b last:border-0">
                    <td className="py-1.5 pe-3 font-medium">
                      {tp.product_id === "unknown" ? (
                        <span className="text-muted-foreground">Unknown product</span>
                      ) : (
                        <Link
                          to="/admin/products/$productId"
                          params={{ productId: tp.product_id }}
                          search={{ back: "", q: "", moderation: "all", status: "all", sellerId: "all", page: 1, create: "" }}
                          className="underline-offset-4 hover:underline"
                        >
                          {productName(tp.title, "Unnamed product")}
                        </Link>
                      )}
                    </td>
                    <td className="py-1.5 pe-3 tabular-nums">{tp.units}</td>
                    <td className="py-1.5 whitespace-nowrap font-medium tabular-nums">
                      {fmtMoney(tp.revenue, "DZD", locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Products tab                                                        */
/* ------------------------------------------------------------------ */

function ProductsTab({
  storeId,
  back,
  locale,
  sellerId,
}: {
  storeId: string;
  back: string;
  locale: "ar" | "fr" | "en";
  sellerId: string | null;
}) {
  const queryClient = useQueryClient();
  const [moderating, setModerating] = useState<null | {
    id: string;
    decision: "approve" | "reject" | "hide";
    name: string;
    reason: string;
  }>(null);

  const productsQuery = useQuery({
    queryKey: ["admin-store-products", storeId],
    queryFn: () => getStoreProducts({ data: { storeId } }),
    staleTime: 30_000,
  });

  const moderateMutation = useMutation({
    mutationFn: (input: { id: string; decision: "approve" | "reject" | "hide"; reason?: string }) =>
      moderateAdminProduct({ data: input }),
    onSuccess: (_res, input) => {
      toast.success(
        input.decision === "approve"
          ? "Product approved"
          : input.decision === "reject"
            ? "Product rejected"
            : "Product hidden",
      );
      setModerating(null);
      queryClient.invalidateQueries({ queryKey: ["admin-store-products", storeId] });
      queryClient.invalidateQueries({ queryKey: ["admin-store-profile", storeId] });
    },
    onError: (err: Error) => {
      setModerating(null);
      toast.error(err.message);
    },
  });

  const products: StoreProductRow[] = productsQuery.data?.products ?? [];

  return (
    <AdminCard
      title="Products"
      subtitle={`${products.length} products in this store`}
      actions={
        sellerId ? (
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/products" search={{ q: "", moderation: "all", status: "all", sellerId, page: 1, create: "" }}>
              <Tag className="size-4 me-1.5" />
              Open in catalog
            </Link>
          </Button>
        ) : undefined
      }
    >
      {productsQuery.isPending ? (
        <TableSkeleton rows={8} />
      ) : productsQuery.isError ? (
        <EmptyState title="Could not load products" text="Please try again." />
      ) : products.length === 0 ? (
        <EmptyState title="No products" text="This store has no products yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pe-3 text-start font-medium">Product</th>
                <th className="py-1.5 pe-3 text-start font-medium">Price</th>
                <th className="py-1.5 pe-3 text-start font-medium">Moderation</th>
                <th className="py-1.5 pe-3 text-start font-medium">Status</th>
                <th className="py-1.5 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((prod) => (
                <tr key={prod.id} className="border-b last:border-0">
                  <td className="py-1.5 pe-3">
                    <Link
                      to="/admin/products/$productId"
                      params={{ productId: prod.id }}
                      search={{ back, q: "", moderation: "all", status: "all", sellerId: "all", page: 1, create: "" }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {productName(prod.name, "Unnamed product")}
                    </Link>
                    {prod.moderation_reason ? (
                      <p className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground">
                        {prod.moderation_reason}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-1.5 pe-3 whitespace-nowrap tabular-nums">
                    {fmtMoney(prod.base_price ?? 0, "DZD", locale)}
                  </td>
                  <td className="py-1.5 pe-3">
                    <StatusPill status={prod.moderation_status ?? "—"} />
                  </td>
                  <td className="py-1.5 pe-3">
                    <StatusPill status={prod.status ?? "—"} />
                  </td>
                  <td className="py-1.5">
                    <div className="flex justify-end gap-1.5">
                      {prod.moderation_status !== "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setModerating({
                              id: prod.id,
                              decision: "approve",
                              name: productName(prod.name, "product"),
                              reason: "",
                            })
                          }
                        >
                          <Check className="size-3.5 me-1" />
                          Approve
                        </Button>
                      )}
                      {prod.moderation_status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setModerating({
                              id: prod.id,
                              decision: "reject",
                              name: productName(prod.name, "product"),
                              reason: "",
                            })
                          }
                        >
                          <X className="size-3.5 me-1" />
                          Reject
                        </Button>
                      )}
                      {prod.visibility !== "hidden" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setModerating({
                              id: prod.id,
                              decision: "hide",
                              name: productName(prod.name, "product"),
                              reason: "",
                            })
                          }
                        >
                          <EyeOff className="size-3.5 me-1" />
                          Hide
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {moderating && moderating.decision !== "approve" && (
        <div className="mt-3 rounded-md border border-dashed p-3">
          <p className="mb-2 text-sm font-semibold">
            {moderating.decision === "reject"
              ? `Reject "${moderating.name}"? The product is hidden and the seller is notified.`
              : `Hide "${moderating.name}"? The product is hidden and the seller is notified.`}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Reason (sent to the seller)</span>
            <Input
              value={moderating.reason}
              onChange={(e) => setModerating((m) => (m ? { ...m, reason: e.target.value } : m))}
              placeholder="Explain why…"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant={moderating.decision === "reject" ? "destructive" : "default"}
              disabled={moderateMutation.isPending}
              onClick={() => {
                const trimmedReason = moderating.reason.trim();
                moderateMutation.mutate(
                  trimmedReason
                    ? { id: moderating.id, decision: moderating.decision, reason: trimmedReason }
                    : { id: moderating.id, decision: moderating.decision },
                );
              }}
            >
              {moderating.decision === "reject" ? "Reject product" : "Hide product"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModerating(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={moderating?.decision === "approve"}
        onOpenChange={(open) => {
          if (!open) setModerating(null);
        }}
        title={`Approve "${moderating?.name ?? "product"}"?`}
        description="The product will be published and visible to customers."
        confirmLabel="Approve"
        onConfirm={() => {
          if (!moderating) return;
          moderateMutation.mutate({ id: moderating.id, decision: "approve" });
        }}
      />
    </AdminCard>
  );
}

/* ------------------------------------------------------------------ */
/* Orders tab                                                          */
/* ------------------------------------------------------------------ */

function OrdersTab({ storeId, locale }: { storeId: string; locale: "ar" | "fr" | "en" }) {
  const ordersQuery = useQuery({
    queryKey: ["admin-store-orders", storeId],
    queryFn: () => getStoreOrders({ data: { storeId, limit: 50 } }),
    staleTime: 30_000,
  });
  const orders: StoreOrderRow[] = ordersQuery.data?.orders ?? [];

  return (
    <AdminCard title="Orders" subtitle="Most recent orders for this store">
      {ordersQuery.isPending ? (
        <TableSkeleton rows={8} />
      ) : ordersQuery.isError ? (
        <EmptyState title="Could not load orders" text="Please try again." />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders" text="This store has no orders yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pe-3 text-start font-medium">Order</th>
                <th className="py-1.5 pe-3 text-start font-medium">Status</th>
                <th className="py-1.5 pe-3 text-start font-medium">Subtotal</th>
                <th className="py-1.5 pe-3 text-start font-medium">Commission</th>
                <th className="py-1.5 text-start font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="py-1.5 pe-3">
                    <Link
                      to="/admin/orders/$orderId"
                      params={{ orderId: o.order_id }}
                      search={{
                        back: "",
                        locale,
                        q: "",
                        status: "",
                        sellerId: "",
                        wilaya: "",
                        paymentMethod: "",
                        minTotal: "",
                        maxTotal: "",
                        from: "",
                        to: "",
                        page: 1,
                      }}
                      className="font-mono text-xs underline-offset-4 hover:underline"
                      dir="ltr"
                    >
                      {o.order_number ?? o.order_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="py-1.5 pe-3">
                    <StatusPill status={o.status ?? "—"} />
                  </td>
                  <td className="py-1.5 pe-3 whitespace-nowrap tabular-nums">
                    {fmtMoney(o.subtotal ?? 0, "DZD", locale)}
                  </td>
                  <td className="py-1.5 pe-3 whitespace-nowrap tabular-nums">
                    {fmtMoney(o.commission_total ?? 0, "DZD", locale)}
                  </td>
                  <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(o.created_at, locale)}>
                    {timeAgo(o.created_at, locale)}
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

/* ------------------------------------------------------------------ */
/* Finance tab                                                         */
/* ------------------------------------------------------------------ */

function FinanceTab({ storeId, locale }: { storeId: string; locale: "ar" | "fr" | "en" }) {
  const financeQuery = useQuery({
    queryKey: ["admin-store-finance", storeId],
    queryFn: () => getStoreFinance({ data: { storeId } }),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      {financeQuery.isPending ? (
        <TableSkeleton rows={6} />
      ) : financeQuery.isError || !financeQuery.data ? (
        <AdminCard title="Finance">
          <EmptyState title="Could not load finance" text="Please try again." />
        </AdminCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Gross sales (delivered)"
              value={fmtMoney(financeQuery.data.grossSales, "DZD", locale)}
              hint={`${financeQuery.data.deliveredCount} delivered orders`}
            />
            <Stat
              label="Platform commission"
              value={fmtMoney(financeQuery.data.commissionEarned, "DZD", locale)}
              hint="Earned on delivered sales"
            />
            <Stat
              label="Seller net"
              value={fmtMoney(financeQuery.data.sellerNet, "DZD", locale)}
              hint="Gross sales minus commission"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Pending sales"
              value={fmtMoney(financeQuery.data.pendingSales, "DZD", locale)}
              hint="Orders not yet delivered"
            />
            <Stat
              label="Pending commission"
              value={fmtMoney(financeQuery.data.pendingCommission, "DZD", locale)}
              hint="Commission on pending orders"
            />
            <Stat
              label="Total orders"
              value={String(financeQuery.data.orderCount)}
              hint="All seller orders"
            />
          </div>
          <AdminCard title="How it is computed" subtitle="Source of truth">
            <p className="text-sm text-muted-foreground">
              All numbers come from real <span className="font-mono" dir="ltr">seller_orders</span> rows
              for this store's seller. Delivered orders count as gross sales; the platform commission
              is the sum of per-order commission totals; seller net is gross sales minus commission.
              Cancelled, returned and refunded orders are excluded.
            </p>
          </AdminCard>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seller tab                                                          */
/* ------------------------------------------------------------------ */

function SellerTab({
  profile,
  storeId,
  back,
  locale,
}: {
  profile: NonNullable<Profile>;
  storeId: string;
  back: string;
  locale: "ar" | "fr" | "en";
}) {
  const p = getTranslations(locale).admin.stores.profile;
  const seller = profile.seller;

  return (
    <AdminCard
      title={p.seller}
      subtitle={p.sellerSubtitle}
      actions={
        seller ? (
          <Button size="sm" asChild>
            <Link
              to="/admin/sellers/$sellerId"
              params={{ sellerId: seller.id }}
              search={{ back, tab: "overview", q: "", status: "all", page: 1, create: "" }}
            >
              <UserRound className="size-4 me-1.5" />
              Open seller workspace
            </Link>
          </Button>
        ) : undefined
      }
    >
      {seller ? (
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Legal name</dt>
            <dd className="font-medium">{seller.legal_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Contact</dt>
            <dd>
              {[seller.first_name, seller.last_name].filter(Boolean).join(" ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="break-all" dir="ltr">{seller.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Phone</dt>
            <dd dir="ltr">{seller.phone ?? "—"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-xs text-muted-foreground">Account status</dt>
            <dd>
              <StatusPill status={seller.account_status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Commission rate</dt>
            <dd className="font-medium">{(Number(seller.commission_rate) * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Seller since</dt>
            <dd title={fmtDateTime(seller.created_at, locale)}>{timeAgo(seller.created_at, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Store ID</dt>
            <dd className="font-mono text-xs" dir="ltr">{storeId}</dd>
          </div>
        </dl>
      ) : (
        <EmptyState title={p.couldNotLoad} text="No seller is linked to this store." />
      )}
    </AdminCard>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications tab                                                   */
/* ------------------------------------------------------------------ */

function NotificationsTab({
  storeId,
  storeName,
  sellerName,
}: {
  storeId: string;
  storeName: string;
  sellerName: string | null;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");

  const sendMutation = useMutation({
    mutationFn: () =>
      sendStoreNotification({
        data: { storeId, title: title.trim(), message: message.trim(), link: link.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success("Notification sent to the seller.");
      setTitle("");
      setMessage("");
      setLink("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSend = title.trim().length > 0 && message.trim().length > 0 && !sendMutation.isPending;

  return (
    <AdminCard
      title="Notify seller"
      subtitle={
        sellerName
          ? `Send a message to the team of "${storeName}" (${sellerName}). It appears in their notification center.`
          : `Send a message to the team of "${storeName}". It appears in their notification center.`
      }
    >
      <div className="max-w-2xl space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Title</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Your store has been verified"
            maxLength={120}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Message</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write the message for the seller…"
            rows={5}
            maxLength={2000}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Link (optional)</span>
          <span className="mb-1 block text-xs text-muted-foreground">
            Relative path, e.g. /seller/products
          </span>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/seller/products"
            maxLength={500}
            dir="ltr"
          />
        </label>
        <div>
          <Button onClick={() => sendMutation.mutate()} disabled={!canSend}>
            <Send className="size-4 me-1.5" />
            {sendMutation.isPending ? "Sending…" : "Send notification"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sent notifications are recorded in the audit log and cannot be edited or recalled.
        </p>
      </div>
    </AdminCard>
  );
}
