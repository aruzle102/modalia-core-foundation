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
  ExternalLink,
  LayoutDashboard,
  Pencil,
  Power,
  ShieldCheck,
  ShieldX,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  updateSellerStatus,
  updateStoreVerification,
  updateCommissionRate,
} from "@/lib/admin-sellers.functions";
import { createSupportSession } from "@/lib/admin-support.functions";
import { EditSellerDialog } from "@/components/admin/EditSellerDialog";
import { StaffPermissionsDialog, type StaffPermissionsInitial } from "@/components/admin/StaffPermissionsDialog";
import { useAdminT } from "@/components/admin/use-admin-t";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";

export const Route = createFileRoute("/admin/sellers/$sellerId")({
  validateSearch: (search: Record<string, unknown>) => ({
    back: strParam(search["back"]),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Seller Profile — Modalia Admin" }],
  }),
  component: SellerProfilePage,
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

function SellerProfilePage() {
  const { sellerId } = Route.useParams();
  const { back } = Route.useSearch();
  const queryClient = useQueryClient();
  const locale = useAdminLocale();
  const t = useAdminT().sellers;
  const common = getTranslations(locale).common;
  const p = t.profile;
  const navLabels = getTranslations(locale).adminNav.items;
  const [confirmAction, setConfirmAction] = useState<null | {
    kind: "suspend" | "disable" | "verify" | "unverify";
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

  const commissionMutation = useMutation({
    mutationFn: (rate: number) => updateCommissionRate({ data: { sellerId, rate } }),
    onSuccess: (res) => {
      toast.success(p.rateUpdated((res.rate * 100).toFixed(1)));
      setCommissionInput("");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
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

  // V8 Sec 47 (implemented): opens the seller's dashboard in read-only
  // admin support mode. The server mints a short-lived grant bound to this
  // admin; the raw token travels once in the new tab's URL and is never
  // persisted. Replaces the Sec-44 placeholder (registry #140).
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

  return (
    <AdminGate>
      <AdminShell
        title={store?.name ?? seller?.legal_name ?? p.couldNotLoad}
        subtitle={p.subtitle}
        breadcrumbs={[
          { label: navLabels.sellers, to: "/admin/sellers", back },
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
            {/* Header */}
            <AdminCard
              title={store?.name ?? seller.legal_name}
              subtitle={seller.email ?? ""}
              actions={
                <div className="flex flex-wrap gap-2">
                  {store?.slug && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/store/$slug"
                        params={{ slug: store.slug }}
                        search={{ locale }}
                      >
                        <ExternalLink className="size-4 me-1.5" />
                        {p.viewPublicStore}
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openSellerDashboard}
                    disabled={supportOpening}
                  >
                    <LayoutDashboard className="size-4 me-1.5" />
                    {p.openDashboard}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="size-4 me-1.5" />
                    {t.edit}
                  </Button>
                  {seller.account_status !== "active" && (
                    <Button
                      size="sm"
                      onClick={() => statusMutation.mutate("active")}
                      disabled={statusMutation.isPending}
                    >
                      <Power className="size-4 me-1.5" />
                      {p.activate}
                    </Button>
                  )}
                  {seller.account_status === "active" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirmAction({
                            kind: "suspend",
                            title: t.confirmSuspendTitle,
                            description: t.confirmSuspendDesc,
                            confirmLabel: t.suspend,
                          })
                        }
                      >
                        <Ban className="size-4 me-1.5" />
                        {t.suspend}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setConfirmAction({
                            kind: "disable",
                            title: p.confirmDisableTitle,
                            description: p.confirmDisableDesc,
                            confirmLabel: p.disableSeller,
                          })
                        }
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
                      onClick={() =>
                        setConfirmAction({
                          kind: "verify",
                          title: p.confirmVerifyTitle,
                          description: p.confirmVerifyDesc(store.name),
                          confirmLabel: p.verifyStore,
                        })
                      }
                    >
                      <ShieldCheck className="size-4 me-1.5" />
                      {p.verifyStore}
                    </Button>
                  )}
                  {store && store.verification_status === "verified" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setConfirmAction({
                          kind: "unverify",
                          title: p.confirmUnverifyTitle,
                          description: p.confirmUnverifyDesc(store.name),
                          confirmLabel: p.removeVerification,
                        })
                      }
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

            {/* Sales stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label={p.products} value={String(profile.stats.productCount)} hint={p.liveCatalogHint} />
              <Stat label={p.deliveredSales} value={fmtMoney(profile.stats.salesTotal, "DZD", locale)} hint={p.deliveredSalesHint} />
              <Stat
                label={p.commissionPayable}
                value={fmtMoney(profile.stats.commissionPayable, "DZD", locale)}
                hint={p.commissionPayableHint}
              />
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

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Store */}
              <AdminCard
                title={p.store}
                subtitle={p.storeSubtitle}
                actions={
                  store?.slug ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/store/$slug"
                        params={{ slug: store.slug }}
                        search={{ locale }}
                      >
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
                      <dd className="whitespace-pre-wrap text-muted-foreground">
                        {store.description ?? "—"}
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">{p.logoPath}</dt>
                        <dd className="break-all font-mono text-xs" dir="ltr">
                          {store.logo_path ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{p.bannerPath}</dt>
                        <dd className="break-all font-mono text-xs" dir="ltr">
                          {store.banner_path ?? "—"}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="text-xs text-muted-foreground">{p.verification}</dt>
                      <dd>
                        <StatusPill status={store.verification_status} />
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <EmptyState title={p.noStore} text={p.noStoreDesc} />
                )}
              </AdminCard>

              {/* Commission */}
              <AdminCard title={p.commission} subtitle={p.commissionSubtitle}>
                <div className="flex items-end gap-2">
                  <div className="text-3xl font-bold">
                    {(Number(seller.commission_rate) * 100).toFixed(1)}%
                  </div>
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
                      <Button
                        onClick={submitCommission}
                        disabled={commissionMutation.isPending || !commissionInput.trim()}
                      >
                        {commissionMutation.isPending ? p.saving : p.updateRate}
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
                            <td className="py-1.5 pe-3 font-medium">
                              {(Number(h.rate) * 100).toFixed(1)}%
                            </td>
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
            </div>

            {/* Products + Orders */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <AdminCard
                title={p.products}
                subtitle={`${profile.stats.productCount} ${p.productsSubtitle}`}
                actions={
                  <Link to="/admin/products" search={{ q: "", moderation: "all", status: "all", sellerId, page: 1, create: "" }}>
                    <Button variant="outline" size="sm">
                      {p.viewProducts}
                    </Button>
                  </Link>
                }
              >
                <p className="text-sm text-muted-foreground">
                  {profile.stats.productCount === 0
                    ? p.noProducts
                    : p.productCountLabel(profile.stats.productCount)}
                </p>
              </AdminCard>

              <AdminCard
                title={p.recentOrders}
                subtitle={p.recentOrdersSubtitle}
                actions={
                  <Link
                    to="/admin/orders"
                    search={{
                      locale,
                      q: "",
                      status: "",
                      sellerId,
                      wilaya: "",
                      paymentMethod: "",
                      minTotal: "",
                      maxTotal: "",
                      from: "",
                      to: "",
                      page: 1,
                    }}
                  >
                    <Button variant="outline" size="sm">
                      {p.viewAllOrders}
                    </Button>
                  </Link>
                }
              >
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
                          <th className="py-1.5 pe-3 text-start font-medium">{p.commissionCol}</th>
                          <th className="py-1.5 text-start font-medium">{p.date}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.recentOrders.map((o) => {
                          const orderNumber =
                            (o.orders as { order_number?: string } | null)?.order_number ?? o.order_id.slice(0, 8);
                          return (
                            <tr key={o.id} className="border-b last:border-0">
                              <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                                {orderNumber}
                              </td>
                              <td className="py-1.5 pe-3">
                                <StatusPill status={o.status} />
                              </td>
                              <td className="py-1.5 pe-3 whitespace-nowrap">{fmtMoney(o.subtotal, "DZD", locale)}</td>
                              <td className="py-1.5 pe-3 whitespace-nowrap">
                                {fmtMoney(o.commission_total, "DZD", locale)}
                              </td>
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

            {/* Settlements + Reviews */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                            <td className="py-1.5 pe-3">
                              <StatusPill status={s.status} />
                            </td>
                            <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                              {s.payment_reference ?? "—"}
                            </td>
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
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(String(r.created_at), locale)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminCard>
            </div>

            {/* Staff + Activity */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                            <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                              {m.user_id.slice(0, 8)}…
                            </td>
                            <td className="py-1.5 pe-3">
                              <StatusPill status={m.role} />
                            </td>
                            <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(m.created_at, locale)}>
                              {timeAgo(m.created_at, locale)}
                            </td>
                            <td className="py-1.5 text-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setEditingStaff({
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

              <AdminCard title={p.activity} subtitle={p.activitySubtitle}>
                {profile.auditLogs.length === 0 ? (
                  <EmptyState title={p.noActivity} />
                ) : (
                  <ul className="space-y-2.5">
                    {profile.auditLogs.map((log) => (
                      <li key={log.id} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="font-mono text-xs" dir="ltr">
                            {log.action}
                          </p>
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

            {/* Linked application */}
            {profile.application && (
              <AdminCard title={p.application} subtitle={p.applicationSubtitle}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm">
                    <StatusPill status={profile.application.status} />
                    <span className="font-medium">
                      {profile.application.first_name} {profile.application.last_name}
                    </span>
                    <span className="text-muted-foreground">
                      {profile.application.proposed_store_name}
                    </span>
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
            if (confirmAction?.kind === "suspend") statusMutation.mutate("suspended");
            else if (confirmAction?.kind === "disable") statusMutation.mutate("disabled");
            else if (confirmAction?.kind === "verify") verifyMutation.mutate();
            else if (confirmAction?.kind === "unverify") unverifyMutation.mutate();
          }}
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
