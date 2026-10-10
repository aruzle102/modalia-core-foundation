import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { getTranslations, localeDirections, type SupportedLocale } from "@/lib/i18n";
import { ModaliaIntelligenceIcon } from "@/components/marketplace/ModaliaIntelligenceIcon";

const DISMISS_KEY = "modalia:onboarding-nudge:dismissed";

/**
 * Small dismissible card prompting the seller owner to finish the guided
 * onboarding wizard. Placement is owned by the dashboard (Worker B) — this
 * file only builds the component.
 */
export function OnboardingNudge({ locale }: { locale: SupportedLocale }) {
  const t = getTranslations(locale).sellerOnboarding;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable — dismissal just won't persist */
    }
    setDismissed(true);
  }

  return (
    <div
      dir={localeDirections[locale]}
      className="flex items-start gap-4 rounded-md border border-border bg-card p-5"
      role="region"
      aria-label={t.nudgeTitle}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand"
        aria-hidden="true"
      >
        <ModaliaIntelligenceIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-h3 text-foreground">{t.nudgeTitle}</p>
        <p className="mt-1 text-small text-muted-foreground">{t.nudgeText}</p>
        <Link
          to="/seller/onboarding"
          search={{ locale }}
          className="link-underline mt-3 inline-flex items-center gap-1.5 text-small font-medium text-foreground"
        >
          {t.nudgeCta}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.nudgeDismiss}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
