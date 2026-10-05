import { createFileRoute, Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  Stat,
  StatusPill,
  EmptyState,
  TableSkeleton,
} from "@/components/admin/ui";
import { getAiStatus } from "@/lib/ai.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/ai")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "AI — Modalia Admin" }],
  }),
  component: AiPage,
});

const TOOLS: { name: string; description: string; to: NonNullable<LinkProps["to"]> }[] = [
  {
    name: "Shopping assistant",
    description:
      "Answers shopper questions strictly from the real catalog. Rules mode is rule-based; provider mode uses the configured model — both are pinned to real product data only.",
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

function AiPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;

  const statusQuery = useQuery({
    queryKey: ["admin-ai-status"],
    queryFn: () => getAiStatus({ data: {} }),
    retry: false,
  });

  const status = statusQuery.data;

  return (
    <AdminGate>
      <AdminShell
        title={t.ai}
        subtitle="How Modalia's AI layer is configured and where it is used. No secrets are ever shown here."
        breadcrumbs={[{ label: t.ai }]}
      >
        <div className="space-y-6">
          <AdminCard title="AI mode" subtitle="Resolved from server environment only.">
            {statusQuery.isPending ? (
              <TableSkeleton rows={3} />
            ) : statusQuery.isError ? (
              <EmptyState title="Could not load AI status" text={errMsg(statusQuery.error)} />
            ) : status ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Mode"
                  value={
                    <StatusPill status={status.source === "provider" ? "provider" : "rules"} />
                  }
                  hint={
                    status.source === "provider"
                      ? "External model answers, pinned to real catalog data."
                      : "Honest rule-based engine on real store data only."
                  }
                />
                <Stat
                  label="Provider"
                  value={status.providerLabel ?? "—"}
                  hint={status.source === "provider" ? "Configured provider" : "No provider configured"}
                />
                <Stat
                  label="Assistant names"
                  value={Object.values(status.ruleAssistantName).join(" · ")}
                  hint="Rule assistant name in ar / fr / en"
                />
              </div>
            ) : null}
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
