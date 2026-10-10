import { useBlocker } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminCard, Field } from "@/components/admin/ui";
import { Stagger } from "@/components/motion";
import { Reveal } from "@/lib/motion";
import { getTranslations, localeDirections, type SupportedLocale } from "@/lib/i18n";
import { markOnboardingComplete, updateSellerProfile } from "@/lib/seller-support.functions";
import { updateStoreProfile } from "@/lib/seller-store.functions";
import { phonePattern } from "@/lib/localization";

export interface OnboardingProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface OnboardingStoreData {
  name: string;
  slug: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  logoPath: string;
  bannerPath: string;
}

const STEP_KEYS = ["welcome", "profile", "store", "done"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatStepOf(template: string, step: number, total: number): string {
  return template.replace("{step}", String(step)).replace("{total}", String(total));
}

/**
 * Guided seller onboarding wizard (Section 21).
 *
 * Steps: 1) Welcome → 2) Seller profile → 3) Store → 4) Done.
 * Every step's data is pre-filled from real server state (getSellerProfile /
 * getStoreStudio, loaded by the route) and persisted through the existing
 * server functions (updateSellerProfile / updateStoreProfile). The
 * admin-created store appears immediately and is never re-created here.
 * "Skip for now" records an explicit skip via markOnboardingComplete.
 * Resumable: the route renders this wizard whenever the owner is not yet
 * onboarded; already-onboarded owners see the complete state instead.
 */
export function OnboardingWizard({
  locale,
  initialProfile,
  initialStore,
  onComplete,
}: {
  locale: SupportedLocale;
  initialProfile: OnboardingProfileData;
  initialStore: OnboardingStoreData | null;
  onComplete: () => void;
}) {
  const t = getTranslations(locale).sellerOnboarding;
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const finishingRef = useRef(false);

  // Profile form (pre-filled from getSellerProfile).
  const [firstName, setFirstName] = useState(initialProfile.firstName);
  const [lastName, setLastName] = useState(initialProfile.lastName);
  const [email, setEmail] = useState(initialProfile.email);
  const [phone, setPhone] = useState(initialProfile.phone);

  // Store form (pre-filled from getStoreStudio; null when the admin has not
  // created the store yet — the step then shows an honest pending state).
  const [storeName, setStoreName] = useState(initialStore?.name ?? "");
  const [description, setDescription] = useState(initialStore?.description ?? "");
  const [contactEmail, setContactEmail] = useState(initialStore?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initialStore?.contactPhone ?? "");
  const [logoPath, setLogoPath] = useState(initialStore?.logoPath ?? "");
  const [bannerPath, setBannerPath] = useState(initialStore?.bannerPath ?? "");

  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Unsaved-changes guard: block in-app navigation while a form has unsaved
  // edits; the confirm dialog offers Stay / Leave.
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !finishingRef.current,
    enableBeforeUnload: false,
    withResolver: true,
  });

  function touch(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setDirty(true);
      setFieldError(null);
    };
  }

  function validateProfile(): string | null {
    if (firstName.trim().length < 1) return t.errFirstName;
    if (lastName.trim().length < 1) return t.errLastName;
    if (email.trim() && !EMAIL_RE.test(email.trim())) return t.errEmail;
    if (phone.trim() && !phonePattern().test(phone.trim())) return t.errPhone;
    return null;
  }

  function validateStore(): string | null {
    if (!initialStore) return null;
    if (storeName.trim().length < 2) return t.errStoreName;
    if (contactEmail.trim() && !EMAIL_RE.test(contactEmail.trim())) return t.errEmail;
    if (contactPhone.trim() && !phonePattern().test(contactPhone.trim())) return t.errPhone;
    return null;
  }

  async function saveProfile(): Promise<boolean> {
    const problem = validateProfile();
    if (problem) {
      setFieldError(problem);
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateSellerProfile({
        data: {
          legalName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        },
      });
      setDirty(false);
      return true;
    } catch {
      setSaveError(t.errSave);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveStore(): Promise<boolean> {
    const problem = validateStore();
    if (problem) {
      setFieldError(problem);
      return false;
    }
    if (!initialStore) return true;
    setSaving(true);
    setSaveError(null);
    try {
      await updateStoreProfile({
        data: {
          name: storeName.trim(),
          description: description.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          logoPath: logoPath.trim() || undefined,
          bannerPath: bannerPath.trim() || undefined,
        },
      });
      setDirty(false);
      return true;
    } catch {
      setSaveError(t.errSave);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      if (await saveProfile()) setStep(2);
      return;
    }
    if (step === 2) {
      if (await saveStore()) setStep(3);
    }
  }

  async function handleFinish(skipped: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      finishingRef.current = true;
      await markOnboardingComplete({ data: { skipped } });
      onComplete();
    } catch {
      finishingRef.current = false;
      setSaveError(t.errSave);
    } finally {
      setSaving(false);
    }
  }

  const storeUrl =
    initialStore && typeof window !== "undefined"
      ? `${window.location.origin}/store/${initialStore.slug}`
      : initialStore
        ? `/store/${initialStore.slug}`
        : null;

  return (
    <div dir={localeDirections[locale]}>
      {/* Stepper */}
      <nav aria-label={formatStepOf(t.stepOf, step + 1, STEP_KEYS.length)}>
        <div role="list" aria-hidden="false">
          <Stagger className="flex flex-1 items-center gap-2" stepMs={70} maxMs={280}>
            {STEP_KEYS.map((key, index) => {
              const done = index < step;
              const current = index === step;
              return (
                <div key={key} role="listitem" className="flex flex-1 items-center gap-2 last:flex-none">
                  <span
                    aria-current={current ? "step" : undefined}
                    className={
                      current
                        ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-background"
                        : done
                          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-white"
                          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm text-muted-foreground"
                    }
                  >
                    {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <span aria-hidden="true">{index + 1}</span>}
                  </span>
                  <span
                    className={
                      current
                        ? "hidden text-small font-medium text-foreground sm:inline"
                        : "hidden text-small text-muted-foreground sm:inline"
                    }
                  >
                    {t.steps[key]}
                  </span>
                  {index < STEP_KEYS.length - 1 ? (
                    <span className="mx-1 h-px flex-1 bg-border" aria-hidden="true" />
                  ) : null}
                </div>
              );
            })}
          </Stagger>
        </div>
        <p className="mt-3 text-caption text-muted-foreground">{formatStepOf(t.stepOf, step + 1, STEP_KEYS.length)}</p>
      </nav>

      <Reveal key={step} className="mt-6">
        <AdminCard>
          {step === 0 ? (
            <div>
              <h2 className="text-h2 text-foreground">{t.welcomeTitle}</h2>
              <p className="mt-2 text-body text-muted-foreground">{t.welcomeText}</p>
              <ul className="mt-5 space-y-3">
                {[t.welcomePoint1, t.welcomePoint2, t.welcomePoint3].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
                      aria-hidden="true"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-body text-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <h2 className="text-h2 text-foreground">{t.profileTitle}</h2>
              <p className="mt-2 text-body text-muted-foreground">{t.profileSub}</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field label={t.firstName} error={fieldError && firstName.trim().length < 1 ? fieldError : undefined}>
                  <Input value={firstName} onChange={(e) => touch(setFirstName)(e.target.value)} maxLength={100} autoComplete="given-name" />
                </Field>
                <Field label={t.lastName} error={fieldError && lastName.trim().length < 1 ? fieldError : undefined}>
                  <Input value={lastName} onChange={(e) => touch(setLastName)(e.target.value)} maxLength={100} autoComplete="family-name" />
                </Field>
                <Field label={t.email}>
                  <Input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => touch(setEmail)(e.target.value)}
                    maxLength={160}
                    autoComplete="email"
                    className="text-start"
                  />
                </Field>
                <Field label={t.phone}>
                  <Input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => touch(setPhone)(e.target.value)}
                    maxLength={30}
                    autoComplete="tel"
                    className="text-start"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h2 className="text-h2 text-foreground">{t.storeTitle}</h2>
              <p className="mt-2 text-body text-muted-foreground">{t.storeSub}</p>
              {initialStore ? (
                <div className="mt-6 grid gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t.storeName}>
                      <Input value={storeName} onChange={(e) => touch(setStoreName)(e.target.value)} maxLength={160} />
                    </Field>
                    <Field label={t.storeUrlLabel} hint={t.storeUrlNote}>
                      <Input dir="ltr" value={storeUrl ?? ""} readOnly aria-readonly="true" className="text-start" />
                    </Field>
                  </div>
                  <Field label={t.description}>
                    <Textarea value={description} onChange={(e) => touch(setDescription)(e.target.value)} maxLength={2000} rows={4} />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t.contactEmail}>
                      <Input
                        type="email"
                        dir="ltr"
                        value={contactEmail}
                        onChange={(e) => touch(setContactEmail)(e.target.value)}
                        maxLength={160}
                        className="text-start"
                      />
                    </Field>
                    <Field label={t.contactPhone}>
                      <Input
                        type="tel"
                        dir="ltr"
                        value={contactPhone}
                        onChange={(e) => touch(setContactPhone)(e.target.value)}
                        maxLength={30}
                        className="text-start"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t.logoPath} hint={t.logoHint}>
                      <Input dir="ltr" value={logoPath} onChange={(e) => touch(setLogoPath)(e.target.value)} maxLength={500} className="text-start" />
                    </Field>
                    <Field label={t.bannerPath} hint={t.bannerHint}>
                      <Input dir="ltr" value={bannerPath} onChange={(e) => touch(setBannerPath)(e.target.value)} maxLength={500} className="text-start" />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex items-start gap-3 rounded-md border border-info/30 bg-info/5 p-4">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
                  <div>
                    <p className="text-small font-medium text-foreground">{t.noStoreTitle}</p>
                    <p className="mt-1 text-small text-muted-foreground">{t.noStoreText}</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <h2 className="text-h2 text-foreground">{t.doneTitle}</h2>
              <p className="mt-2 text-body text-muted-foreground">{t.doneText}</p>
              <div className="mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand" aria-hidden="true">
                <Check className="h-7 w-7" />
              </div>
            </div>
          ) : null}

          {fieldError && step !== 0 && step !== 3 ? (
            <p role="alert" className="mt-5 rounded-md bg-destructive/10 p-3 text-small text-destructive">
              {fieldError}
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="mt-5 rounded-md bg-destructive/10 p-3 text-small text-destructive">
              {saveError}
            </p>
          ) : null}

          {/* Footer */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div>
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  {t.back}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {step < 3 ? (
                <Button variant="ghost" onClick={() => void handleFinish(true)} disabled={saving}>
                  {t.skip}
                </Button>
              ) : null}
              {step < 3 ? (
                <Button onClick={() => void handleContinue()} disabled={saving} className="pressable">
                  {saving ? t.saving : t.continue}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Button>
              ) : (
                <Button onClick={() => void handleFinish(false)} disabled={saving} className="pressable">
                  {saving ? t.saving : t.completeSetup}
                  <Check className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </AdminCard>
      </Reveal>

      {/* Unsaved-changes guard */}
      {blocker.status === "blocked" ? (
        <AlertDialog open onOpenChange={(open) => !open && blocker.reset()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.unsavedTitle}</AlertDialogTitle>
              <AlertDialogDescription>{t.unsavedText}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => blocker.reset()}>{t.unsavedStay}</AlertDialogCancel>
              <AlertDialogAction onClick={() => blocker.proceed()}>{t.unsavedLeave}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
