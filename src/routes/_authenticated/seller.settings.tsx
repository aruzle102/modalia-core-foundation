import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminCard, Field, Stat, TableSkeleton } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { getSellerProfile, updateSellerProfile } from "@/lib/seller-support.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { RouteError } from "@/components/routing/route-states";

const q = queryOptions({ queryKey: ["seller-profile"], queryFn: () => getSellerProfile() });

export const Route = createFileRoute("/_authenticated/seller/settings")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  errorComponent: SettingsError,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: SettingsPage,
});

function SettingsError({ reset }: { reset: () => void }) {
  const t = getTranslations(useAdminLocale()).seller.settings;
  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <RouteError message={t.loadError} reset={reset} />
    </SellerShell>
  );
}

function SettingsPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).seller.settings;

  return (
    <SellerShell eyebrow={t.eyebrow} title={t.title}>
      <p className="text-body text-muted-foreground">{t.intro}</p>
      <ProfileForm t={t} />
    </SellerShell>
  );
}

function ProfileForm({ t }: { t: ReturnType<typeof getTranslations>["seller"]["settings"] }) {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [form, setForm] = useState({ legalName: data.profile.legalName, phone: data.profile.phone, email: data.profile.email });
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateSellerProfile({ data: { legalName: form.legalName.trim(), phone: form.phone.trim() || undefined, email: form.email.trim() || undefined } }),
    onSuccess: (result) => {
      if (result.emailChanged && result.verificationPending) {
        setMessage(t.emailVerificationSent);
      } else if (result.emailChanged && result.emailVerified) {
        setMessage(t.emailAlreadyVerified);
      } else {
        setMessage(t.updated);
      }
      qc.invalidateQueries({ queryKey: ["seller-profile"] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : t.updateFailed),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <AdminCard title={t.profileTitle} subtitle={t.profileSubtitle}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t.legalName}>
              <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} disabled={!data.isOwner} />
            </Field>
          </div>
          <Field label={t.phone} hint={t.phoneHint}>
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!data.isOwner} />
          </Field>
          <Field label={t.contactEmail}>
            <Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!data.isOwner} />
          </Field>
        </div>
        {data.isOwner ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button disabled={form.legalName.trim().length < 2 || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? t.saving : t.saveChanges}
            </Button>
            {message ? <p className="text-small text-muted-foreground">{message}</p> : null}
          </div>
        ) : (
          <p className="mt-5 text-small text-muted-foreground">{t.ownerOnly}</p>
        )}
      </AdminCard>
      <div className="space-y-4">
        <Stat label={t.accountStatus} value={data.profile.accountStatus} />
        <Stat label={t.commissionRate} value={`${(data.profile.commissionRate * 100).toFixed(1)}%`} />
      </div>
    </div>
  );
}
