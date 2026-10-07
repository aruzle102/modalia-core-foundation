import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, LogOut, MailCheck, MailWarning, ShieldCheck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminCard, EmptyState, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { useSellerSession } from "@/components/seller/ui";
import { RouteError, RoutePending } from "@/components/routing/route-states";
import { supabase } from "@/integrations/supabase/client";
import { getLocale, getTranslations } from "@/lib/i18n";
import { errMsg } from "../admin/_shared";

export const Route = createFileRoute("/_authenticated/seller/security")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  pendingComponent: () => <RoutePending label="Loading security settings…" />,
  errorComponent: ({ reset }) => (
    <SellerShell eyebrow="Seller workspace" title="Security">
      <RouteError
        message="Security settings could not be loaded. Check your connection and try again."
        reset={reset}
      />
    </SellerShell>
  ),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Security — Seller — Modalia" },
      { name: "description", content: "Password, email verification and sign-in security for your seller account." },
    ],
  }),
  component: SellerSecurityPage,
});

function SellerSecurityPage() {
  const { locale } = Route.useSearch();
  const nav = useNavigate();
  const title = getTranslations(locale).sellerDashboardV8.nav.security;
  const { seller, userEmail } = useSellerSession();

  // Real auth data only — never invented. email_confirmed_at and last_sign_in_at
  // come straight from the signed-in Supabase user.
  const authQuery = useQuery({
    queryKey: ["seller-security-auth-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    retry: false,
  });

  const signOut = useMutation({
    mutationFn: async () => {
      // scope "global" ends every session on every device, not just this one.
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
    },
    onSuccess: () => {
      void nav({ to: "/seller/login", search: { locale }, replace: true });
    },
  });

  const mustResetPassword = seller?.mustResetPassword === true;
  const emailVerified = !!authQuery.data?.email_confirmed_at;
  const lastSignInAt = authQuery.data?.last_sign_in_at ?? null;

  return (
    <SellerShell eyebrow="Seller workspace" title={title}>
      <p className="text-body text-muted-foreground">
        "Review and manage your account's sign-in security — your password, your email verification, and your sessions."
      </p>

      {/* Clear warning while a temporary password is still active. */}
      {mustResetPassword ? (
        <div
          role="alert"
          className="mt-6 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold">Temporary password still active</p>
              <p className="mt-1 text-sm text-muted-foreground">
                "Your account is still using the temporary password created by the platform team. Change it to a password only you know before doing anything else."
              </p>
            </div>
          </div>
          <div className="sm:ms-auto sm:shrink-0">
            <Button type="button" size="sm" asChild>
              <Link to="/seller/change-password" search={{ locale }}>
                Change password now
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        {authQuery.isLoading ? (
          <TableSkeleton rows={3} />
        ) : authQuery.isError ? (
          <AdminCard>
            <EmptyState
              title="Account details could not be loaded"
              text={errMsg(authQuery.error)}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => authQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          </AdminCard>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Password */}
            <AdminCard
              title="Password"
              actions={<KeyRound className="size-5 text-muted-foreground" aria-hidden="true" />}
            >
              <StatusRow
                ok={!mustResetPassword}
                okText={mustResetPassword ? "Temporary password in use" : "Personal password set"}
                hint={
                  mustResetPassword
                    ? "Created by the platform team — change it now."
                    : "Last changed by you. Change it any time you suspect it may be known."
                }
              />
              <div className="mt-4">
                <Button type="button" variant={mustResetPassword ? "default" : "outline"} size="sm" asChild>
                  <Link to="/seller/change-password" search={{ locale }}>
                    Change password
                  </Link>
                </Button>
              </div>
            </AdminCard>

            {/* Email verification — real status from the auth user, nothing invented */}
            <AdminCard
              title="Email verification"
              actions={
                emailVerified ? (
                  <MailCheck className="size-5 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <MailWarning className="size-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                )
              }
            >
              <StatusRow
                ok={emailVerified}
                okText={emailVerified ? "Email verified" : "Email not verified"}
                hint={userEmail ?? "No sign-in email found on this session."}
              />
              {!emailVerified ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  "Password recovery goes through this email — verify it in your inbox or ask the platform team to resend the verification link."
                </p>
              ) : null}
            </AdminCard>

            {/* Session info — only what the client can actually know */}
            <AdminCard
              title="Current session"
              actions={<UserCheck className="size-5 text-muted-foreground" aria-hidden="true" />}
            >
              <dl className="space-y-2.5 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Signed in as</dt>
                  <dd className="font-medium break-all">{userEmail ?? "—"}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Last sign-in</dt>
                  <dd className="font-medium">{fmtDateTime(lastSignInAt, locale)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                "Detailed device and location history isn't tracked for seller accounts — only your current sign-in is shown here."
              </p>
            </AdminCard>

            {/* Sign out everywhere */}
            <AdminCard
              title="Sign out"
              actions={<ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />}
            >
              <p className="text-sm text-muted-foreground">
                "Ends your session on this device and every other device, in case a session was left open somewhere."
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={signOut.isPending}
                  onClick={() => signOut.mutate()}
                >
                  <LogOut className="size-4" />
                  {signOut.isPending ? "Signing out…" : "Sign out everywhere"}
                </Button>
                {signOut.isError ? (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {errMsg(signOut.error)}
                  </p>
                ) : null}
              </div>
            </AdminCard>
          </div>
        )}
      </div>
    </SellerShell>
  );
}

function StatusRow({ ok, okText, hint }: { ok: boolean; okText: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={
          ok
            ? "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-700 dark:text-green-400"
            : "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400"
        }
        aria-label={ok ? "OK" : "Needs attention"}
      >
        {ok ? <ShieldCheck className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
      </span>
      <div>
        <p className="text-sm font-semibold">{okText}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
