import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSellerContext } from "@/lib/seller-auth";
import type { SellerContext } from "@/lib/seller-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SellerSessionStatus = "checking" | "signed-out" | "not-seller" | "error" | "ready";

export interface SellerSession {
  status: SellerSessionStatus;
  error: string | null;
  seller: SellerContext | null;
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

  const queryErrorMessage =
    ctx.error instanceof Error ? ctx.error.message : ctx.error ? String(ctx.error) : null;

  let status: SellerSessionStatus = "checking";
  if (!sessionReady) {
    status = "checking";
  } else if (!session) {
    status = "signed-out";
  } else if (ctx.isPending || ctx.isFetching) {
    status = "checking";
  } else if (ctx.isError) {
    status = "error";
  } else if (ctx.isSuccess) {
    status = ctx.data.seller ? "ready" : "not-seller";
  }

  return {
    status,
    error: status === "error" ? (queryErrorMessage ?? "Seller access check failed.") : null,
    seller: ctx.data?.seller ?? null,
    userEmail: session?.user?.email ?? null,
    retry: () => {
      void ctx.refetch();
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
