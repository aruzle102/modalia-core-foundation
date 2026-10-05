import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ExternalLink,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  ScrollText,
  ShoppingBag,
  Star,
  Ticket,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { CommandBar } from "./CommandBar";
import { cn } from "@/lib/utils";

import type { LinkProps } from "@tanstack/react-router";

interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: ReactNode;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/admin", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { label: "Orders", to: "/admin/orders", icon: <ShoppingBag className="h-4 w-4" /> },
  { label: "Applications", to: "/admin/applications", icon: <FileText className="h-4 w-4" /> },
  { label: "Sellers", to: "/admin/sellers", icon: <Users className="h-4 w-4" /> },
  { label: "Products", to: "/admin/products", icon: <Package className="h-4 w-4" /> },
  { label: "Categories", to: "/admin/categories", icon: <FolderTree className="h-4 w-4" /> },
  { label: "Reviews", to: "/admin/reviews", icon: <Star className="h-4 w-4" /> },
  { label: "Coupons", to: "/admin/coupons", icon: <Ticket className="h-4 w-4" /> },
  { label: "Shipping", to: "/admin/shipping", icon: <Truck className="h-4 w-4" /> },
  { label: "Settlements", to: "/admin/settlements", icon: <Wallet className="h-4 w-4" /> },
  { label: "Audit log", to: "/admin/audit", icon: <ScrollText className="h-4 w-4" /> },
];

function NavLink({ item, compact }: { item: NavItem; compact?: boolean }) {
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
 * Admin area chrome: sticky topbar with wordmark, global search and store
 * link; left sidebar on lg+; horizontally scrollable nav under the topbar
 * on mobile. Page title + actions + content below.
 */
export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/admin" search={{ locale: "en" }} className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight">Modalia OS</span>
          </Link>
          <div className="flex-1" />
          <CommandBar />
          <Link
            to="/"
            search={{ locale: "en" }}
            className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">View store</span>
          </Link>
        </div>
        {/* Mobile nav: compact horizontally-scrollable under the topbar */}
        <nav className="border-t lg:hidden" aria-label="Admin">
          <div className="flex gap-1 overflow-x-auto px-3 py-2">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} item={item} compact />
            ))}
          </div>
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 self-start overflow-y-auto border-e lg:block">
          <nav className="space-y-0.5 p-3" aria-label="Admin">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
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
