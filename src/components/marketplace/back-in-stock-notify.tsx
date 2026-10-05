import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTranslations } from "@/lib/i18n";
import {
  getBackInStockStatus,
  subscribeBackInStock,
  unsubscribeBackInStock,
} from "@/lib/back-in-stock.functions";
import { supabase } from "@/integrations/supabase/client";
import type { SupportedLocale } from "@/config/platform";

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

export function BackInStockNotify({ variantId, locale }: { variantId: string; locale: SupportedLocale }) {
  const t = getTranslations(locale).product;
  const signedIn = useSignedIn();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Signed-in customers: read the real subscription state server-side.
  const statusQuery = useQuery({
    queryKey: ["back-in-stock-status", variantId],
    queryFn: () => getBackInStockStatus({ data: { variantId } }),
    enabled: signedIn && subscribed === null,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (statusQuery.data && subscribed === null) setSubscribed(statusQuery.data.subscribed);
  }, [statusQuery.data, subscribed]);

  const subscribe = useMutation({
    mutationFn: () =>
      subscribeBackInStock({
        data: { variantId, email: signedIn ? undefined : email.trim().toLowerCase() || undefined },
      }),
    onSuccess: () => {
      setSubscribed(true);
      setNotice(t.notifySubscribed);
      setError(null);
    },
    onError: () => {
      setError(t.notifyFailed);
      setNotice(null);
    },
  });

  const unsubscribe = useMutation({
    mutationFn: () =>
      unsubscribeBackInStock({
        data: { variantId, email: signedIn ? undefined : email.trim().toLowerCase() || undefined },
      }),
    onSuccess: () => {
      setSubscribed(false);
      setNotice(t.notifyUnsubscribed);
      setError(null);
    },
    onError: () => {
      setError(t.notifyFailed);
      setNotice(null);
    },
  });

  function handleSubscribe(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.invalidEmail);
      return;
    }
    subscribe.mutate();
  }

  if (subscribed) {
    return (
      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <p className="inline-flex items-center gap-2 text-small font-medium text-foreground">
          <Bell className="size-4" aria-hidden />
          {signedIn ? t.notifySignedIn : t.notifySubscribed}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => unsubscribe.mutate()}
          disabled={unsubscribe.isPending}
        >
          <BellOff className="size-4" aria-hidden />
          {unsubscribe.isPending ? t.subscribing : t.notifyUnsubscribe}
        </Button>
        {notice && notice !== t.notifySubscribed ? (
          <p className="mt-2 text-caption text-muted-foreground" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-caption text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubscribe} className="mt-4 rounded-2xl border border-border bg-card p-4">
      <p className="inline-flex items-center gap-2 text-small font-medium text-foreground">
        <Bell className="size-4" aria-hidden />
        {t.notifyMe}
      </p>
      <p className="mt-1.5 text-caption text-muted-foreground">{t.notifyText}</p>
      {!signedIn ? (
        <div className="mt-3">
          <Label htmlFor="bis-email" className="sr-only">
            {t.notifyEmail}
          </Label>
          <Input
            id="bis-email"
            type="email"
            value={email}
            maxLength={255}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.notifyEmail}
            dir="ltr"
            className="h-10"
          />
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-2 text-caption text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <Button type="submit" size="sm" className="mt-3 rounded-full" disabled={subscribe.isPending}>
        {subscribe.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.subscribing}
          </>
        ) : (
          t.notifySubscribe
        )}
      </Button>
    </form>
  );
}
