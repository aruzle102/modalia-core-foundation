import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryRail, ProductGrid, StoreRail } from "@/components/marketplace/discovery";
import {
  ShopFilters,
  type ShopFilterValues,
} from "@/components/marketplace/shop-filters";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { browseCatalog, getStoreDirectory } from "@/lib/catalog.functions";
import { parseQuery, intentSummary, type CatalogCategoryLike } from "@/lib/ai/query-parse";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { pageHead, pageHeadCopy, prefetchSeoSettings, seoRobotsFromHeadCtx } from "@/lib/seo";
import type { SupportedLocale } from "@/config/platform";
import { motionTw } from "@/lib/motion-tokens";

const SORTS = ["newest", "price_asc", "price_desc"] as const;
const VIEWS = ["", "categories", "stores"] as const;
const PAGE_SIZE = 24;

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string" && item !== "");
  return typeof value === "string" && value !== "" ? [value] : [];
}

function toOptionalNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function toBoolean(value: unknown): boolean {
  return value === "1" || value === "true" || value === true;
}

type ShopSearch = {
  locale: SupportedLocale;
  q: string;
  category: string;
  sort: (typeof SORTS)[number];
  page: number;
  view: (typeof VIEWS)[number];
  focus: string;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  brands: string[];
  stores: string[];
  colors: string[];
  sizes: string[];
  /** Canonical gender key (men|women|kids|unisex); undefined/"" = no filter. */
  gender?: string | undefined;
  inStock: boolean;
  onSale: boolean;
};

const shopQuery = (input: {
  locale: SupportedLocale;
  q: string;
  category: string;
  sort: string;
  page: number;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  brands: string[];
  stores: string[];
  colors: string[];
  sizes: string[];
  gender?: string | undefined;
  inStock: boolean;
  onSale: boolean;
}) =>
  queryOptions({
    queryKey: ["catalog", input],
    queryFn: () => browseCatalog({ data: { ...input, pageSize: PAGE_SIZE } }),
  });

const storeDirectoryQuery = (locale: SupportedLocale) =>
  queryOptions({
    queryKey: ["store-directory", locale],
    queryFn: () => getStoreDirectory({ data: { locale } }),
  });

function ShopLoading() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return <div className="px-6 py-24 text-center text-muted-foreground">{t.shop.loading}</div>;
}
function ShopError() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div role="alert" className="px-6 py-24 text-center text-muted-foreground">
      {t.shop.loadError}
    </div>
  );
}
function ShopNotFound() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return <div className="px-6 py-24 text-center text-muted-foreground">{t.shop.noCatalogue}</div>;
}

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): ShopSearch => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    q: typeof search["q"] === "string" ? search["q"] : "",
    category: typeof search["category"] === "string" ? search["category"] : "",
    sort: SORTS.includes(search["sort"] as (typeof SORTS)[number])
      ? (search["sort"] as (typeof SORTS)[number])
      : "newest",
    page: (() => {
      const raw = search["page"];
      const parsed =
        typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
    })(),
    view: VIEWS.includes(search["view"] as (typeof VIEWS)[number])
      ? (search["view"] as (typeof VIEWS)[number])
      : "",
    focus: typeof search["focus"] === "string" ? search["focus"] : "",
    minPrice: toOptionalNumber(search["minPrice"]),
    maxPrice: toOptionalNumber(search["maxPrice"]),
    brands: toStringArray(search["brands"]),
    stores: toStringArray(search["stores"]),
    colors: toStringArray(search["colors"]),
    sizes: toStringArray(search["sizes"]),
    gender: typeof search["gender"] === "string" ? search["gender"] : "",
    inStock: toBoolean(search["inStock"]),
    onSale: toBoolean(search["onSale"]),
  }),
  loaderDeps: ({ search }) => ({
    locale: search.locale,
    q: search.q,
    category: search.category,
    sort: search.sort,
    page: search.page,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    brands: search.brands,
    stores: search.stores,
    colors: search.colors,
    sizes: search.sizes,
    gender: search.gender,
    inStock: search.inStock,
    onSale: search.onSale,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(shopQuery(deps)),
      context.queryClient.ensureQueryData(storeDirectoryQuery(deps.locale)),
      prefetchSeoSettings(context.queryClient),
    ]),
  pendingComponent: ShopLoading,
  errorComponent: ShopError,
  notFoundComponent: ShopNotFound,
  head: (context) => {
    const rawSearch = (context as unknown as { search?: Record<string, unknown> }).search ?? {};
    const locale = getLocale(typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined);
    const copy = pageHeadCopy(locale, "shop");
    return pageHead({
      title: copy.title,
      description: copy.description,
      path: "/shop",
      robots: seoRobotsFromHeadCtx(context),
    });
  },
  component: ShopPage,
});

