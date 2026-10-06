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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getSiteSettings,
  updateSiteSettings,
  getDefaultCommissionRate,
} from "@/lib/admin-ops.functions";
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

          <ModerationModeCard />

          <CommissionRateCard />
        </div>
      </AdminShell>
    </AdminGate>
  );
}

/**
 * Platform product-moderation mode (Section 36). This is a REAL setting:
 * `require_approval` keeps the current seller flow (publish → pending human
 * review); `auto_publish` makes the seller's publish action approve the
 * product directly, server-side. Persisted in `site_settings` like the other
 * keys on this page.
 */
function ModerationModeCard() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: () => getSiteSettings({ data: {} }),
    retry: false,
  });

  useEffect(() => {
    if (settingsQuery.data && mode === null) {
      const raw = settingsQuery.data.values["product_moderation_mode"];
      setMode(typeof raw === "string" ? raw : "require_approval");
    }
  }, [settingsQuery.data, mode]);

  const saveMode = useMutation({
    mutationFn: (next: string) =>
      updateSiteSettings({ data: { values: { product_moderation_mode: next } } }),
    onSuccess: () => {
      toast.success("Moderation mode saved.");
      queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <AdminCard
      title="Product moderation"
      subtitle="Controls what happens when a seller publishes a product."
    >
      {settingsQuery.isPending || mode === null ? (
        <TableSkeleton rows={2} />
      ) : settingsQuery.isError ? (
        <EmptyState title="Could not load settings" text={errMsg(settingsQuery.error)} />
      ) : (
        <div className="space-y-4">
          <Field
            label="Publishing mode"
            hint={
              mode === "auto_publish"
                ? "Seller publish actions approve products immediately, without human review."
                : "Seller publish actions send products to the moderation queue for human approval."
            }
          >
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="require_approval">
                  Require approval (moderation queue)
                </SelectItem>
                <SelectItem value="auto_publish">Auto-publish (no human review)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div>
            <Button onClick={() => saveMode.mutate(mode)} disabled={saveMode.isPending}>
              {saveMode.isPending ? "Saving…" : "Save moderation mode"}
            </Button>
          </div>
        </div>
      )}
    </AdminCard>
  );
}

/**
 * Platform default commission rate (Section 59). This is a REAL setting:
 * the seller-creation wizard pre-fills its commission step from
 * `site_settings.default_commission_rate` via `getDefaultCommissionRate`,
 * so changing it here changes new-seller behavior. Validated 0–100
 * server-side; falls back to 10% when never configured.
 */
function CommissionRateCard() {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState<string | null>(null);

  const rateQuery = useQuery({
    queryKey: ["admin-default-commission-rate"],
    queryFn: () => getDefaultCommissionRate({ data: {} }),
    retry: false,
  });

  useEffect(() => {
    if (rateQuery.data && rate === null) {
      setRate(String(rateQuery.data.rate));
    }
  }, [rateQuery.data, rate]);

  const saveRate = useMutation({
    mutationFn: (next: number) =>
      updateSiteSettings({ data: { values: { default_commission_rate: next } } }),
    onSuccess: () => {
      toast.success("Default commission rate saved.");
      queryClient.invalidateQueries({ queryKey: ["admin-default-commission-rate"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const parsed = rate === null ? NaN : Number(rate.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;

  return (
    <AdminCard
      title="Default commission rate"
      subtitle="Pre-filled in the seller-creation wizard for new sellers. Existing sellers keep their own rate."
    >
      {rateQuery.isPending || rate === null ? (
        <TableSkeleton rows={2} />
      ) : rateQuery.isError ? (
        <EmptyState title="Could not load commission setting" text={errMsg(rateQuery.error)} />
      ) : (
        <div className="space-y-4">
          <Field
            label="Commission (%)"
            hint="Applies only to sellers created after the change. History per seller is preserved."
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              dir="ltr"
              className="max-w-40"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <div>
            <Button
              onClick={() => saveRate.mutate(parsed)}
              disabled={saveRate.isPending || !valid}
            >
              {saveRate.isPending ? "Saving…" : "Save commission rate"}
            </Button>
          </div>
        </div>
      )}
    </AdminCard>
  );
}
