import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getSellerDashboard, inviteSellerStaff } from "@/lib/seller.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

const q = queryOptions({ queryKey: ["seller-dashboard"], queryFn: () => getSellerDashboard() });

export const Route = createFileRoute("/_authenticated/seller/staff")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: StaffPage,
});

function StaffPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [staff, setStaff] = useState<any[]>([]);

  useEffect(() => {
    if (!data?.seller.id) return;
    supabase.from("seller_staff").select("id,user_id,role,permissions,created_at").eq("seller_id", data.seller.id).then(({ data: rows }) => setStaff(rows ?? []));
  }, [data?.seller.id]);

  const mutation = useMutation({
    mutationFn: () => inviteSellerStaff({ data: { sellerId: data!.seller.id, email, permissions: ["products.view", "orders.view", "inventory.view"] } }),
    onSuccess: () => { setEmail(""); setMessage("Invitation sent."); qc.invalidateQueries({ queryKey: ["seller-dashboard"] }); },
  });

  if (!data) return null;

  return <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
    <SiteHeader locale={locale} t={t} />
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-eyebrow text-muted-foreground">Seller workspace</p>
      <h1 className="mt-2 text-display">Staff & permissions</h1>
      <div className="mt-8 rounded-[28px] border border-border bg-card p-6">
        <h2 className="text-h3">Invite a staff member</h2>
        <p className="mt-2 text-small text-muted-foreground">New staff start with limited product, order and inventory access.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Input type="email" placeholder="staff@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button disabled={!email || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Sending…" : "Invite"}</Button>
        </div>
        {message ? <p className="mt-3 text-small text-muted-foreground">{message}</p> : null}
        {mutation.error ? <p className="mt-3 text-small text-destructive">{mutation.error instanceof Error ? mutation.error.message : "Invitation failed."}</p> : null}
      </div>
      <section className="mt-6 rounded-[28px] border border-border bg-card p-6">
        <h2 className="text-h3">Current staff</h2>
        <div className="mt-5 divide-y divide-border">
          {staff.map((member) => <div key={member.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-medium">{member.role}</p><p className="text-caption text-muted-foreground">{member.user_id}</p></div><div className="flex flex-wrap gap-1">{(member.permissions ?? []).slice(0, 5).map((permission: string) => <span key={permission} className="rounded-full bg-muted px-2 py-1 text-[10px]">{permission}</span>)}</div></div>)}
          {!staff.length ? <p className="py-8 text-small text-muted-foreground">No staff members yet.</p> : null}
        </div>
      </section>
    </main>
    <SiteFooter locale={locale} t={t} />
  </div>;
}