function pageWindow(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let page = start; page <= end; page++) pages.push(page);
  return pages;
}

type SmartFilterPatch = {
  category?: string;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  colors?: string[];
  sizes?: string[];
  /** Canonical gender key (men|women|kids|unisex) from the NL parser. */
  gender?: string;
};

/**
 * Smart search: interprets a natural-language query (ar/fr/en) with the
 * client-safe parser and offers to apply the detected category / price /
 * color / size / gender signals as real shop filters. Nothing is ever
 * applied silently — the shopper reviews the "understood" summary and
 * confirms.
 */
function SmartSearchBanner({
  q,
  locale,
  categories,
  colors,
  sizes,
  current,
  onApply,
}: {
  q: string;
  locale: SupportedLocale;
  categories: Array<{ slug: string; name: string }>;
  colors: Array<{ slug: string; name: string }>;
  sizes: Array<{ value: string; label: string }>;
  current: {
    category: string;
    minPrice?: number | undefined;
    maxPrice?: number | undefined;
    colors: string[];
    sizes: string[];
    gender: string;
  };
  onApply: (patch: SmartFilterPatch) => void;
}) {
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const ts = getTranslations(locale).shop;

  const suggestion = useMemo(() => {
    const trimmed = q.trim();
    if (!trimmed || dismissedFor === trimmed) return null;
    const likes: CatalogCategoryLike[] = categories.map((c) => ({ slug: c.slug, names: [c.name, c.slug] }));
    const intent = parseQuery(trimmed, likes);
    // Map parsed color words to REAL color slugs from the catalog facets.
    const colorSlugs = intent.colors
      .map((key) => colors.find((c) => c.slug.toLowerCase() === key || c.slug.toLowerCase().includes(key))?.slug)
      .filter((slug): slug is string => slug !== undefined && !current.colors.includes(slug));
    // Map parsed size words to REAL size values from the catalog facets.
    const sizeValues = intent.sizes
      .map((key) => sizes.find((s) => s.value.toLowerCase() === key.toLowerCase())?.value)
      .filter((value): value is string => value !== undefined && !current.sizes.includes(value));
    const patch: SmartFilterPatch = {};
    if (intent.categorySlug && current.category !== intent.categorySlug) patch.category = intent.categorySlug;
    if (intent.minPrice !== null && current.minPrice !== intent.minPrice) patch.minPrice = intent.minPrice;
    if (intent.maxPrice !== null && current.maxPrice !== intent.maxPrice) patch.maxPrice = intent.maxPrice;
    if (colorSlugs.length) patch.colors = [...current.colors, ...colorSlugs];
    if (sizeValues.length) patch.sizes = [...current.sizes, ...sizeValues];
    // Gender reaches the DB as a structured p_gender filter (V8 #228) —
    // category or ancestor chain carries the gender. Only the first parsed
    // gender is used, matching the assistant drawer.
    const parsedGender = intent.genders[0];
    if (parsedGender && current.gender !== parsedGender) patch.gender = parsedGender;
    if (Object.keys(patch).length === 0) return null;
    const summary = intentSummary(intent, locale);
    if (!summary) return null;
    return { summary, patch };
  }, [q, dismissedFor, locale, categories, colors, sizes, current]);

  if (!suggestion) return null;
  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3"
      role="status"
    >
      <Sparkles className="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-sky-900 dark:text-sky-200">
        {ts.smartUnderstood(suggestion.summary)}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => onApply(suggestion.patch)}>
          {ts.smartApply}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={ts.smartDismiss}
          onClick={() => setDismissedFor(q.trim())}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function CategoryTab({
  active,
  label,
  count,
  onSelect,
}: {
  active: boolean;
  label: string;
  count?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`relative shrink-0 pb-3 text-small transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
      {count !== undefined ? (
        <span className="ms-1.5 text-caption text-muted-foreground/70">{count}</span>
      ) : null}
      <span
        aria-hidden
        className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground ${motionTw.transition.opacity} ${motionTw.duration.feedback} ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
    </button>
  );
}

function ShopPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop" });
  const { data } = useSuspenseQuery(shopQuery(search));
  const { data: storeDirectory } = useSuspenseQuery(storeDirectoryQuery(search.locale));
  const t = getTranslations(search.locale);
  const ts = t.shop;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = search.q.trim();

  useEffect(() => {
    if (q) {
      // Attribute the search to the seller when the shopper filtered to a
      // single store: the seller-scoped RPC picks these events up by
      // entity_type='store' + the store's id (no RPC change needed).
      const onlyStore =
        search.stores.length === 1
          ? storeDirectory.find((s) => s.slug === search.stores[0])
          : undefined;
      track("search", {
        ...(onlyStore ? { entityType: "store" as const, entityId: onlyStore.id } : {}),
        metadata: { query: q.slice(0, 120) },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filterValues: ShopFilterValues = {
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    brands: search.brands,
    stores: search.stores,
    colors: search.colors,
    sizes: search.sizes,
    inStock: search.inStock,
    onSale: search.onSale,
  };

  const updateFilters = (next: ShopFilterValues) => {
    navigate({
      search: (previous) => ({
        ...previous,
        minPrice: next.minPrice,
        maxPrice: next.maxPrice,
        brands: next.brands,
        stores: next.stores,
        colors: next.colors,
        sizes: next.sizes,
        inStock: next.inStock,
        onSale: next.onSale,
        page: 1,
      }),
    });
  };

  /** Apply smart-search suggestions (parsed NL query) as real filters. */
  const applySmartFilters = (patch: SmartFilterPatch) => {
    navigate({
      search: (previous) => ({
        ...previous,
        category: patch.category ?? previous.category,
        minPrice: patch.minPrice ?? previous.minPrice,
        maxPrice: patch.maxPrice ?? previous.maxPrice,
        colors: patch.colors ?? previous.colors,
        sizes: patch.sizes ?? previous.sizes,
        gender: patch.gender ?? previous.gender,
        page: 1,
      }),
    });
  };

  const brandName = (slug: string) => data.brands.find((brand) => brand.slug === slug)?.name ?? slug;
  const storeName = (slug: string) => data.stores.find((store) => store.slug === slug)?.name ?? slug;
  const colorName = (slug: string) => data.colors.find((color) => color.slug === slug)?.name ?? slug;
  const sizeLabel = (value: string) =>
    data.sizes.find((size) => size.value === value)?.label ?? value;
  const categoryName = (slug: string) =>
    data.categories.find((category) => category.slug === slug)?.name ?? slug;
  const genderLabel = (gender: string) =>
    gender === "men"
      ? t.category.genderMen
      : gender === "women"
        ? t.category.genderWomen
        : gender === "kids"
          ? t.category.genderKids
          : gender === "unisex"
            ? t.category.genderUnisex
            : gender;

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (q) chips.push({ key: "q", label: `“${q}”`, clear: () => navigate({ search: (p) => ({ ...p, q: "", page: 1 }) }) });
  if (search.category)
    chips.push({
      key: "category",
      label: categoryName(search.category),
      clear: () => navigate({ search: (p) => ({ ...p, category: "", page: 1 }) }),
    });
  if (search.minPrice !== undefined || search.maxPrice !== undefined)
    chips.push({
      key: "price",
      label: `${search.minPrice ?? "…"} – ${search.maxPrice ?? "…"}`,
      clear: () => updateFilters({ ...filterValues, minPrice: undefined, maxPrice: undefined }),
    });
  search.brands.forEach((slug) =>
    chips.push({
      key: `brand:${slug}`,
      label: brandName(slug),
      clear: () => updateFilters({ ...filterValues, brands: filterValues.brands.filter((b) => b !== slug) }),
    }),
  );
  search.stores.forEach((slug) =>
    chips.push({
      key: `store:${slug}`,
      label: storeName(slug),
      clear: () => updateFilters({ ...filterValues, stores: filterValues.stores.filter((s) => s !== slug) }),
    }),
  );
  search.colors.forEach((slug) =>
    chips.push({
      key: `color:${slug}`,
      label: colorName(slug),
      clear: () => updateFilters({ ...filterValues, colors: filterValues.colors.filter((c) => c !== slug) }),
    }),
  );
  search.sizes.forEach((value) =>
    chips.push({
      key: `size:${value}`,
      label: sizeLabel(value),
      clear: () => updateFilters({ ...filterValues, sizes: filterValues.sizes.filter((s) => s !== value) }),
    }),
  );
  if (search.gender)
    chips.push({
      key: "gender",
      label: genderLabel(search.gender),
      clear: () => navigate({ search: (p) => ({ ...p, gender: "", page: 1 }) }),
    });
  if (search.inStock)
    chips.push({
      key: "instock",
      label: ts.inStockOnly,
      clear: () => updateFilters({ ...filterValues, inStock: false }),
    });
  if (search.onSale)
    chips.push({
      key: "onsale",
      label: ts.onSale,
      clear: () => updateFilters({ ...filterValues, onSale: false }),
    });

  const clearAll = () =>
    navigate({
      search: (previous) => ({
        ...previous,
        q: "",
        category: "",
        minPrice: undefined,
        maxPrice: undefined,
        brands: [],
        stores: [],
        colors: [],
        sizes: [],
        gender: "",
        inStock: false,
        onSale: false,
        page: 1,
      }),
    });

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const views: { value: (typeof VIEWS)[number]; label: string }[] = [
    { value: "", label: t.nav.shop },
    { value: "categories", label: t.nav.categories },
    { value: "stores", label: t.nav.stores },
  ];

  const filtersPanel = (
    <ShopFilters
      facets={data}
      values={filterValues}
      locale={search.locale}
      onChange={updateFilters}
    />
  );

  return (
    <div dir={localeDirections[search.locale]} lang={search.locale} className="min-h-screen bg-background">
      <SiteHeader locale={search.locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-eyebrow text-muted-foreground">{ts.eyebrow}</p>
        <h1 className="mt-2 text-display text-foreground">{ts.title}</h1>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("q");
            navigate({
              search: (previous) => ({
                ...previous,
                q: typeof value === "string" ? value : "",
                view: "",
                page: 1,
              }),
            });
          }}
          className="relative mt-8 max-w-2xl"
        >
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            key={search.q}
            autoFocus={search.focus === "search"}
            name="q"
            defaultValue={search.q}
            placeholder={ts.searchPlaceholder}
            className="h-11 ps-10"
          />
        </form>

        <SmartSearchBanner
          q={search.q}
          locale={search.locale}
          categories={data.categories}
          colors={data.colors}
          sizes={data.sizes}
          current={{
            category: search.category,
            minPrice: search.minPrice,
            maxPrice: search.maxPrice,
            colors: search.colors,
            sizes: search.sizes,
            gender: search.gender ?? "",
          }}
          onApply={applySmartFilters}
        />

        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-border pb-4" aria-label={ts.filters}>
          {views.map((view) => (
            <Button
              key={view.value || "all"}
              variant={search.view === view.value ? "default" : "outline"}
              size="sm"
              aria-current={search.view === view.value ? "page" : undefined}
              onClick={() =>
                navigate({ search: (previous) => ({ ...previous, view: view.value, page: 1 }) })
              }
            >
              {view.label}
            </Button>
          ))}
        </div>

        {search.view === "categories" ? (
          <div className="mt-8">
            <CategoryRail categories={data.categories} locale={search.locale} />
          </div>
        ) : search.view === "stores" ? (
          <div className="mt-8">
            <StoreRail stores={storeDirectory} locale={search.locale} />
          </div>
        ) : (
          <>
            <div className="mt-8 flex gap-7 overflow-x-auto border-b border-border" role="tablist" aria-label={ts.filters}>
              <CategoryTab
                active={search.category === ""}
                label={ts.all}
                onSelect={() =>
                  navigate({ search: (previous) => ({ ...previous, category: "", page: 1 }) })
                }
              />
              {data.categories.map((category) => (
                <CategoryTab
                  key={category.id}
                  active={search.category === category.slug}
                  label={category.name}
                  count={category.productCount}
                  onSelect={() =>
                    navigate({
                      search: (previous) => ({ ...previous, category: category.slug, page: 1 }),
                    })
                  }
                />
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-border py-3">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setFiltersOpen(true)}
                >
                  <SlidersHorizontal className="size-4" />
                  {ts.filters}
                </Button>
                <p className="text-small text-muted-foreground" aria-live="polite">
                  {q ? `${ts.resultsFor(q)} · ` : ""}
                  {ts.resultsCount(data.total)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
                <select
                  aria-label={ts.sortLabel}
                  value={search.sort}
                  onChange={(event) =>
                    navigate({
                      search: (previous) => ({
                        ...previous,
                        sort: event.target.value as (typeof SORTS)[number],
                        page: 1,
                      }),
                    })
                  }
                  className="h-9 bg-background text-small text-foreground outline-none"
                >
                  <option value="newest">{ts.sortNewest}</option>
                  <option value="price_asc">{ts.sortPriceAsc}</option>
                  <option value="price_desc">{ts.sortPriceDesc}</option>
                </select>
              </div>
            </div>

            {chips.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-2" aria-label={ts.filters}>
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.clear}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 py-1 pe-2 ps-3 text-caption text-foreground transition-colors hover:border-foreground/30"
                  >
                    {chip.label}
                    <X className="size-3.5 text-muted-foreground" aria-hidden />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-caption font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {ts.clearAll}
                </button>
              </div>
            ) : null}

            <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <aside className="hidden lg:block">
                <div className="sticky top-24">{filtersPanel}</div>
              </aside>
              <div className="min-w-0">
                <ProductGrid
                  products={data.products}
                  locale={search.locale}
                  emptyTitle={ts.noResultsTitle}
                  emptyText={ts.noResultsText}
                />
                {totalPages > 1 ? (
                  <nav aria-label={ts.pageOf(data.page, totalPages)} className="mt-12 flex items-center justify-center gap-1.5">
                    {data.page <= 1 ? (
                      <Button variant="outline" size="sm" disabled>
                        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                        {ts.prevPage}
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <Link
                          to="/shop"
                          search={{ ...search, page: data.page - 1 }}
                        >
                          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                          {ts.prevPage}
                        </Link>
                      </Button>
                    )}
                    {pageWindow(data.page, totalPages).map((pageNumber) => (
                      <Button
                        key={pageNumber}
                        asChild
                        variant={pageNumber === data.page ? "default" : "ghost"}
                        size="sm"
                        className="min-w-9"
                      >
                        <Link
                          to="/shop"
                          search={{ ...search, page: pageNumber }}
                          aria-current={pageNumber === data.page ? "page" : undefined}
                        >
                          {pageNumber}
                        </Link>
                      </Button>
                    ))}
                    {data.page >= totalPages ? (
                      <Button variant="outline" size="sm" disabled>
                        {ts.nextPage}
                        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <Link
                          to="/shop"
                          search={{ ...search, page: data.page + 1 }}
                        >
                          {ts.nextPage}
                          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                        </Link>
                      </Button>
                    )}
                  </nav>
                ) : null}
              </div>
            </div>
          </>
        )}
      </main>

      {filtersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={ts.filters}>
          <button
            type="button"
            aria-label={ts.hideFilters}
            className="absolute inset-0 cursor-default bg-black/50"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 flex w-80 max-w-[85vw] flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-h3 text-foreground">{ts.filters}</h2>
              <Button type="button" variant="ghost" size="icon" onClick={() => setFiltersOpen(false)} aria-label={ts.hideFilters}>
                <X className="size-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{filtersPanel}</div>
            <div className="border-t border-border p-4">
              <Button type="button" className="w-full" onClick={() => setFiltersOpen(false)}>
                {ts.resultsCount(data.total)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SiteFooter locale={search.locale} t={t} />
    </div>
  );
}
