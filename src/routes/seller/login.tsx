import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        const { access, mustResetPassword, onboarded, isOwner } = await getSellerAccessStatus();
        if (cancelled) return;
        if (access === "active") {
          // New onboarding flow: sellers who haven't completed setup go to the
          // 4-step wizard (personal → store → appearance → credentials).
          // The wizard's final step replaces temp credentials, so we skip the
          // legacy change-password page for non-onboarded sellers.
          if (isOwner && !onboarded) {
            await nav({ href: `/seller/onboarding?locale=${locale}`, replace: true });
          } else if (mustResetPassword) {
            // Legacy flow: already-onboarded seller with a pending rotation.
            await nav({ href: `/seller/change-password?locale=${locale}`, replace: true });
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
      const { access, mustResetPassword, onboarded, isOwner } = await getSellerAccessStatus();
      if (access !== "active") {
        await supabase.auth.signOut();
        setMessageTone("error");
        setMessage(blockedMessage(t));
        return;
      }
      // New onboarding flow: non-onboarded sellers go to the 4-step wizard
      // (its final step replaces temp credentials).
      if (isOwner && !onboarded) {
        await nav({ href: `/seller/onboarding?locale=${locale}`, replace: true });
      } else if (mustResetPassword) {
        // Legacy flow: already-onboarded seller with a pending rotation.
        await nav({ href: `/seller/change-password?locale=${locale}`, replace: true });
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
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div>
            <p className="text-wordmark text-foreground">Modalia</p>
            <p className="mt-2 text-eyebrow text-muted-foreground">Seller OS</p>
            <h1 className="mt-1 text-display">{mode === "signin" ? t.loginTitle : t.forgotTitle}</h1>
          </div>
          <p className="mt-3 text-small text-muted-foreground">{mode === "signin" ? t.loginSub : t.forgotSub}</p>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn}>
              <label className="mt-7 block text-small">
                {t.identifier}
                <Input
                  className="mt-2"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder={t.identifierPlaceholder}
                  spellCheck={false}
                />
              </label>
              <label className="mt-5 block text-small">
                {t.password}
                <Input
                  className="mt-2"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              {message ? (
                <p
                  role="alert"
                  className={
                    messageTone === "error"
                      ? "mt-5 rounded-xl bg-destructive/10 p-3 text-small text-destructive"
                      : "mt-5 rounded-xl bg-muted p-3 text-small"
                  }
                >
                  {message}
                </p>
              ) : null}
              <Button className="mt-6 h-12 w-full rounded-full" disabled={loading}>
                {loading ? t.signingIn : t.signIn}
              </Button>
              <button
                type="button"
                className="mt-5 w-full text-small underline underline-offset-4"
                onClick={() => {
                  setMode("forgot");
                  setMessage("");
                }}
              >
                {t.forgotPassword}
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot}>
              <label className="mt-7 block text-small">
                {t.email}
                <Input className="mt-2" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required autoComplete="email" />
              </label>
              {message ? (
                <p
                  role="alert"
                  className={
                    messageTone === "error"
                      ? "mt-5 rounded-xl bg-destructive/10 p-3 text-small text-destructive"
                      : "mt-5 rounded-xl bg-muted p-3 text-small"
                  }
                >
                  {message}
                </p>
              ) : null}
              <Button className="mt-6 h-12 w-full rounded-full" disabled={loading}>
                {loading ? t.sending : t.sendResetLink}
              </Button>
              <button
                type="button"
                className="mt-5 w-full text-small underline underline-offset-4"
                onClick={() => {
                  setMode("signin");
                  setMessage("");
                }}
              >
                {t.backToSignIn}
              </button>
            </form>
          )}

          <p className="mt-7 text-center text-small text-muted-foreground">
            {t.noAccount}{" "}
            <Link to="/become-a-seller" search={{ locale }} className="underline underline-offset-4">
              {t.becomeSeller}
            </Link>
          </p>
          <Link to="/" search={{ locale }} className="mt-3 block text-center text-caption text-muted-foreground">
            {t.backToMarketplace}
          </Link>
        </div>
      </main>
    </div>
  );
}
