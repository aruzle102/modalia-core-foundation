import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModaliLogo } from "@/components/brand/ModaliaLogo";
import {
  validateInvitationToken,
  acceptAdminInvitation,
} from "@/lib/admin-invitations.functions";
import { getLocale, localeDirections } from "@/lib/i18n";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Accept Admin Invitation — Modalia" },
    ],
  }),
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { token } = Route.useParams();
  const { locale } = Route.useSearch() as { locale?: string };
  const loc = getLocale(typeof locale === "string" ? locale : undefined);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const validationQuery = useQuery({
    queryKey: ["invitation-validate", token],
    queryFn: () => validateInvitationToken({ data: { token } }),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptAdminInvitation({ data: { token, password } }),
    onSuccess: (result) => {
      toast.success("Account created! Please sign in.");
      navigate({ to: "/auth", search: { locale: loc, redirect: "/admin" } });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not accept invitation."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    acceptMutation.mutate();
  };

  return (
    <div
      dir={localeDirections[loc]}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <ModaliLogo className="h-10 w-auto" />
        </div>

        {validationQuery.isPending ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Validating invitation...</p>
          </div>
        ) : validationQuery.isError || !validationQuery.data?.valid ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold">Invalid Invitation</h1>
            <p className="text-sm text-muted-foreground">
              {validationQuery.data?.reason ?? "This invitation link is not valid."}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
              <h1 className="text-xl font-semibold">You're Invited!</h1>
              <p className="text-sm text-muted-foreground">
                {validationQuery.data.email} — Role:{" "}
                <span className="font-medium capitalize">
                  {validationQuery.data.role}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Set your password to activate your admin account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  minLength={8}
                  required
                  dir="ltr"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  minLength={8}
                  required
                  dir="ltr"
                  className="mt-1.5"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? "Creating account..." : "Accept & Create Account"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
