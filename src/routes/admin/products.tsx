import { createFileRoute, Link, Outlet, useMatch, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flag, Pencil, Star, StarOff } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  fmtMoney,
  fmtDateTime,
} from "@/components/admin/ui";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAdminProducts,
  moderateAdminProduct,
  updateAdminProduct,
  setProductStatus,
  bulkModerateAdminProducts,
  bulkSetProductStatus,
  listAdminSellersLite,
} from "@/lib/admin-catalog.functions";
import type { ModerationFlag } from "@/lib/moderation-rules";
import { errMsg, pickName, Pager } from "./_shared";
import { numParam, strParam, useBackParam, useDebouncedUrlParam, useUrlState } from "@/hooks/use-url-state";
import { useAdminT } from "@/components/admin/use-admin-t";
import { getTranslations } from "@/lib/i18n";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/admin/products")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: strParam(search["q"]),
    moderation: strParam(search["moderation"], "all"),
    status: strParam(search["status"], "all"),
    sellerId: strParam(search["sellerId"], "all"),
    page: numParam(search["page"], 1),
    create: strParam(search["create"]),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AdminProductsPage,
});

const MODERATION_FILTERS = ["pending", "approved", "rejected"] as const;
const STATUS_FILTERS = ["draft", "active", "archived"] as const;

function AdminProductsPage() {
  // Child routes (new / $productId) render in the Outlet; this route shows
  // the table. (Same pattern as the seller products route.)
  const child = useMatch({ from: "/admin/products", strict: true, shouldThrow: false });
  const locale = useAdminLocale();
  const t = useAdminT().products;
  const nav = getTranslations(locale).adminNav.items;
  if (!child) return <Outlet />;
  return (
    <AdminGate>
      <AdminShell
        title={t.title}
        subtitle={t.subtitle}
        breadcrumbs={[{ label: nav.products }]}
      >
        <ProductsManager />
      </AdminShell>
    </AdminGate>
  );
}

