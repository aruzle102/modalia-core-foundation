import { useEffect, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Star } from "lucide-react";
import { CategoryRail, ProductGrid } from "@/components/marketplace/discovery";
import { OfficialStoreBadge } from "@/components/marketplace/StoreBadges";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getStoreDetail } from "@/lib/store.functions";
import { breadcrumbJsonLd, canonicalUrl, onlineStoreJsonLd, pageHead, prefetchSeoSettings, seoRobotsFromHeadCtx } from "@/lib/seo";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { accentById } from "@/lib/store-settings";
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

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`size-3.5 ${star <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-2 text-h2">{title}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function OfficialStorePage() {
  const { locale } = Route.useSearch();
  const { data: store } = useSuspenseQuery(storeQuery(locale));
  const { data: reviewData } = useSuspenseQuery(reviewsQuery(locale));
  const t = getTranslations(locale);
  const official = t.store.official;

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

  const accent = accentById(store.accent);
  const sectionTitle = (kind: string, fallback: string) =>
    store.sections.find((section) => section.kind === kind)?.title ?? fallback;
  const productSection = (products: CatalogProduct[], kind: string, fallback: string) =>
    products.length ? (
      <Section eyebrow={official.heroEyebrow} title={sectionTitle(kind, fallback)}>
        <ProductGrid products={products} locale={locale} />
      </Section>
    ) : null;

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      {store.announcement ? (
        <div role="note" style={{ backgroundColor: accent.swatch, color: accent.ink }}>
          <p className="mx-auto max-w-7xl px-4 py-2 text-center text-small font-medium sm:px-6 lg:px-8">
            {store.announcement}
          </p>
        </div>
      ) : null}
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0">
            {store.bannerUrl ? (
              <img src={store.bannerUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="absolute inset-0 store-sheen" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-20 sm:px-6 sm:pt-28 lg:px-8">
            <div className="flex items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-card text-2xl font-semibold sm:size-24">
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  store.name.slice(0, 1)
                )}
              </div>
              <div>
                <p className="flex items-center gap-2 text-eyebrow text-muted-foreground">
                  {official.heroEyebrow}
                  <OfficialStoreBadge label={t.store.officialStore} />
                </p>
                <h1 className="mt-2 text-display">{store.name}</h1>
              </div>
            </div>
            <p className="mt-6 max-w-2xl text-h3 font-normal text-muted-foreground">
              {t.store.officialTagline}
            </p>
            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-caption text-muted-foreground">{official.statsProducts}</dt>
                <dd className="mt-1 text-h3">{store.products.length}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">{official.statsCategories}</dt>
                <dd className="mt-1 text-h3">{store.categories.length}</dd>
              </div>
              {reviewData.average != null ? (
                <div>
                  <dt className="text-caption text-muted-foreground">{official.statsRating}</dt>
                  <dd className="mt-1 flex items-center gap-2 text-h3">
                    {reviewData.average.toFixed(1)}
                    <Stars value={reviewData.average} />
                  </dd>
                </div>
              ) : null}
            </dl>
            {store.products.length ? (
              <a
                href="#collection"
                className="mt-10 inline-flex items-center rounded-full bg-foreground px-7 py-3 text-small font-semibold text-background transition-opacity hover:opacity-90"
              >
                {official.shopCta}
              </a>
            ) : null}
          </div>
        </section>

        {/* Featured */}
        {productSection(store.featuredProducts, "featured", t.store.allProducts)}

        {/* Categories */}
        {store.featuredCategories.length ? (
          <Section eyebrow={official.heroEyebrow} title={sectionTitle("categories", t.store.allProducts)}>
            <CategoryRail categories={store.featuredCategories} locale={locale} />
          </Section>
        ) : null}

        {/* Best sellers */}
        {productSection(store.bestProducts, "best", t.store.allProducts)}

        {/* New arrivals */}
        {productSection(store.newProducts, "new", t.store.allProducts)}

        {/* Offers */}
        {productSection(store.offerProducts, "offers", t.store.allProducts)}

        {/* Full collection */}
        <section id="collection" className="border-b border-border scroll-mt-20">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <p className="text-eyebrow text-muted-foreground">{t.store.catalogueEyebrow}</p>
            <h2 className="mt-2 text-h2">{t.store.allProducts}</h2>
            <div className="mt-8">
              <ProductGrid
                products={store.products}
                locale={locale}
                emptyTitle={t.store.emptyTitle}
                emptyText={t.store.emptyText}
              />
            </div>
          </div>
        </section>

        {/* Reviews — real approved reviews only; hidden when empty */}
        {reviewData.reviews.length ? (
          <Section eyebrow={official.heroEyebrow} title={official.reviewsTitle}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {reviewData.reviews.slice(0, 6).map((review) => (
                <figure key={review.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
                  <Stars value={review.rating} />
                  {review.body ? (
                    <blockquote className="mt-3 flex-1 text-small text-foreground">
                      {review.body}
                    </blockquote>
                  ) : null}
                  <figcaption className="mt-4 text-caption text-muted-foreground">
                    {review.firstName ?? "—"} · {review.productName}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Brand story */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <div>
              <p className="text-eyebrow text-muted-foreground">{official.heroEyebrow}</p>
              <h2 className="mt-2 text-h2">{official.storyTitle}</h2>
              <div className="mt-6 flex items-center gap-2">
                <OfficialStoreBadge label={t.store.officialStore} />
                <span className="text-small font-medium text-foreground">{store.name}</span>
              </div>
            </div>
            <div className="max-w-3xl">
              <p className="text-body leading-relaxed text-muted-foreground">{official.storyText}</p>
              <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6">
                <div>
                  <dt className="text-caption text-muted-foreground">{official.statsProducts}</dt>
                  <dd className="mt-1 text-h3">{store.products.length}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">{official.statsCategories}</dt>
                  <dd className="mt-1 text-h3">{store.categories.length}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">{official.reviewsTitle}</dt>
                  <dd className="mt-1 text-h3">{reviewData.count}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
