import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Store,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { adminGlobalSearch, getOfficialStore } from "@/lib/admin-search.functions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getTranslations } from "@/lib/i18n";
import { useAdminLocale } from "./useAdminLocale";

interface SearchItem {
  key: string;
  group: string;
  label: string;
  sub: string;
  icon: ReactNode;
  disabled?: boolean;
  run: () => void;
}

/**
 * Global admin search palette. Renders its own topbar trigger button
 * ("Search…" + ⌘K hint); ⌘K / Ctrl+K opens, Esc or backdrop click closes.
 *
 * Searches orders (by number, email, phone, customer name), sellers, stores,
 * products and customers through the admin-only `adminGlobalSearch` server
 * function — no mock data. Clicking a result navigates to the real record.
 * A "Quick actions" group offers Create product / seller / store and opening
 * the official storefront.
 */
export function CommandBar() {
  const locale = useAdminLocale();
  const t = getTranslations(locale).commandBar;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
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
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
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

  const officialStore = useQuery({
    queryKey: ["admin-official-store"],
    queryFn: () => getOfficialStore(),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });

  const go = useCallback(
    (to: string, opts: { search?: Record<string, string>; params?: Record<string, string> }) => {
      close();
      void navigate({ to, ...opts } as never);
    },
    [close, navigate],
  );

  const { actions, results } = useMemo(() => {
    const groups = t.groups;
    const actions: SearchItem[] = [];

    const official = officialStore.data?.store ?? null;
    const officialReady = officialStore.isSuccess;
    actions.push(
      {
        key: "action-create-product",
        group: groups.actions,
        label: t.createProduct,
        sub: t.createProductHint,
        icon: <Plus className="h-4 w-4 text-muted-foreground" />,
        run: () => go("/admin/products", { search: { create: "product" } }),
      },
      {
        key: "action-create-seller",
        group: groups.actions,
        label: t.createSeller,
        sub: t.createSellerHint,
        icon: <UserPlus className="h-4 w-4 text-muted-foreground" />,
        run: () => go("/admin/sellers", { search: { create: "seller" } }),
      },
      {
        key: "action-create-store",
        group: groups.actions,
        label: t.createStore,
        sub: t.createStoreHint,
        icon: <Store className="h-4 w-4 text-muted-foreground" />,
        run: () => go("/admin/sellers", { search: { create: "seller" } }),
      },
      {
        key: "action-official-store",
        group: groups.actions,
        label: t.openOfficialStore,
        sub: official ? official.name : officialReady ? t.noOfficialStore : t.openOfficialStoreHint,
        icon: officialStore.isFetching ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <BadgeCheck className="h-4 w-4 text-muted-foreground" />
        ),
        disabled: officialStore.isFetching || (officialReady && !official),
        run: () => {
          if (official) {
            close();
            window.open(`/store/${official.slug}?locale=${locale}`, "_blank", "noopener,noreferrer");
          }
        },
      },
    );

    const results: SearchItem[] = [];
    const data = search.data;
    if (data) {
      for (const o of data.orders) {
        results.push({
          key: `order-${o.id}`,
          group: groups.orders,
          label: o.order_number,
          sub: `${o.customer} · ${o.total} DZD · ${o.status.replace(/_/g, " ")}`,
          icon: <ShoppingBag className="h-4 w-4 text-muted-foreground" />,
          run: () => go("/admin/orders/$orderId", { params: { orderId: o.id } }),
        });
      }
      for (const s of data.sellers) {
        results.push({
          key: `seller-${s.id}`,
          group: groups.sellers,
          label: s.name,
          sub: `${s.email} · ${s.status.replace(/_/g, " ")}`,
          icon: <Users className="h-4 w-4 text-muted-foreground" />,
          run: () => go("/admin/sellers/$sellerId", { params: { sellerId: s.id } }),
        });
      }
      for (const p of data.products) {
        results.push({
          key: `product-${p.id}`,
          group: groups.products,
          label: p.slug,
          sub: `${p.price} DZD · ${p.status.replace(/_/g, " ")}`,
          icon: <Package className="h-4 w-4 text-muted-foreground" />,
          run: () => go("/admin/products", { search: { q: p.slug } }),
        });
      }
      for (const s of data.stores) {
        results.push({
          key: `store-${s.id}`,
          group: groups.stores,
          label: s.name,
          sub: s.slug,
          icon: <Store className="h-4 w-4 text-muted-foreground" />,
          run: () => go("/admin/sellers", { search: { q: s.slug } }),
        });
      }
      for (const c of data.customers) {
        results.push({
          key: `customer-${c.id}`,
          group: groups.customers,
          label: c.name,
          sub: [c.email, c.phone].filter(Boolean).join(" · ") || "—",
          icon: <User className="h-4 w-4 text-muted-foreground" />,
          run: () => go("/admin/orders", { search: { q: c.phone ?? c.email ?? c.name } }),
        });
      }
    }
    return { actions, results };
  }, [search.data, officialStore.data, officialStore.isFetching, officialStore.isSuccess, t, go, locale, close]);

  const items = useMemo(() => [...actions, ...results], [actions, results]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, search.data]);

  const selectable = useMemo(() => items.filter((i) => !i.disabled), [items]);
  const clampedIndex = selectable.length ? Math.min(activeIndex, selectable.length - 1) : 0;

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (selectable.length ? (i + 1) % selectable.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (selectable.length ? (i - 1 + selectable.length) % selectable.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = selectable[clampedIndex];
      if (item) item.run();
    }
  };

  let lastGroup: string | null = null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
        aria-label={t.dialogLabel}
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-start">{t.trigger}</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md border sm:hidden"
        aria-label={t.dialogLabel}
      >
        <Search className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.dialogLabel}
            className="relative w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-xl"
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={t.placeholder}
                className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              {search.isFetching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {search.isError ? (
                <p className="px-4 py-6 text-center text-sm text-destructive">{t.failed}</p>
              ) : debounced.length >= 2 && results.length === 0 && !search.isFetching ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {t.noResultsFor} “{debounced}”.
                </p>
              ) : (
                items.map((item) => {
                  const showGroup = item.group !== lastGroup;
                  lastGroup = item.group;
                  const active = selectable[clampedIndex] === item;
                  return (
                    <div key={item.key}>
                      {showGroup ? (
                        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {item.group}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        disabled={item.disabled}
                        onMouseEnter={() => {
                          const idx = selectable.indexOf(item);
                          if (idx >= 0) setActiveIndex(idx);
                        }}
                        onClick={() => item.run()}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-start disabled:opacity-50",
                          active && !item.disabled ? "bg-accent" : undefined,
                        )}
                      >
                        {item.icon}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>
                        </span>
                        {active && !item.disabled ? (
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span>
                <kbd className="rounded border px-1">↑↓</kbd> {t.navigate}
              </span>
              <span>
                <kbd className="rounded border px-1">↵</kbd> {t.open}
              </span>
              <span>
                <kbd className="rounded border px-1">esc</kbd> {t.close}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
