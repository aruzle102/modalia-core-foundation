import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  BadgePercent,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ExternalLink,
  FileText,
  FileWarning,
  Flag,
  FolderTree,
  Globe,
  Hammer,
  Handshake,
  Images,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  MapPin,
  Megaphone,
  MousePointerClick,
  Package,
  Percent,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Ticket,
  Truck,
  UserCheck,
  Wrench,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { CommandBar } from "./CommandBar";
import { QuickCreate } from "./QuickCreate";
import { useAdminLocale } from "./useAdminLocale";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { getTranslations, type Translation } from "@/lib/i18n";
import {
  ADMIN_NAV_PERMISSIONS,
  canSeeNavItem,
  getMyAdminIdentity,
} from "@/lib/admin-permissions";
import { cn } from "@/lib/utils";
import { Crumbs, type Crumb } from "@/components/routing/crumbs";
import { PageHeader } from "@/components/dashboard/PageHeader";

import type { LinkProps } from "@tanstack/react-router";

type AdminNavStrings = Translation["adminNav"];

interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: ReactNode;
  exact?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * The canonical admin navigation. Every item MUST point at a real, working
 * /admin/* route — no dead links — with one exception: /admin/team is the
 * super-admin-only Team page reserved by the admin-members work and auto-hides
 * for everyone else. Groups/items are trilingual via the `adminNav`
 * translation section.
 */
function buildNavGroups(t: AdminNavStrings): NavGroup[] {
  const items = t.items;
  const icon = "h-4 w-4";
  return [
    {
      id: "overview",
      label: t.groups.overview,
      items: [
        { label: items.dashboard, to: "/admin", icon: <LayoutDashboard className={icon} />, exact: true },
        { label: items.analytics, to: "/admin/analytics", icon: <BarChart3 className={icon} /> },
      ],
    },
    {
      id: "commerce",
      label: t.groups.commerce,
      items: [
        { label: items.orders, to: "/admin/orders", icon: <ShoppingBag className={icon} /> },
        { label: items.products, to: "/admin/products", icon: <Package className={icon} /> },
        { label: items.categories, to: "/admin/categories", icon: <FolderTree className={icon} /> },
        { label: items.officialStore, to: "/admin/official-store", icon: <BadgeCheck className={icon} /> },
        { label: items.reviews, to: "/admin/reviews", icon: <Star className={icon} /> },
      ],
    },
    {
      id: "marketplace",
      label: t.groups.marketplace,
      items: [
        { label: items.sellerApplications, to: "/admin/applications", icon: <FileText className={icon} /> },
        { label: items.sellers, to: "/admin/sellers", icon: <Users className={icon} /> },
        { label: items.stores, to: "/admin/stores", icon: <Store className={icon} /> },
        { label: items.customers, to: "/admin/customers", icon: <UserRound className={icon} /> },
        { label: items.verifications, to: "/admin/verifications", icon: <UserCheck className={icon} /> },
      ],
    },
    {
      id: "finance",
      label: t.groups.finance,
      items: [
        { label: items.settlements, to: "/admin/settlements", icon: <Wallet className={icon} /> },
        { label: items.commissions, to: "/admin/commissions", icon: <Percent className={icon} /> },
      ],
    },
    {
      id: "operations",
      label: t.groups.operations,
      items: [
        { label: items.shipping, to: "/admin/shipping", icon: <Truck className={icon} /> },
        { label: items.wilayas, to: "/admin/wilayas", icon: <MapPin className={icon} /> },
        { label: items.communes, to: "/admin/communes", icon: <Building2 className={icon} /> },
        { label: items.coupons, to: "/admin/coupons", icon: <Ticket className={icon} /> },
        { label: items.partnerCoupons, to: "/admin/partner-coupons", icon: <BadgePercent className={icon} /> },
        { label: items.notifications, to: "/admin/notifications", icon: <Bell className={icon} /> },
      ],
    },
    {
      id: "growth",
      label: t.groups.growth,
      items: [
        { label: items.partnerships, to: "/admin/partnerships", icon: <Handshake className={icon} /> },
        { label: items.partnerBanners, to: "/admin/partner-banners", icon: <Megaphone className={icon} /> },
        { label: items.reports, to: "/admin/reports", icon: <FileWarning className={icon} /> },
        { label: items.homepage, to: "/admin/homepage", icon: <LayoutTemplate className={icon} /> },
        { label: items.homepageBuilder, to: "/admin/homepage/builder", icon: <Hammer className={icon} /> },
        { label: items.media, to: "/admin/media", icon: <Images className={icon} /> },
        { label: items.banners, to: "/admin/banners", icon: <Flag className={icon} /> },
        { label: items.collections, to: "/admin/collections", icon: <Layers className={icon} /> },
        { label: items.buttons, to: "/admin/buttons", icon: <MousePointerClick className={icon} /> },
        { label: items.seo, to: "/admin/seo", icon: <Globe className={icon} /> },
      ],
    },
    {
      id: "system",
      label: t.groups.system,
      items: [
        { label: items.team, to: "/admin/team", icon: <UserCog className={icon} /> },
        { label: items.ai, to: "/admin/ai", icon: <Sparkles className={icon} /> },
        { label: items.settings, to: "/admin/settings", icon: <Settings className={icon} /> },
        { label: items.security, to: "/admin/security", icon: <ShieldCheck className={icon} /> },
        { label: items.auditLogs, to: "/admin/audit", icon: <ScrollText className={icon} /> },
        { label: items.maintenance, to: "/admin/maintenance", icon: <Wrench className={icon} /> },
        { label: items.systemHealth, to: "/admin/system-health", icon: <Activity className={icon} /> },
      ],
    },
  ];
}

