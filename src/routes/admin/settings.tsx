import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  TableSkeleton,
  Field,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSiteSettings, updateSiteSettings } from "@/lib/admin-ops.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Settings — Modalia Admin" }],
  }),
  component: SettingsPage,
});

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const CONTACT_FIELDS = [
  { key: "contact_email", label: "Contact email", type: "email" as const },
  { key: "contact_phone", label: "Contact phone", type: "tel" as const },
  { key: "contact_hours", label: "Contact hours", type: "text" as const },
] as const;

const SOCIAL_FIELDS = [
  { key: "instagram_url", label: "Instagram URL" },
  { key: "facebook_url", label: "Facebook URL" },
  { key: "tiktok_url", label: "TikTok URL" },
  { key: "whatsapp_number", label: "WhatsApp number" },
] as const;

function SettingsPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: () => getSiteSettings({ data: {} }),
    retry: false,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !hydrated) {
      const values = settingsQuery.data.values;
      const next: Record<string, string> = {};
      for (const f of [...CONTACT_FIELDS, ...SOCIAL_FIELDS, { key: "contact_address", label: "" }]) {
        next[f.key] = str(values[f.key]);
      }
      setForm(next);
      setHydrated(true);
    }
  }, [settingsQuery.data, hydrated]);

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => updateSiteSettings({ data: { values: form } }),
    onSuccess: (r) => {
      toast.success(`Saved ${r.saved} setting(s).`);
      queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <AdminGate>
      <AdminShell
        title={t.settings}
        subtitle="Platform contact details and social links, editable here and shown across the storefront."
        breadcrumbs={[{ label: t.settings }]}
      >
        <div className="space-y-6">
          <AdminCard title="Contact" subtitle="Shown in the footer and contact page.">
            {settingsQuery.isPending ? (
              <TableSkeleton rows={4} />
            ) : settingsQuery.isError ? (
              <EmptyState title="Could not load settings" text={errMsg(settingsQuery.error)} />
            ) : (
              <div className="space-y-4">
                {CONTACT_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      type={f.type}
                      value={form[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      dir="ltr"
                    />
                  </Field>
                ))}
                <Field label="Contact address">
                  <Textarea
                    value={form["contact_address"] ?? ""}
                    onChange={(e) => set("contact_address", e.target.value)}
                    rows={2}
                  />
                </Field>
              </div>
            )}
          </AdminCard>

          <AdminCard title="Social links" subtitle="Shown in the footer. Leave empty to hide.">
            {!settingsQuery.isPending && !settingsQuery.isError ? (
              <div className="space-y-4">
                {SOCIAL_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      value={form[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder="https://…"
                      dir="ltr"
                    />
                  </Field>
                ))}
                <div>
                  <Button onClick={() => save.mutate()} disabled={save.isPending || settingsQuery.isPending}>
                    {save.isPending ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              </div>
            ) : null}
          </AdminCard>
        </div>
      </AdminShell>
    </AdminGate>
  );
}
