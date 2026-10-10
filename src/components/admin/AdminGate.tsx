import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogIn, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkAdminAccess } from "@/lib/admin-session.functions";
import { getLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type AdminSessionStatus = "checking" | "signed-out" | "denied" | "error" | "ready";

export interface AdminSession {
  status: AdminSessionStatus;
  error: string | null;
  userEmail: string | null;
  retry: () => void;
}

/**
 * Session + authorization state for the admin area.
 * Session comes from the Supabase browser client; authorization comes from
 * the `checkAdminAccess` server function (requireSupabaseAuth + is_super_admin).
 */
export function useAdminSession(): AdminSession {
  const [sessionReady, setSessionReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionReady(true);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signedIn = sessionReady && session !== null;

  const access = useQuery({
    queryKey: ["admin-access"],
    queryFn: () => checkAdminAccess(),
    enabled: signedIn,
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const queryErrorMessage =
    access.error instanceof Error
      ? access.error.message
      : access.error
        ? String(access.error)
        : null;

  let status: AdminSessionStatus = "checking";
  if (!sessionReady) {
    status = "checking";
  } else if (!session) {
    status = "signed-out";
  } else if (access.isPending) {
    // Only block on initial load, not background refetches
    status = "checking";
  } else if (access.isError) {
    status = queryErrorMessage?.includes("Forbidden") ? "denied" : "error";
  } else if (access.isSuccess) {
    status = "ready";
  }

  return {
    status,
    // Deliberately generic: server error text is never surfaced to the user.
    error: status === "error" ? "The admin access check failed." : null,
    userEmail: session?.user?.email ?? null,
    retry: () => {
      void access.refetch();
    },
  };
}

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

/** Sign out and land on the sign-in page (used to switch accounts). */
async function switchAccount(locale: string) {
  await supabase.auth.signOut();
  window.location.assign(`/auth?locale=${encodeURIComponent(locale)}`);
}

/**
 * Guards the admin area. Renders children only when the signed-in user is a
 * super_admin; otherwise shows a neutral access state card.
 *
 * Note: admin role grants are SQL-only (supabase/super_admin_bootstrap.sql).
 * This gate never exposes SQL, user IDs, or technical error detail.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status, userEmail, retry } = useAdminSession();
  const location = useLocation();
  // Preserve the originally requested admin page so sign-in returns here,
  // not to the homepage. Never trust a redirect blindly — /auth sanitizes it.
  const searchObj =
    typeof location.search === "object" && location.search !== null
      ? (location.search as Record<string, unknown>)
      : undefined;
  const locale = getLocale(
    typeof searchObj?.["locale"] === "string" ? searchObj["locale"] : undefined,
  );
  const redirectBack = location.pathname + (location.searchStr ? `?${location.searchStr}` : "");

  if (status === "checking") {
    return (
      <GateCard
        icon={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        title="Checking access…"
      >
        <p className="text-sm text-muted-foreground">Verifying your admin session.</p>
      </GateCard>
    );
  }

  if (status === "signed-out") {
    return (
      <GateCard
        icon={<LogIn className="h-6 w-6 text-muted-foreground" />}
        title="Sign in required"
        description="You need to sign in to access the admin area."
      >
        <Button asChild>
          <Link to="/auth" search={{ locale, redirect: redirectBack }}>
            Sign in
          </Link>
        </Button>
      </GateCard>
    );
  }

  if (status === "denied") {
    return (
      <GateCard
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Access denied"
        description="You're signed in, but this account doesn't have admin access."
      >
        {userEmail ? (
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{userEmail}</span>
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          If you believe this is a mistake, contact the site administrator.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/" search={{ locale }}>
              Back to store
            </Link>
          </Button>
          <Button type="button" variant="ghost" onClick={() => void switchAccount(locale)}>
            <LogOut className="me-2 h-4 w-4" />
            Switch account
          </Button>
        </div>
      </GateCard>
    );
  }

  if (status === "error") {
    return (
      <GateCard
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Something went wrong"
        description="The admin access check failed. Please try again — if the problem persists, contact the site administrator."
      >
        <Button type="button" variant="outline" onClick={retry}>
          <RefreshCw className="me-2 h-4 w-4" />
          Retry
        </Button>
      </GateCard>
    );
  }

  return <>{children}</>;
}
