/**
 * MODALIA — Maintenance gate for the public storefront.
 *
 * Server-side enforced where possible:
 *  - the maintenance flag comes from `site_settings` via a public server
 *    function (never client-controlled state);
 *  - the admin bypass is verified by the `checkAdminAccess` server function.
 *
 * Admin, seller, auth and application routes are never gated, so nobody
 * gets locked out while maintenance is on.
 */
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { getPublicMaintenanceStatus } from "@/lib/maintenance.functions";
import { checkAdminAccess } from "@/lib/admin-session.functions";
import { getLocale, localeDirections } from "@/lib/i18n";

const BYPASS_PREFIXES = ["/admin", "/seller", "/auth", "/become-a-seller", "/reset-password"];

function MaintenancePage({ title, message }: { title: string; message: string }) {
  const locale = getLocale();
  return (
    <div
      dir={localeDirections[locale]}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Wrench className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <p className="mt-8 text-xs uppercase tracking-[0.2em] text-muted-foreground/60">
          Modalia
        </p>
      </div>
    </div>
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const status = useQuery({
    queryKey: ["public-maintenance-status"],
    queryFn: () => getPublicMaintenanceStatus(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  // Admin bypass: verified server-side. Any failure (anonymous, non-admin)
  // means "not an admin" — never blocks the maintenance page itself.
  const admin = useQuery({
    queryKey: ["maintenance-admin-bypass"],
    queryFn: () => checkAdminAccess().then(() => true),
    enabled: status.data?.enabled === true,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const neverGated = BYPASS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (neverGated) return <>{children}</>;

  // While the status is unknown, render the storefront — fail open so a
  // settings outage never takes the shop down by itself.
  if (!status.data?.enabled) return <>{children}</>;

  // Maintenance is on: admins pass through, everyone else sees the page.
  if (admin.data === true) return <>{children}</>;
  if (admin.isPending) return <>{children}</>;

  return <MaintenancePage title={status.data.title} message={status.data.message} />;
}
