import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search, Store, Tag, TrendingUp } from "lucide-react";
import {
  getSearchSuggestions,
  getTrendingSearches,
  getPopularCategories,
  getPopularSearchFallbacks,
  type SearchSuggestions,
} from "@/lib/search-suggestions.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";
import { track } from "@/lib/analytics";

const RECENT_KEY = "modalia_recent_searches";
const MAX_RECENT = 6;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  try {
    const next = [term, ...readRecent().filter((s) => s !== term)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — ignore */
  }
}

function formatPrice(value: number, locale: SupportedLocale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-DZ", {
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Premium search autocomplete dropdown. Mounted by the site header.
 *
 * - Before typing: popular searches (admin-configured), trending (real data
 *   or fallbacks), popular categories, recent searches (localStorage).
 * - While typing (debounced, min 2 chars): products, stores, categories, brands.
 */
export function SearchAutocomplete({
  value,
  onChange,
  onSubmit,
  onClose,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const navigate = useNavigate();
  const locale = getLocale() as SupportedLocale;
  const t = (getTranslations(locale) as any).search ?? {};
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const typing = value.trim().length >= 2;

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), 220);
    return () => clearTimeout(id);
  }, [value]);

  const suggestionsQuery = useQuery({
    queryKey: ["search-suggestions", debounced, locale],
    queryFn: (): Promise<SearchSuggestions> =>
      getSearchSuggestions({ data: { query: debounced, locale } }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const trendingQuery = useQuery({
    queryKey: ["trending-searches"],
    queryFn: () => getTrendingSearches(),
    enabled: open && !typing,
    staleTime: 5 * 60_000,
  });

  const fallbacksQuery = useQuery({
    queryKey: ["popular-search-fallbacks"],
    queryFn: () => getPopularSearchFallbacks(),
    enabled: open && !typing,
    staleTime: 10 * 60_000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["popular-categories", locale],
    queryFn: () => getPopularCategories({ data: { locale } }),
    enabled: open && !typing,
    staleTime: 10 * 60_000,
  });

  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (open && !typing) setRecent(readRecent());
  }, [open, typing]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const goSearch = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return;
      pushRecent(q);
      setRecent(readRecent());
      track("search", { metadata: { query: q } });
      setOpen(false);
      onSubmit(q);
    },
    [onSubmit],
  );

  const goProduct = (slug: string) => {
    setOpen(false);
    onClose();
    navigate({ to: "/product/$slug", params: { slug }, search: { locale } });
  };

  const goStore = (slug: string) => {
    setOpen(false);
    onClose();
    navigate({ to: "/store/$slug", params: { slug }, search: { locale } });
  };

  const goCategory = (slug: string) => {
    setOpen(false);
    onClose();
    navigate({ to: "/category/$slug", params: { slug }, search: { locale } });
  };

  const trending = trendingQuery.data ?? [];
  const fallbacks = fallbacksQuery.data ?? [];
  const popularTerms = trending.length > 0 ? trending : fallbacks;
  const suggestions = suggestionsQuery.data;
  const hasSuggestions =
    !!suggestions &&
    (suggestions.products.length + suggestions.stores.length + suggestions.categories.length + suggestions.brands.length > 0);

  const sectionTitle = "text-caption font-semibold uppercase tracking-widest text-muted-foreground";
  const termChip =
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-small text-foreground transition-colors hover:border-foreground/30 hover:bg-muted";

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              goSearch(value);
            }
          }}
          placeholder={t.placeholder ?? "Search products, stores, brands…"}
          aria-label={t.label ?? "Search"}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          className="h-10 w-full rounded-full border border-border bg-muted/40 ps-10 pe-4 text-small text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40 focus:bg-background"
        />
      </div>

      {open ? (
        <div className="absolute start-0 end-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-xl">
          {typing ? (
            suggestionsQuery.isPending ? (
              <div className="space-y-2 py-2" aria-label="Loading suggestions">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : hasSuggestions && suggestions ? (
              <div className="space-y-4">
                {suggestions.products.length > 0 ? (
                  <section>
                    <h3 className={sectionTitle}>{t.products ?? "Products"}</h3>
                    <ul className="mt-2 space-y-1">
                      {suggestions.products.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => goProduct(p.slug)}
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-muted"
                          >
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="size-10 rounded-lg object-cover" loading="lazy" />
                            ) : (
                              <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                                <Tag className="size-4" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-small font-medium text-foreground">{p.name}</span>
                              <span className="block truncate text-caption text-muted-foreground">
                                {p.storeName ?? ""} · {formatPrice(p.price, locale)} DZD
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {suggestions.stores.length > 0 ? (
                  <section>
                    <h3 className={sectionTitle}>{t.stores ?? "Stores"}</h3>
                    <ul className="mt-2 space-y-1">
                      {suggestions.stores.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => goStore(s.slug)}
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-muted"
                          >
                            <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                              <Store className="size-4" />
                            </span>
                            <span className="truncate text-small font-medium text-foreground">{s.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {suggestions.categories.length > 0 ? (
                  <section>
                    <h3 className={sectionTitle}>{t.categories ?? "Categories"}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.categories.map((c) => (
                        <button key={c.id} type="button" onClick={() => goCategory(c.slug)} className={termChip}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
                {suggestions.brands.length > 0 ? (
                  <section>
                    <h3 className={sectionTitle}>{t.brands ?? "Brands"}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.brands.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => goSearch(b.name)}
                          className={termChip}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
                <button
                  type="button"
                  onClick={() => goSearch(value)}
                  className="flex w-full items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-small font-semibold text-background transition-opacity hover:opacity-90"
                >
                  <Search className="size-4" aria-hidden="true" />
                  {t.seeAll ?? "See all results for"} “{value.trim()}”
                </button>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-small font-medium text-foreground">{t.noMatches ?? "No matches found"}</p>
                <p className="mt-1 text-caption text-muted-foreground">{t.tryOther ?? "Try a different search term."}</p>
                <button
                  type="button"
                  onClick={() => goSearch(value)}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-small font-semibold text-background"
                >
                  <Search className="size-4" aria-hidden="true" />
                  {t.searchAnyway ?? "Search anyway"}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-5">
              {popularTerms.length > 0 ? (
                <section>
                  <h3 className={sectionTitle}>
                    {trending.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <TrendingUp className="size-3.5" aria-hidden="true" /> {t.trending ?? "Trending now"}
                      </span>
                    ) : (
                      t.popular ?? "Popular searches"
                    )}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {popularTerms.map((term) => (
                      <button key={term} type="button" onClick={() => goSearch(term)} className={termChip}>
                        {term}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              {(categoriesQuery.data ?? []).length > 0 ? (
                <section>
                  <h3 className={sectionTitle}>{t.popularCategories ?? "Popular categories"}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(categoriesQuery.data ?? []).map((c) => (
                      <button key={c.id} type="button" onClick={() => goCategory(c.slug)} className={termChip}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              {recent.length > 0 ? (
                <section>
                  <h3 className={sectionTitle}>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5" aria-hidden="true" /> {t.recent ?? "Recent searches"}
                    </span>
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button key={term} type="button" onClick={() => goSearch(term)} className={termChip}>
                        {term}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
