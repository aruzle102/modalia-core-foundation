import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Ban,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ExternalLink,
  Eye,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Menu,
  Package,
  Palette,
  Percent,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store as StoreIcon,
  Tags,
  Ticket,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SellerCommandBar } from "./SellerCommandBar";
import { SellerGateCard, SellerShellSkeleton, useSellerSession } from "./ui";
import type { SellerSuspendedReason } from "./ui";
import { SupportModeBanner, useSupportHandshake } from "./support-mode";
import { SUPPORT_READ_PERMISSIONS, type SellerPermission } from "@/lib/seller-auth";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: ReactNode;
  exact?: boolean;
  /**
   * V8 Sec 47 — the seller permission this section's reads require, or null
   * when the section has no permission gate. In support mode, items whose
   * permission falls outside SUPPORT_READ_PERMISSIONS are hidden (instead of
   * rendering a page that only shows access-denied). The allowed set is
   * derived from SUPPORT_READ_PERMISSIONS — the single source of truth for
   * the support read scope (src/lib/seller-auth.ts).
   */
  permission: SellerPermission | null;
  /**
   * External URL (e.g. public storefront preview). When set, renders an
   * <a> instead of a router <Link> — never hijacks history.
   */
  href?: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

type SellerDashboardNavStrings = ReturnType<typeof getTranslations>["sellerDashboardV8"]["nav"];
type SellerDashboardGroupStrings = ReturnType<typeof getTranslations>["sellerDashboardV8"]["groups"];

/**
 * Grouped seller navigation (Spec §2). Every entry must correspond to a
 * /seller/* route. "Store Preview" is an external link to the public
 * storefront — it never hijacks router history.
 */
function getNavGroups(
  t: SellerDashboardNavStrings,
  g: SellerDashboardGroupStrings,
  storeSlug?: string | null,
): NavGroup[] {
  const icon = "h-4 w-4";
  return [
    {
      id: "overview",
      label: g.overview,
      items: [
        { label: t.overview, to: "/seller", icon: <LayoutDashboard className={icon} />, exact: true, permission: "analytics.view" },
      ],
    },
    {
      id: "commerce",
      label: g.commerce,
      items: [
        { label: t.orders, to: "/seller/orders", icon: <ShoppingBag className={icon} />, permission: "orders.view" },
        { label: t.products, to: "/seller/products", icon: <Package className={icon} />, permission: "products.view" },
        { label: t.inventory, to: "/seller/inventory", icon: <Warehouse className={icon} />, permission: "inventory.manage" },
        { label: t.categories, to: "/seller/categories", icon: <Tags className={icon} />, permission: "products.view" },
        { label: t.customers, to: "/seller/customers", icon: <Users className={icon} />, permission: "customers.view" },
      ],
    },
    {
      id: "store",
      label: g.store,
      items: [
        { label: t.storeProfile, to: "/seller/store", icon: <StoreIcon className={icon} />, permission: "store.manage" },
        { label: t.storeAppearance, to: "/seller/appearance", icon: <Palette className={icon} />, permission: "store.manage" },
        ...(storeSlug
          ? [
              {
                label: t.storePreview,
                to: "/seller" as const,
                icon: <Eye className={icon} />,
                permission: null,
                href: `/store/${storeSlug}`,
              },
            ]
          : []),
      ],
    },
    {
      id: "marketing",
      label: g.marketing,
      items: [
        { label: t.coupons, to: "/seller/coupons", icon: <Ticket className={icon} />, permission: "coupons.manage" },
        { label: t.discounts, to: "/seller/promotions", icon: <Percent className={icon} />, permission: "promotions.manage" },
        { label: t.bundles, to: "/seller/bundles", icon: <Layers className={icon} />, permission: "bundles.manage" },
      ],
    },
    {
      id: "operations",
      label: g.operations,
      items: [
        { label: t.shipping, to: "/seller/shipping", icon: <Truck className={icon} />, permission: "store.manage" },
        { label: t.offices, to: "/seller/offices", icon: <Building2 className={icon} />, permission: "store.manage" },
      ],
    },
    {
      id: "analytics",
      label: g.analytics,
      items: [
        { label: t.analytics, to: "/seller/analytics", icon: <BarChart3 className={icon} />, permission: "analytics.view" },
        { label: t.reviews, to: "/seller/reviews", icon: <Star className={icon} />, permission: "reviews.manage" },
      ],
    },
    {
      id: "finance",
      label: g.finance,
      items: [
        { label: t.commission, to: "/seller/commission", icon: <Percent className={icon} />, permission: "finance.view" },
        { label: t.settlements, to: "/seller/settlements", icon: <Wallet className={icon} />, permission: "finance.view" },
      ],
    },
    {
      id: "team",
      label: g.team,
      items: [
        { label: t.staff, to: "/seller/staff", icon: <UserCog className={icon} />, permission: "staff.manage" },
        { label: t.permissions, to: "/seller/permissions", icon: <KeyRound className={icon} />, permission: "staff.manage" },
      ],
    },
    {
      id: "support",
      label: g.support,
      items: [
        { label: t.support, to: "/seller/support", icon: <LifeBuoy className={icon} />, permission: "support.manage" },
        // Notifications have no permission gate (NotificationBell is already
        // in the header) — the page works in support mode as-is.
        { label: t.notifications, to: "/seller/notifications", icon: <Bell className={icon} />, permission: null },
      ],
    },
    {
      id: "system",
      label: g.system,
      items: [
        // AI draft actions require products.edit (a write); the page's purpose
        // is drafting, so it stays out of the read-only support scope.
        { label: t.aiTools, to: "/seller/ai", icon: <ModaliaIntelligenceIcon size={18} className={icon} />, permission: "products.edit" },
        { label: t.settings, to: "/seller/settings", icon: <Settings className={icon} />, permission: "settings.manage" },
        { label: t.security, to: "/seller/security", icon: <ShieldCheck className={icon} />, permission: null },
      ],
    },
  ];
}

