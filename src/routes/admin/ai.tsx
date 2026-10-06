import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  Stat,
  StatusPill,
  EmptyState,
  TableSkeleton,
  Field,
  fmtDateTime,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getAiStatus } from "@/lib/ai.functions";
import {
  getIntelligenceSettings,
  updateIntelligenceSettings,
  type IntelligenceSettings,
} from "@/lib/intelligence-settings.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/ai")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Intelligence — Modalia Admin" }],
  }),
  component: IntelligencePage,
});

const TOOLS: { name: string; description: string; to: NonNullable<LinkProps["to"]> }[] = [
  {
    name: "Shopping assistant",
    description:
      "Answers shopper questions strictly from the real catalog using the deterministic rule-based engine. No external AI model is called.",
    to: "/",
  },
  {
    name: "Natural-language catalog search",
    description:
      "Parses ar/fr/en queries (category, price, attributes) and matches them against real products. No invented results.",
    to: "/shop",
  },
  {
    name: "Seller draft studio",
    description:
      "Sellers generate product draft copy with mandatory human review before anything goes live.",
    to: "/seller/ai",
  },
  {
    name: "Moderation briefs",
    description:
      "Rule-based briefs that summarize pending applications and products for the admin queue — used on the applications page.",
    to: "/admin/applications",
  },
];

