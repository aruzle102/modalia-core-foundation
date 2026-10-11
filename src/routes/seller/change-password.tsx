import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import { changeSellerPassword, getSellerAccessStatus } from "@/lib/seller-auth";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/seller/change-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () =>
    pageHead({
      title: "Change your password — Modalia",
      description: "Set a new password for your Modalia seller account.",
      path: "/seller/change-password",
      robots: "noindex,nofollow",
    }),
  component: SellerChangePasswordPage,
});

/**
 * Forced password rotation for sellers provisioned by the admin.
 * The temporary password (shown once to the admin) expires after first
 * sign-in: the login page and the SellerShell gate route the owner here,
 * and the password only changes after proving knowledge of the temporary
 * one (verified server-side). Suspended / disabled / pending accounts are
 * signed out with the standard blocked message.
 */
function SellerChangePasswordPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).sellerAuth;
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const [checkingSession, setCheckingSession] = useState(true);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) {
          await nav({ href: `/seller/login?locale=${locale}`, replace: true });
          return;
        }
        // Suspended / disabled / pending owners must not reach this page.
        const { access } = await getSellerAccessStatus();
        if (cancelled) return;
        if (access !== "active") {
          await supabase.auth.signOut();
          await nav({ href: `/seller/login?locale=${locale}`, replace: true });
        }
      } catch {
        if (!cancelled) {
          await nav({ href: `/seller/login?locale=${locale}`, replace: true });
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function errorMessage(code: string): string {
    switch (code) {
      case "CURRENT_PASSWORD_INCORRECT":
        return t.currentWrong;
      case "PASSWORD_SAME_AS_CURRENT":
        return t.sameAsCurrent;
      default:
        return t.updateFailed;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
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
      await changeSellerPassword({ data: { currentPassword: current, newPassword: password } });
      setMessageTone("info");
      setMessage(t.passwordChanged);
      // Drop the stale seller context (which still has mustResetPassword=true).
      await queryClient.invalidateQueries({ queryKey: ["seller-context"] });
      // Fresh server check: a first-time owner who has not onboarded yet goes
      // to the guided setup; everyone else lands on the dashboard.
      const status = await getSellerAccessStatus().catch(() => null);
      if (status && status.isOwner && status.access === "active" && !status.onboarded) {
        await nav({ to: "/seller/onboarding", search: { locale }, replace: true });
      } else {
        await nav({ to: "/seller", search: { locale }, replace: true });
      }
    } catch (err) {
      setMessageTone("error");
      setMessage(errorMessage(err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell dir={localeDirections[locale]} lang={locale}>
      <AuthCenter className="min-h-screen">
        <AuthCard
          eyebrow="MODALIA · SELLER OS"
          title={t.changeTitle}
          subtitle={t.changeSub}
          icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
        >
          {checkingSession ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t.signingIn}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <AuthField label={t.currentPassword}>
                <AuthInput
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </AuthField>
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
              <AuthSubmit loading={loading} loadingLabel={t.changing}>
                {t.updatePassword}
              </AuthSubmit>
            </form>
          )}
          <Link
            to="/"
            search={{ locale }}
            className="mt-5 block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {t.backToMarketplace}
          </Link>
        </AuthCard>
      </AuthCenter>
    </AuthShell>
  );
}
