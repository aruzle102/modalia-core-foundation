import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AuthPage as AuthShell,
  AuthCard,
  AuthCenter,
  AuthField,
  AuthInput,
  AuthMessage,
  AuthSubmit,
} from "@/components/auth/AuthForm";
import { supabase } from "@/integrations/supabase/client";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/seller/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () =>
    pageHead({
      title: "Reset password — Modalia",
      description: "Set a new password for your Modalia seller account.",
      path: "/seller/reset-password",
      robots: "noindex,nofollow",
    }),
  component: SellerResetPasswordPage,
});

type Phase = "verifying" | "ready" | "invalid" | "done";

/**
 * Completion page for the Supabase password-recovery email link.
 * Handles both link shapes Supabase may emit:
 * - PKCE: `?code=…` → exchanged for a session explicitly.
 * - Implicit: `#access_token=…&type=recovery` → picked up by the browser
 *   client's detectSessionInUrl, which fires PASSWORD_RECOVERY.
 * The seller then sets a new password via updateUser; nothing is trusted
 * from the URL besides the recovery token itself.
 */
function SellerResetPasswordPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).sellerAuth;
  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const finish = (ok: boolean) => {
      if (!cancelled) setPhase(ok ? "ready" : "invalid");
    };

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        finish(!error);
        return;
      }
      // Hash-based recovery link (type=recovery): the client detects it on
      // load; give it a moment, then check for a live session.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finish(true);
        return;
      }
      // Fall back to the auth-state event in case detection is still in flight.
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" || session) finish(true);
      });
      const timer = window.setTimeout(() => {
        listener.subscription.unsubscribe();
        supabase.auth.getSession().then(({ data: d }) => finish(!!d.session));
      }, 2500);
      return () => {
        window.clearTimeout(timer);
        listener.subscription.unsubscribe();
      };
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessageTone("error");
      setMessage(t.passwordTooShort);
      return;
    }
    if (password !== confirm) {
      setMessageTone("error");
      setMessage(t.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPhase("done");
      setMessageTone("info");
      setMessage(t.passwordUpdated);
    } catch {
      setMessageTone("error");
      setMessage(t.updateFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell dir={localeDirections[locale]} lang={locale}>
      <AuthCenter className="min-h-screen">
        <AuthCard
          eyebrow="MODALIA · SELLER OS"
          title={phase === "invalid" ? t.linkTitle : t.resetTitle}
          subtitle={phase === "ready" ? t.resetSub : undefined}
          icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
        >
          {phase === "verifying" ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t.verifying}
            </p>
          ) : phase === "invalid" ? (
            <div>
              <p className="text-sm text-muted-foreground">{t.linkSub}</p>
              <Button asChild className="mt-6 h-12 w-full rounded-full text-[15px]">
                <Link to="/seller/login" search={{ locale }}>
                  {t.backToLogin}
                </Link>
              </Button>
            </div>
          ) : phase === "done" ? (
            <div>
              <AuthMessage tone={messageTone}>{message}</AuthMessage>
              <Button asChild className="mt-6 h-12 w-full rounded-full text-[15px]">
                <Link to="/seller/login" search={{ locale }}>
                  {t.backToLogin}
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleUpdate} className="space-y-5">
              <AuthField label={t.newPassword}>
                <AuthInput
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </AuthField>
              <AuthField label={t.confirmPassword}>
                <AuthInput
                  type="password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </AuthField>
              {message ? <AuthMessage tone={messageTone}>{message}</AuthMessage> : null}
              <AuthSubmit loading={loading} loadingLabel={t.updating}>
                {t.updatePassword}
              </AuthSubmit>
            </form>
          )}
        </AuthCard>
      </AuthCenter>
    </AuthShell>
  );
}