const EXPANDED_KEY = "modalia:admin-nav:expanded";
const ACTIVE_KEY = "modalia:admin-nav:active";

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

function NavLink({ item, compact }: { item: NavItem; compact?: boolean }) {
  return (
    <Link
      to={item.to}
      {...(item.exact ? { activeOptions: { exact: true } } : {})}
      activeProps={{ className: "bg-neutral-900 text-white font-medium shadow-sm dark:bg-white dark:text-neutral-900 [&_svg]:text-current" }}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100",
        compact && "shrink-0 whitespace-nowrap py-1.5",
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

/**
 * Collapsible sidebar group. Expanded groups + the active section persist in
 * localStorage so the sidebar looks the same after reload.
 */
function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const { pathname } = useLocation();
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [expanded, setExpanded] = useState<string[]>(() => {
    const stored = readStoredArray(EXPANDED_KEY);
    if (stored) return stored.filter((id) => groups.some((g) => g.id === id));
    const active = readStoredString(ACTIVE_KEY);
    const group = active ? groups.find((g) => g.items.some((i) => String(i.to) === active)) : undefined;
    if (group) return [group.id];
    return groups.map((g) => g.id);
  });

  const groupForPath = (path: string): NavGroup | undefined =>
    groups.find((g) => g.items.some((item) => itemMatches(item, path)));

  // Remember the current section; keep its group expanded.
  useEffect(() => {
    const activeItem = allItems.find((i) => itemMatches(i, pathname));
    if (activeItem) writeStored(ACTIVE_KEY, String(activeItem.to));
    const group = groupForPath(pathname);
    if (group) {
      setExpanded((prev) => {
        if (prev.includes(group.id)) return prev;
        const next = [...prev, group.id];
        writeStored(EXPANDED_KEY, JSON.stringify(next));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, allItems]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      writeStored(EXPANDED_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <nav className="space-y-4 p-4" aria-label="Admin">
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
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 transition-colors duration-200 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200",
                active && "text-neutral-900 dark:text-neutral-100",
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
                  <NavLink key={String(item.to)} item={item} />
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
 * Admin area chrome: sticky topbar with wordmark, global search and store
 * link; grouped collapsible left sidebar on lg+ (expanded groups + active
 * section persist in localStorage); horizontally scrollable nav under the
 * topbar on mobile. Breadcrumbs + page title + actions + content below.
 */
async function signOutAdmin() {
  await supabase.auth.signOut();
  window.location.assign("/");
}

export function AdminShell({
  title,
  subtitle,
  actions,
  breadcrumbs,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  children: ReactNode;
}) {
  const locale = useAdminLocale();
  const t = getTranslations(locale).adminNav;
  /**
   * Admin identity for nav filtering (UX only — server functions enforce).
   * While loading, the nav renders unfiltered to avoid a layout flash; on
   * error AdminGate owns the denied/error state, so we fall back to
   * unfiltered too. Groups that end up empty are dropped.
   */
  const identityQuery = useQuery({
    queryKey: ["admin-identity"],
    queryFn: () => getMyAdminIdentity(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const groups = useMemo(() => {
    const built = buildNavGroups(t);
    const identity = identityQuery.data;
    if (!identity) return built;
    return built
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          canSeeNavItem(ADMIN_NAV_PERMISSIONS[String(item.to)], {
            kind: identity.kind,
            permissions: identity.permissions,
          }),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [t, identityQuery.data]);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/admin" search={{ locale }} className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              M
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">MODALIA</span>
              <span className="text-caption text-muted-foreground">{t.areaLabel}</span>
            </span>
          </Link>
          <div className="flex-1" />
          <CommandBar />
          <QuickCreate />
          <NotificationBell
            scope="admin"
            locale={locale}
            t={getTranslations(locale).notifications}
            viewAllTo="/admin/notifications"
          />
          <Link
            to="/"
            search={{ locale }}
            className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">{t.viewStore}</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOutAdmin()}
            className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t.signOut}</span>
          </button>
        </div>
        {/* Mobile nav: compact horizontally-scrollable under the topbar */}
        <nav className="border-t lg:hidden" aria-label="Admin">
          <div className="flex gap-1 overflow-x-auto px-3 py-2">
            {allItems.map((item) => (
              <NavLink key={String(item.to)} item={item} compact />
            ))}
          </div>
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 self-start overflow-y-auto border-e border-neutral-200/80 bg-white dark:border-neutral-800/80 dark:bg-neutral-950 lg:block">
          <SidebarNav groups={groups} />
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
            {breadcrumbs && breadcrumbs.length > 0 ? <Crumbs items={breadcrumbs} /> : null}
            <PageHeader title={title} description={subtitle} actions={actions} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
