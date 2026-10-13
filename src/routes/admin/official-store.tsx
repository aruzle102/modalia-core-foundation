import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Store, XCircle } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  TableSkeleton,
  ConfirmDialog,
  Field,
} from "@/components/admin/ui";
import { DataTable, EmptyState, ErrorState } from "@/components/dashboard";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  listStoresForVerification,
  grantStoreVerificationBadge,
  removeStoreVerification,
  type StoreVerificationRow,
  type VerificationBadge,
} from "@/lib/verification.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { errMsg, Pager } from "./_shared";

export const Route = createFileRoute("/admin/official-store")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Store Verification — Modalia Admin" },
    ],
  }),
  component: StoreVerificationPage,
});

/**
 * Store verification — the admin grants blue/green verification badges to
 * stores. The platform's own store is managed via the seller dashboard
 * (login as seller); this admin page is verification-only.
 */
function StoreVerificationPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).admin.officialStore.verification;
  const navTitle = getTranslations(locale).adminNav.items.officialStore;

  return (
    <AdminGate>
      <AdminShell
        title={navTitle}
        subtitle={t.subtitle}
        breadcrumbs={[{ label: navTitle }]}
      >
        <VerificationTab locale={locale} />
      </AdminShell>
    </AdminGate>
  );
}

/* Verification — admin grants blue/green badges to stores              */
/* ------------------------------------------------------------------ */

const VERIFICATION_FILTERS = ["all", "unverified", "verified", "manual", "suspended"] as const;

function VerificationTab({ locale }: { locale: "ar" | "fr" | "en" }) {
  const t = getTranslations(locale).admin.officialStore.verification;
  const tc = getTranslations(locale).admin.officialStore.common;
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState<(typeof VERIFICATION_FILTERS)[number]>("all");
  const [page, setPage] = useState(1);
  const [granting, setGranting] = useState<StoreVerificationRow | null>(null);
  const [badge, setBadge] = useState<VerificationBadge>("blue");
  const [note, setNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<StoreVerificationRow | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const listQuery = useQuery({
    queryKey: ["admin-stores-verification", q, filter, page],
    queryFn: () =>
      listStoresForVerification({
        data: { q: q || undefined, verification: filter, page },
      }),
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-stores-verification"] });

  const grantMut = useMutation({
    mutationFn: (input: { storeId: string; badge: VerificationBadge; note?: string }) =>
      grantStoreVerificationBadge({ data: input }),
    onSuccess: () => {
      toast.success(t.granted);
      setGranting(null);
      setNote("");
      setBadge("blue");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const removeMut = useMutation({
    mutationFn: (storeId: string) => removeStoreVerification({ data: { storeId } }),
    onSuccess: () => {
      toast.success(t.removed);
      setConfirmRemove(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const stores = listQuery.data?.stores ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.pageSize ?? 20;

  return (
    <div className="space-y-6">
      <AdminCard title={t.title} subtitle={t.subtitle}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t.search}</Label>
            <Input
              placeholder={t.searchPh}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.filter}</Label>
            <Select
              value={filter}
              onValueChange={(v) => {
                setFilter(v as (typeof VERIFICATION_FILTERS)[number]);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERIFICATION_FILTERS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t.filters[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {listQuery.isPending ? (
          <TableSkeleton />
        ) : listQuery.isError ? (
          <ErrorState
            title={tc.loadingError}
            description={errMsg(listQuery.error)}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => listQuery.refetch()}>
                {tc.tryAgain}
              </Button>
            }
          />
        ) : stores.length === 0 ? (
          <EmptyState title={t.empty} description={t.emptyText} />
        ) : (
          <DataTable>
            <table className="w-full min-w-[820px] text-start text-small">
              <thead>
                <tr className="border-b border-neutral-200 text-start text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="px-3 py-3 text-start">{t.store}</th>
                  <th className="px-3 py-3 text-start">{t.status}</th>
                  <th className="px-3 py-3 text-start">{t.badge}</th>
                  <th className="px-3 py-3 text-end">{t.products}</th>
                  <th className="px-3 py-3 text-end">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {stores.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {s.logo_url ? (
                          <img
                            src={s.logo_url}
                            alt={s.name}
                            className="size-10 shrink-0 rounded-lg border object-cover"
                          />
                        ) : (
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                            <Store className="size-5 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="truncate text-caption text-muted-foreground">
                            /{s.slug}
                            {s.seller_legal_name ? ` · ${s.seller_legal_name}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusPill status={s.status} />
                        <StatusPill status={s.verification_status} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {s.verification_status === "manual" || s.verification_status === "verified" ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            s.verification_badge === "green"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          }`}
                        >
                          <BadgeCheck className="size-3.5" />
                          {s.verification_badge === "green" ? t.greenBadge : t.blueBadge}
                        </span>
                      ) : (
                        <span className="text-caption text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-end font-medium tabular-nums">{s.product_count}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setGranting(s)}>
                          <BadgeCheck className="size-3.5" /> {t.grant}
                        </Button>
                        {s.verification_status === "manual" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRemove(s)}
                            disabled={removeMut.isPending}
                          >
                            <XCircle className="size-3.5" /> {t.remove}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
        <div className="mt-4">
          <Pager page={page} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </AdminCard>

      {/* Grant badge dialog */}
      <Dialog
        open={granting !== null}
        onOpenChange={(open) => {
          if (!open) setGranting(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.grantTitle}</DialogTitle>
            {granting ? (
              <p className="text-sm text-muted-foreground">
                {granting.name} · /{granting.slug}
              </p>
            ) : null}
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.chooseBadge}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBadge("blue")}
                className={`rounded-xl border-2 p-4 text-start transition ${
                  badge === "blue"
                    ? "border-sky-500 bg-sky-500/5"
                    : "border-border hover:border-sky-500/40"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
                  <BadgeCheck className="size-4" /> {t.blueBadge}
                </span>
                <p className="mt-2 text-sm font-medium">{t.blueTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.blueDesc}</p>
              </button>
              <button
                type="button"
                onClick={() => setBadge("green")}
                className={`rounded-xl border-2 p-4 text-start transition ${
                  badge === "green"
                    ? "border-emerald-500 bg-emerald-500/5"
                    : "border-border hover:border-emerald-500/40"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="size-4" /> {t.greenBadge}
                </span>
                <p className="mt-2 text-sm font-medium">{t.greenTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.greenDesc}</p>
              </button>
            </div>
            <Field label={t.noteLabel} hint={t.noteHint}>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                dir={locale === "ar" ? "rtl" : "ltr"}
              />
            </Field>
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t.notifyHint}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGranting(null)}>
              {t.cancel}
            </Button>
            <Button
              onClick={() => {
                if (!granting) return;
                const input: { storeId: string; badge: VerificationBadge; note?: string } = {
                  storeId: granting.id,
                  badge,
                };
                const trimmed = note.trim();
                if (trimmed) input.note = trimmed;
                grantMut.mutate(input);
              }}
              disabled={grantMut.isPending || !granting}
            >
              {grantMut.isPending ? "…" : t.confirmGrant}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove verification confirm */}
      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
        title={t.confirmRemoveTitle}
        description={confirmRemove ? t.confirmRemoveDesc(confirmRemove.name) : ""}
        confirmLabel={t.remove}
        danger
        onConfirm={() => {
          if (confirmRemove) removeMut.mutate(confirmRemove.id);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */