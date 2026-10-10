import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/ui";
import { Reveal } from "@/lib/motion";
import { getSellerAccessStatus } from "@/lib/seller-auth";
import { getSellerProfile } from "@/lib/seller-support.functions";
import { getStoreStudio } from "@/lib/seller-store.functions";
import {
  OnboardingWizard,
  type OnboardingProfileData,
  type OnboardingStoreData,
} from "@/components/seller/OnboardingWizard";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/seller/onboarding")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () =>
    pageHead({
      title: "Seller setup — Modalia",
      description: "Complete your Modalia seller profile and store setup.",
      path: "/seller/onboarding",
      robots: "noindex,nofollow",
    }),
  component: SellerOnboardingPage,
});

type GateState = "checking" | "wizard" | "complete" | "load-error";

/**
 * Guided seller onboarding (Section 21). Standalone wizard — deliberately
 * NOT wrapped in SellerShell nav: it is the first thing a new owner sees.
 *
 * Gate chain (all server-verified):
 * - not active (suspended/disabled/pending/deactivated) → seller login
 *   (which signs the account out with a clear message);
 * - mustResetPassword → change-password first;
 * - staff (never onboarded) → seller dashboard;
 * - already onboarded → friendly "setup complete" state with dashboard link;
 * - otherwise the 4-step wizard, resumable on every visit.
 */
function SellerOnboardingPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).sellerOnboarding;
  const nav = useNavigate();

  const [gate, setGate] = useState<GateState>("checking");
  const [profile, setProfile] = useState<OnboardingProfileData | null>(null);
  const [store, setStore] = useState<OnboardingStoreData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getSellerAccessStatus();
        if (cancelled) return;
        if (status.access !== "active") {
          await nav({ href: `/seller/login?locale=${locale}`, replace: true });
          return;
        }
        if (status.mustResetPassword) {
          await nav({ href: `/seller/change-password?locale=${locale}`, replace: true });
          return;
        }
        // Staff members are invited with their own credentials and never
        // run the owner wizard.
        if (!status.isOwner) {
          await nav({ to: "/seller", search: { locale }, replace: true });
          return;
        }
        if (status.onboarded) {
          setGate("complete");
          return;
        }
        const [profileRes, storeRes] = await Promise.allSettled([getSellerProfile(), getStoreStudio()]);
        if (cancelled) return;
        if (profileRes.status === "rejected") {
          setGate("load-error");
          return;
        }
        const p = profileRes.value.profile;
        setProfile({
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone,
          wilaya: (p as { wilaya?: string }).wilaya ?? "",
          address: (p as { address?: string }).address ?? "",
        });
        if (storeRes.status === "fulfilled") {
          const s = storeRes.value.store;
          setStore({
            name: s.name ?? "",
            slug: s.slug ?? "",
            description: s.description ?? "",
            contactEmail: s.contact_email ?? "",
            contactPhone: s.contact_phone ?? "",
            logoPath: s.logo_path ?? "",
            bannerPath: s.banner_path ?? "",
          });
        } else {
          // No store row yet (admin still preparing it): the wizard shows an
          // honest pending state on the store step instead of forcing
          // re-creation. Any other store-load failure is a real error.
          const message = storeRes.reason instanceof Error ? storeRes.reason.message : "";
          if (message === "Store not found.") {
            setStore(null);
          } else {
            setGate("load-error");
            return;
          }
        }
        setGate("wizard");
      } catch {
        if (!cancelled) setGate("load-error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleComplete() {
    await nav({ to: "/seller", search: { locale }, replace: true });
  }

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background text-foreground">
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        <Reveal>
          <p className="text-wordmark text-foreground">MODALIA</p>
          <p className="mt-3 text-eyebrow text-muted-foreground">{t.eyebrow}</p>
          <h1 className="mt-1 text-display">{gate === "complete" ? t.completeTitle : t.title}</h1>
          <p className="mt-2 max-w-xl text-body text-muted-foreground">
            {gate === "complete" ? t.completeText : t.subtitle}
          </p>
        </Reveal>

        <div className="mt-8">
          {gate === "checking" ? (
            <AdminCard>
              <p className="text-small text-muted-foreground" role="status">
                {t.saving}
              </p>
            </AdminCard>
          ) : null}

          {gate === "load-error" ? (
            <AdminCard>
              <p className="text-body text-foreground" role="alert">
                {t.errLoad}
              </p>
              <Button className="mt-4" onClick={() => window.location.reload()}>
                {t.continue}
              </Button>
            </AdminCard>
          ) : null}

          {gate === "wizard" && profile ? (
            <OnboardingWizard locale={locale} initialProfile={profile} initialStore={store} onComplete={handleComplete} />
          ) : null}

          {gate === "complete" ? (
            <Reveal>
              <AdminCard>
                <div className="flex items-start gap-4">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
                    aria-hidden="true"
                  >
                    <CheckCircle2 className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-h3 text-foreground">{t.completeTitle}</p>
                    <p className="mt-1 text-body text-muted-foreground">{t.completeText}</p>
                    <Button className="mt-5 pressable" onClick={() => void nav({ to: "/seller", search: { locale }, replace: true })}>
                      {t.goToDashboard}
                    </Button>
                  </div>
                </div>
              </AdminCard>
            </Reveal>
          ) : null}
        </div>
      </main>
    </div>
  );
}
