import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState, Field, TableSkeleton } from "@/components/admin/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductEditor } from "@/components/seller/ProductEditor";
import { listAdminSellersLite } from "@/lib/admin-catalog.functions";
import { useAdminT } from "@/components/admin/use-admin-t";
import { errMsg } from "./_shared";
import { strParam } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/products/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    back: strParam(search["back"]),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "New product — Modalia Admin" }],
  }),
  component: AdminProductNewPage,
});

function AdminProductNewPage() {
  const t = useAdminT().products;
  const { back } = Route.useSearch();
  const [sellerId, setSellerId] = useState("");
  const sellersQuery = useQuery({
    queryKey: ["admin-sellers-lite"],
    queryFn: () => listAdminSellersLite(),
    retry: false,
  });
  const sellers = sellersQuery.data?.sellers ?? [];

  return (
    <AdminGate>
      <AdminShell
        title={t.newTitle}
        subtitle={t.newSubtitle}
        breadcrumbs={[{ label: t.title, to: "/admin/products", back: back || "/admin/products" }, { label: t.newTitle }]}
      >
        {sellersQuery.isPending ? (
          <TableSkeleton rows={3} />
        ) : sellersQuery.isError ? (
          <EmptyState title={t.loadError} text={errMsg(sellersQuery.error)} />
        ) : !sellerId ? (
          <AdminCard title={t.chooseSellerTitle} subtitle={t.chooseSellerHint}>
            <Field label={t.seller}>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder={t.selectSeller} />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.legal_name} · {s.account_status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </AdminCard>
        ) : (
          <ProductEditor key={sellerId} mode="create" adminMode adminSellerId={sellerId} />
        )}
      </AdminShell>
    </AdminGate>
  );
}
