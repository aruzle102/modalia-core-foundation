import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Search, SearchX, ShoppingBag, Star, X } from "lucide-react";
import { OfficialStoreBadge, VerifiedSellerBadge } from "@/components/marketplace/StoreBadges";
import { CategoryRail, ProductCard, ProductGrid } from "@/components/marketplace/discovery";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { Reveal, usePrefersReducedMotion } from "@/lib/motion";
import { accentById } from "@/lib/store-settings";
import type { StoreDetail, StoreSectionView } from "@/lib/store.functions";
import type { CatalogProduct } from "@/lib/catalog.functions";
import type { SupportedLocale } from "@/config/platform";
import { localeDirections, type Translation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function sectionProducts(section: StoreSectionView, store: StoreDetail): CatalogProduct[] {
  switch (section.kind) {
    case "featured":
      return store.featuredProducts;
    case "new":
      return store.newProducts;
    case "offers":
      return store.offerProducts;
    case "best":
      return store.bestProducts;
    default:
      return [];
  }
}

const SOCIAL_ORDER = ["instagram", "facebook", "tiktok", "website"] as const;

type StoreSort = "featured" | "newest" | "price-asc" | "price-desc" | "discount";

/** Discount depth 0..1 from the real compare-at price; 0 when not on offer. */
function discountRatio(product: CatalogProduct): number {
  return product.compareAtPrice != null && product.compareAtPrice > product.price
    ? 1 - product.price / product.compareAtPrice
    : 0;
}

/** Fallback label for a category slug with no localized name on record. */
function humanizeSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10";

/** One approved customer review, as rendered by the reviews section. */
export interface StoreFrontReview {
  id: string;
  rating: number;
  body: string | null;
  firstName: string | null;
  productName: string;
}

/**
 * Optional real review summary for a storefront — today only the official
 * store route loads one (`getOfficialStoreReviews`). Absent or empty means
 * no reviews section is rendered; nothing is ever fabricated.
 */
export interface StoreFrontReviewsData {
  reviews: StoreFrontReview[];
  average: number | null;
  count: number;
}

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

/**
 * Presentational public storefront, shared by the `/store/$slug` route and the
 * seller Studio's live preview. Pure render from a `StoreDetail` — no data
 * fetching, no analytics, no routing side effects. The route wrapper owns
 * loading/error/SEO/tracking; the preview feeds it draft state. In-store
 * search / category / sort below operate client-side on `store.products`
 * only, so the preview behaves exactly like the live page.
 */
export function StoreFront({
  store,
  locale,
  t,
  reviewsData,
}: {
  store: StoreDetail;
  locale: SupportedLocale;
  t: Translation;
  reviewsData?: StoreFrontReviewsData;
}) {
  const accent = accentById(store.accent);
  const v8 = t.sellerStoreV8.storefront;
  const reducedMotion = usePrefersReducedMotion();
  const catalogueRef = useRef<HTMLElement | null>(null);

  const socials = SOCIAL_ORDER.map((key) => ({
    key,
    label: v8.socialLabels[key],
    href: store.socialLinks[key],
  })).filter((entry) => entry.href.length > 0);
  const hasContact = Boolean(store.contactEmail || store.contactPhone || socials.length);

  const stats = [
    { value: String(store.products.length), label: t.store.official.statsProducts },
    ...(store.categories.length
      ? [{ value: String(store.categories.length), label: t.store.official.statsCategories }]
      : []),
    ...(store.collections.length
      ? [{ value: String(store.collections.length), label: t.store.collectionsEyebrow }]
      : []),
  ];

  /* ——— In-store discovery: real categories derived from the products ——— */
  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of store.products) {
      if (product.categorySlug) {
        counts.set(product.categorySlug, (counts.get(product.categorySlug) ?? 0) + 1);
      }
    }
    const nameBySlug = new Map(store.featuredCategories.map((category) => [category.slug, category.name]));
    return [...counts.entries()]
      .map(([slug, count]) => ({
        slug,
        count,
        name: nameBySlug.get(slug) ?? humanizeSlug(slug),
        image:
          store.products.find((product) => product.categorySlug === slug && product.imagePath)?.imagePath ?? null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [store.products, store.featuredCategories]);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<StoreSort>("featured");
  const [descExpanded, setDescExpanded] = useState(false);

  const visibleProducts = useMemo(() => {
    let list = store.products;
    if (activeCategory) list = list.filter((product) => product.categorySlug === activeCategory);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((product) => product.name.toLowerCase().includes(q));
    if (sort === "featured") return list;
    const sorted = [...list];
    switch (sort) {
      case "newest":
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "discount":
        sorted.sort((a, b) => discountRatio(b) - discountRatio(a));
        break;
    }
    return sorted;
  }, [store.products, activeCategory, query, sort]);

  const filtersActive = Boolean(query.trim() || activeCategory || sort !== "featured");
  const resetFilters = () => {
    setQuery("");
    setActiveCategory(null);
    setSort("featured");
  };

  const pickCategory = (slug: string | null) => {
    setActiveCategory(slug);
    requestAnimationFrame(() => {
      catalogueRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const longDescription = (store.description?.length ?? 0) > 280;

  const chipClass = (active: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border/70 bg-background text-foreground/75 hover:border-foreground/40 hover:text-foreground",
    );

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      {store.announcement ? (
        <div role="note" style={{ backgroundColor: accent.swatch, color: accent.ink }}>
          <p className="mx-auto max-w-[1440px] px-4 py-2 text-center text-small font-medium sm:px-6 lg:px-10">
            {store.announcement}
          </p>
        </div>
      ) : null}

      {/* ——— Back to the marketplace directory ——— */}
      <div className="border-b border-border/60">
        <div className={cn(CONTAINER, "flex items-center justify-between py-3")}>
          <Link
            to="/stores"
            search={{ locale }}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t.store.filterAll}
          </Link>
          {store.categoryName ? (
            <span className="hidden text-[13px] text-muted-foreground sm:block">{store.categoryName}</span>
          ) : null}
        </div>
      </div>

      <main id="main-content" tabIndex={-1}>
        {/* ——— Banner: full-width band, image never cropped ——— */}
        {store.bannerUrl ? (
          <Reveal as="div" className="relative flex w-full justify-center overflow-hidden bg-muted/60">
            <img
              src={store.bannerUrl}
              alt=""
              className="max-h-44 w-full object-contain sm:max-h-72"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/80 to-transparent"
            />
          </Reveal>
        ) : null}

        {/* ——— Store identity: logo overlaps the banner's bottom edge ——— */}
        <section className="border-b border-border bg-background">
          <div className={CONTAINER}>
            <div className="flex flex-col gap-5 pb-6 pt-6 sm:flex-row sm:items-end sm:gap-6">
              <div
                className={
                  "grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-white p-2.5 text-2xl font-semibold text-foreground shadow-xl ring-4 ring-background sm:size-28 " +
                  (store.bannerUrl ? "-mt-16 sm:-mt-24" : "")
                }
              >
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt="" className="size-full object-contain" />
                ) : (
                  store.name.slice(0, 1)
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                  <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {store.name}
                  </h1>
                  <VerifiedSellerBadge verified={store.verified} tone={store.verificationBadge} label={t.store.verifiedStore} />
                  {store.official ? <OfficialStoreBadge label={t.store.officialStore} /> : null}
                </div>
                <p className="mt-2 text-small text-muted-foreground">
                  {store.categoryName ? `${store.categoryName} · ` : ""}
                  {store.official ? t.store.officialTagline : t.store.independent}
                </p>
                {store.description ? (
                  <div className="mt-3 max-w-3xl">
                    <p
                      className={cn(
                        "text-[15px] leading-relaxed text-muted-foreground",
                        longDescription && !descExpanded && "line-clamp-3",
                      )}
                    >
                      {store.description}
                    </p>
                    {longDescription ? (
                      <button
                        type="button"
                        onClick={() => setDescExpanded((value) => !value)}
                        className="link-underline mt-2 text-[13px] font-semibold text-foreground"
                      >
                        {descExpanded ? t.store.showLess : t.store.readMore}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {stats.length ? (
              <dl className="flex flex-wrap gap-x-10 gap-y-4 border-t border-border/60 pb-7 pt-5">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex min-w-20 flex-col">
                    <dt className="order-2 mt-1 text-caption text-muted-foreground">{stat.label}</dt>
                    <dd className="order-1 text-2xl font-semibold tabular-nums text-foreground">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>

        {/* ——— Contact strip (real seller details only) ——— */}
        {hasContact ? (
          <section className="border-b border-border">
            <div className={cn(CONTAINER, "flex flex-col gap-4 py-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-10")}>
              <p className="text-eyebrow text-muted-foreground">{v8.contactEyebrow}</p>
              {store.contactEmail ? (
                <a
                  href={`mailto:${store.contactEmail}`}
                  dir="ltr"
                  className="link-underline text-small font-medium text-foreground"
                >
                  {store.contactEmail}
                </a>
              ) : null}
              {store.contactPhone ? (
                <a
                  href={`tel:${store.contactPhone.replace(/[^+\d]/g, "")}`}
                  dir="ltr"
                  className="link-underline text-small font-medium text-foreground"
                >
                  {store.contactPhone}
                </a>
              ) : null}
              {socials.length ? (
                <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {socials.map((entry) => (
                    <li key={entry.key}>
                      <a
                        href={entry.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-underline text-small font-medium text-foreground"
                      >
                        {entry.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ——— Curated collections ——— */}
        {store.collections.map((collection) => (
          <section key={collection.id} className="border-b border-border bg-secondary/40">
            <div className={cn(CONTAINER, "py-12 sm:py-16")}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-eyebrow text-muted-foreground">{t.store.collectionsEyebrow}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {collection.title}
                  </h2>
                  {collection.subtitle ? (
                    <p className="mt-3 text-body text-muted-foreground">{collection.subtitle}</p>
                  ) : null}
                </div>
              </div>
              <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
                {collection.products.map((product) => (
                  <div key={product.id} className="w-36 shrink-0 snap-start sm:w-44 lg:w-48">
                    <ProductCard product={product} locale={locale} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* ——— Store sections ——— */}
        {store.sections.map((section) => {
          if (section.kind === "categories") {
            if (!store.featuredCategories.length) return null;
            return (
              <section key={section.id} className="border-b border-border">
                <div className={cn(CONTAINER, "py-12 sm:py-16")}>
                  <p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {section.title}
                  </h2>
                  <div className="mt-8">
                    <CategoryRail categories={store.featuredCategories} locale={locale} />
                  </div>
                </div>
              </section>
            );
          }
          const products = sectionProducts(section, store);
          if (!products.length) return null;
          return (
            <section key={section.id} className="border-b border-border">
              <div className={cn(CONTAINER, "py-12 sm:py-16")}>
                <p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {section.title}
                </h2>
                <div className="mt-8">
                  <ProductGrid products={products} locale={locale} />
                </div>
              </div>
            </section>
          );
        })}

        {/* ——— Shop by category: real category tiles that set the filter ——— */}
        {categoryStats.length >= 2 ? (
          <section className="border-b border-border bg-muted/40">
            <div className={cn(CONTAINER, "py-12 sm:py-16")}>
              <p className="text-eyebrow text-muted-foreground">{t.store.eyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {t.store.shopByCategory}
              </h2>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {categoryStats.map((category) => {
                  const selected = activeCategory === category.slug;
                  return (
                    <button
                      key={category.slug}
                      type="button"
                      onClick={() => pickCategory(selected ? null : category.slug)}
                      aria-pressed={selected}
                      className={cn(
                        "group overflow-hidden rounded-2xl border bg-card text-start transition-all",
                        selected
                          ? "border-foreground ring-1 ring-foreground"
                          : "border-border/60 hover:border-foreground/30",
                      )}
                    >
                      <span className="block aspect-[16/10] overflow-hidden bg-muted">
                        {category.image ? (
                          <img
                            src={category.image}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                          />
                        ) : (
                          <span className="grid size-full place-items-center text-3xl font-semibold text-muted-foreground">
                            {category.name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2 p-3.5">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">{category.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {t.shop.resultsCount(category.count)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {/* ——— Catalogue with in-store discovery toolbar ——— */}
        <section ref={catalogueRef} id="store-catalogue" className={cn(CONTAINER, "scroll-mt-36 py-12 sm:py-16")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-eyebrow text-muted-foreground">{t.store.catalogueEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {t.store.allProducts}
              </h2>
            </div>
            <p className="text-small tabular-nums text-muted-foreground" aria-live="polite">
              {t.shop.resultsCount(visibleProducts.length)}
            </p>
          </div>

          {/* Sticky toolbar: search + sort + category chips */}
          <div className="sticky top-[4.5rem] z-30 mt-8 rounded-2xl border border-border/60 bg-background/95 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{t.store.searchInStorePlaceholder}</span>
                <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t.store.searchInStorePlaceholder}
                  className="w-full rounded-full border border-transparent bg-muted/50 py-2.5 pe-10 ps-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-background"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t.common.close}
                    className="absolute end-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </label>
              <label className="relative shrink-0">
                <span className="sr-only">{t.shop.sortLabel}</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as StoreSort)}
                  aria-label={t.shop.sortLabel}
                  className="w-full appearance-none rounded-full border border-border/70 bg-background py-2.5 pe-9 ps-4 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-foreground/40 focus:border-foreground/40 sm:w-auto"
                >
                  <option value="featured">{t.category.featuredTitle}</option>
                  <option value="newest">{t.shop.sortNewest}</option>
                  <option value="price-asc">{t.shop.sortPriceAsc}</option>
                  <option value="price-desc">{t.shop.sortPriceDesc}</option>
                  <option value="discount">{t.store.sortDiscount}</option>
                </select>
                <ChevronDown
                  aria-hidden
                  className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
              </label>
            </div>
            {categoryStats.length ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" onClick={() => setActiveCategory(null)} className={chipClass(activeCategory === null)}>
                  {t.shop.all}
                  <span className="tabular-nums opacity-70">{store.products.length}</span>
                </button>
                {categoryStats.map((category) => (
                  <button
                    key={category.slug}
                    type="button"
                    onClick={() => setActiveCategory(activeCategory === category.slug ? null : category.slug)}
                    aria-pressed={activeCategory === category.slug}
                    className={chipClass(activeCategory === category.slug)}
                  >
                    {category.name}
                    <span className="tabular-nums opacity-70">{category.count}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Grid / empty states */}
          {store.products.length === 0 ? (
            <section className="mt-8 rounded-2xl border border-border bg-card py-16 text-center">
              <ShoppingBag className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <h3 className="mt-4 text-h3 text-foreground">{t.store.emptyTitle}</h3>
              <p className="mx-auto mt-2 max-w-sm text-small text-muted-foreground">{t.store.emptyText}</p>
            </section>
          ) : visibleProducts.length === 0 ? (
            <section className="mt-8 rounded-2xl border border-border bg-card py-16 text-center">
              <SearchX className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <h3 className="mt-4 text-h3 text-foreground">{t.shop.noResultsTitle}</h3>
              <p className="mx-auto mt-2 max-w-sm text-small text-muted-foreground">{t.shop.noResultsText}</p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-6 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-semibold text-background transition-transform active:scale-95"
                >
                  {t.shop.clearAll}
                </button>
              ) : null}
            </section>
          ) : (
            <div
              key={`${activeCategory ?? "all"}|${sort}`}
              className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-10"
            >
              {visibleProducts.map((product, index) => (
                <Reveal key={product.id} delay={Math.min(index * 60, 480)} className="min-w-0">
                  <ProductCard product={product} locale={locale} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* ——— Customer reviews: real approved reviews only, hidden when none ——— */}
        {reviewsData && reviewsData.count > 0 && reviewsData.reviews.length ? (
          <section className="border-t border-border">
            <div className={cn(CONTAINER, "py-12 sm:py-16")}>
              <p className="text-eyebrow text-muted-foreground">{t.store.official.heroEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {t.store.official.reviewsTitle}
              </h2>
              {reviewsData.average != null ? (
                <div className="mt-5 flex items-center gap-3">
                  <span className="text-3xl font-semibold tabular-nums text-foreground">
                    {reviewsData.average.toFixed(1)}
                  </span>
                  <span className="flex flex-col gap-1">
                    <Stars value={reviewsData.average} />
                    <span className="text-caption text-muted-foreground">
                      {t.store.official.statsRating}
                    </span>
                  </span>
                </div>
              ) : null}
              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {reviewsData.reviews.slice(0, 6).map((review) => (
                  <figure
                    key={review.id}
                    className="flex flex-col rounded-xl border border-border bg-card p-5"
                  >
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
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
