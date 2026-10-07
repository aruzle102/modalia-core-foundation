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
  Power,
  ShieldCheck,
  ShieldX,
  Star,
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
} from "@/components/admin/ui";
import { getStoreProfile, updateStoreStatus } from "@/lib/admin-stores.functions";
import { updateStoreVerification } from "@/lib/admin-sellers.functions";
import { useAdminT } from "@/components/admin/use-admin-t";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { accentById, normalizeStoreSettings, type TrilingualText } from "@/lib/store-settings";

export const Route = createFileRoute("/admin/stores/$storeId")({
  validateSearch: (search: Record<string, unknown>) => ({
    back: strParam(search["back"]),
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

function StoreProfilePage() {
  const { storeId } = Route.useParams();
  const { back } = Route.useSearch();
  const queryClient = useQueryClient();
  const locale = useAdminLocale();
  const adminT = useAdminT();
  const common = getTranslations(locale).common;
  const p = getTranslations(locale).admin.stores.profile;
  const sellerT = adminT.sellers.profile;
  const navLabels = getTranslations(locale).adminNav.items;
  const [confirmAction, setConfirmAction] = useState<null | {
    kind: "status" | "verify" | "unverify";
    status?: StoreStatus;
    title: string;
    description: string;
    confirmLabel: string;
  }>(null);

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
                  {store.verification_status === "unverified" && (
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
                  )}
                  {store.verification_status === "verified" && (
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
                  )}
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={store.status} />
                <StatusPill status={store.verification_status} />
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

            {/* Identity */}
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

              {/* Seller */}
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

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label={p.productsCount} value={String(profile.stats.productCount)} hint={p.productsHint} />
              <Stat label={p.ordersCount} value={String(profile.stats.orderCount)} hint={p.ordersHint} />
              <Stat label={p.deliveredSales} value={fmtMoney(profile.stats.salesTotal, "DZD", locale)} hint={p.deliveredSalesHint} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat
                label={p.reviewsCount}
                value={String(profile.stats.reviewCount)}
                hint={p.reviewsHint}
              />
              <Stat
                label={p.avgRating}
                value={profile.stats.avgRating !== null ? profile.stats.avgRating.toFixed(1) : "—"}
                hint={p.avgRatingHint}
              />
              <Stat
                label={p.activeOffers}
                value={String(profile.stats.activeOfferCount)}
                hint={p.activeOffersHint}
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

            {/* Appearance + Collections */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <AdminCard title={p.appearance} subtitle={p.appearanceSubtitle}>
                {settings ? (
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
                      <dd className="text-muted-foreground">
                        {announcementText || p.notSet}
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">{p.featuredProducts}</dt>
                        <dd className="font-medium tabular-nums">
                          {settings.featured_product_ids.length}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{p.featuredCategories}</dt>
                        <dd className="font-medium tabular-nums">
                          {settings.featured_category_ids.length}
                        </dd>
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
                ) : (
                  <EmptyState title={p.noSections} />
                )}
              </AdminCard>

              <AdminCard title={p.collections} subtitle={p.collectionsSubtitle}>
                {collections.length === 0 ? (
                  <EmptyState title={p.noCollections} />
                ) : (
                  <ul className="space-y-3">
                    {collections.map((c) => (
                      <li key={c.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {trilingualText(c.title, locale) || c.id}
                          </span>
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

            {/* Products + Orders */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <AdminCard
                title={p.recentProducts}
                subtitle={`${profile.stats.productCount} — ${p.productsHint}`}
                actions={
                  seller ? (
                    <Link
                      to="/admin/products"
                      search={{ q: "", moderation: "all", status: "all", sellerId: seller.id, page: 1, create: "" }}
                    >
                      <Button variant="outline" size="sm">
                        {p.manageProducts}
                      </Button>
                    </Link>
                  ) : undefined
                }
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

              <AdminCard
                title={p.recentOrders}
                subtitle={p.recentOrdersSubtitle}
                actions={
                  seller ? (
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
                      <Button variant="outline" size="sm">
                        {p.viewAllOrders}
                      </Button>
                    </Link>
                  ) : undefined
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
            }
          }}
        />
      </AdminShell>
    </AdminGate>
  );
}
