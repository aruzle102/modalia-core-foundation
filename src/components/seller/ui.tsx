import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSellerContext, getSellerAccessStatus } from "@/lib/seller-auth";
import type { SellerContext, SellerAccessState } from "@/lib/seller-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SellerSessionStatus = "checking" | "signed-out" | "not-seller" | "suspended" | "error" | "ready";

/** Why a signed-in user is blocked from the seller area (server-side check). */
export type SellerSuspendedReason = Extract<
  SellerAccessState,
  "pending" | "suspended" | "disabled" | "staff-deactivated"
>;

export interface SellerSession {
  status: SellerSessionStatus;
  error: string | null;
  seller: SellerContext | null;
  /** Set when status === "suspended": the server-side reason for the block. */
  suspendedReason: SellerSuspendedReason | null;
  userEmail: string | null;
  retry: () => void;
}

/**
 * Session + seller authorization state for the Seller OS.
 * Signed-in state comes from the Supabase browser client; seller context comes
 * from the `getSellerContext` server function (session-only resolution, never
 * trusts a client-supplied seller_id).
 */
export function useSellerSession(): SellerSession {
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

  const ctx = useQuery({
    queryKey: ["seller-context"],
    queryFn: () => getSellerContext(),
    enabled: signedIn,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // When the seller context is empty for a signed-in user, ask the server WHY
  // (suspended / disabled / pending account, deactivated staff) so the UI can
  // show a clear message instead of a confusing "not a seller" state.
  const access = useQuery({
    queryKey: ["seller-access"],
    queryFn: () => getSellerAccessStatus(),
    enabled: signedIn && ctx.isSuccess && !ctx.data.seller,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const queryErrorMessage =
    ctx.error instanceof Error ? ctx.error.message : ctx.error ? String(ctx.error) : null;

  let status: SellerSessionStatus = "checking";
  let suspendedReason: SellerSuspendedReason | null = null;
  if (!sessionReady) {
    status = "checking";
  } else if (!session) {
    status = "signed-out";
  } else if (ctx.isPending || ctx.isFetching) {
    status = "checking";
  } else if (ctx.isError) {
    status = "error";
  } else if (ctx.isSuccess && ctx.data.seller) {
    status = "ready";
  } else if (access.isPending || access.isFetching) {
    status = "checking";
  } else if (access.isError) {
    status = "error";
  } else if (access.isSuccess) {
    const a = access.data.access;
    if (a === "suspended" || a === "disabled" || a === "pending" || a === "staff-deactivated") {
      status = "suspended";
      suspendedReason = a;
    } else {
      status = "not-seller";
    }
  }

  return {
    status,
    error:
      status === "error"
        ? (queryErrorMessage ?? (access.error instanceof Error ? access.error.message : "Seller access check failed."))
        : null,
    seller: ctx.data?.seller ?? null,
    suspendedReason,
    userEmail: session?.user?.email ?? null,
    retry: () => {
      void ctx.refetch();
      void access.refetch();
    },
  };
}

/** Centered card used for the Seller OS access gates (signed-out / not-a-seller / error). */
export function SellerGateCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {icon}
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

/** Skeleton shown while the seller session is resolving. */
export function SellerShellSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking seller access…</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
