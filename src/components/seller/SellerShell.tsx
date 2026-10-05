import { useMemo, type ReactNode } from "react";
import { getLocale, localeDirections } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import {
  BarChart3,
  ExternalLink,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  Package,
  Paintbrush,
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: ReactNode;
  exact?: boolean;
}

/** Every entry must correspond to a /seller/* route (created by the Phase 2 workers). */
const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/seller", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { label: "Orders", to: "/seller/orders", icon: <ShoppingBag className="h-4 w-4" /> },
  { label: "Products", to: "/seller/products", icon: <Package className="h-4 w-4" /> },
  { label: "Inventory", to: "/seller/inventory", icon: <Warehouse className="h-4 w-4" /> },
  { label: "Customers", to: "/seller/customers", icon: <Users className="h-4 w-4" /> },
  { label: "Store", to: "/seller/store", icon: <StoreIcon className="h-4 w-4" /> },
  { label: "Appearance", to: "/seller/appearance", icon: <Paintbrush className="h-4 w-4" /> },
  { label: "Coupons", to: "/seller/coupons", icon: <Ticket className="h-4 w-4" /> },
  { label: "Discounts", to: "/seller/promotions", icon: <Percent className="h-4 w-4" /> },
  { label: "Bundles", to: "/seller/bundles", icon: <Layers className="h-4 w-4" /> },
  { label: "Shipping", to: "/seller/shipping", icon: <Truck className="h-4 w-4" /> },
  { label: "Analytics", to: "/seller/analytics", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Reviews", to: "/seller/reviews", icon: <Star className="h-4 w-4" /> },
  { label: "Staff", to: "/seller/staff", icon: <UserCog className="h-4 w-4" /> },
  { label: "Commission", to: "/seller/commission", icon: <Percent className="h-4 w-4" /> },
  { label: "Settlements", to: "/seller/settlements", icon: <Wallet className="h-4 w-4" /> },
  { label: "Support", to: "/seller/support", icon: <LifeBuoy className="h-4 w-4" /> },
  { label: "AI Tools", to: "/seller/ai", icon: <Sparkles className="h-4 w-4" /> },
  { label: "Settings", to: "/seller/settings", icon: <Settings className="h-4 w-4" /> },
];

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

export function SellerShell({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { status, error, seller, retry } = useSellerSession();
  const locale = useSellerLocale();
  const dirProps = { dir: localeDirections[locale], lang: locale } as const;

  if (status === "checking") {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerShellSkeleton />
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div {...dirProps} className="min-h-screen bg-background text-foreground">
        <SellerGateCard
          icon={<LogIn className="h-6 w-6 text-muted-foreground" />}
          title="Sign in required"
          description="You need to sign in to access your seller workspace."
        >
          <Button asChild>
            <Link to="/auth" search={{ locale }}>
              Sign in
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
        </div>
        {/* Mobile nav: compact horizontally-scrollable under the topbar */}
        <nav className="border-t lg:hidden" aria-label="Seller">
          <div className="flex gap-1 overflow-x-auto px-3 py-2">
            {NAV_ITEMS.map((item) => (
              <SellerNavLink key={item.to} item={item} compact />
            ))}
          </div>
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 self-start overflow-y-auto border-e lg:block">
          <nav className="space-y-0.5 p-3" aria-label="Seller">
            {NAV_ITEMS.map((item) => (
              <SellerNavLink key={item.to} item={item} />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
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
