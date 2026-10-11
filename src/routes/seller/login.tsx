import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AuthPage as AuthShell,
  AuthCard,
  AuthCenter,
  AuthField,
  AuthInput,
  AuthMessage,
  AuthSubmit,
  AuthTextButton,
} from "@/components/auth/AuthForm";
import { supabase } from "@/integrations/supabase/client";
import { getSellerAccessStatus } from "@/lib/seller-auth";
import { resolveUsernameToEmail } from "@/lib/seller-identity";
import {
  checkLoginAllowed,
  clearLoginAttempts,
  isLoginRateLimitedError,
  resolveLoginRateLimitMessage,
} from "@/lib/auth-guard.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/seller/login")({
  validateSearch: (search: Record<string, unknown>): { locale: ReturnType<typeof getLocale>; redirect?: string | undefined } => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
  }),
  head: () =>
    pageHead({
      title: "Seller sign in — Modalia",
      description: "Sign in to your Modalia seller workspace.",
      path: "/seller/login",
      robots: "noindex,nofollow",
    }),
  component: SellerLoginPage,
});

/**
 * Accept only same-origin absolute paths so `?redirect=` can never be abused
 * as an open redirect. Anything else falls back to the seller workspace root.
 */
function sanitizeRedirect(value: string | undefined): string {
  if (!value) return "/seller";
  if (!value.startsWith("/")) return "/seller";
  if (value.startsWith("//") || value.includes("://") || value.includes("\\")) return "/seller";
  return value;
}

/**
 * V8 Sec 48 — every blocked state (suspended / disabled / pending seller,
 * deactivated staff, no seller account) is denied fail-closed with ONE
 * generic message. The sign-in page must never distinguish the states, so a
 * failed sign-in reveals nothing about the account behind the email.
 */
function blockedMessage(t: ReturnType<typeof getTranslations>["sellerAuth"]): string {
  return t.blockedGeneric;
}

function SellerLoginPage() {
  const { locale, redirect } = Route.useSearch();
  const t = getTranslations(locale).sellerAuth;
  const nav = useNavigate();
  const target = sanitizeRedirect(redirect);

  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  // Spec Section 8: sign-in accepts a USERNAME or an email. Usernames map
  // deterministically to the synthetic auth email; real emails pass through.
  const [identifier, setIdentifier] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Already signed in? Verify the seller account status server-side and skip
  // the login form straight to the intended route. Suspended/deactivated
  // accounts are signed out here with a clear message.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled || !data.session) return;
        const { access, onboarded, isOwner } = await getSellerAccessStatus();
        if (cancelled) return;
        if (access === "active") {
          // New onboarding flow: sellers who haven't completed setup go to the
          // 4-step wizard (personal → store → appearance → credentials).
          // Onboarding flow: non-onboarded owners go to the wizard.
          // Onboarded sellers go directly to dashboard - the wizard already
          // handled credential setup. Never force change-password after onboarding.
          if (isOwner && !onboarded) {
            await nav({ href: `/seller/onboarding?locale=${locale}`, replace: true });
          } else {
            await nav({ href: target, replace: true });
          }
        } else {
          await supabase.auth.signOut();
          setMessageTone("error");
          setMessage(blockedMessage(t));
        }
      } catch {
        // Stay on the login page on unexpected errors.
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      // Spec Section 8: resolve username -> synthetic auth email (or
      // pass a real email through). Invalid identifiers fail closed with
      // the same generic message as a bad password.
      const authEmail = resolveUsernameToEmail(identifier);
      // V8 Sec 57 #151: server-side brute-force gate BEFORE the password
      // check. Denied attempts get one generic, non-enumerating message.
      await checkLoginAllowed({ data: { identifier: identifier.trim() } });
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (error) throw error;
      // Ownership proven: reset the brute-force bucket so stale failed
      // attempts never lock out a legitimate user. Best-effort.
      void clearLoginAttempts().catch(() => {});
      // Server-side status check: suspended / disabled / pending sellers and
      // deactivated staff must not enter, with a clear reason.
      const { access, onboarded, isOwner } = await getSellerAccessStatus();
      if (access !== "active") {
        await supabase.auth.signOut();
        setMessageTone("error");
        setMessage(blockedMessage(t));
        return;
      }
      // New onboarding flow: non-onboarded sellers go to the 4-step wizard.
      // Onboarded sellers go directly to dashboard (wizard handled credentials).
      if (isOwner && !onboarded) {
        await nav({ href: `/seller/onboarding?locale=${locale}`, replace: true });
      } else {
        await nav({ href: target, replace: true });
      }
    } catch (err) {
      setMessageTone("error");
      setMessage(
        isLoginRateLimitedError(err)
          ? resolveLoginRateLimitMessage(locale, t as unknown as Record<string, unknown>)
          : t.signInFailed,
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      // Password reset is email-only: usernames have no inbox. The seller
      // must use the verified real email (post-transition).
      const resetEmail = forgotEmail.trim().toLowerCase();
      if (!resetEmail.includes("@")) throw new Error("email-required");
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/seller/reset-password?locale=${locale}`,
      });
      if (error) throw error;
      setMessageTone("info");
      setMessage(t.resetLinkSent);
    } catch {
      setMessageTone("error");
      setMessage(t.resetFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell dir={localeDirections[locale]} lang={locale}>
      <AuthCenter className="min-h-screen">
        <AuthCard
          eyebrow="MODALIA · SELLER OS"
          title={mode === "signin" ? t.loginTitle : t.forgotTitle}
          subtitle={mode === "signin" ? t.loginSub : t.forgotSub}
        >
          {checkingSession ? <span className="sr-only">{t.signingIn}</span> : null}
          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-5">
              <AuthField label={t.identifier}>
                <AuthInput
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder={t.identifierPlaceholder}
                  spellCheck={false}
                  maxLength={160}
                />
              </AuthField>
              <AuthField label={t.password}>
                <AuthInput
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </AuthField>
              {message ? <AuthMessage tone={messageTone}>{message}</AuthMessage> : null}
              <AuthSubmit loading={loading} loadingLabel={t.signingIn}>
                {t.signIn}
              </AuthSubmit>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-5">
              <AuthField label={t.email}>
                <AuthInput
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoComplete="email"
                  maxLength={160}
                />
              </AuthField>
              {message ? <AuthMessage tone={messageTone}>{message}</AuthMessage> : null}
              <AuthSubmit loading={loading} loadingLabel={t.sending}>
                {t.sendResetLink}
              </AuthSubmit>
            </form>
          )}
          {mode === "signin" ? (
            <AuthTextButton
              onClick={() => {
                setMode("forgot");
                setMessage("");
              }}
            >
              {t.forgotPassword}
            </AuthTextButton>
          ) : (
            <AuthTextButton
              onClick={() => {
                setMode("signin");
                setMessage("");
              }}
            >
              {t.backToSignIn}
            </AuthTextButton>
          )}
          <p className="mt-7 text-center text-sm text-muted-foreground">
            {t.noAccount}{" "}
            <Link
              to="/become-a-seller"
              search={{ locale }}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {t.becomeSeller}
            </Link>
          </p>
          <Link
            to="/"
            search={{ locale }}
            className="mt-3 block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {t.backToMarketplace}
          </Link>
        </AuthCard>
      </AuthCenter>
    </AuthShell>
  );
}