const LOCALES: { code: SupportedLocale; label: string }[] = [
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

function TriInputs({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  multiline?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="grid gap-3">
        {LOCALES.map(({ code, label: langLabel }) => (
          <div key={code} className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{langLabel}</Label>
            {multiline ? (
              <Textarea
                value={value[code] ?? ""}
                onChange={(e) => onChange({ ...value, [code]: e.target.value })}
                rows={3}
                maxLength={2000}
                dir={code === "ar" ? "rtl" : "ltr"}
              />
            ) : (
              <Input
                value={value[code] ?? ""}
                onChange={(e) => onChange({ ...value, [code]: e.target.value })}
                maxLength={2000}
                dir={code === "ar" ? "rtl" : "ltr"}
              />
            )}
          </div>
        ))}
      </div>
    </Field>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

function IntelligencePage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["admin-ai-status"],
    queryFn: () => getAiStatus({ data: {} }),
    retry: false,
  });

  const settingsQuery = useQuery({
    queryKey: ["intelligence-settings"],
    queryFn: () => getIntelligenceSettings({ data: {} }),
    retry: false,
  });

  const [draft, setDraft] = useState<IntelligenceSettings | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    if (settingsQuery.data && !draft) setDraft(settingsQuery.data);
  }, [settingsQuery.data, draft]);

  const save = useMutation({
    mutationFn: (input: Partial<IntelligenceSettings>) =>
      updateIntelligenceSettings({ data: input as never }),
    onSuccess: (result) => {
      setDraft(result);
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["intelligence-settings"] });
      window.setTimeout(() => setSaveState("idle"), 2500);
    },
    onError: () => setSaveState("error"),
  });

  const status = statusQuery.data;

  return (
    <AdminGate>
      <AdminShell
        title="Intelligence"
        subtitle="Modalia Intelligence control plane — deterministic, DB-powered, no external AI. No secrets are ever shown here."
        breadcrumbs={[{ label: t.ai }]}
      >
        <div className="space-y-6">
          <AdminCard title="AI mode" subtitle="Modalia Intelligence is deterministic and database-powered.">
            {statusQuery.isPending ? (
              <TableSkeleton rows={3} />
            ) : statusQuery.isError ? (
              <EmptyState title="Could not load AI status" text={errMsg(statusQuery.error)} />
            ) : status ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Stat
                  label="Mode"
                  value={<StatusPill status="rules" />}
                  hint="Honest rule-based engine on real store data only. No external AI provider is called in production."
                />
                <Stat
                  label="Assistant names"
                  value={Object.values(status.ruleAssistantName).join(" · ")}
                  hint="Rule assistant name in ar / fr / en"
                />
              </div>
            ) : null}
          </AdminCard>

          <AdminCard
            title="Feature switches"
            subtitle="Enable or disable each intelligence surface without touching code."
          >
            {settingsQuery.isPending ? (
              <TableSkeleton rows={3} />
            ) : settingsQuery.isError || !draft ? (
              <EmptyState title="Could not load settings" text={errMsg(settingsQuery.error)} />
            ) : (
              <div className="divide-y divide-border">
                <ToggleRow
                  label="Support answers"
                  hint="Answer shopper questions from the confirmed Modalia knowledge base (delivery, COD, tracking, returns, seller onboarding)."
                  checked={draft.support_enabled}
                  onChange={(v) => {
                    const next = { ...draft, support_enabled: v };
                    setDraft(next);
                    save.mutate({ support_enabled: v });
                  }}
                  disabled={save.isPending}
                />
                <ToggleRow
                  label="Smart shopping"
                  hint="Natural-language product search over the real catalog (category, price, attributes)."
                  checked={draft.smart_shopping_enabled}
                  onChange={(v) => {
                    const next = { ...draft, smart_shopping_enabled: v };
                    setDraft(next);
                    save.mutate({ smart_shopping_enabled: v });
                  }}
                  disabled={save.isPending}
                />
                <ToggleRow
                  label="Recommendations"
                  hint="Deterministic recommendations from real signals (views, sales, recency). Never fabricated."
                  checked={draft.recommendations_enabled}
                  onChange={(v) => {
                    const next = { ...draft, recommendations_enabled: v };
                    setDraft(next);
                    save.mutate({ recommendations_enabled: v });
                  }}
                  disabled={save.isPending}
                />
              </div>
            )}
          </AdminCard>

          <AdminCard
            title="Assistant copy"
            subtitle="Trilingual messages shown in the shopping assistant."
            actions={
              <Button
                size="sm"
                disabled={!draft || save.isPending}
                onClick={() =>
                  draft &&
                  save.mutate({
                    welcome_message: draft.welcome_message,
                    suggested_questions: draft.suggested_questions,
                    fallback_message: draft.fallback_message,
                  })
                }
              >
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save copy
              </Button>
            }
          >
            {!draft ? (
              <TableSkeleton rows={4} />
            ) : (
              <div className="grid gap-6">
                <TriInputs
                  label="Welcome message"
                  value={draft.welcome_message}
                  onChange={(v) => setDraft({ ...draft, welcome_message: v })}
                  multiline
                />
                <TriInputs
                  label="Fallback message (no confirmed answer)"
                  value={draft.fallback_message}
                  onChange={(v) => setDraft({ ...draft, fallback_message: v })}
                  multiline
                />
                <Field
                  label="Suggested questions"
                  hint="One per line per language — keep the three languages aligned by line number."
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    {LOCALES.map(({ code, label: langLabel }) => (
                      <div key={code} className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">{langLabel}</Label>
                        <Textarea
                          rows={6}
                          dir={code === "ar" ? "rtl" : "ltr"}
                          value={draft.suggested_questions.map((q) => q[code] ?? "").join("\n")}
                          onChange={(e) => {
                            const lines = e.target.value.split("\n").slice(0, 12);
                            const next = lines.map((line, i) => ({
                              ar: code === "ar" ? line : (draft.suggested_questions[i]?.ar ?? ""),
                              fr: code === "fr" ? line : (draft.suggested_questions[i]?.fr ?? ""),
                              en: code === "en" ? line : (draft.suggested_questions[i]?.en ?? ""),
                            }));
                            setDraft({ ...draft, suggested_questions: next });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </Field>
                {saveState === "saved" ? (
                  <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <Check className="size-4" /> Saved.
                  </p>
                ) : saveState === "error" ? (
                  <p className="text-sm text-destructive">Could not save. Please retry.</p>
                ) : null}
              </div>
            )}
          </AdminCard>

          <AdminCard
            title="Ranking weights"
            subtitle="Deterministic recommendation ranking. Weights are normalized to sum to 1 on save."
            actions={
              <Button
                size="sm"
                disabled={!draft || save.isPending}
                onClick={() => draft && save.mutate({ ranking_weights: draft.ranking_weights })}
              >
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save weights
              </Button>
            }
          >
            {!draft ? (
              <TableSkeleton rows={4} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["sales", "Sales signal"],
                    ["views", "Product views"],
                    ["recency", "Recency"],
                    ["rating", "Rating"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label} hint={`Current: ${(draft.ranking_weights[key] * 100).toFixed(0)}%`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draft.ranking_weights[key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            ranking_weights: { ...draft.ranking_weights, [key]: Number(e.target.value) },
                          })
                        }
                        className="w-full accent-primary"
                        aria-label={label}
                      />
                      <span className="w-12 shrink-0 text-right text-sm tabular-nums">
                        {(draft.ranking_weights[key] * 100).toFixed(0)}%
                      </span>
                    </div>
                  </Field>
                ))}
              </div>
            )}
          </AdminCard>

          <AdminCard title="Index status" subtitle="Knowledge is the live database — no manual retraining needed.">
            {settingsQuery.isPending ? (
              <TableSkeleton rows={2} />
            ) : settingsQuery.isError || !draft ? (
              <EmptyState title="Could not load status" text={errMsg(settingsQuery.error)} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Source of truth" value="PostgreSQL" hint="Products, categories, stores, shipping, policies" />
                <Stat label="Index mode" value="Live" hint="New catalog content becomes searchable immediately" />
                <Stat label="Last settings update" value={fmtDateTime(draft.updated_at)} hint="From the audit log for change history" />
              </div>
            )}
          </AdminCard>

          <AdminCard title="AI tools" subtitle="Every AI surface on the platform and where to find it.">
            <ul className="divide-y divide-border">
              {TOOLS.map((tool) => (
                <li key={tool.name} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 max-w-xl">
                    <p className="font-medium">{tool.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                  </div>
                  <Link to={tool.to} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </AdminCard>
        </div>
      </AdminShell>
    </AdminGate>
  );
}
