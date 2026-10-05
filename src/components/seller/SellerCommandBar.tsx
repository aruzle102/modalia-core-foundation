import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { FileText, Loader2, Package, Search, ShoppingBag, Users } from "lucide-react";
import { searchSellerCatalog } from "@/lib/seller-search.functions";
import type { SellerSearchItem } from "@/lib/seller-search.functions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const KIND_META: Record<SellerSearchItem["kind"], { group: string; icon: ReactNode }> = {
  order: {
    group: "Orders",
    icon: <ShoppingBag className="h-4 w-4 text-muted-foreground" />,
  },
  product: {
    group: "Products",
    icon: <Package className="h-4 w-4 text-muted-foreground" />,
  },
  customer: {
    group: "Customers",
    icon: <Users className="h-4 w-4 text-muted-foreground" />,
  },
};

interface PaletteItem {
  key: string;
  group: string;
  label: string;
  sub: string;
  icon: ReactNode;
  run: () => void;
}

/**
 * Seller-scoped ⌘K search palette. Renders its own trigger button ("Search…" +
 * ⌘K hint); ⌘K / Ctrl+K opens, Esc or backdrop click closes. Results only ever
 * cover the caller's OWN catalog, orders and customers (see searchSellerCatalog).
 */
export function SellerCommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const push = useRouter().history.push;
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setDebounced("");
    setActiveIndex(0);
  }, []);

  // ⌘K / Ctrl+K to open, Esc to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 250ms debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open ]);

  const search = useQuery({
    queryKey: ["seller-search", debounced],
    queryFn: () => searchSellerCatalog({ data: { q: debounced } }),
    enabled: open && debounced.length >= 2,
    retry: false,
  });

  const items: PaletteItem[] = useMemo(() => {
    if (!search.data) return [];
    return search.data.map((r) => {
      const meta = KIND_META[r.kind];
      return {
        key: `${r.kind}-${r.id}`,
        group: meta.group,
        label: r.label,
        sub: r.sub ?? "",
        icon: meta.icon,
        run: () => {
          const href = r.search?.['q'] ? `${r.to}?q=${encodeURIComponent(r.search['q'])}` : r.to;
          push(href);
        },
      };
    });
  }, [search.data, push]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, search.data]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) {
        close();
        item.run();
      }
    }
  };

  let lastGroup: string | null = null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
        aria-label="Search your catalog"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-start">Search…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md border sm:hidden"
        aria-label="Search your catalog"
      >
        <Search className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Seller search"
            className="relative w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-xl"
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search your products, orders, customers…"
                className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              {search.isFetching ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {debounced.length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              ) : search.isError ? (
                <p className="px-4 py-6 text-center text-sm text-destructive">
                  Search failed. Try again.
                </p>
              ) : items.length === 0 && !search.isFetching ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No results for “{debounced}”.
                </p>
              ) : (
                items.map((item, idx) => {
                  const showGroup = item.group !== lastGroup;
                  lastGroup = item.group;
                  const active = idx === activeIndex;
                  return (
                    <div key={item.key}>
                      {showGroup ? (
                        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {item.group}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          close();
                          item.run();
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-start",
                          active ? "bg-accent" : undefined,
                        )}
                      >
                        {item.icon}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          {item.sub ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.sub}
                            </span>
                          ) : null}
                        </span>
                        {active ? (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span>
                <kbd className="rounded border px-1">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="rounded border px-1">↵</kbd> open
              </span>
              <span>
                <kbd className="rounded border px-1">esc</kbd> close
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
