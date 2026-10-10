import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, Plus } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/routing/back-link";
import {
  getHomepageSections,
  updateHomepageContent,
  type HomepageSection,
} from "@/lib/admin-homepage.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { strParam } from "@/hooks/use-url-state";
import { toast } from "sonner";

const BANNER_KINDS = ["hero", "app_banner", "editorial"] as const;

export const Route = createFileRoute("/admin/banners")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    back: strParam(search["back"]),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Banners — Modalia Admin" },
      { name: "description", content: "Manage promotional banners (hero, app, editorial)." },
    ],
  }),
  component: BannersPage,
});

function BannersPage() {
  const { locale, back } = Route.useSearch();
  const queryClient = useQueryClient();

  const sectionsQuery = useQuery({
    queryKey: ["admin-homepage-sections"],
    queryFn: () => getHomepageSections(),
  });

  const toggle = useMutation({
    mutationFn: (s: HomepageSection) =>
      updateHomepageContent({
        data: { sectionId: s.id, patch: { enabled: !s.enabled } },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-homepage-sections"] });
      toast.success("Banner updated.");
    },
    onError: () => toast.error("Could not update banner."),
  });

  const sections = (sectionsQuery.data?.sections ?? []).filter((s) =>
    (BANNER_KINDS as readonly string[]).includes(s.kind),
  );

  return (
    <AdminGate>
      <AdminShell
        title="Banners"
        subtitle="Promotional banners across the storefront."
        breadcrumbs={[{ label: getTranslations(locale).adminNav.items.banners }]}
        actions={
          <Button size="sm" asChild>
            <Link to="/admin/homepage/builder" search={{ locale, create: "section" }}>
              <Plus className="size-4 me-1.5" />
              New banner
            </Link>
          </Button>
        }
      >
        <BackLink back={back} fallbackTo="/admin/homepage" fallbackSearch={{ locale }}>
          <ArrowLeft className="size-4 me-1.5" />
          Back
        </BackLink>

        {sectionsQuery.isPending ? (
          <div className="mt-4 space-y-2" aria-busy="true">
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : sectionsQuery.isError ? (
          <AdminCard className="mt-4">
            <EmptyState
              title={getTranslations(locale).common.loadError}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => sectionsQuery.refetch()}>
                  {getTranslations(locale).common.retry}
                </Button>
              }
            />
          </AdminCard>
        ) : sections.length === 0 ? (
          <AdminCard className="mt-4">
            <EmptyState
              title="No banners yet"
              text="Create a hero, app or editorial banner from the homepage builder."
            />
          </AdminCard>
        ) : (
          <div className="mt-4 grid gap-4">
            {sections.map((s) => (
              <AdminCard key={s.id}>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.section_key}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.kind} · {s.enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle.mutate(s)}
                      disabled={toggle.isPending}
                    >
                      {s.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        to="/admin/homepage/builder"
                        search={{ locale, create: "" }}
                      >
                        <Eye className="size-4 me-1.5" />
                        Edit
                      </Link>
                    </Button>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>
        )}
      </AdminShell>
    </AdminGate>
  );
}
