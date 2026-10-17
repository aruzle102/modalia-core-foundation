import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModaliLogo } from "@/components/brand/ModaliaLogo";
import { unsubscribeNewsletter } from "@/lib/engagement.functions";
import { getLocale, localeDirections } from "@/lib/i18n";
import { strParam } from "@/hooks/use-url-state";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: strParam(search["token"]),
    locale: strParam(search["locale"]) || "fr",
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { title: "Unsubscribe — Modalia" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token, locale } = Route.useSearch();
  const loc = getLocale(locale);
  const [done, setDone] = useState(false);

  const unsubMutation = useMutation({
    mutationFn: () => unsubscribeNewsletter({ data: { token: token ?? "" } }),
    onSuccess: () => setDone(true),
  });

  useEffect(() => {
    if (token && !done && !unsubMutation.isPending) {
      unsubMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const texts = {
    ar: { title: "إلغاء الاشتراك", success: "تم إلغاء اشتراكك بنجاح.", error: "رابط غير صالح.", retry: "حدث خطأ في الاتصال. حاول مجددًا.", retryButton: "إعادة المحاولة" },
    fr: { title: "Désinscription", success: "Désinscription réussie.", error: "Lien invalide.", retry: "Erreur de connexion. Veuillez réessayer.", retryButton: "Réessayer" },
    en: { title: "Unsubscribe", success: "Successfully unsubscribed.", error: "Invalid link.", retry: "Connection error. Please try again.", retryButton: "Retry" },
  }[loc];

  // The server returns "Invalid unsubscribe link." only for bad/used tokens.
  // Any other failure is a network or service error — offer a retry.
  const failureMessage = unsubMutation.error instanceof Error ? unsubMutation.error.message : "";
  const isInvalidLink = failureMessage === "Invalid unsubscribe link.";

  return (
    <div dir={localeDirections[loc]} className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <ModaliLogo className="h-10 w-auto" />
        </div>
        <h1 className="mb-6 text-xl font-semibold">{texts.title}</h1>

        {!token ? (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm text-muted-foreground">{texts.error}</p>
          </div>
        ) : unsubMutation.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : unsubMutation.isError ? (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm text-muted-foreground">{isInvalidLink ? texts.error : texts.retry}</p>
            {!isInvalidLink ? (
              <Button size="sm" onClick={() => unsubMutation.mutate()} disabled={unsubMutation.isPending}>
                {texts.retryButton}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="h-12 w-12 text-green-600" />
            <p className="text-sm">{texts.success}</p>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = `/?locale=${loc}`)}>
              {loc === "ar" ? "العودة للرئيسية" : loc === "fr" ? "Retour" : "Back home"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
