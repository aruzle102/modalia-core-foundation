import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Search, ShoppingBag, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryRail, ProductCard, StoreRail } from "@/components/marketplace/discovery";
import {
  ShopFilters,
  type ShopFilterValues,
} from "@/components/marketplace/shop-filters";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { browseCatalog, getStoreDirectory } from "@/lib/catalog.functions";
import { parseQuery, intentSummary, type CatalogCategoryLike } from "@/lib/ai/query-parse";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { recordCategoryBrowse } from "@/lib/recommendations-client";
import { pageHead, pageHeadCopy, prefetchSeoSettings, seoRobotsFromHeadCtx } from "@/lib/seo";
import type { SupportedLocale } from "@/config/platform";

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
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label={t.shop.loading}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-10 w-64 max-w-full" />
        <Skeleton className="mt-4 h-4 w-40" />
        <Skeleton className="mt-10 h-14 w-full rounded-2xl" />
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
              <Skeleton className="mt-3 h-4 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function ShopError() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div role="alert" className="mx-auto w-full max-w-[1440px] px-4 py-24 text-center text-muted-foreground sm:px-6 lg:px-10">
      {t.shop.loadError}
    </div>
  );
}
function ShopNotFound() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-24 text-center text-muted-foreground sm:px-6 lg:px-10">
      {t.shop.noCatalogue}
    </div>
  );
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
      className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3"
      role="status"
    >
      <Sparkles className="size-4 shrink-0 text-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-foreground">
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

