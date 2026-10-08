import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Pencil,
  Star,
  StarOff,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  Store,
  LayoutDashboard,
} from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
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
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getOfficialStore,
  getOfficialStoreLinkStatus,
  linkOfficialStoreOwner,
  unlinkOfficialStoreOwner,
} from "@/lib/admin-official-store.functions";
import {
  listAdminProducts,
  moderateAdminProduct,
  updateAdminProduct,
  setProductStatus,
  createAdminProduct,
  bulkModerateAdminProducts,
  bulkSetProductStatus,
  listAdminCategories,
  moderateReview,
  upsertCoupon,
  setCouponStatus,
  deleteCoupon,
  type AdminProductListItem,
  type AdminCouponRow,
  type ReviewQueue,
} from "@/lib/admin-catalog.functions";
import {
  getOfficialStoreStats,
  listOfficialStoreInventory,
  adjustOfficialStoreInventory,
  listOfficialStoreReviews,
  listOfficialStoreCoupons,
  listOfficialStoreCategories,
  listOfficialStoreProductsLite,
  getOfficialStoreAppearance,
  updateOfficialStoreAppearance,
  updateOfficialStoreSections,
  upsertOfficialCollection,
  deleteOfficialCollection,
  type OfficialCollection,
} from "@/lib/admin-official-store.functions";
import { STORE_ACCENTS } from "@/lib/store-settings";
import { getLocale, getTranslations } from "@/lib/i18n";
import { errMsg, pickName, Pager } from "./_shared";

const TABS = [
  "overview",
  "products",
  "inventory",
  "categories",
  "collections",
  "offers",
  "reviews",
  "appearance",
] as const;
type TabId = (typeof TABS)[number];

export const Route = createFileRoute("/admin/official-store")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    tab: (TABS as readonly string[]).includes(
      typeof search["tab"] === "string" ? search["tab"] : "",
    )
      ? (search["tab"] as TabId)
      : "overview",
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Official Store — Modalia Admin" },
    ],
  }),
  component: OfficialStorePage,
});

type OfficialStoreData = NonNullable<Awaited<ReturnType<typeof getOfficialStore>>["official"]>;

