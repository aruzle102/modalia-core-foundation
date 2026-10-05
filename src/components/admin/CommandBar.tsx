import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Package, Search, ShoppingBag, Store, Users } from "lucide-react";
import { adminGlobalSearch } from "@/lib/admin-search.functions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchItem {
  key: string;
  group: string;
  label: string;
  sub: string;
  icon: ReactNode;
  run: () => void;
}

/**
 * Global admin search palette. Renders its own topbar trigger button
 * ("Search…" + ⌘K hint); ⌘K / Ctrl+K opens, Esc or backdrop click closes.
 */
export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    queryKey: ["admin-search", debounced],
    queryFn: () => adminGlobalSearch({ data: { q: debounced } }),
    enabled: open && debounced.length >= 2,
    retry: false,
  });

  const items: SearchItem[] = useMemo(() => {
    const results = search.data;
    if (!results) return [];
    const list: SearchItem[] = [];
    for (const o of results.orders) {
      list.push({
        key: `order-${o.id}`,
        group: "Orders",
        label: o.order_number,
        sub: `${o.customer} · ${o.total} DZD · ${o.status.replace(/_/g, " ")}`,
        icon: <ShoppingBag className="h-4 w-4 text-muted-foreground" />,
        run: () => navigate({ to: "/admin/orders/$orderId", params: { orderId: o.id } }),
      });
    }
    for (const s of results.sellers) {
      list.push({
        key: `seller-${s.id}`,
        group: "Sellers",
        label: s.name,
        sub: `${s.email} · ${s.status.replace(/_/g, " ")}`,
        icon: <Users className="h-4 w-4 text-muted-foreground" />,
        run: () => navigate({ to: "/admin/sellers/$sellerId", params: { sellerId: s.id } }),
      });
    }
    for (const p of results.products) {
      list.push({
        key: `product-${p.id}`,
        group: "Products",
        label: p.slug,
        sub: `${p.price} DZD · ${p.status.replace(/_/g, " ")}`,
        icon: <Package className="h-4 w-4 text-muted-foreground" />,
        run: () => navigate({ to: "/admin/products", search: { q: p.slug } }),
      });
    }
    for (const s of results.stores) {
      list.push({
        key: `store-${s.id}`,
        group: "Stores",
        label: s.name,
        sub: s.slug,
        icon: <Store className="h-4 w-4 text-muted-foreground" />,
        run: () => navigate({ to: "/admin/sellers", search: { q: s.slug } }),
      });
    }
    return list;
  }, [search.data, navigate]);

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
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-start">Search…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md border sm:hidden"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            className="relative w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-xl"
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search orders, sellers, products, stores…"
                className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              {search.isFetching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {debounced.length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              ) : search.isError ? (
                <p className="px-4 py-6 text-center text-sm text-destructive">Search failed. Try again.</p>
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
                          <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>
                        </span>
                        {active ? <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
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
