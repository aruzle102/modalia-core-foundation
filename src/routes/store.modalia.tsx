import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { StoreFront } from "@/components/store/StoreFront";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getStoreDetail } from "@/lib/store.functions";
import { breadcrumbJsonLd, canonicalUrl, onlineStoreJsonLd, pageHead, prefetchSeoSettings, seoRobotsFromHeadCtx } from "@/lib/seo";
import { RouteError, RoutePending } from "@/components/routing/route-states";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import type { Database, Json } from "@/integrations/supabase/types";

const OFFICIAL_SLUG = "modalia";

function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Reviews are temporarily unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function localizedText(value: Json | null, locale: string, fallback: string): string {
  if (!value || Array.isArray(value)) return fallback;
  const record = value as Record<string, Json | undefined>;
  const localized = record[locale] ?? record["fr"] ?? record["en"] ?? record["ar"];
  return typeof localized === "string" ? localized : fallback;
}

export interface OfficialStoreReview {
  id: string;
  rating: number;
  body: string | null;
  firstName: string | null;
  createdAt: string;
  verifiedPurchase: boolean | null;
  productSlug: string;
  productName: string;
}

/**
 * Real, approved customer reviews on the official store's published products.
 * Returns an empty list (and the page hides the section) when there are none —
 * never fabricated.
 */
export const getOfficialStoreReviews = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ locale: z.string() }).parse(data))
  .handler(async ({ data }): Promise<{ reviews: OfficialStoreReview[]; average: number | null; count: number }> => {
    const supabase = publicClient();
    const storeRow = await supabase
      .from("stores")
      .select("id")
      .eq("slug", OFFICIAL_SLUG)
      .eq("status", "active")
      .maybeSingle();
    if (storeRow.error || !storeRow.data) return { reviews: [], average: null, count: 0 };

    const productsRes = await supabase
      .from("products")
      .select("id,slug,name")
      .eq("store_id", storeRow.data.id)
      .eq("status", "active")
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .eq("visibility", "public")
      .limit(500);
    const products = productsRes.data ?? [];
    if (!products.length) return { reviews: [], average: null, count: 0 };

    const byId = new Map(products.map((product) => [product.id, product]));
    const reviewsRes = await supabase
      .from("reviews")
      .select("id,product_id,rating,body,first_name,created_at,verified_purchase")
      .in("product_id", [...byId.keys()])
      .eq("moderation_status", "approved")
      .order("created_at", { ascending: false })
      .limit(12);
    if (reviewsRes.error) throw new Error("Reviews could not be loaded.");

    const reviews = (reviewsRes.data ?? [])
      .map((review): OfficialStoreReview | null => {
        const product = byId.get(review.product_id);
        if (!product) return null;
        return {
          id: review.id,
          rating: Number(review.rating) || 0,
          body: review.body,
          firstName: review.first_name,
          createdAt: review.created_at,
          verifiedPurchase: review.verified_purchase,
          productSlug: product.slug,
          productName: localizedText(product.name, data.locale, product.slug),
        };
      })
      .filter((review): review is OfficialStoreReview => review !== null);
    const average = reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null;
    return { reviews, average, count: reviews.length };
  });

const storeQuery = (locale: string) =>
  queryOptions({
    queryKey: ["store", OFFICIAL_SLUG, locale],
    queryFn: () => getStoreDetail({ data: { slug: OFFICIAL_SLUG, locale } }),
  });
const reviewsQuery = (locale: string) =>
  queryOptions({
    queryKey: ["official-store-reviews", locale],
    queryFn: () => getOfficialStoreReviews({ data: { locale } }),
  });

export const Route = createFileRoute("/store/modalia")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(storeQuery(deps.locale)),
      context.queryClient.ensureQueryData(reviewsQuery(deps.locale)),
      prefetchSeoSettings(context.queryClient),
    ]),
  pendingComponent: () => <RoutePending label="Loading the official store…" />,
  errorComponent: ({ reset }) => (
    <RouteError
      message="The official store could not be loaded. Check your connection and try again."
      reset={reset}
    />
  ),
  head: (context) => {
    const store = context.loaderData?.[0] ?? null;
    return pageHead({
      robots: seoRobotsFromHeadCtx(context),
      title: "Modalia Official Store — Modalia",
      description: store?.description
        ? `Modalia Official Store on Modalia: ${store.description}`
        : "The official Modalia store: the platform's own curated picks. Cash on delivery across Algeria.",
      path: "/store/modalia",
      image: store?.logoUrl ?? store?.bannerUrl ?? null,
      jsonLd: store
        ? [
            onlineStoreJsonLd(store, canonicalUrl("/store/modalia")),
            breadcrumbJsonLd([
              { name: "Home", url: canonicalUrl("/") },
              { name: "Modalia Official Store", url: canonicalUrl("/store/modalia") },
            ]),
          ]
        : [],
    });
  },
  component: OfficialStorePage,
});

function OfficialStorePage() {
  const { locale } = Route.useSearch();
  const { data: store } = useSuspenseQuery(storeQuery(locale));
  const { data: reviewData } = useSuspenseQuery(reviewsQuery(locale));
  const t = getTranslations(locale);

  useEffect(() => {
    if (store?.id) track("store_view", { entityType: "store", entityId: store.id, metadata: { slug: OFFICIAL_SLUG, official: true } });
  }, [store?.id]);

  if (!store)
    return (
      <div dir={localeDirections[locale]} className="min-h-screen bg-background">
        <SiteHeader locale={locale} t={t} />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-16 text-center">
          <h1 className="text-display">{t.store.unavailableTitle}</h1>
          <p className="mt-3 text-body text-muted-foreground">{t.store.unavailableText}</p>
        </main>
        <SiteFooter locale={locale} t={t} />
      </div>
    );

  return <StoreFront store={store} locale={locale} t={t} reviewsData={reviewData} />;
}
