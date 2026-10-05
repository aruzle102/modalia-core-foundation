import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Power,
  ShieldCheck,
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

export const Route = createFileRoute("/admin/sellers/$sellerId")({
  head: () => ({
    meta: [{ title: "Seller Profile — Modalia Admin" }],
  }),
  component: SellerProfilePage,
});

type Profile = Awaited<ReturnType<typeof getSellerProfile>>;

function productName(value: unknown): string {
  return pickName(value) || "Unnamed product";
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
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<null | {
    kind: "suspend" | "disable" | "verify";
    title: string;
    description: string;
    confirmLabel: string;
  }>(null);
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
      toast.success(`Seller ${res.accountStatus}.`);
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
      toast.success("Store verified.");
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
      toast.success(`Commission updated to ${(res.rate * 100).toFixed(1)}%.`);
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
      toast.error("Enter a commission percent between 0 and 100.");
      return;
    }
    commissionMutation.mutate(parsed);
  };

  return (
    <AdminGate>
      <AdminShell
        title={store?.name ?? seller?.legal_name ?? "Seller profile"}
        subtitle="Seller account, store, sales, and activity."
        actions={
          <Link to="/admin/sellers">
            <Button variant="outline" size="sm">
              <ArrowLeft className="size-4 me-1.5" />
              All sellers
            </Button>
          </Link>
        }
      >
        {profileQuery.isLoading ? (
          <TableSkeleton rows={10} />
        ) : profileQuery.isError || !seller ? (
          <AdminCard title="Seller not found">
            <EmptyState title="Could not load this seller" text="Please go back and try again." />
          </AdminCard>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <AdminCard
              title={store?.name ?? seller.legal_name}
              subtitle={seller.email ?? ""}
              actions={
                <div className="flex flex-wrap gap-2">
                  {seller.account_status !== "active" && (
                    <Button
                      size="sm"
                      onClick={() => statusMutation.mutate("active")}
                      disabled={statusMutation.isPending}
                    >
                      <Power className="size-4 me-1.5" />
                      Activate
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
                            title: "Suspend this seller?",
                            description:
                              "The seller will be suspended and unable to operate until reactivated.",
                            confirmLabel: "Suspend seller",
                          })
                        }
                      >
                        <Ban className="size-4 me-1.5" />
                        Suspend
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setConfirmAction({
                            kind: "disable",
                            title: "Disable this seller?",
                            description:
                              "The seller account will be disabled. This is a destructive action.",
                            confirmLabel: "Disable seller",
                          })
                        }
                      >
                        <Ban className="size-4 me-1.5" />
                        Disable
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
                          title: "Verify this store?",
                          description: `Mark "${store.name}" as a verified store.`,
                          confirmLabel: "Verify store",
                        })
                      }
                    >
                      <ShieldCheck className="size-4 me-1.5" />
                      Verify store
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
                    Official Store ✓
                  </span>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Legal name</dt>
                  <dd className="font-medium">{seller.legal_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Contact</dt>
                  <dd>
                    <span className="block" dir="ltr">{seller.phone ?? "—"}</span>
                    <span className="block break-all text-muted-foreground" dir="ltr">
                      {seller.email ?? "—"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Seller since</dt>
                  <dd title={fmtDateTime(seller.created_at)}>{timeAgo(seller.created_at)}</dd>
                </div>
              </dl>
            </AdminCard>

            {/* Sales stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat
                label="Products"
                value={String(profile.stats.productCount)}
                hint="Live catalog count"
              />
              <Stat
                label="Delivered sales"
                value={fmtMoney(profile.stats.salesTotal)}
                hint="Sum of delivered order subtotals"
              />
              <Stat
                label="Commission payable"
                value={fmtMoney(profile.stats.commissionPayable)}
                hint="Delivered + fulfilled commission_total"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Store */}
              <AdminCard title="Store" subtitle="Storefront details">
                {store ? (
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Name</dt>
                      <dd className="font-medium">{store.name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Slug</dt>
                      <dd className="font-mono text-xs" dir="ltr">/store/{store.slug}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Description</dt>
                      <dd className="whitespace-pre-wrap text-muted-foreground">
                        {store.description ?? "—"}
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">Logo path</dt>
                        <dd className="break-all font-mono text-xs" dir="ltr">
                          {store.logo_path ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Banner path</dt>
                        <dd className="break-all font-mono text-xs" dir="ltr">
                          {store.banner_path ?? "—"}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="text-xs text-muted-foreground">Verification</dt>
                      <dd>
                        <StatusPill status={store.verification_status} />
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <EmptyState title="No store" text="This seller has no store record." />
                )}
              </AdminCard>

              {/* Commission */}
              <AdminCard title="Commission" subtitle="Versioned rate — applies to new sales only">
                <div className="flex items-end gap-2">
                  <div className="text-3xl font-bold">
                    {(Number(seller.commission_rate) * 100).toFixed(1)}%
                  </div>
                  <span className="pb-1 text-xs text-muted-foreground">current rate</span>
                </div>
                <div className="mt-4">
                  <Field
                    label="New commission rate (%)"
                    hint="Historical orders keep their commission_total snapshot — rate changes are never recalculated on past orders."
                  >
                    <div className="flex gap-2">
                      <Input
                        value={commissionInput}
                        onChange={(e) => setCommissionInput(e.target.value)}
                        placeholder="e.g. 12.5"
                        inputMode="decimal"
                        dir="ltr"
                        className="max-w-40"
                      />
                      <Button
                        onClick={submitCommission}
                        disabled={commissionMutation.isPending || !commissionInput.trim()}
                      >
                        {commissionMutation.isPending ? "Saving…" : "Update rate"}
                      </Button>
                    </div>
                  </Field>
                </div>
                <h4 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rate history
                </h4>
                {profile.commissionHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No history recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-72 text-sm">
                      <thead>
                        <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pe-3 text-start font-medium">Rate</th>
                          <th className="py-1.5 pe-3 text-start font-medium">Effective from</th>
                          <th className="py-1.5 text-start font-medium">Changed by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.commissionHistory.map((h) => (
                          <tr key={h.id} className="border-b last:border-0">
                            <td className="py-1.5 pe-3 font-medium">
                              {(Number(h.rate) * 100).toFixed(1)}%
                            </td>
                            <td className="py-1.5 pe-3 text-muted-foreground" title={fmtDateTime(h.effective_from)}>
                              {timeAgo(h.effective_from)}
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
                title="Products"
                subtitle={`${profile.stats.productCount} products`}
                actions={
                  <Link to="/admin/products">
                    <Button variant="outline" size="sm">
                      View products
                    </Button>
                  </Link>
                }
              >
                <p className="text-sm text-muted-foreground">
                  {profile.stats.productCount === 0
                    ? "This seller has no products yet."
                    : `${profile.stats.productCount} product${profile.stats.productCount === 1 ? "" : "s"} in the catalog.`}
                </p>
              </AdminCard>

              <AdminCard title="Recent orders" subtitle="Latest seller orders">
                {profile.recentOrders.length === 0 ? (
                  <EmptyState title="No orders yet" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-96 text-sm">
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
                              <td className="py-1.5 pe-3 whitespace-nowrap">{fmtMoney(o.subtotal)}</td>
                              <td className="py-1.5 pe-3 whitespace-nowrap">
                                {fmtMoney(o.commission_total)}
                              </td>
                              <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(o.created_at)}>
                                {timeAgo(o.created_at)}
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
              <AdminCard title="Settlements" subtitle="Payout records">
                {profile.settlements.length === 0 ? (
                  <EmptyState title="No settlements" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-96 text-sm">
                      <thead>
                        <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pe-3 text-start font-medium">Amount</th>
                          <th className="py-1.5 pe-3 text-start font-medium">Status</th>
                          <th className="py-1.5 pe-3 text-start font-medium">Reference</th>
                          <th className="py-1.5 text-start font-medium">Settled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.settlements.map((s) => (
                          <tr key={s.id} className="border-b last:border-0">
                            <td className="py-1.5 pe-3 font-medium whitespace-nowrap">
                              {fmtMoney(s.amount)} {s.currency}
                            </td>
                            <td className="py-1.5 pe-3">
                              <StatusPill status={s.status} />
                            </td>
                            <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                              {s.payment_reference ?? "—"}
                            </td>
                            <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                              {s.settled_at ? timeAgo(s.settled_at) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCard>

              <AdminCard title="Recent reviews" subtitle="On this seller's products">
                {profile.reviews.length === 0 ? (
                  <EmptyState title="No reviews yet" />
                ) : (
                  <ul className="space-y-3">
                    {profile.reviews.map((r) => (
                      <li key={String(r.id)} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {productName((r.products as { name?: unknown } | null)?.name)}
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
                          <StatusPill status={String(r.moderation_status ?? r.status ?? "—")} />
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(String(r.created_at))}
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
              <AdminCard title="Staff" subtitle="Team members with seller access">
                {profile.staff.length === 0 ? (
                  <EmptyState title="No staff members" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-72 text-sm">
                      <thead>
                        <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pe-3 text-start font-medium">User</th>
                          <th className="py-1.5 pe-3 text-start font-medium">Role</th>
                          <th className="py-1.5 text-start font-medium">Added</th>
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
                            <td className="py-1.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(m.created_at)}>
                              {timeAgo(m.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminCard>

              <AdminCard title="Activity" subtitle="Recent admin actions for this seller">
                {profile.auditLogs.length === 0 ? (
                  <EmptyState title="No activity recorded" />
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
                        <span className="shrink-0 text-xs text-muted-foreground" title={fmtDateTime(log.created_at)}>
                          {timeAgo(log.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminCard>
            </div>

            {/* Linked application */}
            {profile.application && (
              <AdminCard title="Seller application" subtitle="The original application">
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
                  <Link to="/admin/applications">
                    <Button variant="outline" size="sm">
                      Open applications
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
          confirmLabel={confirmAction?.confirmLabel ?? "Confirm"}
          onConfirm={() => {
            if (confirmAction?.kind === "suspend") statusMutation.mutate("suspended");
            else if (confirmAction?.kind === "disable") statusMutation.mutate("disabled");
            else if (confirmAction?.kind === "verify") verifyMutation.mutate();
          }}
        />
      </AdminShell>
    </AdminGate>
  );
}
