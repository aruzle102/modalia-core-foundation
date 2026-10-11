import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
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
import { clearLoginAttempts } from "@/lib/auth-guard.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () =>
    pageHead({
      title: "Reset password — Modalia",
      description: "Set a new password for your Modalia account.",
      path: "/reset-password",
      robots: "noindex,nofollow",
    }),
  component: CustomerResetPasswordPage,
});

type Phase = "verifying" | "ready" | "invalid" | "done";

/**
 * Completion page for the Supabase password-recovery email link (customer accounts).
 * Handles both link shapes Supabase may emit:
 * - PKCE: `?code=…` → exchanged for a session explicitly.
 * - Implicit: `#access_token=…` → the client's detectSessionInUrl fires PASSWORD_RECOVERY.
 * The customer then sets a new password via updateUser; nothing is trusted
 * from the URL besides the recovery token itself.
 */
function CustomerResetPasswordPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const ta = t.auth;
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
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finish(true);
        return;
      }
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
      setMessage(ta.passwordMismatch);
      return;
    }
    if (password !== confirm) {
      setMessageTone("error");
      setMessage(ta.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Ownership proven via the recovery session: reset the brute-force
      // bucket so the new password works immediately on next sign-in.
      void clearLoginAttempts().catch(() => {});
      setPhase("done");
      setMessageTone("info");
      setMessage(ta.passwordUpdated);
    } catch {
      setMessageTone("error");
      setMessage(ta.authFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell dir={localeDirections[locale]} lang={locale}>
      <SiteHeader locale={locale} t={t} />
      <AuthCenter className="min-h-[calc(100vh-16rem)]">
        <AuthCard
          eyebrow="MODALIA"
          title={ta.setNewPassword}
          icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
        >
          {phase === "verifying" ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t.common.loading}
            </p>
          ) : phase === "invalid" ? (
            <div>
              <p className="text-sm text-muted-foreground">{ta.resetInvalid}</p>
              <Button asChild className="mt-6 h-12 w-full rounded-full text-[15px]">
                <Link to="/auth" search={{ locale }}>
                  {ta.backToSignIn}
                </Link>
              </Button>
            </div>
          ) : phase === "done" ? (
            <div>
              <AuthMessage tone={messageTone}>{message}</AuthMessage>
              <Button asChild className="mt-6 h-12 w-full rounded-full text-[15px]">
                <Link to="/auth" search={{ locale }}>
                  {ta.backToSignIn}
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleUpdate} className="space-y-5">
              <AuthField label={ta.newPassword}>
                <AuthInput
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </AuthField>
              <AuthField label={ta.confirmPassword}>
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
              <AuthSubmit loading={loading} loadingLabel={ta.wait}>
                {ta.setNewPassword}
              </AuthSubmit>
            </form>
          )}
        </AuthCard>
      </AuthCenter>
      <SiteFooter locale={locale} t={t} />
    </AuthShell>
  );
}
