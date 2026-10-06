import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  checkLoginAllowed,
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
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-md items-center px-4 py-10"
      >
        <form
          onSubmit={submit}
          className="w-full rounded-3xl border border-border bg-card p-6 sm:p-8"
        >
          <p className="text-eyebrow text-muted-foreground">MODALIA</p>
          <h1 className="mt-2 text-display">{title}</h1>
          <p className="mt-3 text-small text-muted-foreground">{sub}</p>
          {mode === "signup" ? (
            <label className="mt-7 block text-small">
              {ta.name}
              <Input
                className="mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          ) : null}
          <label className="mt-5 block text-small">
            {ta.email}
            <Input
              className="mt-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {mode === "forgot" ? null : (
            <label className="mt-5 block text-small">
              {ta.password}
              <Input
                className="mt-2"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          {message ? <p className="mt-5 rounded-xl bg-muted p-3 text-small">{message}</p> : null}
          <Button className="mt-6 h-12 w-full rounded-full" disabled={loading}>
            {loading
              ? ta.wait
              : mode === "forgot"
                ? ta.sendResetLink
                : mode === "signin"
                  ? ta.signin
                  : ta.createAccountCta}
          </Button>
          {mode === "signin" ? (
            <button
              type="button"
              className="mt-4 w-full text-small underline underline-offset-4"
              onClick={() => setMode("forgot")}
            >
              {ta.forgotPassword}
            </button>
          ) : null}
          {mode === "forgot" ? (
            <button
              type="button"
              className="mt-4 w-full text-small underline underline-offset-4"
              onClick={() => setMode("signin")}
            >
              {ta.backToSignIn}
            </button>
          ) : (
            <button
              type="button"
              className="mt-5 w-full text-small underline underline-offset-4"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? ta.needAccount : ta.haveAccount}
            </button>
          )}
          <Link
            to="/"
            search={{ locale }}
            className="mt-5 block text-center text-caption text-muted-foreground"
          >
            {ta.backToModalia}
          </Link>
        </form>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
