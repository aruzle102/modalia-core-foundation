import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      await nav({ to: "/seller", search: { locale }, replace: true });
    } catch (err) {
      setMessageTone("error");
      setMessage(errorMessage(err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-eyebrow text-muted-foreground">MODALIA · SELLER OS</p>
              <h1 className="mt-1 text-display">{t.changeTitle}</h1>
            </div>
          </div>
          <p className="mt-3 text-small text-muted-foreground">{t.changeSub}</p>

          {checkingSession ? (
            <p className="mt-7 text-small text-muted-foreground">{t.signingIn}</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="mt-7 block text-small">
                {t.currentPassword}
                <Input
                  className="mt-2"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              <label className="mt-5 block text-small">
                {t.newPassword}
                <Input
                  className="mt-2"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="mt-5 block text-small">
                {t.confirmPassword}
                <Input
                  className="mt-2"
                  type="password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
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
                {loading ? t.changing : t.updatePassword}
              </Button>
            </form>
          )}

          <Link to="/" search={{ locale }} className="mt-5 block text-center text-caption text-muted-foreground">
            {t.backToMarketplace}
          </Link>
        </div>
      </main>
    </div>
  );
}
