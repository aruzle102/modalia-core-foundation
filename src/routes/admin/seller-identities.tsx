import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGate } from "@/components/admin/AdminGate";
import { StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import {
  listSellersForVerification,
  verifySellerIdentity,
  getSellerIdentityDetail,
} from "@/lib/admin-sellers.functions";

export const Route = createFileRoute("/admin/seller-identities")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Seller Identity Verification — Modalia Admin" }],
  }),
  component: SellerIdentitiesPage,
});

function SellerIdentitiesPage() {
  const locale = getLocale();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["seller-identities"],
    queryFn: () => listSellersForVerification(),
  });

  const verifyMutation = useMutation({
    mutationFn: (params: { sellerId: string; approved: boolean; note: string }) =>
      verifySellerIdentity({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-identities"] });
      setSelected(null);
      setNote("");
      toast.success("Verification updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sellers = data?.sellers ?? [];

  return (
    <AdminGate>
      <AdminShell title="Seller Identity Verification" subtitle="Review and verify seller identities">
        <div dir={localeDirections[locale as "fr" | "ar" | "en"]}>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : sellers.length === 0 ? (
            <EmptyState title="No sellers pending verification" />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Phone</th>
                  <th>Wilaya</th>
                  <th>Onboarded</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium">{s.first_name} {s.last_name}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </td>
                    <td dir="ltr">{s.phone || "—"}</td>
                    <td>{s.wilaya || "—"}</td>
                    <td>{s.onboarded_at ? fmtDateTime(s.onboarded_at) : "—"}</td>
                    <td>
                      <StatusPill status={s.verification_state || "pending"} />
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelected(s.id)}
                        >
                          Review
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}

          <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Verify Seller Identity</DialogTitle>
              </DialogHeader>
              {selected && (
                <SellerDetail sellerId={selected} />
              )}
              <div className="mt-4">
                <label className="text-sm font-medium">Verification note</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note about the verification..."
                  rows={3}
                  className="mt-2"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => selected && verifyMutation.mutate({ sellerId: selected, approved: false, note })}
                  disabled={verifyMutation.isPending}
                >
                  <X className="me-1.5 h-4 w-4" />
                  Reject
                </Button>
                <Button
                  onClick={() => selected && verifyMutation.mutate({ sellerId: selected, approved: true, note })}
                  disabled={verifyMutation.isPending}
                >
                  <Check className="me-1.5 h-4 w-4" />
                  Approve Identity
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AdminShell>
    </AdminGate>
  );
}

function SellerDetail({ sellerId }: { sellerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["seller-identity-detail", sellerId],
    queryFn: () => getSellerIdentityDetail({ data: { sellerId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  const s = data?.seller;
  if (!s) return <p className="text-sm text-muted-foreground">Not found.</p>;

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Full name:</span>
        <span className="font-medium">{s.first_name} {s.last_name}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Legal name:</span>
        <span>{s.legal_name || "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Email:</span>
        <span dir="ltr">{s.email || "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Phone:</span>
        <span dir="ltr">{s.phone || "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Wilaya:</span>
        <span>{s.wilaya || "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Address:</span>
        <span>{s.address || "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Store:</span>
        <span>{s.store_name || "—"}</span>
      </div>
    </div>
  );
}


