import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCard, Field, Stat, TableSkeleton } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { getSellerProfile, updateSellerProfile } from "@/lib/seller-support.functions";
import { getLocale, getTranslations } from "@/lib/i18n";

const q = queryOptions({ queryKey: ["seller-profile"], queryFn: () => getSellerProfile() });

export const Route = createFileRoute("/_authenticated/seller/settings")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  component: SettingsPage,
});

function SettingsPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Seller settings"
    >
      <p className="text-body text-muted-foreground">Your seller account details. Only the store owner can edit them.</p>
      <ProfileForm />
    </SellerShell>
  );
}

function ProfileForm() {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [form, setForm] = useState({ legalName: data.profile.legalName, phone: data.profile.phone, email: data.profile.email });
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateSellerProfile({ data: { legalName: form.legalName.trim(), phone: form.phone.trim() || undefined, email: form.email.trim() || undefined } }),
    onSuccess: () => {
      setMessage("Profile updated.");
      qc.invalidateQueries({ queryKey: ["seller-profile"] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "Update failed."),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <AdminCard title="Seller profile" subtitle="Shown to customers and used for payouts.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Legal name">
              <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} disabled={!data.isOwner} />
            </Field>
          </div>
          <Field label="Phone" hint="Algerian format, e.g. 0550 12 34 56">
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!data.isOwner} />
          </Field>
          <Field label="Contact email">
            <Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!data.isOwner} />
          </Field>
        </div>
        {data.isOwner ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button disabled={form.legalName.trim().length < 2 || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
            {message ? <p className="text-small text-muted-foreground">{message}</p> : null}
          </div>
        ) : (
          <p className="mt-5 text-small text-muted-foreground">Only the store owner can edit this profile.</p>
        )}
      </AdminCard>
      <div className="space-y-4">
        <Stat label="Account status" value={data.profile.accountStatus} />
        <Stat label="Commission rate" value={`${(data.profile.commissionRate * 100).toFixed(1)}%`} />
      </div>
    </div>
  );
}
