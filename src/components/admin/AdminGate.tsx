import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { Check, Copy, Loader2, LogIn, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkAdminAccess } from "@/lib/admin-session.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AdminSessionStatus = "checking" | "signed-out" | "denied" | "error" | "ready";

export interface AdminSession {
  status: AdminSessionStatus;
  error: string | null;
  userEmail: string | null;
  userId: string | null;
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
  });

  const queryErrorMessage =
    access.error instanceof Error ? access.error.message : access.error ? String(access.error) : null;

  let status: AdminSessionStatus = "checking";
  if (!sessionReady) {
    status = "checking";
  } else if (!session) {
    status = "signed-out";
  } else if (access.isPending || access.isFetching) {
    status = "checking";
  } else if (access.isError) {
    status = queryErrorMessage?.includes("Forbidden") ? "denied" : "error";
  } else if (access.isSuccess) {
    status = "ready";
  }

  return {
    status,
    error:
      status === "error"
        ? (queryErrorMessage ?? "Authorization check failed.")
        : status === "denied"
          ? "Forbidden: super_admin role required"
          : null,
    userEmail: session?.user?.email ?? null,
    userId: session?.user?.id ?? null,
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
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

/**
 * Guards the admin area. Renders children only when the signed-in user is a
 * super_admin; otherwise shows a helpful access state card.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status, error, userEmail, userId, retry } = useAdminSession();
  const [copied, setCopied] = useState(false);

  if (status === "checking") {
    return (
      <GateCard icon={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />} title="Checking access…">
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
          <Link to="/auth" search={{ locale: "en" }}>Sign in</Link>
        </Button>
      </GateCard>
    );
  }

  if (status === "denied") {
    const sql = userId
      ? `INSERT INTO public.user_roles (user_id, role) VALUES ('${userId}', 'super_admin') ON CONFLICT (user_id, role) DO NOTHING;`
      : "";
    const copySql = async () => {
      if (!sql) return;
      try {
        await navigator.clipboard.writeText(sql);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    };
    return (
      <GateCard
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Access denied"
        description="This account is signed in but does not have the super_admin role."
      >
        <div className="w-full rounded-md bg-muted px-3 py-2 text-start text-xs">
          <p className="truncate text-muted-foreground">
            Email: <span className="text-foreground">{userEmail ?? "—"}</span>
          </p>
          <p className="truncate text-muted-foreground">
            User ID: <span className="font-mono text-foreground">{userId ?? "—"}</span>
          </p>
        </div>
        {sql ? (
          <div className="w-full">
            <p className="mb-1 text-xs text-muted-foreground">
              Run this in the Supabase SQL Editor to grant access:
            </p>
            <div className="relative rounded-md border bg-background p-2">
              <pre className="overflow-x-auto pe-10 text-start font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                {sql}
              </pre>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-1 top-1 h-7 w-7"
                onClick={copySql}
                aria-label="Copy SQL"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : null}
      </GateCard>
    );
  }

  if (status === "error") {
    return (
      <GateCard
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Something went wrong"
        description="The admin access check failed."
      >
        <p className={cn("w-full rounded-md bg-muted px-3 py-2 font-mono text-xs break-all text-start")}>
          {error ?? "Unknown error"}
        </p>
        <Button type="button" variant="outline" onClick={retry}>
          <RefreshCw className="me-2 h-4 w-4" />
          Retry
        </Button>
      </GateCard>
    );
  }

  return <>{children}</>;
}