function CategoryPill({
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
      className={`shrink-0 rounded-full border px-4 py-2 text-small transition-colors duration-200 ${
        active
          ? "border-foreground bg-foreground font-semibold text-background"
          : "border-border/70 bg-background font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span className={`ms-1.5 text-caption ${active ? "text-background/70" : "text-muted-foreground/70"}`}>
          {count}
        </span>
      ) : null}
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

  // Mobile filter sheet: close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [filtersOpen]);

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
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 pb-16 sm:px-6 sm:pb-20 lg:px-10">
        <header className="py-10 sm:py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {ts.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {ts.title}
          </h1>
          {search.view === "" ? (
            <p className="mt-3 text-small text-muted-foreground" aria-live="polite">
              {q ? `${ts.resultsFor(q)} · ` : ""}
              {ts.resultsCount(data.total)}
            </p>
          ) : null}
        </header>

        <div className="sticky top-[4.5rem] z-30 rounded-2xl border border-border/60 bg-background/95 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur">
          <div className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
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
              className="relative min-w-0 flex-1"
            >
              <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                key={search.q}
                autoFocus={search.focus === "search"}
                name="q"
                defaultValue={search.q}
                placeholder={ts.searchPlaceholder}
                className="h-11 rounded-full border-border/60 bg-muted/40 ps-11 shadow-none"
              />
            </form>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 rounded-full lg:hidden"
              onClick={() => setFiltersOpen(true)}
              aria-expanded={filtersOpen}
              aria-controls="mobile-filters"
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">{ts.filters}</span>
            </Button>
            <div className="relative flex shrink-0 items-center gap-2">
              <label htmlFor="shop-sort" className="hidden text-small text-muted-foreground md:block">
                {ts.sortLabel}
              </label>
              <select
                id="shop-sort"
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
                className="h-11 cursor-pointer appearance-none rounded-full border border-border/60 bg-muted/40 px-4 pe-10 text-small text-foreground outline-none transition-colors hover:border-foreground/30"
              >
                <option value="newest">{ts.sortNewest}</option>
                <option value="price_asc">{ts.sortPriceAsc}</option>
                <option value="price_desc">{ts.sortPriceDesc}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute end-4 size-4 text-muted-foreground" aria-hidden />
            </div>
          </div>
        </div>

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

        <div className="mt-8 flex flex-wrap items-center gap-2" aria-label={ts.filters}>
          <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1">
            {views.map((view) => (
              <button
                key={view.value || "all"}
                type="button"
                aria-current={search.view === view.value ? "page" : undefined}
                onClick={() =>
                  navigate({ search: (previous) => ({ ...previous, view: view.value, page: 1 }) })
                }
                className={`rounded-full px-4 py-1.5 text-small transition-colors duration-200 ${
                  search.view === view.value
                    ? "bg-foreground font-semibold text-background shadow-sm"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>

        {search.view === "categories" ? (
          <div className="mt-10 pb-16">
            <CategoryRail categories={data.categories} locale={search.locale} />
          </div>
        ) : search.view === "stores" ? (
          <div className="mt-10 pb-16">
            <StoreRail stores={storeDirectory} locale={search.locale} />
          </div>
        ) : (
          <>
            <div
              className="mt-6 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label={ts.filters}
            >
              <CategoryPill
                active={search.category === ""}
                label={ts.all}
                onSelect={() =>
                  navigate({ search: (previous) => ({ ...previous, category: "", page: 1 }) })
                }
              />
              {data.categories.map((category) => (
                <CategoryPill
                  key={category.id}
                  active={search.category === category.slug}
                  label={category.name}
                  count={category.productCount}
                  onSelect={() => {
                    recordCategoryBrowse(category.slug);
                    navigate({
                      search: (previous) => ({ ...previous, category: category.slug, page: 1 }),
                    });
                  }}
                />
              ))}
            </div>

            {chips.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-2" aria-label={ts.filters}>
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.clear}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 py-1 pe-2 ps-3 text-caption text-foreground transition-colors hover:border-foreground/30"
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

            <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] xl:gap-10">
              <aside className="hidden lg:block">
                <div className="sticky top-36 rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">{filtersPanel}</div>
              </aside>
              <div className="min-w-0">
                {data.products.length === 0 ? (
                  <section className="rounded-2xl border border-border/60 bg-muted/40 px-6 py-20 text-center">
                    <div className="mx-auto grid size-14 place-items-center rounded-full bg-background shadow-sm">
                      <ShoppingBag className="size-6 text-muted-foreground" aria-hidden />
                    </div>
                    <h2 className="mt-5 text-h3 text-foreground">{ts.noResultsTitle}</h2>
                    <p className="mx-auto mt-2 max-w-sm text-small text-muted-foreground">{ts.noResultsText}</p>
                    {chips.length ? (
                      <Button type="button" className="mt-6 rounded-full" onClick={clearAll}>
                        {ts.clearAll}
                      </Button>
                    ) : null}
                  </section>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 xl:grid-cols-4">
                    {data.products.map((product) => (
                      <ProductCard key={product.id} product={product} locale={search.locale} />
                    ))}
                  </div>
                )}
                {totalPages > 1 ? (
                  <nav aria-label={ts.pageOf(data.page, totalPages)} className="mt-14 flex items-center justify-center gap-1.5">
                    {data.page <= 1 ? (
                      <Button variant="outline" size="sm" className="rounded-full" disabled>
                        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                        {ts.prevPage}
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm" className="rounded-full">
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
                        className="min-w-9 rounded-full"
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
                      <Button variant="outline" size="sm" className="rounded-full" disabled>
                        {ts.nextPage}
                        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm" className="rounded-full">
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
        <div id="mobile-filters" className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={ts.filters}>
          <button
            type="button"
            aria-label={ts.hideFilters}
            className="animate-in fade-in-0 absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="animate-in slide-in-from-bottom absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-card shadow-2xl duration-300">
            <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" />
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <h2 className="text-h3 text-foreground">{ts.filters}</h2>
              <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => setFiltersOpen(false)} aria-label={ts.hideFilters}>
                <X className="size-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-4">{filtersPanel}</div>
            <div className="border-t border-border/60 p-4">
              <Button type="button" className="w-full rounded-full" onClick={() => setFiltersOpen(false)}>
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
