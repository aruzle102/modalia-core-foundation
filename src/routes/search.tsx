import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductGrid } from "@/components/marketplace/discovery";
import {
  ShopFilters,
  type ShopFilterValues,
} from "@/components/marketplace/shop-filters";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { SearchAutocomplete } from "@/components/marketplace/SearchAutocomplete";
import { browseCatalog } from "@/lib/catalog.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

const SORTS = ["relevance", "newest", "price_asc", "price_desc"] as const;
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

type SearchPageSearch = {
  locale: SupportedLocale;
  q: string;
  category: string;
  sort: (typeof SORTS)[number];
  page: number;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  brands: string[];
  stores: string[];
  gender?: string | undefined;
  inStock: boolean;
  onSale: boolean;
  filtersOpen: boolean;
};

const searchPageQuery = (input: {
  locale: SupportedLocale;
  q: string;
  category: string;
  sort: string;
  page: number;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  brands: string[];
  stores: string[];
  gender?: string | undefined;
  inStock: boolean;
  onSale: boolean;
}) =>
  queryOptions({
    queryKey: ["search-page", input],
    queryFn: () => browseCatalog({ data: { ...input, pageSize: PAGE_SIZE } }),
  });

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchPageSearch => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    q: typeof search["q"] === "string" ? search["q"] : "",
    category: typeof search["category"] === "string" ? search["category"] : "",
    sort: SORTS.includes(search["sort"] as (typeof SORTS)[number])
      ? (search["sort"] as (typeof SORTS)[number])
      : "relevance",
    page: (() => {
      const raw = search["page"];
      const parsed =
        typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
    })(),
    minPrice: toOptionalNumber(search["minPrice"]),
    maxPrice: toOptionalNumber(search["maxPrice"]),
    brands: toStringArray(search["brands"]),
    stores: toStringArray(search["stores"]),
    gender: typeof search["gender"] === "string" ? search["gender"] : "",
    inStock: toBoolean(search["inStock"]),
    onSale: toBoolean(search["onSale"]),
    filtersOpen: toBoolean(search["filtersOpen"]),
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const t = getTranslations(search.locale);
  const ts = (t as any).search ?? {};

  const { data } = useSuspenseQuery(
    searchPageQuery({
      locale: search.locale,
      q: search.q,
      category: search.category,
      sort: search.sort,
      page: search.page,
      minPrice: search.minPrice,
      maxPrice: search.maxPrice,
      brands: search.brands,
      stores: search.stores,
      gender: search.gender,
      inStock: search.inStock,
      onSale: search.onSale,
    }),
  );

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const filterValues: ShopFilterValues = useMemo(
    () => ({
      minPrice: search.minPrice,
      maxPrice: search.maxPrice,
      brands: search.brands,
      stores: search.stores,
      colors: [],
      sizes: [],
      inStock: search.inStock,
      onSale: search.onSale,
    }),
    [search.minPrice, search.maxPrice, search.brands, search.stores, search.inStock, search.onSale],
  );

  const updateFilters = (values: ShopFilterValues) => {
    navigate({
      to: "/search",
      search: {
        ...search,
        minPrice: values.minPrice,
        maxPrice: values.maxPrice,
        brands: values.brands,
        stores: values.stores,
        inStock: values.inStock,
        onSale: values.onSale,
        page: 1,
      },
    });
  };

  const updateSort = (sort: (typeof SORTS)[number]) => {
    navigate({ to: "/search", search: { ...search, sort, page: 1 } });
  };

  const clearFilters = () => {
    navigate({
      to: "/search",
      search: {
        ...search,
        category: "",
        minPrice: undefined,
        maxPrice: undefined,
        brands: [],
        stores: [],
        gender: "",
        inStock: false,
        onSale: false,
        page: 1,
      },
    });
  };

  const hasActiveFilters =
    search.category !== "" ||
    search.minPrice !== undefined ||
    search.maxPrice !== undefined ||
    search.brands.length > 0 ||
    search.stores.length > 0 ||
    (search.gender ?? "") !== "" ||
    search.inStock ||
    search.onSale;

  const sortLabels: Record<(typeof SORTS)[number], string> = {
    relevance: ts.sortRelevance ?? "Relevance",
    newest: ts.sortNewest ?? "Newest",
    price_asc: ts.sortPriceAsc ?? "Price: low to high",
    price_desc: ts.sortPriceDesc ?? "Price: high to low",
  };

  const storeResults = data.stores ?? [];

  return (
    <div dir={localeDirections[search.locale]} lang={search.locale} className="min-h-screen bg-background">
      <SiteHeader locale={search.locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Search input with autocomplete */}
        <div className="mx-auto max-w-2xl">
          <SearchAutocomplete
            value={search.q}
            onChange={(v) =>
              navigate({ to: "/search", search: { ...search, q: v } })
            }
            onSubmit={(q) =>
              navigate({ to: "/search", search: { ...search, q, page: 1 } })
            }
            onClose={() => {}}
            inputRef={{ current: null }}
          />
        </div>

        {/* Query + count */}
        <div className="mt-8">
          <p className="text-eyebrow text-muted-foreground">{ts.eyebrow ?? "Search results"}</p>
          <h1 className="mt-2 text-display text-foreground">
            {search.q ? (
              <>
                {ts.resultsFor ?? "Results for"} <span className="text-foreground">“{search.q}”</span>
              </>
            ) : (
              (ts.browseAll ?? "Browse all products")
            )}
          </h1>
          <p className="mt-2 text-small text-muted-foreground">
            {ts.resultCount
              ? ts.resultCount(data.total)
              : `${data.total} ${data.total === 1 ? "result" : "results"}`}
          </p>
        </div>

        {/* Stores section (when relevant) */}
        {search.q && storeResults.length > 0 ? (
          <section aria-label={ts.stores ?? "Stores"} className="mt-8">
            <h2 className="flex items-center gap-2 text-h3 text-foreground">
              <Store className="size-5" aria-hidden="true" />
              {ts.stores ?? "Stores"}
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {storeResults.slice(0, 6).map((store) => (
                <Link
                  key={store.id}
                  to="/store/$slug"
                  params={{ slug: store.slug }}
                  search={{ locale: search.locale }}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-small font-medium text-foreground transition-colors hover:border-foreground/30"
                >
                  {store.name}
                  <span className="text-caption text-muted-foreground">{store.productCount}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Toolbar: sort + filter toggle */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="search-sort" className="text-small text-muted-foreground">
              {ts.sortBy ?? "Sort by"}
            </label>
            <select
              id="search-sort"
              value={search.sort}
              onChange={(e) => updateSort(e.target.value as (typeof SORTS)[number])}
              className="h-10 cursor-pointer appearance-none rounded-full border border-border bg-background px-4 pe-8 text-small text-foreground outline-none"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {sortLabels[s]}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() =>
              navigate({
                to: "/search",
                search: { ...search, filtersOpen: !search.filtersOpen },
              })
            }
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {ts.filters ?? "Filters"}
          </Button>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <X className="size-3.5" aria-hidden="true" />
              {ts.clearAll ?? "Clear all"}
            </button>
          ) : null}
        </div>

        {/* Results grid */}
        <div className="mt-6 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className={`lg:block ${search.filtersOpen ? "block" : "hidden"}`}>
            <div className="lg:sticky lg:top-24">
              <ShopFilters facets={data} values={filterValues} locale={search.locale} onChange={updateFilters} />
            </div>
          </aside>
          <div className="min-w-0">
            <ProductGrid
              products={data.products}
              locale={search.locale}
              emptyTitle={ts.noResultsTitle ?? `No matches for "${search.q}"`}
              emptyText={ts.noResultsText ?? "Try a different search or adjust the filters."}
            />
            {totalPages > 1 ? (
              <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1.5">
                {data.page <= 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/search" search={{ ...search, page: data.page - 1 }}>
                      <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
                <span className="px-3 text-small text-muted-foreground">
                  {data.page} / {totalPages}
                </span>
                {data.page >= totalPages ? (
                  <Button variant="outline" size="sm" disabled>
                    <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/search" search={{ ...search, page: data.page + 1 }}>
                      <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </nav>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter locale={search.locale} t={t} />
    </div>
  );
}