function SellerNavLink({ item, compact, onNavigate }: { item: NavItem; compact?: boolean; onNavigate?: (() => void) | undefined }) {
  const className = cn(
    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
    compact && "shrink-0 whitespace-nowrap py-1.5",
  );
  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        className={className}
      >
        {item.icon}
        {item.label}
        <ExternalLink className="ms-auto h-3 w-3 opacity-60" aria-hidden="true" />
      </a>
    );
  }
  return (
    <Link
      to={item.to}
      preload="intent"
      onClick={onNavigate}
      {...(item.exact ? { activeOptions: { exact: true } } : {})}
      activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
      className={className}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

const SELLER_EXPANDED_KEY = "modalia:seller-nav:expanded";
const SELLER_ACTIVE_KEY = "modalia:seller-nav:active";

function readStoredArray(key: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const items = parsed.filter((v): v is string => typeof v === "string");
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

function readStoredString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, SSR) — sidebar still works in-memory.
  }
}

function itemMatches(item: NavItem, pathname: string): boolean {
  const to = String(item.to);
  if (item.exact) return pathname === to || pathname === `${to}/`;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Collapsible grouped sidebar nav. Expanded groups + the active section
 * persist in localStorage so the sidebar looks the same after reload.
 * Follows the AdminShell pattern.
 */
function SellerSidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [expanded, setExpanded] = useState<string[]>(() => {
    const stored = readStoredArray(SELLER_EXPANDED_KEY);
    if (stored) return stored.filter((id) => groups.some((g) => g.id === id));
    const active = readStoredString(SELLER_ACTIVE_KEY);
    const group = active ? groups.find((g) => g.items.some((i) => String(i.to) === active)) : undefined;
    if (group) return [group.id];
    return groups.map((g) => g.id);
  });

  const groupForPath = (path: string): NavGroup | undefined =>
    groups.find((g) => g.items.some((item) => itemMatches(item, path)));

  // Remember the current section; keep its group expanded.
  useEffect(() => {
    const activeItem = allItems.find((i) => itemMatches(i, pathname));
    if (activeItem) writeStored(SELLER_ACTIVE_KEY, String(activeItem.to));
    const group = groupForPath(pathname);
    if (group) {
      setExpanded((prev) => {
        if (prev.includes(group.id)) return prev;
        const next = [...prev, group.id];
        writeStored(SELLER_EXPANDED_KEY, JSON.stringify(next));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, allItems]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      writeStored(SELLER_EXPANDED_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <nav className="space-y-1 p-3" aria-label="Seller">
      {groups.map((group) => {
        const open = expanded.includes(group.id);
        const active = group.items.some((item) => itemMatches(item, pathname));
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={open}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:bg-accent/60 hover:text-foreground",
                active && "text-foreground",
              )}
            >
              <span>{group.label}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  open ? "" : "-rotate-90 rtl:rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <div className="mt-0.5 space-y-0.5">
                {group.items.map((item) => (
                  <SellerNavLink key={item.href ?? String(item.to)} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Seller OS chrome: sticky topbar with wordmark, ⌘K search and store link;
 * left sidebar on lg+; horizontally scrollable nav under the topbar on mobile.
 * Guards everything behind useSellerSession: checking → skeleton, signed-out →
 * sign-in card, not-a-seller → become-a-seller card.
 */
/** Resolve the seller-area locale from the URL param, falling back to the persisted choice. */
function useSellerLocale() {
  return useMemo(() => {
    if (typeof window === "undefined") return getLocale(undefined);
    return getLocale(new URLSearchParams(window.location.search).get("locale") ?? undefined);
  }, []);
}

type SellerAuthStrings = ReturnType<typeof getTranslations>["sellerAuth"];

function suspendedMessage(
  reason: SellerSuspendedReason | null,
  t: SellerAuthStrings,
): string {
  switch (reason) {
    case "suspended":
      return t.blockedSuspended;
    case "disabled":
      return t.blockedDisabled;
    case "pending":
      return t.blockedPending;
    case "staff-deactivated":
      return t.blockedStaff;
    default:
      return t.blockedTitle;
  }
}

import { Crumbs, type Crumb } from "@/components/routing/crumbs";
import { ModaliaIntelligenceIcon } from "@/components/marketplace/ModaliaIntelligenceIcon";

export function SellerShell({
  title,
  eyebrow,
  actions,
  breadcrumbs,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  children: ReactNode;
}) {
  const { status, error, seller, suspendedReason, retry } = useSellerSession();
  // V8 Sec 47: admin support-mode handshake (?support=<token>). While it
  // resolves we hold the skeleton; on failure we show a gate card instead
  // of a confusing "not a seller" state.
  const supportHandshake = useSupportHandshake();
  const locale = useSellerLocale();
  const dirProps = { dir: localeDirections[locale], lang: locale } as const;
  const nav = useNavigate();
  const t = getTranslations(locale).sellerAuth;
  // V8 Sec 47: in support mode only the read-scope sections are shown —
  // derived from SUPPORT_READ_PERMISSIONS (single source of truth), so
  // out-of-scope pages hide instead of rendering access-denied. Empty groups
  // are dropped.
  const navGroups = useMemo(() => {
    const strings = getTranslations(locale).sellerDashboardV8;
    const groups = getNavGroups(strings.nav, strings.groups, seller?.storeSlug);
    if (!seller?.supportMode) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.permission === null || SUPPORT_READ_PERMISSIONS.includes(item.permission),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [locale, seller?.supportMode, seller?.storeSlug]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Forced password rotation: a first-time owner who reaches the workspace
  // (e.g. via a bookmarked deep link) is routed to the change-password page
  // before any work. The flag is owner-only; suspended owners never get here
  // (status !== "ready"). href is used because the route tree regenerates at
  // build time.
  useEffect(() => {
    if (status === "ready" && seller?.isOwner && seller?.mustResetPassword) {
      void nav({ href: `/seller/change-password?locale=${locale}`, replace: true });
    }
  }, [status, seller, locale, nav]);
  // Preserve the intended route so the seller returns here after signing in.
  const intended = useMemo(
    () =>
      typeof window === "undefined"
        ? "/seller"
        : window.location.pathname + window.location.search,
    [],
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    await nav({ to: "/seller/login", search: { locale }, replace: true });
  }

  if (status === "checking" || supportHandshake.pending) {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerShellSkeleton />
      </div>
    );
  }

  if (supportHandshake.error) {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerGateCard
          icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
          title={t.blockedTitle}
          description={t.supportInvalid}
        >
          <Button asChild variant="outline">
            <Link to="/" search={{ locale }}>
              {t.backToMarketplace}
            </Link>
          </Button>
        </SellerGateCard>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerGateCard
          icon={<LogIn className="h-6 w-6 text-muted-foreground" />}
          title={t.gateTitle}
          description={t.gateSub}
        >
          <Button asChild>
            <Link to="/seller/login" search={{ locale, redirect: intended }}>
              {t.signIn}
            </Link>
          </Button>
        </SellerGateCard>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerGateCard
          icon={<Ban className="h-6 w-6 text-destructive" />}
          title={t.blockedTitle}
          description={suspendedMessage(suspendedReason, t)}
        >
          <Button type="button" variant="outline" onClick={handleSignOut}>
            <LogOut className="me-2 h-4 w-4" aria-hidden="true" />
            {t.logout}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/" search={{ locale }}>
              {t.backToMarketplace}
            </Link>
          </Button>
        </SellerGateCard>
      </div>
    );
  }

  if (status === "not-seller") {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerGateCard
          icon={<StoreIcon className="h-6 w-6 text-muted-foreground" />}
          title="Seller workspace"
          description="This account is not attached to a seller workspace yet."
        >
          <Button asChild>
            <Link to="/become-a-seller" search={{ locale }}>
              Become a seller
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/" search={{ locale }}>
              Back to the marketplace
            </Link>
          </Button>
        </SellerGateCard>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerGateCard
          icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
          title="Something went wrong"
          description="The seller access check failed."
        >
          {error ? (
            <p className="w-full rounded-md bg-muted px-3 py-2 font-mono text-xs break-all text-start">
              {error}
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={retry}>
            <RefreshCw className="me-2 h-4 w-4" />
            Retry
          </Button>
        </SellerGateCard>
      </div>
    );
  }

  return (
    <div {...dirProps} className="min-h-screen bg-background text-foreground">
      {/* V8 Sec 47: unmissable support-mode marker across the whole shell. */}
      {seller?.supportMode ? <SupportModeBanner seller={seller} locale={locale} /> : null}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Link to="/seller" search={{ locale }} className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-950 text-xs font-bold text-white">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight">Seller OS</span>
          </Link>
          {seller ? (
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground md:inline">
              {seller.legalName}
              {seller.isOwner ? null : " · Staff"}
            </span>
          ) : null}
          <div className="flex-1" />
          <SellerCommandBar />
          {seller?.storeSlug ? (
            <Link
              to="/store/$slug"
              params={{ slug: seller.storeSlug }}
              search={{ locale }}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View store</span>
            </Link>
          ) : null}
          <NotificationBell
            scope="seller"
            locale={locale}
            t={getTranslations(locale).notifications}
            viewAllTo="/seller/notifications"
            preferencesTo="/seller/notifications/preferences"
          />
          {/* In support mode there is no seller session to end — signing out
              here would kill the admin's own session. Exit via the banner. */}
          {seller?.supportMode ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              title={t.logout}
              aria-label={t.logout}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        {/* Mobile nav: drawer with grouped navigation */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-72 overflow-y-auto p-0">
            <SheetHeader className="border-b p-4">
              <SheetTitle className="flex items-center gap-2 text-start">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-950 text-xs font-bold text-white">
                  M
                </span>
                <span className="text-sm font-semibold tracking-tight">Seller OS</span>
              </SheetTitle>
            </SheetHeader>
            <SellerSidebarNav groups={navGroups} onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 self-start overflow-y-auto border-e lg:block">
          <SellerSidebarNav groups={navGroups} />
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
            {breadcrumbs && breadcrumbs.length > 0 ? <Crumbs items={breadcrumbs} /> : null}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {eyebrow}
                  </p>
                ) : null}
                <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
              </div>
              {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
