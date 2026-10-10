import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, Hammer, LayoutTemplate } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState, StatRow, StatRows } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { getHomepageSections } from "@/lib/admin-homepage.functions";
import { getLocale, getTranslations } from "@/lib/i18n";

export const Route = createFileRoute("/admin/homepage")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Homepage — Modalia Admin" },
      { name: "description", content: "Homepage overview and quick access to the builder." },
    ],
  }),
  component: HomepageOverviewPage,
});

function HomepageOverviewPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);

  const sectionsQuery = useQuery({
    queryKey: ["admin-homepage-sections"],
    queryFn: () => getHomepageSections(),
  });

  const sections = sectionsQuery.data?.sections ?? [];
  const enabled = sections.filter((s) => s.enabled);

  return (
    <AdminGate>
      <AdminShell
        title="Homepage"
        subtitle="Overview of your storefront homepage."
        breadcrumbs={[{ label: "Homepage" }]}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/" search={{ locale }} target="_blank" rel="noopener">
                <Eye className="size-4 me-1.5" />
                Preview
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/admin/homepage/builder" search={{ locale, create: "" }}>
                <Hammer className="size-4 me-1.5" />
                Open builder
              </Link>
            </Button>
          </>
        }
      >
        <StatRows>
          <StatRow label="Sections" value={String(sections.length)} />
          <StatRow label="Enabled" value={String(enabled.length)} />
          <StatRow label="Disabled" value={String(sections.length - enabled.length)} />
        </StatRows>

        <AdminCard className="mt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <LayoutTemplate className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-medium">Homepage builder</h2>
              <p className="text-sm text-muted-foreground">
                Create, reorder, enable and edit homepage sections.
              </p>
            </div>
            <Button className="ms-auto" asChild>
              <Link to="/admin/homepage/builder" search={{ locale, create: "" }}>
                Open builder
                <ArrowRight className="size-4 ms-1.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </AdminCard>

        {sectionsQuery.isPending ? (
          <div className="mt-6 space-y-2" aria-busy="true">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
          </div>
        ) : sectionsQuery.isError ? (
          <AdminCard className="mt-6">
            <EmptyState
              title={t.common.loadError}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => sectionsQuery.refetch()}>
                  {t.common.retry}
                </Button>
              }
            />
          </AdminCard>
        ) : sections.length > 0 ? (
          <AdminCard className="mt-6">
            <h2 className="mb-3 font-medium">Live sections</h2>
            <ul className="divide-y divide-border">
              {enabled.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm">{s.section_key}</span>
                  <span className="text-xs text-muted-foreground">{s.kind}</span>
                </li>
              ))}
            </ul>
            {enabled.length > 8 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                +{enabled.length - 8} more
              </p>
            ) : null}
          </AdminCard>
        ) : null}
      </AdminShell>
    </AdminGate>
  );
}
