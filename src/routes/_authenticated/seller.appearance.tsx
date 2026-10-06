import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SellerShell } from "@/components/seller/SellerShell";
import { StoreStudio } from "@/components/seller/StoreStudio";
import { getStoreStudio } from "@/lib/seller-store.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { RouteError } from "@/components/routing/route-states";

const studioQuery = queryOptions({
  queryKey: ["seller-store-studio"],
  queryFn: () => getStoreStudio(),
});

export const Route = createFileRoute("/_authenticated/seller/appearance")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studioQuery),
  pendingComponent: AppearancePending,
  errorComponent: AppearanceError,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AppearancePage,
});

function AppearancePending() {
  const t = getTranslations(useAdminLocale()).seller.appearance;
  return (
    <SellerShell eyebrow={t.osEyebrow} title={t.pendingTitle}>
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </SellerShell>
  );
}

function AppearanceError({ reset }: { reset: () => void }) {
  const t = getTranslations(useAdminLocale()).seller.appearance;
  return (
    <SellerShell eyebrow={t.osEyebrow} title={t.pendingTitle}>
      <RouteError message={t.loadError} reset={reset} />
    </SellerShell>
  );
}

function AppearancePage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).seller.appearance;
  const { data } = useSuspenseQuery(studioQuery);
  return (
    <SellerShell title={t.title} eyebrow={t.eyebrow} actions={null}>
      {data ? (
        <StoreStudio data={data} locale={locale} initialTab="appearance" />
      ) : (
        <p className="py-10 text-small text-muted-foreground">{t.notFound}</p>
      )}
    </SellerShell>
  );
}
