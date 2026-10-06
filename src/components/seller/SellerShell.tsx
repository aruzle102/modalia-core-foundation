import { useEffect, useMemo, type ReactNode } from "react";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { Link, useNavigate } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Ban,
  BarChart3,
  Bell,
  ExternalLink,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Package,
  Percent,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  Store as StoreIcon,
  Ticket,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
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
}

type SellerDashboardNavStrings = ReturnType<typeof getTranslations>["sellerDashboardV8"]["nav"];

/**
 * Every entry must correspond to a /seller/* route (created by the Phase 2 workers).
 * "Store & appearance" is a single nav entry for /seller/store — the legacy
 * /seller/appearance route keeps working untouched (same StoreStudio, initialTab="appearance"),
 * so deep links and bookmarks don't break.
 */
function getNavItems(t: SellerDashboardNavStrings): NavItem[] {
  return [
    { label: t.overview, to: "/seller", icon: <LayoutDashboard className="h-4 w-4" />, exact: true, permission: "analytics.view" },
    { label: t.orders, to: "/seller/orders", icon: <ShoppingBag className="h-4 w-4" />, permission: "orders.view" },
    { label: t.products, to: "/seller/products", icon: <Package className="h-4 w-4" />, permission: "products.view" },
    { label: t.inventory, to: "/seller/inventory", icon: <Warehouse className="h-4 w-4" />, permission: "inventory.manage" },
    { label: t.customers, to: "/seller/customers", icon: <Users className="h-4 w-4" />, permission: "customers.view" },
    { label: t.storeAppearance, to: "/seller/store", icon: <StoreIcon className="h-4 w-4" />, permission: "store.manage" },
    { label: t.coupons, to: "/seller/coupons", icon: <Ticket className="h-4 w-4" />, permission: "coupons.manage" },
    { label: t.discounts, to: "/seller/promotions", icon: <Percent className="h-4 w-4" />, permission: "promotions.manage" },
    { label: t.bundles, to: "/seller/bundles", icon: <Layers className="h-4 w-4" />, permission: "bundles.manage" },
    { label: t.shipping, to: "/seller/shipping", icon: <Truck className="h-4 w-4" />, permission: "store.manage" },
    { label: t.analytics, to: "/seller/analytics", icon: <BarChart3 className="h-4 w-4" />, permission: "analytics.view" },
    { label: t.reviews, to: "/seller/reviews", icon: <Star className="h-4 w-4" />, permission: "reviews.manage" },
    { label: t.staff, to: "/seller/staff", icon: <UserCog className="h-4 w-4" />, permission: "staff.manage" },
    { label: t.commission, to: "/seller/commission", icon: <Percent className="h-4 w-4" />, permission: "finance.view" },
    { label: t.settlements, to: "/seller/settlements", icon: <Wallet className="h-4 w-4" />, permission: "finance.view" },
    { label: t.support, to: "/seller/support", icon: <LifeBuoy className="h-4 w-4" />, permission: "support.manage" },
    // Notifications have no permission gate (NotificationBell is already in
    // the header) — the page works in support mode as-is.
    { label: t.notifications, to: "/seller/notifications", icon: <Bell className="h-4 w-4" />, permission: null },
    // AI draft actions require products.edit (a write); the page's purpose
    // is drafting, so it stays out of the read-only support scope.
    { label: t.aiTools, to: "/seller/ai", icon: <Sparkles className="h-4 w-4" />, permission: "products.edit" },
    { label: t.settings, to: "/seller/settings", icon: <Settings className="h-4 w-4" />, permission: "settings.manage" },
  ];
}

function SellerNavLink({ item, compact }: { item: NavItem; compact?: boolean }) {
  return (
    <Link
      to={item.to}
      {...(item.exact ? { activeOptions: { exact: true } } : {})}
      activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
        compact && "shrink-0 whitespace-nowrap py-1.5",
      )}
    >
      {item.icon}
      {item.label}
    </Link>
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
  // out-of-scope pages hide instead of rendering access-denied.
  const navItems = useMemo(() => {
    const items = getNavItems(getTranslations(locale).sellerDashboardV8.nav);
    if (!seller?.supportMode) return items;
    return items.filter(
      (item) => item.permission === null || SUPPORT_READ_PERMISSIONS.includes(item.permission),
    );
  }, [locale, seller?.supportMode]);

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
        {/* Mobile nav: compact horizontally-scrollable under the topbar */}
        <nav className="border-t lg:hidden" aria-label="Seller">
          <div className="flex gap-1 overflow-x-auto px-3 py-2">
            {navItems.map((item) => (
              <SellerNavLink key={item.to} item={item} compact />
            ))}
          </div>
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 self-start overflow-y-auto border-e lg:block">
          <nav className="space-y-0.5 p-3" aria-label="Seller">
            {navItems.map((item) => (
              <SellerNavLink key={item.to} item={item} />
            ))}
          </nav>
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
