import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
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
import {
  checkLoginAllowed,
  clearLoginAttempts,
  isLoginRateLimitedError,
  resolveLoginRateLimitMessage,
} from "@/lib/auth-guard.functions";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

function sanitizeRedirect(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("://") || value.includes("\\")) return null;
  return value;
}
export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { locale: ReturnType<typeof getLocale>; redirect?: string | undefined } => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
  }),
  head: () =>
    pageHead({
      title: "Sign in — Modalia",
      description: "Sign in to your Modalia account to track orders and manage your wishlist.",
      path: "/auth",
      robots: "noindex,nofollow",
    }),
  component: AuthPage,
});
function AuthPage() {
  const { locale, redirect } = Route.useSearch();
  const t = getTranslations(locale);
  const ta = t.auth;
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const target = sanitizeRedirect(redirect);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password?locale=${locale}`,
        });
        if (error) throw error;
        setMessage(ta.resetLinkSent);
      } else if (mode === "signin") {
        // V8 Sec 57 #151: server-side brute-force gate BEFORE the password
        // check. Denied attempts get one generic, non-enumerating message.
        await checkLoginAllowed({ data: { identifier: email } });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Ownership proven: reset the brute-force bucket so stale failed
        // attempts (e.g. from before a password change) never lock out a
        // legitimate user. Best-effort — login already succeeded.
        void clearLoginAttempts().catch(() => {});
        if (target) {
          await nav({ href: target, replace: true });
        } else {
          await nav({ to: "/", search: { locale } });
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } },
        });
        if (error) throw error;
        if (data.user) {
          await supabase
            .from("profiles")
            .upsert({ id: data.user.id, display_name: name, preferred_locale: locale });
        }
        setMessage(ta.accountCreatedMsg);
      }
    } catch (err) {
      // V8 Sec 57 #151: the brute-force gate throws one generic code — map
      // it to the non-enumerating "too many attempts" message.
      if (isLoginRateLimitedError(err)) {
        setMessage(resolveLoginRateLimitMessage(locale, ta as unknown as Record<string, unknown>));
      } else {
        setMessage(
          err instanceof Error ? err.message : mode === "forgot" ? ta.resetFailed : ta.authFailed,
        );
      }
    } finally {
      setLoading(false);
    }
  }
  const title =
    mode === "signin" ? ta.welcomeBack : mode === "signup" ? ta.createAccount : ta.forgotTitle;
  const sub = mode === "signin" ? ta.signinSub : mode === "signup" ? ta.signupSub : ta.forgotSub;
  return (
    <AuthShell dir={localeDirections[locale]} lang={locale}>
      <SiteHeader locale={locale} t={t} />
      <AuthCenter className="min-h-[calc(100vh-16rem)]">
        <AuthCard eyebrow="MODALIA" title={title} subtitle={sub}>
          <form onSubmit={submit} className="space-y-5">
            {mode === "signup" ? (
              <AuthField label={ta.name}>
                <AuthInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  maxLength={100}
                />
              </AuthField>
            ) : null}
            <AuthField label={ta.email}>
              <AuthInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                maxLength={160}
              />
            </AuthField>
            {mode === "forgot" ? null : (
              <AuthField label={ta.password}>
                <AuthInput
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </AuthField>
            )}
            {message ? <AuthMessage>{message}</AuthMessage> : null}
            <AuthSubmit loading={loading} loadingLabel={ta.wait}>
              {mode === "forgot"
                ? ta.sendResetLink
                : mode === "signin"
                  ? ta.signin
                  : ta.createAccountCta}
            </AuthSubmit>
          </form>
          {mode === "signin" ? (
            <AuthTextButton onClick={() => setMode("forgot")}>{ta.forgotPassword}</AuthTextButton>
          ) : null}
          {mode === "forgot" ? (
            <AuthTextButton onClick={() => setMode("signin")}>{ta.backToSignIn}</AuthTextButton>
          ) : (
            <AuthTextButton onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? ta.needAccount : ta.haveAccount}
            </AuthTextButton>
          )}
          <Link
            to="/"
            search={{ locale }}
            className="mt-5 block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {ta.backToModalia}
          </Link>
        </AuthCard>
      </AuthCenter>
      <SiteFooter locale={locale} t={t} />
    </AuthShell>
  );
}