function OfficialStorePage() {
  const { locale, tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const t = getTranslations(locale).admin.officialStore;
  const navTitle = getTranslations(locale).adminNav.items.officialStore;

  const storeQuery = useQuery({
    queryKey: ["admin-official-store"],
    queryFn: () => getOfficialStore({ data: {} }),
    retry: false,
  });
  const official = storeQuery.data?.official ?? null;

  const linkQuery = useQuery({
    queryKey: ["admin-official-store-link"],
    queryFn: () => getOfficialStoreLinkStatus({ data: {} }),
    retry: false,
  });
  const linked = linkQuery.data?.linked === true;
  const linkMutation = useMutation({
    mutationFn: () => linkOfficialStoreOwner({ data: {} }),
    onSuccess: async () => {
      await linkQuery.refetch();
      toast.success(t.sellerDashboardLinked);
      navigate({ to: "/seller", search: { locale } });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const unlinkMutation = useMutation({
    mutationFn: () => unlinkOfficialStoreOwner({ data: {} }),
    onSuccess: async () => {
      await linkQuery.refetch();
      toast.success(t.sellerDashboardUnlinked);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const setTab = (next: TabId) => navigate({ search: (prev) => ({ ...prev, tab: next }) });

  return (
    <AdminGate>
      <AdminShell
        title={navTitle}
        subtitle={t.subtitle}
        breadcrumbs={[{ label: navTitle }]}
        actions={
          official ? (
            <div className="flex items-center gap-2">
              {linked ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => navigate({ to: "/seller", search: { locale } })}
                  >
                    <LayoutDashboard className="h-4 w-4 me-1.5" />
                    {t.openSellerDashboard}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={unlinkMutation.isPending}
                    onClick={() => unlinkMutation.mutate()}
                    title={t.unlinkSellerDashboardHint}
                  >
                    {t.unlinkSellerDashboard}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={linkMutation.isPending}
                  onClick={() => linkMutation.mutate()}
                >
                  <LayoutDashboard className="h-4 w-4 me-1.5" />
                  {t.linkSellerDashboard}
                </Button>
              )}
              <Link
                to="/store/$slug"
                params={{ slug: official.store.slug }}
                search={{ locale }}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Store className="h-4 w-4" />
                {t.openStorefront}
              </Link>
            </div>
          ) : undefined
        }
      >
        {/* Separation notice: the official store is managed as a regular seller store */}
        {official && linked ? (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-medium">The official store is managed as a seller store.</p>
            <p className="mt-1 text-blue-700">
              Add and manage products from the seller dashboard. This admin page is for
              store linking and oversight only.
            </p>
          </div>
        ) : null}
        {storeQuery.isPending ? (
          <TableSkeleton rows={6} />
        ) : storeQuery.isError ? (
          <EmptyState
            title={t.common.loadingError}
            text={errMsg(storeQuery.error)}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => storeQuery.refetch()}
              >
                {t.common.tryAgain}
              </Button>
            }
          />
        ) : !official ? (
          <EmptyState
            title={t.noOfficialTitle}
            text={t.noOfficialText}
            action={
              <Link
                to="/admin/stores"
                search={{ locale, q: "", status: "", page: 1 }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {t.browseStores}
              </Link>
            }
          />
        ) : (
          <div className="space-y-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
              <div className="overflow-x-auto">
                <TabsList>
                  {(Object.keys(t.tabs) as TabId[]).map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {t.tabs[id]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
            {tab === "overview" && <OverviewTab locale={locale} official={official} />}
            {tab === "products" && <ProductsTab locale={locale} official={official} />}
            {tab === "inventory" && <InventoryTab locale={locale} official={official} />}
            {tab === "categories" && <CategoriesTab locale={locale} official={official} />}
            {tab === "collections" && <CollectionsTab locale={locale} official={official} />}
            {tab === "offers" && <OffersTab locale={locale} official={official} />}
            {tab === "reviews" && <ReviewsTab locale={locale} official={official} />}
            {tab === "appearance" && <AppearanceTab locale={locale} official={official} />}
          </div>
        )}
      </AdminShell>
    </AdminGate>
  );
}

/** Three labeled inputs for a {ar,fr,en} text value. Plain text only. */
function TriText({
  id,
  value,
  onChange,
  labels,
}: {
  id: string;
  value: { ar: string; fr: string; en: string };
  onChange: (next: { ar: string; fr: string; en: string }) => void;
  labels: { ar: string; fr: string; en: string };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {(
        [
          ["ar", labels.ar, "rtl"],
          ["fr", labels.fr, "ltr"],
          ["en", labels.en, "ltr"],
        ] as const
      ).map(([key, label, dir]) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`${id}-${key}`}>{label}</Label>
          <Input
            id={`${id}-${key}`}
            dir={dir}
            value={value[key]}
            maxLength={120}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewTab({
  locale,
  official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const navigate = Route.useNavigate();
  const statsQuery = useQuery({
    queryKey: ["admin-official-store-stats"],
    queryFn: () => getOfficialStoreStats({ data: {} }),
    retry: false,
  });
  const s = statsQuery.data?.stats;
  const go = (next: TabId) => navigate({ search: (prev) => ({ ...prev, tab: next }) });

  return (
    <div className="space-y-6">
      <AdminCard
        title={t.overview.identity}
        subtitle={`/${official.store.slug}`}
        actions={
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <BadgeCheck className="h-4 w-4" /> Official
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={official.store.status} />
          <StatusPill status={official.store.verification_status} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t.overview.seller} value={official.seller_legal_name ?? "—"} />
          <Stat
            label={t.overview.contact}
            value={official.store.contact_email ?? official.store.contact_phone ?? "—"}
          />
          <Stat
            label={t.overview.avgRating}
            value={s?.reviews.avgRating != null ? `${s.reviews.avgRating} / 5` : "—"}
          />
          <Stat label={t.overview.pendingReviews} value={s?.reviews.pending ?? "…"} />
        </div>
        {official.store.description ? (
          <p className="mt-4 text-sm text-muted-foreground">{official.store.description}</p>
        ) : null}
      </AdminCard>

      {statsQuery.isPending ? (
        <TableSkeleton rows={3} />
      ) : statsQuery.isError ? (
        <EmptyState title={t.common.loadingError} text={errMsg(statsQuery.error)} />
      ) : s ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard title={t.overview.products}>
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t.overview.published} value={s.products.published} />
              <Stat label={t.overview.drafts} value={s.products.draft} />
              <Stat label={t.overview.products} value={s.products.total} />
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => go("products")}>
              {t.overview.goToProducts}
            </Button>
          </AdminCard>
          <AdminCard title={t.tabs.inventory}>
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t.overview.stockOk} value={s.inventory.ok} />
              <Stat label={t.overview.stockLow} value={s.inventory.low} />
              <Stat label={t.overview.stockOut} value={s.inventory.out} />
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => go("inventory")}>
              {t.tabs.inventory}
            </Button>
          </AdminCard>
          <AdminCard title={t.overview.reviews}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t.overview.reviews} value={s.reviews.total} />
              <Stat label={t.overview.pendingReviews} value={s.reviews.pending} />
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => go("reviews")}>
              {t.tabs.reviews}
            </Button>
          </AdminCard>
          <AdminCard title={t.overview.orders}>
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t.overview.orders} value={s.orders.total} />
              <Stat label={t.overview.variants} value={s.variants.total} />
              <Stat label={t.overview.activeOffers} value={s.coupons.active} />
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => go("offers")}>
              {t.tabs.offers}
            </Button>
          </AdminCard>
        </div>
      ) : null}

      <AdminCard
        title={t.overview.recentProducts}
        actions={
          <Button size="sm" variant="ghost" onClick={() => go("products")}>
            {t.overview.goToProducts}
          </Button>
        }
      >
        {official.recent_products.length === 0 ? (
          <EmptyState title={t.overview.noProducts} text={t.overview.noProductsText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t.products.name}</th>
                  <th className="px-3 py-2 font-medium">{t.products.price}</th>
                  <th className="px-3 py-2 font-medium">{t.products.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {official.recent_products.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <Link
                        to="/product/$slug"
                        params={{ slug: p.slug }}
                        search={{ locale }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {(p.name as Record<string, string> | null)?.[locale] ??
                          (p.name as Record<string, string> | null)?.["fr"] ??
                          p.slug}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-medium">{fmtMoney(p.base_price, "DZD", locale)}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={p.status} />
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
/* Products (same engine as /admin/products, scoped to the official     */
/* store's seller)                                                     */
/* ------------------------------------------------------------------ */

type ProductRow = AdminProductListItem;
const MODERATION_FILTERS = ["pending", "approved", "rejected"] as const;
const STATUS_FILTERS = ["draft", "active", "archived"] as const;

function ProductsTab({
  locale,
  official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const tb = getTranslations(locale).admin.products;
  const queryClient = useQueryClient();
  const sellerId = official.store.seller_id;

  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [moderation, setModeration] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);

  // Debounce the search input.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const filters = {
    q: q || undefined,
    moderationStatus: moderation === "all" ? undefined : moderation,
    status: status === "all" ? undefined : (status as "draft" | "active" | "archived"),
    sellerId,
    page,
  };
  const productsQuery = useQuery({
    queryKey: ["admin-official-store-products", filters],
    queryFn: () => listAdminProducts({ data: filters }),
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["admin-categories-flat"],
    queryFn: () => listAdminCategories(),
    retry: false,
  });
  const flat = categoriesQuery.data?.flat ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-official-store-products"] });

  const mutate = (
    label: string,
    fn: () => Promise<unknown>,
    opts?: { confirm?: { title: string; description: string } },
  ) => {
    const run = () =>
      toast.promise(fn(), {
        loading: `${label}…`,
        success: () => {
          invalidate();
          return t.products.saved;
        },
        error: (e) => errMsg(e),
      });
    if (opts?.confirm) {
      setConfirm({ title: opts.confirm.title, description: opts.confirm.description, run });
    } else {
      void run();
    }
  };

  const moderate = useMutation({
    mutationFn: (payload: {
      id: string;
      decision: "approve" | "reject" | "hide";
      reason?: string;
    }) => moderateAdminProduct({ data: payload }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatusMut = useMutation({
    mutationFn: (payload: { id: string; status: "draft" | "active" | "archived" }) =>
      setProductStatus({ data: payload }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });
  const feature = useMutation({
    mutationFn: (payload: { id: string; featured: boolean }) =>
      updateAdminProduct({ data: { id: payload.id, patch: { featured: payload.featured } } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });

  const products = productsQuery.data?.products ?? [];
  const total = productsQuery.data?.total ?? 0;
  const pageSize = productsQuery.data?.pageSize ?? 25;

  useEffect(() => {
    setSelected([]);
  }, [page, q, moderation, status]);

  const toggleSelect = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleSelectAll = () =>
    setSelected((cur) =>
      cur.length === products.length ? [] : products.map((p) => p.id as string),
    );

  const bulkMutate = (actionLabel: string, fn: () => Promise<{ ok: true; count: number }>) => {
    setConfirm({
      title: tb.confirmBulkTitle(actionLabel, selected.length),
      description: tb.confirmBulkDesc,
      run: () =>
        toast.promise(fn(), {
          loading: `${actionLabel}…`,
          success: (res) => {
            setSelected([]);
            invalidate();
            return `${tb.done} (${res.count})`;
          },
          error: (e) => errMsg(e),
        }),
    });
  };

  return (
    <div className="space-y-6">
      <AdminCard
        title={t.products.title}
        subtitle={t.products.subtitle(total)}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> {t.products.create}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t.products.name}</Label>
            <Input
              placeholder={t.products.searchPh}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.products.moderation}</Label>
            <Select
              value={moderation}
              onValueChange={(v) => {
                setModeration(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.products.all}</SelectItem>
                {MODERATION_FILTERS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.products.status}</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.products.all}</SelectItem>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6">
          {selected.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <span className="text-sm font-medium">{tb.selected(selected.length)}</span>
              <div className="ms-auto flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    bulkMutate(tb.bulkApprove, () =>
                      bulkModerateAdminProducts({ data: { ids: selected, decision: "approve" } }),
                    )
                  }
                >
                  {tb.bulkApprove}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    bulkMutate(tb.bulkReject, () =>
                      bulkModerateAdminProducts({
                        data: {
                          ids: selected,
                          decision: "reject",
                          reason: "Rejected by admin (bulk)",
                        },
                      }),
                    )
                  }
                >
                  {tb.bulkReject}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    bulkMutate(tb.bulkHide, () =>
                      bulkModerateAdminProducts({ data: { ids: selected, decision: "hide" } }),
                    )
                  }
                >
                  {tb.bulkHide}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    bulkMutate(tb.bulkPublish, () =>
                      bulkSetProductStatus({ data: { ids: selected, status: "active" } }),
                    )
                  }
                >
                  {tb.bulkPublish}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    bulkMutate(tb.bulkArchive, () =>
                      bulkSetProductStatus({ data: { ids: selected, status: "archived" } }),
                    )
                  }
                >
                  {tb.bulkArchive}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  ×
                </Button>
              </div>
            </div>
          ) : null}
          {productsQuery.isPending ? (
            <TableSkeleton />
          ) : productsQuery.isError ? (
            <EmptyState
              title={t.common.loadingError}
              text={errMsg(productsQuery.error)}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => productsQuery.refetch()}
                >
                  {t.common.tryAgain}
                </Button>
              }
            />
          ) : products.length === 0 ? (
            <EmptyState title={t.products.empty} text={t.products.emptyText} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-start text-small">
                <thead>
                  <tr className="border-b border-border text-caption text-muted-foreground">
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        checked={products.length > 0 && selected.length === products.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all products on this page"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">{t.products.name}</th>
                    <th className="px-3 py-2 font-medium">{t.products.price}</th>
                    <th className="px-3 py-2 font-medium">{t.products.moderation}</th>
                    <th className="px-3 py-2 font-medium">{t.products.status}</th>
                    <th className="px-3 py-2 font-medium">★</th>
                    <th className="px-3 py-2 font-medium text-end">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((p) => (
                    <tr key={p.id} className="align-top">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selected.includes(p.id as string)}
                          onCheckedChange={() => toggleSelect(p.id as string)}
                          aria-label={`Select ${pickName(p.name) || p.slug}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{pickName(p.name) || p.slug}</p>
                        <p className="text-caption text-muted-foreground">
                          {p.slug} · {fmtDateTime(p.created_at, locale)}
                        </p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {fmtMoney(Number(p.base_price), "DZD", locale)}
                        {p.compare_at_price ? (
                          <span className="ms-2 text-caption text-muted-foreground line-through">
                            {fmtMoney(Number(p.compare_at_price), "DZD", locale)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={p.moderation_status} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={p.status} />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => feature.mutate({ id: p.id, featured: !p.featured })}
                          aria-label={p.featured ? "Unfeature product" : "Feature product"}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {p.featured ? (
                            <Star className="size-4 fill-brand text-brand" />
                          ) : (
                            <StarOff className="size-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                            <Pencil className="size-3.5" /> {t.products.edit}
                          </Button>
                          {p.moderation_status !== "approved" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => moderate.mutate({ id: p.id, decision: "approve" })}
                              disabled={moderate.isPending}
                            >
                              {t.products.approve}
                            </Button>
                          ) : null}
                          {p.moderation_status === "approved" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => moderate.mutate({ id: p.id, decision: "hide" })}
                              disabled={moderate.isPending}
                            >
                              {t.products.hide}
                            </Button>
                          ) : null}
                          {p.moderation_status === "pending" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                mutate(
                                  "reject-product",
                                  () =>
                                    moderateAdminProduct({
                                      data: {
                                        id: p.id,
                                        decision: "reject",
                                        reason: "Rejected by admin",
                                      },
                                    }),
                                  {
                                    confirm: {
                                      title: t.products.confirmRejectTitle,
                                      description: t.products.confirmRejectDesc,
                                    },
                                  },
                                )
                              }
                            >
                              {t.products.reject}
                            </Button>
                          ) : null}
                          {p.status !== "active" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setStatusMut.mutate({ id: p.id, status: "active" })}
                              disabled={setStatusMut.isPending}
                            >
                              {t.products.publish}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                mutate(
                                  "archive-product",
                                  () =>
                                    setProductStatus({ data: { id: p.id, status: "archived" } }),
                                  {
                                    confirm: {
                                      title: t.products.confirmArchiveTitle,
                                      description: t.products.confirmArchiveDesc,
                                    },
                                  },
                                )
                              }
                            >
                              {t.products.archive}
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
          <div className="mt-4">
            <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
          </div>
        </div>
      </AdminCard>

      {editing ? (
        <OfficialEditProductDialog
          locale={locale}
          product={editing}
          categories={flat}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      ) : null}
      {creating ? (
        <OfficialNewProductDialog
          locale={locale}
          sellerId={sellerId}
          categories={flat}
          onClose={() => setCreating(false)}
          onSaved={() => {
            invalidate();
            setCreating(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={t.products.confirm}
        danger
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      />
    </div>
  );
}

function OfficialEditProductDialog({
  locale,
  product,
  categories,
  onClose,
  onSaved,
}: {
  locale: "ar" | "fr" | "en";
  product: ProductRow;
  categories: { id: string; parent_id: string | null; slug: string; name: unknown }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const [basePrice, setBasePrice] = useState(String(product.base_price ?? ""));
  const [compareAt, setCompareAt] = useState(
    product.compare_at_price != null ? String(product.compare_at_price) : "",
  );
  const [weight, setWeight] = useState(
    product.weight_grams != null ? String(product.weight_grams) : "",
  );
  const [categoryId, setCategoryId] = useState<string>(product.category_id ?? "none");
  const [featured, setFeatured] = useState(Boolean(product.featured));
  const [serverError, setServerError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateAdminProduct({
        data: {
          id: product.id as string,
          patch: {
            base_price: basePrice.trim() === "" ? undefined : Number(basePrice),
            compare_at_price: compareAt.trim() === "" ? null : Number(compareAt),
            weight_grams: weight.trim() === "" ? null : Number(weight),
            featured,
            category_id: categoryId === "none" ? null : categoryId,
          },
        },
      }),
    onSuccess: () => {
      toast.success(t.products.saved);
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  const priceError = basePrice.trim() !== "" && !(Number(basePrice) > 0) ? t.products.price : null;
  const compareError =
    compareAt.trim() !== "" && !(Number(compareAt) > 0) ? t.products.compareAt : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.products.editTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-small text-muted-foreground">
            {pickName(product.name) || product.slug}
          </p>
          <Field label={t.products.price} error={priceError ?? undefined}>
            <Input
              inputMode="decimal"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="4990"
            />
          </Field>
          <Field
            label={t.products.compareAt}
            error={compareError ?? undefined}
            hint={t.products.compareAtHint}
          >
            <Input
              inputMode="decimal"
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
            />
          </Field>
          <Field label={t.products.weight}>
            <Input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <Field label={t.products.category}>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder={t.products.category} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t.products.noCategory}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.parent_id ? "— " : ""}
                    {pickName(c.name) || c.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="official-product-featured">{t.products.featured}</Label>
            <Switch
              id="official-product-featured"
              checked={featured}
              onCheckedChange={setFeatured}
            />
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.products.cancel}
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (priceError || compareError) return;
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "…" : t.products.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfficialNewProductDialog({
  locale,
  sellerId,
  categories,
  onClose,
  onSaved,
}: {
  locale: "ar" | "fr" | "en";
  sellerId: string;
  categories: { id: string; parent_id: string | null; slug: string; name: unknown }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const nameError = name.trim().length < 2 ? t.products.name : null;
  const priceValue = Number(price);
  const priceError = price.trim() === "" || !(priceValue > 0) ? t.products.price : null;

  const create = useMutation({
    mutationFn: () =>
      createAdminProduct({
        data: {
          seller_id: sellerId,
          name: name.trim(),
          name_locale: locale,
          base_price: priceValue,
          category_id: categoryId === "none" ? null : categoryId,
        },
      }),
    onSuccess: () => {
      toast.success(t.products.created);
      onSaved();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.products.createTitle}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t.products.createSubtitle}</p>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t.products.name} error={tried && nameError ? nameError : undefined}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.products.namePh}
              dir={locale === "ar" ? "rtl" : "ltr"}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.products.price} error={tried && priceError ? priceError : undefined}>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
              />
            </Field>
            <Field label={t.products.category}>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t.products.noCategory} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.products.noCategory}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {pickName(c.name) || c.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.products.cancel}
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              setTried(true);
              if (nameError || priceError) return;
              create.mutate();
            }}
            disabled={create.isPending}
          >
            {create.isPending ? "…" : t.products.createCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Inventory                                                             */
/* ------------------------------------------------------------------ */

const INV_FILTERS = ["all", "ok", "low", "out"] as const;

function InventoryTab({
  locale,
  official: _official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof INV_FILTERS)[number]>("all");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<{
    variantId: string;
    sku: string | null;
    productName: string;
    quantity: number;
    threshold: number;
  } | null>(null);

  const invQuery = useQuery({
    queryKey: ["admin-official-store-inventory", status, page],
    queryFn: () => listOfficialStoreInventory({ data: { status, page } }),
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-official-store-inventory"] });

  const rows = invQuery.data?.rows ?? [];
  const total = invQuery.data?.total ?? 0;
  const pageSize = invQuery.data?.pageSize ?? 25;
  const counts = invQuery.data?.counts;

  return (
    <div className="space-y-6">
      <AdminCard
        title={t.inventory.title}
        subtitle={counts ? t.inventory.subtitle(counts.total) : undefined}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {INV_FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={status === f ? "default" : "outline"}
              onClick={() => {
                setStatus(f);
                setPage(1);
              }}
            >
              {t.inventory[f]}
              {counts && f !== "all" ? ` (${counts[f]})` : ""}
            </Button>
          ))}
        </div>
        {invQuery.isPending ? (
          <TableSkeleton />
        ) : invQuery.isError ? (
          <EmptyState
            title={t.common.loadingError}
            text={errMsg(invQuery.error)}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => invQuery.refetch()}>
                {t.common.tryAgain}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t.inventory.empty} text={t.inventory.emptyText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t.inventory.product}</th>
                  <th className="px-3 py-2 font-medium">{t.inventory.sku}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.inventory.onHand}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.inventory.reserved}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.inventory.available}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.inventory.threshold}</th>
                  <th className="px-3 py-2 font-medium">{t.products.status}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.variantId} className="align-top hover:bg-muted/40">
                    <td className="px-3 py-3">
                      {r.productSlug ? (
                        <Link
                          to="/product/$slug"
                          params={{ slug: r.productSlug }}
                          search={{ locale }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {r.productName}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.productName}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-caption text-muted-foreground">{r.sku ?? "—"}</td>
                    <td className="px-3 py-3 text-end font-medium">{r.quantity}</td>
                    <td className="px-3 py-3 text-end text-muted-foreground">{r.reserved}</td>
                    <td className="px-3 py-3 text-end font-medium">{r.available}</td>
                    <td className="px-3 py-3 text-end text-muted-foreground">{r.threshold}</td>
                    <td className="px-3 py-3">
                      <StatusPill
                        status={
                          r.status === "ok"
                            ? t.inventory.ok
                            : r.status === "low"
                              ? t.inventory.low
                              : t.inventory.out
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setAdjusting({
                            variantId: r.variantId,
                            sku: r.sku,
                            productName: r.productName,
                            quantity: r.quantity,
                            threshold: r.threshold,
                          })
                        }
                      >
                        {t.inventory.adjust}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminCard>

      {adjusting ? (
        <AdjustInventoryDialog
          locale={locale}
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            invalidate();
            setAdjusting(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AdjustInventoryDialog({
  locale,
  row,
  onClose,
  onSaved,
}: {
  locale: "ar" | "fr" | "en";
  row: {
    variantId: string;
    sku: string | null;
    productName: string;
    quantity: number;
    threshold: number;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [threshold, setThreshold] = useState(String(row.threshold));
  const [serverError, setServerError] = useState<string | null>(null);

  const qtyNum = Number(quantity);
  const thrNum = Number(threshold);
  const qtyError =
    quantity.trim() === "" || !Number.isInteger(qtyNum) || qtyNum < 0 ? t.inventory.quantity : null;
  const thrError =
    threshold.trim() === "" || !Number.isInteger(thrNum) || thrNum < 0
      ? t.inventory.thresholdLabel
      : null;

  const adjust = useMutation({
    mutationFn: () =>
      adjustOfficialStoreInventory({
        data: { variantId: row.variantId, quantity: qtyNum, lowStockThreshold: thrNum },
      }),
    onSuccess: () => {
      toast.success(t.inventory.saved);
      onSaved();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.inventory.adjustTitle}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {row.productName}
            {row.sku ? ` · ${row.sku}` : ""}
          </p>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label={t.inventory.quantity}
            error={qtyError ?? undefined}
            hint={t.inventory.quantityHint}
          >
            <Input
              inputMode="numeric"
              dir="ltr"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field
            label={t.inventory.thresholdLabel}
            error={thrError ?? undefined}
            hint={t.inventory.thresholdHint}
          >
            <Input
              inputMode="numeric"
              dir="ltr"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </Field>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (qtyError || thrError) return;
              adjust.mutate();
            }}
            disabled={adjust.isPending}
          >
            {adjust.isPending ? "…" : t.inventory.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

function CategoriesTab({
  locale,
  official: _official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const catQuery = useQuery({
    queryKey: ["admin-official-store-categories"],
    queryFn: () => listOfficialStoreCategories({ data: {} }),
    retry: false,
  });
  const categories = useMemo(
    () => (catQuery.data?.categories ?? []).filter((c) => c.official_products > 0),
    [catQuery.data],
  );

  return (
    <div className="space-y-6">
      <AdminCard
        title={t.categories.title}
        subtitle={t.categories.subtitle}
        actions={
          <Link
            to="/admin/categories"
            search={{ create: "" }}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {t.categories.manage}
          </Link>
        }
      >
        <p className="mb-4 text-small text-muted-foreground">{t.categories.manageHint}</p>
        {catQuery.isPending ? (
          <TableSkeleton />
        ) : catQuery.isError ? (
          <EmptyState
            title={t.common.loadingError}
            text={errMsg(catQuery.error)}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => catQuery.refetch()}>
                {t.common.tryAgain}
              </Button>
            }
          />
        ) : categories.length === 0 ? (
          <EmptyState title={t.categories.empty} text={t.categories.emptyText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t.categories.category}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.categories.products}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.categories.published}</th>
                  <th className="px-3 py-2 font-medium">{t.categories.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <span className="font-medium">
                        {c.parent_id ? "— " : ""}
                        {pickName(c.name) || c.slug}
                      </span>
                      <p className="text-caption text-muted-foreground">{c.slug}</p>
                    </td>
                    <td className="px-3 py-3 text-end font-medium">{c.official_products}</td>
                    <td className="px-3 py-3 text-end text-muted-foreground">
                      {c.official_published}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={c.status ?? "active"} />
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
/* Collections (curated sets stored in stores.settings)                */
/* ------------------------------------------------------------------ */

const EMPTY_TRITEXT = { ar: "", fr: "", en: "" };

function CollectionsTab({
  locale,
  official: _official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<OfficialCollection | "new" | null>(null);
  const [deleting, setDeleting] = useState<OfficialCollection | null>(null);

  const appearanceQuery = useQuery({
    queryKey: ["admin-official-store-appearance"],
    queryFn: () => getOfficialStoreAppearance({ data: {} }),
    retry: false,
  });
  const productsQuery = useQuery({
    queryKey: ["admin-official-store-products-lite"],
    queryFn: () => listOfficialStoreProductsLite({ data: {} }),
    retry: false,
  });
  const collections = appearanceQuery.data?.appearance.collections ?? [];
  const products = productsQuery.data?.products ?? [];
  const productName = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? pickName(p.name) || p.slug : id.slice(0, 8);
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-official-store-appearance"] });

  const del = useMutation({
    mutationFn: (id: string) => deleteOfficialCollection({ data: { id } }),
    onSuccess: () => {
      toast.success(t.common.delete);
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-6">
      <AdminCard
        title={t.collections.title}
        subtitle={t.collections.subtitle}
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {t.collections.new}
          </Button>
        }
      >
        {appearanceQuery.isPending ? (
          <TableSkeleton />
        ) : appearanceQuery.isError ? (
          <EmptyState
            title={t.common.loadingError}
            text={errMsg(appearanceQuery.error)}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appearanceQuery.refetch()}
              >
                {t.common.tryAgain}
              </Button>
            }
          />
        ) : collections.length === 0 ? (
          <EmptyState title={t.collections.empty} text={t.collections.emptyText} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {collections.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {c.title[locale] || c.title.fr || c.title.en || c.title.ar || c.id}
                    </p>
                    {(c.subtitle[locale] || c.subtitle.fr || c.subtitle.en || c.subtitle.ar) && (
                      <p className="mt-1 text-small text-muted-foreground">
                        {c.subtitle[locale] || c.subtitle.fr || c.subtitle.en || c.subtitle.ar}
                      </p>
                    )}
                    <p className="mt-2 text-caption text-muted-foreground">
                      {t.collections.productsCount(c.product_ids.length)}
                    </p>
                  </div>
                  <StatusPill status={c.enabled ? t.collections.enabled : t.collections.disabled} />
                </div>
                {c.product_ids.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-small text-muted-foreground">
                    {c.product_ids.slice(0, 5).map((pid) => (
                      <li key={pid} className="truncate">
                        · {productName(pid)}
                      </li>
                    ))}
                    {c.product_ids.length > 5 ? <li>…</li> : null}
                  </ul>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                    <Pencil className="size-3.5" /> {t.common.edit}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                    <Trash2 className="size-3.5" /> {t.collections.delete}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {editing ? (
        <CollectionDialog
          locale={locale}
          collection={editing === "new" ? null : editing}
          products={products.map((p) => ({
            id: p.id as string,
            name: pickName(p.name) || (p.slug as string),
          }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t.collections.deleteTitle}
        description={t.collections.deleteDesc}
        confirmLabel={t.collections.delete}
        danger
        onConfirm={() => {
          if (deleting) del.mutate(deleting.id);
        }}
      />
    </div>
  );
}

function CollectionDialog({
  locale,
  collection,
  products,
  onClose,
  onSaved,
}: {
  locale: "ar" | "fr" | "en";
  collection: OfficialCollection | null;
  products: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const [title, setTitle] = useState(collection?.title ?? { ...EMPTY_TRITEXT });
  const [subtitle, setSubtitle] = useState(collection?.subtitle ?? { ...EMPTY_TRITEXT });
  const [productIds, setProductIds] = useState<string[]>(collection?.product_ids ?? []);
  const [enabled, setEnabled] = useState(collection?.enabled ?? true);
  const [filter, setFilter] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const filtered = products.filter((p) =>
    filter.trim() === "" ? true : p.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const toggle = (id: string) =>
    setProductIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = useMutation({
    mutationFn: () =>
      upsertOfficialCollection({
        data: {
          ...(collection ? { id: collection.id } : {}),
          title,
          subtitle,
          productIds,
          enabled,
        },
      }),
    onSuccess: () => {
      toast.success(t.collections.saved);
      onSaved();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{collection ? t.collections.edit : t.collections.new}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.collections.products}</Label>
            <TriText
              id="collection-title"
              value={title}
              onChange={setTitle}
              labels={{
                ar: t.collections.nameAr,
                fr: t.collections.nameFr,
                en: t.collections.nameEn,
              }}
            />
          </div>
          <TriText
            id="collection-subtitle"
            value={subtitle}
            onChange={setSubtitle}
            labels={{
              ar: t.collections.subtitleAr,
              fr: t.collections.subtitleFr,
              en: t.collections.subtitleEn,
            }}
          />
          <div className="space-y-1.5">
            <Label>{t.collections.products}</Label>
            <Input
              placeholder={t.collections.pickProductsPh}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2">
              {filtered.length === 0 ? (
                <p className="p-2 text-small text-muted-foreground">{t.products.emptyText}</p>
              ) : (
                filtered.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={productIds.includes(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                    />
                    <span className="text-small">{p.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-caption text-muted-foreground">
              {t.collections.productsCount(productIds.length)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="collection-enabled">{t.collections.enabled}</Label>
            <Switch id="collection-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "…" : t.collections.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Offers (coupons scoped to the official store's seller)               */
/* ------------------------------------------------------------------ */

function OffersTab({
  locale,
  official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const queryClient = useQueryClient();
  const sellerId = official.store.seller_id;
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminCouponRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminCouponRow | null>(null);

  const couponsQuery = useQuery({
    queryKey: ["admin-official-store-coupons", page],
    queryFn: () => listOfficialStoreCoupons({ data: { page } }),
    retry: false,
  });
  const coupons = couponsQuery.data?.coupons ?? [];
  const total = couponsQuery.data?.total ?? 0;
  const pageSize = couponsQuery.data?.pageSize ?? 25;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-official-store-coupons"] });

  const setStatusMut = useMutation({
    mutationFn: (payload: { id: string; status: "active" | "inactive" }) =>
      setCouponStatus({ data: payload }),
    onSuccess: () => {
      toast.success(t.offers.saved);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteCoupon({ data: { id } }),
    onSuccess: () => {
      toast.success(t.offers.delete);
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-6">
      <AdminCard
        title={t.offers.title}
        subtitle={t.offers.subtitle(total)}
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {t.offers.new}
          </Button>
        }
      >
        {couponsQuery.isPending ? (
          <TableSkeleton />
        ) : couponsQuery.isError ? (
          <EmptyState
            title={t.common.loadingError}
            text={errMsg(couponsQuery.error)}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => couponsQuery.refetch()}
              >
                {t.common.tryAgain}
              </Button>
            }
          />
        ) : coupons.length === 0 ? (
          <EmptyState title={t.offers.empty} text={t.offers.emptyText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t.offers.code}</th>
                  <th className="px-3 py-2 font-medium">{t.offers.type}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.offers.value}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.offers.usage}</th>
                  <th className="px-3 py-2 font-medium">{t.offers.status}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coupons.map((c) => (
                  <tr key={c.id} className="align-top hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <p className="font-mono font-medium" dir="ltr">
                        {c.code}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {c.starts_at ? fmtDateTime(c.starts_at, locale) : "—"}
                        {" → "}
                        {c.ends_at ? fmtDateTime(c.ends_at, locale) : "—"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-caption">
                      {c.discount_type === "percentage" ? t.offers.percentage : t.offers.fixed}
                    </td>
                    <td className="px-3 py-3 text-end font-medium">
                      {c.discount_type === "percentage"
                        ? `${c.discount_value}%`
                        : fmtMoney(Number(c.discount_value), "DZD", locale)}
                    </td>
                    <td className="px-3 py-3 text-end text-muted-foreground">
                      {c.usage_count ?? 0}
                      {c.usage_limit ? ` / ${c.usage_limit}` : ""}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        status={c.status === "active" ? t.offers.active : t.offers.inactive}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c as any)}>
                          <Pencil className="size-3.5" /> {t.common.edit}
                        </Button>
                        {c.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStatusMut.mutate({ id: c.id, status: "inactive" })}
                            disabled={setStatusMut.isPending}
                          >
                            {t.offers.deactivate}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStatusMut.mutate({ id: c.id, status: "active" })}
                            disabled={setStatusMut.isPending}
                          >
                            {t.offers.activate}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(c as any)}>
                          <Trash2 className="size-3.5" /> {t.offers.delete}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminCard>

      {editing ? (
        <CouponDialog
          locale={locale}
          sellerId={sellerId}
          coupon={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t.offers.deleteTitle}
        description={t.offers.deleteDesc}
        confirmLabel={t.offers.delete}
        danger
        onConfirm={() => {
          if (deleting) del.mutate(deleting.id);
        }}
      />
    </div>
  );
}

function CouponDialog({
  locale,
  sellerId,
  coupon,
  onClose,
  onSaved,
}: {
  locale: "ar" | "fr" | "en";
  sellerId: string;
  coupon: AdminCouponRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<"percentage" | "fixed">(
    (coupon?.discount_type as "percentage" | "fixed" | undefined) ?? "percentage",
  );
  const [value, setValue] = useState(coupon ? String(coupon.discount_value) : "");
  const [minOrder, setMinOrder] = useState(
    coupon?.min_order_amount != null ? String(coupon.min_order_amount) : "",
  );
  const [maxDiscount, setMaxDiscount] = useState(
    coupon?.max_discount_amount != null ? String(coupon.max_discount_amount) : "",
  );
  const [usageLimit, setUsageLimit] = useState(
    coupon?.usage_limit != null ? String(coupon.usage_limit) : "",
  );
  const [perCustomer, setPerCustomer] = useState(
    coupon?.per_customer_limit != null ? String(coupon.per_customer_limit) : "",
  );
  const [startsAt, setStartsAt] = useState(coupon?.starts_at ? coupon.starts_at.slice(0, 16) : "");
  const [endsAt, setEndsAt] = useState(coupon?.ends_at ? coupon.ends_at.slice(0, 16) : "");
  const [status, setStatus] = useState<"active" | "inactive">(
    (coupon?.status as "active" | "inactive" | undefined) ?? "active",
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: () =>
      upsertCoupon({
        data: {
          ...(coupon ? { id: coupon.id } : {}),
          code,
          discount_type: type,
          discount_value: Number(value),
          min_order_amount: num(minOrder),
          max_discount_amount: num(maxDiscount),
          usage_limit: num(usageLimit) != null ? Math.trunc(num(usageLimit) as number) : null,
          per_customer_limit:
            num(perCustomer) != null ? Math.trunc(num(perCustomer) as number) : null,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          seller_id: sellerId,
          status,
        },
      }),
    onSuccess: () => {
      toast.success(t.offers.saved);
      onSaved();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{coupon ? t.offers.edit : t.offers.new}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.offers.code}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t.offers.codePh}
                dir="ltr"
                maxLength={32}
              />
            </Field>
            <Field label={t.offers.type}>
              <Select value={type} onValueChange={(v) => setType(v as "percentage" | "fixed")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">{t.offers.percentage}</SelectItem>
                  <SelectItem value="fixed">{t.offers.fixed}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.offers.value}>
              <Input
                inputMode="decimal"
                dir="ltr"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <Field label={t.offers.status}>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t.offers.active}</SelectItem>
                  <SelectItem value="inactive">{t.offers.inactive}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.offers.minOrder}>
              <Input
                inputMode="decimal"
                dir="ltr"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
              />
            </Field>
            <Field label={t.offers.maxDiscount}>
              <Input
                inputMode="decimal"
                dir="ltr"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.offers.usageLimit}>
              <Input
                inputMode="numeric"
                dir="ltr"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
              />
            </Field>
            <Field label={t.offers.perCustomer}>
              <Input
                inputMode="numeric"
                dir="ltr"
                value={perCustomer}
                onChange={(e) => setPerCustomer(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.offers.startsAt}>
              <Input
                type="datetime-local"
                dir="ltr"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field label={t.offers.endsAt}>
              <Input
                type="datetime-local"
                dir="ltr"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.offers.cancel}
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "…" : t.offers.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Reviews (same moderation engine, scoped to the official store)       */
/* ------------------------------------------------------------------ */

const REVIEW_QUEUES: ReviewQueue[] = ["pending", "flagged", "approved", "rejected", "hidden"];

function ReviewsTab({
  locale,
  official: _official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<ReviewQueue>("pending");
  const [page, setPage] = useState(1);
  const [moderating, setModerating] = useState<{
    id: string;
    decision: "approve" | "reject" | "hide";
  } | null>(null);

  const reviewsQuery = useQuery({
    queryKey: ["admin-official-store-reviews", queue, page],
    queryFn: () => listOfficialStoreReviews({ data: { queue, page } }),
    retry: false,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-official-store-reviews"] });

  const moderate = useMutation({
    mutationFn: (payload: {
      id: string;
      decision: "approve" | "reject" | "hide";
      reason?: string;
    }) => moderateReview({ data: payload }),
    onSuccess: () => {
      toast.success(t.reviews.approve);
      setModerating(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const reviews = reviewsQuery.data?.reviews ?? [];
  const total = reviewsQuery.data?.total ?? 0;
  const pageSize = reviewsQuery.data?.pageSize ?? 25;

  return (
    <div className="space-y-6">
      <Tabs
        value={queue}
        onValueChange={(v) => {
          setQueue(v as ReviewQueue);
          setPage(1);
        }}
      >
        <TabsList>
          {REVIEW_QUEUES.map((q) => (
            <TabsTrigger key={q} value={q}>
              {t.reviews.queues[q]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <AdminCard title={t.reviews.title} subtitle={t.reviews.subtitle(total)}>
        {reviewsQuery.isPending ? (
          <TableSkeleton />
        ) : reviewsQuery.isError ? (
          <EmptyState
            title={t.common.loadingError}
            text={errMsg(reviewsQuery.error)}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => reviewsQuery.refetch()}
              >
                {t.common.tryAgain}
              </Button>
            }
          />
        ) : reviews.length === 0 ? (
          <EmptyState title={t.reviews.empty} text={t.reviews.emptyText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t.reviews.queues.pending}</th>
                  <th className="px-3 py-2 font-medium">{t.products.name}</th>
                  <th className="px-3 py-2 font-medium">{t.overview.avgRating}</th>
                  <th className="px-3 py-2 font-medium">{t.products.status}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reviews.map((r) => {
                  const product = (r as { products?: unknown }).products;
                  const prod = (Array.isArray(product) ? product[0] : product) as {
                    name?: unknown;
                    slug?: string | null;
                  } | null;
                  const reviewer =
                    [r.first_name, r.last_name].filter(Boolean).join(" ") || t.reviews.anonymous;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="max-w-md whitespace-pre-wrap">{r.body ?? "—"}</p>
                        <p className="mt-1 text-caption text-muted-foreground">
                          {reviewer} · {fmtDateTime(r.created_at, locale)}
                          {r.verified_purchase ? ` · ${t.reviews.verified}` : ""}
                          {r.flagged_at ? ` · ${t.reviews.flagged}` : ""}
                        </p>
                        {r.moderation_reason ? (
                          <p className="mt-1 text-caption text-brand">
                            {t.reviews.reason}: {r.moderation_reason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-caption">
                        {pickName(prod?.name) || prod?.slug || r.product_id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.rating} / 5</td>
                      <td className="px-3 py-3">
                        <StatusPill status={r.moderation_status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setModerating({ id: r.id, decision: "approve" })}
                            disabled={moderate.isPending}
                          >
                            {t.reviews.approve}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setModerating({ id: r.id, decision: "reject" })}
                            disabled={moderate.isPending}
                          >
                            {t.reviews.reject}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setModerating({ id: r.id, decision: "hide" })}
                            disabled={moderate.isPending}
                          >
                            {t.reviews.hide}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminCard>

      {moderating ? (
        <OfficialModerateReviewDialog
          decision={moderating.decision}
          onClose={() => setModerating(null)}
          onConfirm={(reason) => {
            const trimmed = (reason ?? "").trim();
            moderate.mutate(
              trimmed
                ? { id: moderating.id, decision: moderating.decision, reason: trimmed }
                : { id: moderating.id, decision: moderating.decision },
            );
          }}
          pending={moderate.isPending}
        />
      ) : null}
    </div>
  );
}

function OfficialModerateReviewDialog({
  decision,
  onClose,
  onConfirm,
  pending,
}: {
  decision: "approve" | "reject" | "hide";
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  pending: boolean;
}) {
  // Locale resolved from the route like every other admin page.
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).admin.officialStore;
  const [reason, setReason] = useState("");
  const needsReason = decision !== "approve";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === "approve"
              ? t.reviews.approveTitle
              : decision === "reject"
                ? t.reviews.rejectTitle
                : t.reviews.hideTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label={needsReason ? t.reviews.reasonRequired : t.reviews.reasonOptional}
            hint={t.reviews.reasonHint}
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={needsReason ? t.reviews.reasonPh : "…"}
              rows={3}
            />
          </Field>
          {needsReason ? (
            <div className="space-y-1.5">
              <Label>{t.reviews.reason}</Label>
              <div className="flex flex-wrap gap-2">
                {t.reviews.quickReasons.map((r: string) => (
                  <Button key={r} size="sm" variant="outline" onClick={() => setReason(r)}>
                    {r}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.reviews.cancel}
          </Button>
          <Button
            onClick={() => onConfirm(reason.trim() || undefined)}
            disabled={pending || (needsReason && !reason.trim())}
            variant={decision === "approve" ? "default" : "destructive"}
          >
            {pending
              ? "…"
              : decision === "approve"
                ? t.reviews.approve
                : decision === "reject"
                  ? t.reviews.reject
                  : t.reviews.hide}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Appearance (accent, announcement, sections, featured sets — plain    */
/* text only; the public storefront reads these from stores.settings)  */
/* ------------------------------------------------------------------ */

type SectionDraft = {
  id: string;
  kind: "featured" | "categories" | "offers" | "new" | "best";
  title: { ar: string; fr: string; en: string };
  enabled: boolean;
};

function AppearanceTab({
  locale,
  official: _official,
}: {
  locale: "ar" | "fr" | "en";
  official: OfficialStoreData;
}) {
  const t = getTranslations(locale).admin.officialStore;
  const queryClient = useQueryClient();

  const appearanceQuery = useQuery({
    queryKey: ["admin-official-store-appearance"],
    queryFn: () => getOfficialStoreAppearance({ data: {} }),
    retry: false,
  });
  const productsQuery = useQuery({
    queryKey: ["admin-official-store-products-lite"],
    queryFn: () => listOfficialStoreProductsLite({ data: {} }),
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["admin-categories-flat"],
    queryFn: () => listAdminCategories(),
    retry: false,
  });

  const appearance = appearanceQuery.data?.appearance ?? null;
  const products = productsQuery.data?.products ?? [];
  const categories = categoriesQuery.data?.flat ?? [];

  const [announcement, setAnnouncement] = useState<{ ar: string; fr: string; en: string } | null>(
    null,
  );
  const [accent, setAccent] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionDraft[] | null>(null);
  const [featuredProducts, setFeaturedProducts] = useState<string[] | null>(null);
  const [featuredCategories, setFeaturedCategories] = useState<string[] | null>(null);

  // Seed the editors once the server data arrives.
  useEffect(() => {
    if (!appearance) return;
    if (announcement === null) setAnnouncement({ ...appearance.settings.announcement });
    if (accent === null) setAccent(appearance.settings.accent);
    if (sections === null) {
      setSections(
        appearance.settings.sections.map((s) => ({
          id: s.id,
          kind: s.kind,
          title: { ...s.title },
          enabled: s.enabled,
        })),
      );
    }
    if (featuredProducts === null)
      setFeaturedProducts([...appearance.settings.featured_product_ids]);
    if (featuredCategories === null)
      setFeaturedCategories([...appearance.settings.featured_category_ids]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-official-store-appearance"] });

  const saveAppearance = useMutation({
    mutationFn: () =>
      updateOfficialStoreAppearance({
        data: {
          accent: (accent ?? "ink") as "ink" | "clay" | "olive" | "sand" | "slate" | "plum",
          announcement: announcement ?? { ar: "", fr: "", en: "" },
        },
      }),
    onSuccess: () => {
      toast.success(t.appearance.saved);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveSections = useMutation({
    mutationFn: () =>
      updateOfficialStoreSections({
        data: {
          sections: (sections ?? []).map((s) => ({
            id: s.id,
            kind: s.kind,
            title: s.title,
            enabled: s.enabled,
          })),
          featuredProductIds: featuredProducts ?? [],
          featuredCategoryIds: featuredCategories ?? [],
        },
      }),
    onSuccess: () => {
      toast.success(t.appearance.saved);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const moveSection = (index: number, dir: -1 | 1) => {
    setSections((cur) => {
      if (!cur) return cur;
      const next = [...cur];
      const j = index + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  };

  const toggleId = (list: string[] | null, id: string, set: (v: string[]) => void) => {
    set((list ?? []).includes(id) ? (list ?? []).filter((x) => x !== id) : [...(list ?? []), id]);
  };

  if (appearanceQuery.isPending) return <TableSkeleton rows={5} />;
  if (appearanceQuery.isError || !appearance)
    return (
      <EmptyState
        title={t.common.loadingError}
        text={appearanceQuery.isError ? errMsg(appearanceQuery.error) : undefined}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appearanceQuery.refetch()}
          >
            {t.common.tryAgain}
          </Button>
        }
      />
    );

  return (
    <div className="space-y-6">
      <AdminCard
        title={t.appearance.title}
        subtitle={t.appearance.subtitle}
        actions={
          <Button
            size="sm"
            onClick={() => saveAppearance.mutate()}
            disabled={saveAppearance.isPending || announcement === null || accent === null}
          >
            {saveAppearance.isPending ? "…" : t.appearance.saveAppearance}
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>{t.appearance.announcement}</Label>
            <TriText
              id="announcement"
              value={announcement ?? { ar: "", fr: "", en: "" }}
              onChange={(v) => setAnnouncement(v)}
              labels={{ ar: "العربية", fr: "Français", en: "English" }}
            />
            <p className="text-caption text-muted-foreground">{t.appearance.announcementHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t.appearance.accent}</Label>
            <div className="flex flex-wrap gap-2">
              {STORE_ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccent(a.id)}
                  aria-pressed={accent === a.id}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    accent === a.id ? "border-primary ring-1 ring-primary" : "hover:bg-accent"
                  }`}
                >
                  <span
                    className="inline-block size-4 rounded-full border border-border"
                    style={{ backgroundColor: a.swatch }}
                  />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AdminCard>

      <AdminCard
        title={t.appearance.sections}
        subtitle={t.appearance.sectionsHint}
        actions={
          <Button
            size="sm"
            onClick={() => saveSections.mutate()}
            disabled={saveSections.isPending || sections === null}
          >
            {saveSections.isPending ? "…" : t.appearance.saveSections}
          </Button>
        }
      >
        <div className="space-y-3">
          {(sections ?? []).map((s, i) => (
            <div key={s.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t.appearance.sectionKinds[s.kind]}</span>
                <span className="text-caption text-muted-foreground">{s.kind}</span>
                <div className="ms-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(i, -1)}
                    disabled={i === 0}
                    aria-label={t.appearance.moveUp}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(i, 1)}
                    disabled={i === (sections ?? []).length - 1}
                    aria-label={t.appearance.moveDown}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(v) =>
                      setSections((cur) =>
                        (cur ?? []).map((x) => (x.id === s.id ? { ...x, enabled: v } : x)),
                      )
                    }
                    aria-label={t.appearance.sectionKinds[s.kind]}
                  />
                </div>
              </div>
              <div className="mt-3">
                <TriText
                  id={`section-${s.id}`}
                  value={s.title}
                  onChange={(v) =>
                    setSections((cur) =>
                      (cur ?? []).map((x) => (x.id === s.id ? { ...x, title: v } : x)),
                    )
                  }
                  labels={{ ar: "العربية", fr: "Français", en: "English" }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t.appearance.featuredProducts}</Label>
            <p className="text-caption text-muted-foreground">
              {t.appearance.featuredProductsHint}
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border p-2">
              {products.length === 0 ? (
                <p className="p-2 text-small text-muted-foreground">{t.products.emptyText}</p>
              ) : (
                products.map((p) => (
                  <label
                    key={p.id as string}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={(featuredProducts ?? []).includes(p.id as string)}
                      onCheckedChange={() =>
                        toggleId(featuredProducts, p.id as string, setFeaturedProducts)
                      }
                    />
                    <span className="text-small">{pickName(p.name) || (p.slug as string)}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t.appearance.featuredCategories}</Label>
            <p className="text-caption text-muted-foreground">
              {t.appearance.featuredCategoriesHint}
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border p-2">
              {categories.length === 0 ? (
                <p className="p-2 text-small text-muted-foreground">{t.categories.emptyText}</p>
              ) : (
                categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={(featuredCategories ?? []).includes(c.id)}
                      onCheckedChange={() =>
                        toggleId(featuredCategories, c.id, setFeaturedCategories)
                      }
                    />
                    <span className="text-small">
                      {c.parent_id ? "— " : ""}
                      {pickName(c.name) || c.slug}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
