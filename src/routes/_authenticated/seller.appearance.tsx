import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { SellerShell } from "@/components/seller/SellerShell";
import { StoreStudio } from "@/components/seller/StoreStudio";
import { getStoreStudio } from "@/lib/seller-store.functions";
import { getLocale } from "@/lib/i18n";
import { RouteError } from "@/components/routing/route-states";

const studioQuery = queryOptions({ queryKey: ["seller-store-studio"], queryFn: () => getStoreStudio() });

export const Route = createFileRoute("/_authenticated/seller/appearance")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studioQuery),
  errorComponent: ({ reset }) => (
    <SellerShell eyebrow="Seller OS" title="Store appearance">
      <RouteError message="Store appearance could not be loaded. Check your connection and try again." reset={reset} />
    </SellerShell>
  ),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AppearancePage,
});

function AppearancePage() {
  const { locale } = Route.useSearch();
  const { data } = useSuspenseQuery(studioQuery);
  return (
    <SellerShell
      title="Appearance"
      eyebrow="Seller workspace · Store studio"
      actions={null}
    >
      {data ? (
        <StoreStudio data={data} locale={locale} initialTab="appearance" />
      ) : (
        <p className="py-10 text-small text-muted-foreground">{"Your store could not be loaded."}</p>
      )}
    </SellerShell>
  );
}
