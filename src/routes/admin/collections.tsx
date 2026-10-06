import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers, Plus } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, EmptyState } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/routing/back-link";
import { listAllCollections } from "@/lib/admin-collections.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { strParam } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/collections")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    back: strParam(search["back"]),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Collections — Modalia Admin" },
      { name: "description", content: "Curated product collections across all stores." },
    ],
  }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const { locale, back } = Route.useSearch();
  const t = getTranslations(locale).admin.collections;

  const collectionsQuery = useQuery({
    queryKey: ["admin-all-collections"],
    queryFn: () => listAllCollections({ data: {} }),
  });

  const collections = collectionsQuery.data?.collections ?? [];

  return (
    <AdminGate>
      <AdminShell
        title={t.title}
        subtitle={t.subtitle}
        breadcrumbs={[{ label: t.title }]}
        actions={
          <Button size="sm" asChild>
            <Link to="/admin/official-store" search={{ locale, tab: "collections" }}>
              <Plus className="size-4 me-1.5" />
              {t.newCollection}
            </Link>
          </Button>
        }
      >
        <BackLink back={back} fallbackTo="/admin" fallbackSearch={{ locale }}>
          <ArrowLeft className="size-4 me-1.5" />
          {t.back}
        </BackLink>

        {collectionsQuery.isPending ? (
          <div className="mt-4 space-y-2" aria-busy="true">
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : collections.length === 0 ? (
          <AdminCard className="mt-4">
            <EmptyState title={t.emptyTitle} text={t.emptyText} />
          </AdminCard>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <AdminCard key={`${c.storeId}:${c.id}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Layers className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.productsUnit(c.productCount)} · {c.storeName ?? t.storeFallback}
                    </p>
                    {/* No per-store collection editor exists — link to that
                        collection's own store page, which shows its collections. */}
                    <Button variant="link" size="sm" className="px-0" asChild>
                      <Link
                        to="/admin/stores/$storeId"
                        params={{ storeId: c.storeId }}
                        search={{ back, locale, q: "", status: "all", page: 1 }}
                      >
                        {t.manage}
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
