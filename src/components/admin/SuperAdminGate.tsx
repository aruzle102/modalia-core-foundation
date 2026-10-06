import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { getMyAdminIdentity } from "@/lib/admin-permissions";
import { useAdminLocale } from "./useAdminLocale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function GateCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {icon}
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Route guard for super-admin-only admin pages (team, commissions, settings,
 * audit, security). Rendered inside AdminGate, so session handling is already
 * done; this layer checks the caller's admin identity.
 *
 * - loading → neutral checking card (no content flashes, no data queries fire)
 * - not super_admin (or error) → the standard "Access denied" card, mirroring
 *   AdminGate's denied state
 * - super_admin → children
 *
 * Client-side UX only: the underlying server functions enforce the same
 * boundary via assertAdmin/assertSuperAdmin.
 */
export function SuperAdminGate({ children }: { children: ReactNode }) {
  const locale = useAdminLocale();
  // Shared cache key with AdminShell's nav filtering query.
  const identity = useQuery({
    queryKey: ["admin-identity"],
    queryFn: () => getMyAdminIdentity(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (identity.isPending) {
    return (
      <GateCard
        icon={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        title="Checking access…"
      >
        <p className="text-sm text-muted-foreground">Verifying your permissions.</p>
      </GateCard>
    );
  }

  if (identity.isError || identity.data?.kind !== "super_admin") {
    return (
      <GateCard
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Access denied"
        description="This area is restricted to super administrators."
      >
        <p className="text-sm text-muted-foreground">
          Your account doesn't have access to this page. If you believe this is a
          mistake, contact a super administrator.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/admin" search={{ locale }}>
              Back to admin
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/" search={{ locale }}>
              Back to store
            </Link>
          </Button>
        </div>
      </GateCard>
    );
  }

  return <>{children}</>;
}