function ProductsManager() {
  const locale = useAdminLocale();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const backParam = useBackParam();
  const url = useUrlState({ moderation: "all", status: "all", sellerId: "all", page: 1 });
  const page = numParam(url.search["page"], 1);
  const q = strParam(url.search["q"]);
  const moderation = strParam(url.search["moderation"], "all");
  const status = strParam(url.search["status"], "all");
  const sellerId = strParam(url.search["sellerId"], "all");
  const [searchInput, setSearchInput] = useDebouncedUrlParam("q", "", {
    onCommit: () => url.set({ page: 1 }),
  });
  const setPage = (next: number) => url.set({ page: next }, { push: true });
  const setFilter = (patch: Record<string, string | undefined>) => url.set({ ...patch, page: 1 });
  const [confirm, setConfirm] = useState<{ id: string; title: string; description: string; run: () => void } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const t = useAdminT().products;
  const common = getTranslations(locale).common;

  // Deep link: /admin/products?create=product opens the full new-product editor.
  useEffect(() => {
    if (strParam(url.search["create"]) === "product") {
      url.set({ create: undefined });
      void navigate({
        to: "/admin/products/new",
        search: { q, moderation, status, sellerId, page, create: "", back: backParam },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.search["create"]]);

  const filters = {
    q: q.trim() || undefined,
    moderationStatus: moderation === "all" ? undefined : moderation,
    status: status === "all" ? undefined : (status as "draft" | "active" | "archived"),
    sellerId: sellerId === "all" ? undefined : sellerId,
    page,
  };
  const productsQuery = useQuery({
    queryKey: ["admin-products", filters],
    queryFn: () => listAdminProducts({ data: filters }),
    retry: false,
  });
  const sellersQuery = useQuery({
    queryKey: ["admin-sellers-lite"],
    queryFn: () => listAdminSellersLite(),
    retry: false,
  });
  const sellerName = (id: string) =>
    sellersQuery.data?.sellers.find((s) => s.id === id)?.legal_name ?? id.slice(0, 8);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-products"] });
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
          return t.done;
        },
        error: (e) => errMsg(e),
      });
    if (opts?.confirm) {
      setConfirm({ id: label, title: opts.confirm.title, description: opts.confirm.description, run });
    } else {
      void run();
    }
  };

  const moderate = useMutation({
    mutationFn: (payload: { id: string; decision: "approve" | "reject" | "hide"; reason?: string }) =>
      moderateAdminProduct({ data: payload }),
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

  // Selection never survives a filter/page change.
  useEffect(() => {
    setSelected([]);
  }, [page, q, moderation, status, sellerId]);

  const toggleSelect = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleSelectAll = () =>
    setSelected((cur) => (cur.length === products.length ? [] : products.map((p) => p.id as string)));

  const bulkMutate = (
    actionLabel: string,
    fn: () => Promise<{ ok: true; count: number }>,
  ) => {
    setConfirm({
      id: `bulk-${actionLabel}`,
      title: t.confirmBulkTitle(actionLabel, selected.length),
      description: t.confirmBulkDesc,
      run: () =>
        toast.promise(fn(), {
          loading: `${actionLabel}…`,
          success: (res) => {
            setSelected([]);
            invalidate();
            return `${t.done} (${res.count})`;
          },
          error: (e) => errMsg(e),
        }),
    });
  };

  return (
    <div className="space-y-6">
      <AdminCard title={t.filtersTitle}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="product-search">{t.searchLabel}</Label>
            <Input
              id="product-search"
              placeholder={t.searchPlaceholder}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.moderationLabel}</Label>
            <Select
              value={moderation}
              onValueChange={(v) => setFilter({ moderation: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {MODERATION_FILTERS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.statusLabel}</Label>
            <Select
              value={status}
              onValueChange={(v) => setFilter({ status: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.sellerLabel}</Label>
            <Select
              value={sellerId}
              onValueChange={(v) => setFilter({ sellerId: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allSellers}</SelectItem>
                {(sellersQuery.data?.sellers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={t.title} subtitle={t.matchCount(total)}>
        {selected.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <span className="text-sm font-medium">{t.selected(selected.length)}</span>
            <div className="ms-auto flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkMutate(t.bulkApprove, () =>
                    bulkModerateAdminProducts({ data: { ids: selected, decision: "approve" } }),
                  )
                }
              >
                {t.bulkApprove}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkMutate(t.bulkReject, () =>
                    bulkModerateAdminProducts({ data: { ids: selected, decision: "reject", reason: t.rejectReasonBulk } }),
                  )
                }
              >
                {t.bulkReject}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkMutate(t.bulkHide, () =>
                    bulkModerateAdminProducts({ data: { ids: selected, decision: "hide" } }),
                  )
                }
              >
                {t.bulkHide}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkMutate(t.bulkPublish, () =>
                    bulkSetProductStatus({ data: { ids: selected, status: "active" } }),
                  )
                }
              >
                {t.bulkPublish}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkMutate(t.bulkArchive, () =>
                    bulkSetProductStatus({ data: { ids: selected, status: "archived" } }),
                  )
                }
              >
                {t.bulkArchive}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])} aria-label={t.clearSelection}>
                ×
              </Button>
            </div>
          </div>
        ) : null}
        {productsQuery.isPending ? (
          <TableSkeleton />
        ) : productsQuery.isError ? (
          <EmptyState
            title={t.productsLoadError}
            text={errMsg(productsQuery.error)}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => productsQuery.refetch()}>
                {common.retry}
              </Button>
            }
          />
        ) : products.length === 0 ? (
          <EmptyState title={t.noProducts} text={t.noProductsText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-start text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={products.length > 0 && selected.length === products.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label={t.selectAll}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">{t.colProduct}</th>
                  <th className="px-3 py-2 font-medium">{t.colSeller}</th>
                  <th className="px-3 py-2 font-medium">{t.colPrice}</th>
                  <th className="px-3 py-2 font-medium">{t.colModeration}</th>
                  <th className="px-3 py-2 font-medium">{t.colStatus}</th>
                  <th className="px-3 py-2 font-medium">{t.colVisibility}</th>
                  <th className="px-3 py-2 font-medium">{t.colFeatured}</th>
                  <th className="px-3 py-2 font-medium text-end">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selected.includes(p.id as string)}
                        onCheckedChange={() => toggleSelect(p.id as string)}
                        aria-label={t.selectRow(pickName(p.name) || p.slug)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{pickName(p.name) || p.slug}</p>
                      <p className="text-caption text-muted-foreground">{p.slug} · {fmtDateTime(p.created_at, locale)}</p>
                      {p.flags.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1" title={t.flagsNote}>
                          <Flag className="size-3 text-brand" aria-hidden />
                          <span className="text-caption text-muted-foreground">{t.flagsTitle}:</span>
                          {p.flags.map((f: ModerationFlag) => (
                            <span
                              key={f.code}
                              title={`${t.flagLabels[f.code]} — “${f.match}”`}
                              className="rounded-sm bg-brand/15 px-1.5 py-0.5 text-caption font-medium text-brand"
                            >
                              {t.flagLabels[f.code]}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-caption">{sellerName(p.seller_id)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fmtMoney(Number(p.base_price), "DZD", locale)}
                      {p.compare_at_price ? (
                        <span className="ms-2 text-caption text-muted-foreground line-through">
                          {fmtMoney(Number(p.compare_at_price), "DZD", locale)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3"><StatusPill status={p.moderation_status} /></td>
                    <td className="px-3 py-3"><StatusPill status={p.status} /></td>
                    <td className="px-3 py-3"><StatusPill status={p.visibility} /></td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => feature.mutate({ id: p.id, featured: !p.featured })}
                        aria-label={p.featured ? t.unfeatureProduct : t.featureProduct}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {p.featured ? <Star className="size-4 fill-brand text-brand" /> : <StarOff className="size-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="ghost" asChild>
                          <Link
                            to="/admin/products/$productId"
                            params={{ productId: p.id as string }}
                            search={{ q, moderation, status, sellerId, page, create: "", back: backParam }}
                          >
                            <Pencil className="size-3.5" /> {t.edit}
                          </Link>
                        </Button>
                        {p.moderation_status !== "approved" ? (
                          <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, decision: "approve" })} disabled={moderate.isPending}>
                            {t.approve}
                          </Button>
                        ) : null}
                        {p.moderation_status === "approved" ? (
                          <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, decision: "hide" })} disabled={moderate.isPending}>
                            {t.hide}
                          </Button>
                        ) : null}
                        {p.moderation_status === "pending" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              mutate("reject-product", () => moderateAdminProduct({ data: { id: p.id, decision: "reject", reason: t.rejectReason } }), {
                                confirm: { title: t.rejectTitle, description: t.rejectDesc },
                              })
                            }
                          >
                            {t.reject}
                          </Button>
                        ) : null}
                        {p.status !== "active" ? (
                          <Button size="sm" variant="ghost" onClick={() => setStatusMut.mutate({ id: p.id, status: "active" })} disabled={setStatusMut.isPending}>
                            {t.publish}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              mutate("archive-product", () => setProductStatus({ data: { id: p.id, status: "archived" } }), {
                                confirm: { title: t.archiveTitle, description: t.archiveDesc },
                              })
                            }
                          >
                            {t.archive}
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
      </AdminCard>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        danger
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      />
    </div>
  );
}

