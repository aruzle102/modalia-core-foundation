import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Minus,
  Plus,
  Store,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ConfirmDialog, Field } from "@/components/admin/ui";
import {
  checkStoreSlug,
  listSellers,
  provisionSeller,
  WIZARD_STAFF_PERMISSIONS,
  type ProvisionSellerResult,
} from "@/lib/admin-sellers.functions";
import { getDefaultCommissionRate } from "@/lib/admin-ops.functions";
import type { SellerPermission } from "@/lib/seller-auth";
import { useAdminT } from "@/components/admin/use-admin-t";

export type WizardApplication = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  proposed_store_name: string;
  business_description: string | null;
};

type WizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the wizard is prefilled from an approved application (owner mode, locked). */
  application?: WizardApplication | null;
  onCreated?: () => void;
};

type WizardMode = "owner" | "staff";

type PickedSeller = {
  id: string;
  legal_name: string;
  email: string | null;
  storeName: string | null;
};

const OWNER_STEP_KEYS = ["identity", "account", "store", "commission", "permissions", "review", "create"] as const;
const STAFF_STEP_KEYS = ["identity", "account", "seller", "review", "create"] as const;

const PERMISSION_GROUP_ORDER = [
  "products",
  "orders",
  "marketing",
  "customers",
  "store",
  "team",
  "reports",
  "support",
] as const;

const PHONE_RE = /^\+213[5-7][0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "store"
  );
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export function SellerOnboardingWizard({ open, onOpenChange, application, onCreated }: WizardProps) {
  const t = useAdminT().sellers.sellerWizard;
  // Step 0 = mode select (skipped when prefilled from an application: owner is locked).
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<WizardMode | null>(null);
  const [modePicked, setModePicked] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<
    { checked: string; available: boolean; suggestion: string | null } | null
  >(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [storeDescription, setStoreDescription] = useState("");
  const [storeLogoUrl, setStoreLogoUrl] = useState("");
  const [storeBannerUrl, setStoreBannerUrl] = useState("");
  const [storeContactEmail, setStoreContactEmail] = useState("");
  const [storeContactPhone, setStoreContactPhone] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");
  // Platform default commission (Admin > Settings > Default commission rate).
  // The wizard seeds its commission field from the freshest fetched value on
  // every open instead of a hardcoded 10 (registry #170).
  const defaultRateQuery = useQuery({
    queryKey: ["platform-default-commission-rate"],
    queryFn: () => getDefaultCommissionRate({ data: {} }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const latestDefaultRate = useRef<number | null>(null);
  useEffect(() => {
    if (defaultRateQuery.data) latestDefaultRate.current = defaultRateQuery.data.rate;
  }, [defaultRateQuery.data]);
  const seededCommissionDefault = () => String(latestDefaultRate.current ?? 10);
  const [staffTitle, setStaffTitle] = useState("");
  const [staffPermissions, setStaffPermissions] = useState<SellerPermission[]>([]);
  const [pickedSeller, setPickedSeller] = useState<PickedSeller | null>(null);
  const [sellerQuery, setSellerQuery] = useState("");
  const [sellerQueryDebounced, setSellerQueryDebounced] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // Section 19: the one-time credential result lives ONLY in component memory.
  const [result, setResult] = useState<ProvisionSellerResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // Snapshot for the result screen (so the review summary stays readable).
  const [resultMeta, setResultMeta] = useState<{ email: string; storeName: string; sellerName: string } | null>(null);

  const lockedOwner = application != null;
  const effectiveMode: WizardMode = mode ?? "owner";
  const stepKeys: readonly string[] =
    effectiveMode === "staff" ? STAFF_STEP_KEYS : OWNER_STEP_KEYS;
  const startStep = lockedOwner ? 1 : 0;
  const stepKey = step === 0 ? "mode" : stepKeys[step - 1];

  // (Re)initialize only when the dialog transitions from closed to open —
  // never on parent re-renders while the wizard is open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open || wasOpen.current) {
      wasOpen.current = open;
      return;
    }
    wasOpen.current = true;
    setStep(application ? 1 : 0);
    setMode(application ? "owner" : null);
    setModePicked(false);
    setFieldError(null);
    setConfirmDiscardOpen(false);
    setResult(null);
    setResultMeta(null);
    setShowPassword(false);
    setCopiedField(null);
    setSlugTouched(false);
    setSlugState(null);
    setFirstName(application?.first_name ?? "");
    setLastName(application?.last_name ?? "");
    setPhone(application?.phone ?? "");
    setEmail(application?.email ?? "");
    const name = application?.proposed_store_name ?? "";
    setStoreName(name);
    setSlug(slugifyName(name));
    setStoreDescription(application?.business_description ?? "");
    setStoreLogoUrl("");
    setStoreBannerUrl("");
    setStoreContactEmail("");
    setStoreContactPhone("");
    setCommissionRate(seededCommissionDefault());
    setStaffTitle("");
    setStaffPermissions([]);
    setPickedSeller(null);
    setSellerQuery("");
    setSellerQueryDebounced("");
  }, [open, application]);

  // Auto-suggest the slug from the store name until the admin edits it manually.
  useEffect(() => {
    if (!slugTouched) setSlug(slugifyName(storeName));
  }, [storeName, slugTouched]);

  // Debounced slug availability check (existing checkStoreSlug server fn).
  useEffect(() => {
    if (!open || !slug || effectiveMode !== "owner" || stepKey !== "store") {
      return;
    }
    setSlugChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await checkStoreSlug({ data: { slug } });
        setSlugState({ checked: res.slug, available: res.available, suggestion: res.suggestion });
      } catch {
        setSlugState(null);
      } finally {
        setSlugChecking(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [slug, open, effectiveMode, stepKey]);

  // Debounced seller search for the staff-mode picker (real sellers only).
  useEffect(() => {
    const timer = setTimeout(() => setSellerQueryDebounced(sellerQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [sellerQuery]);

  const sellerSearchQuery = useQuery({
    queryKey: ["wizard-seller-search", sellerQueryDebounced],
    queryFn: () => listSellers({ data: { q: sellerQueryDebounced || undefined, page: 1 } }),
    enabled: open && effectiveMode === "staff" && stepKey === "seller" && !pickedSeller,
  });

  const sellerOptions: PickedSeller[] = useMemo(() => {
    const items = sellerSearchQuery.data?.items ?? [];
    return items.map((s) => {
      const stores = (s as { stores?: { name: string }[] | null }).stores;
      return {
        id: s.id as string,
        legal_name: (s.legal_name as string) ?? "",
        email: (s.email as string | null) ?? null,
        storeName: Array.isArray(stores) && stores[0] ? (stores[0].name as string) : null,
      };
    });
  }, [sellerSearchQuery.data]);

  const createMutation = useMutation({
    mutationFn: () => {
      const person = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      };
      if (effectiveMode === "staff") {
        if (!pickedSeller) throw new Error(t.sellerRequired);
        return provisionSeller({
          data: {
            mode: "staff",
            ...person,
            sellerId: pickedSeller.id,
            staffTitle: staffTitle.trim() || undefined,
            staffPermissions,
          },
        });
      }
      return provisionSeller({
        data: {
          mode: "owner",
          applicationId: application?.id,
          ...person,
          storeName: storeName.trim(),
          storeSlug: slug || undefined,
          storeDescription: storeDescription.trim() || undefined,
          storeLogoUrl: storeLogoUrl.trim() || undefined,
          storeBannerUrl: storeBannerUrl.trim() || undefined,
          storeContactEmail: storeContactEmail.trim() || undefined,
          storeContactPhone: storeContactPhone.trim() || undefined,
          commissionRate: Number(commissionRate),
        },
      });
    },
    onSuccess: (res) => {
      setResult(res);
      setResultMeta({
        email: email.trim(),
        storeName: storeName.trim(),
        sellerName: pickedSeller?.legal_name ?? "",
      });
      setShowPassword(false);
      setCopiedField(null);
      toast.success(res.mode === "owner" ? t.createdOwner : t.createdStaff);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stepError = useMemo((): string | null => {
    switch (stepKey) {
      case "mode":
        return mode ? null : t.modeRequired;
      case "identity":
        if (firstName.trim().length < 2) return t.errors.firstName;
        if (lastName.trim().length < 2) return t.errors.lastName;
        if (!PHONE_RE.test(phone.trim())) return t.errors.phone;
        if (!EMAIL_RE.test(email.trim())) return t.errors.email;
        return null;
      case "account":
        return null;
      case "store": {
        if (storeName.trim().length < 2) return t.errors.storeName;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return t.errors.slug;
        if (storeContactEmail.trim() && !CONTACT_EMAIL_RE.test(storeContactEmail.trim()))
          return t.errors.contactEmail;
        if (slugState && slugState.checked === slug && !slugState.available)
          return t.errors.slugTaken(slugState.suggestion);
        return null;
      }
      case "commission": {
        const n = Number(commissionRate);
        if (!Number.isFinite(n) || n < 0 || n > 100) return t.errors.commission;
        return null;
      }
      case "permissions":
        return null; // owner mode: all 17 permissions granted, nothing to select.
      case "seller": {
        if (!pickedSeller) return t.sellerRequired;
        if (staffPermissions.length === 0) return t.errors.staffPerms;
        return null;
      }
      default:
        return null;
    }
  }, [
    stepKey,
    mode,
    t,
    firstName,
    lastName,
    phone,
    email,
    storeName,
    slug,
    slugState,
    storeContactEmail,
    commissionRate,
    pickedSeller,
    staffPermissions,
  ]);

  const goNext = () => {
    const err = stepError;
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError(null);
    setStep((s) => Math.min(s + 1, stepKeys.length));
  };

  const goBack = () => {
    setFieldError(null);
    setStep((s) => Math.max(s - 1, startStep));
  };

  const copyField = async (field: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedField(field);
      toast.success(t.copied);
    } else {
      toast.error(value);
    }
  };

  /** Any entered data that would be lost on close. */
  const hasUnsaved = useMemo(() => {
    if (modePicked) return true;
    if (pickedSeller) return true;
    if (staffPermissions.length > 0 || staffTitle.trim()) return true;
    const touched = [
      firstName,
      lastName,
      phone,
      email,
      storeName,
      storeDescription,
      storeLogoUrl,
      storeBannerUrl,
      storeContactEmail,
      storeContactPhone,
      sellerQuery,
    ];
    if (touched.some((v) => v.trim() !== "")) return true;
    if (commissionRate !== seededCommissionDefault()) return true;
    if (step !== startStep) return true;
    return false;
  }, [
    modePicked,
    pickedSeller,
    staffPermissions,
    staffTitle,
    firstName,
    lastName,
    phone,
    email,
    storeName,
    storeDescription,
    storeLogoUrl,
    storeBannerUrl,
    storeContactEmail,
    storeContactPhone,
    sellerQuery,
    commissionRate,
    step,
    startStep,
  ]);

  const doClose = () => {
    const hadResult = result !== null;
    setResult(null);
    setResultMeta(null);
    setConfirmDiscardOpen(false);
    onOpenChange(false);
    if (hadResult) onCreated?.();
  };

  const requestClose = () => {
    // The credential result exists only in memory — confirm before discarding it.
    if (result || hasUnsaved) setConfirmDiscardOpen(true);
    else doClose();
  };

  const done = result !== null;
  const lastStepIndex = stepKeys.length; // step indexes are 1-based over stepKeys

  const renderStepper = () => (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={t.wizardStepsLabel}>
      {stepKeys.map((key, i) => {
        const idx = i + 1;
        const state = idx === step ? "current" : idx < step ? "done" : "todo";
        return (
          <li key={key} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => idx < step && setStep(idx)}
              disabled={idx > step}
              aria-current={state === "current" ? "step" : undefined}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                state === "current"
                  ? "bg-primary text-primary-foreground"
                  : state === "done"
                    ? "bg-primary/15 text-primary hover:bg-primary/25"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {idx}. {(t.steps as Record<string, string>)[key]}
            </button>
            {i < stepKeys.length - 1 && <span className="text-muted-foreground">·</span>}
          </li>
        );
      })}
    </ol>
  );

  const renderModeStep = () => (
    <div className="space-y-4">
      <p className="text-sm font-medium">{t.modeTitle}</p>
      {lockedOwner && (
        <p className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-muted-foreground">
          {t.modeLockedOwner}
        </p>
      )}
      <RadioGroup
        value={mode ?? ""}
        onValueChange={(v) => {
          setMode(v as WizardMode);
          setModePicked(true);
        }}
        className="grid gap-3"
      >
        <div className="flex items-start gap-3 rounded-lg border p-4">
          <RadioGroupItem value="owner" id="mode-owner" className="mt-1" disabled={lockedOwner} />
          <Label htmlFor="mode-owner" className="flex flex-1 cursor-pointer items-start gap-3">
            <Store className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">{t.modeOwner}</span>
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                {t.modeOwnerDesc}
              </span>
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-3 rounded-lg border p-4">
          <RadioGroupItem value="staff" id="mode-staff" className="mt-1" disabled={lockedOwner} />
          <Label htmlFor="mode-staff" className="flex flex-1 cursor-pointer items-start gap-3">
            <Users className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">{t.modeStaff}</span>
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                {t.modeStaffDesc}
              </span>
            </span>
          </Label>
        </div>
      </RadioGroup>
    </div>
  );

  const renderIdentityStep = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={t.firstName}>
        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
      </Field>
      <Field label={t.lastName}>
        <Input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
      </Field>
      <Field label={t.phone} hint={t.phoneHint}>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          placeholder="+213…"
          inputMode="tel"
        />
      </Field>
      <Field label={t.email} hint={t.emailHint}>
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
          type="email"
          autoComplete="off"
        />
      </Field>
    </div>
  );

  const renderAccountStep = () => (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">{t.accountTitle}</p>
        <p className="mt-1 text-muted-foreground">
          {email.trim() ? (
            <>
              {t.accountBody(email.trim()).split(email.trim())[0]}
              <span className="font-medium text-foreground" dir="ltr">
                {email.trim()}
              </span>
              {t.accountBody(email.trim()).split(email.trim())[1]}
            </>
          ) : (
            t.accountBodyNoEmail
          )}
        </p>
      </div>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">{t.whatGetsCreated}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
          {(effectiveMode === "owner" ? t.getsCreatedOwner : t.getsCreatedStaff).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderStoreStep = () => (
    <div className="space-y-4">
      <Field label={t.storeName}>
        <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
      </Field>
      <Field
        label={t.slug}
        hint={
          slugChecking
            ? t.slugChecking
            : slugState && slugState.checked === slug
              ? slugState.available
                ? t.slugAvailable
                : t.slugTaken(slugState.suggestion)
              : t.slugHint
        }
      >
        <div className="flex gap-2">
          <Input
            value={slug}
            dir="ltr"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugifyName(e.target.value));
            }}
          />
          {slugState && !slugState.available && slugState.suggestion && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSlug(slugState.suggestion!);
                setSlugTouched(true);
              }}
            >
              {t.useSuggestion}
            </Button>
          )}
        </div>
      </Field>
      <Field label={t.storeDescription} hint={t.storeDescriptionHint}>
        <Textarea value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} rows={4} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.logoUrl} hint={t.logoUrlHint}>
          <Input
            value={storeLogoUrl}
            onChange={(e) => setStoreLogoUrl(e.target.value)}
            dir="ltr"
            placeholder="https://…"
            type="url"
          />
        </Field>
        <Field label={t.bannerUrl} hint={t.bannerUrlHint}>
          <Input
            value={storeBannerUrl}
            onChange={(e) => setStoreBannerUrl(e.target.value)}
            dir="ltr"
            placeholder="https://…"
            type="url"
          />
        </Field>
        <Field label={t.contactEmail} hint={t.contactInfoHint}>
          <Input
            value={storeContactEmail}
            onChange={(e) => setStoreContactEmail(e.target.value)}
            dir="ltr"
            type="email"
            placeholder="contact@…"
          />
        </Field>
        <Field label={t.contactPhone} hint={t.contactInfoHint}>
          <Input
            value={storeContactPhone}
            onChange={(e) => setStoreContactPhone(e.target.value)}
            dir="ltr"
            placeholder="+213…"
            inputMode="tel"
          />
        </Field>
      </div>
    </div>
  );

  const renderCommissionStep = () => (
    <Field label={t.commissionRate} hint={t.commissionHint}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="−1"
          onClick={() => {
            const n = Number(commissionRate);
            setCommissionRate(String(Number.isFinite(n) ? Math.max(0, n - 1) : 10));
          }}
        >
          <Minus className="size-4" />
        </Button>
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          dir="ltr"
          className="w-28 text-center"
          value={commissionRate}
          onChange={(e) => setCommissionRate(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="+1"
          onClick={() => {
            const n = Number(commissionRate);
            setCommissionRate(String(Number.isFinite(n) ? Math.min(100, n + 1) : 10));
          }}
        >
          <Plus className="size-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          ={" "}
          {Number.isFinite(Number(commissionRate)) ? (Number(commissionRate) / 100).toFixed(4) : "—"}{" "}
          {t.commissionAsFraction}
        </span>
      </div>
    </Field>
  );

  const renderOwnerPermissionsStep = () => (
    <div className="rounded-lg border p-4 text-sm">
      <p className="font-medium">{t.ownerPermsTitle}</p>
      <p className="mt-1 text-muted-foreground">{t.ownerPermsBody}</p>
    </div>
  );

  const togglePermission = (key: SellerPermission) =>
    setStaffPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const renderSellerStep = () => (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium">{t.chooseSeller}</p>
        {pickedSeller ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{pickedSeller.legal_name}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">
                {[pickedSeller.storeName, pickedSeller.email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPickedSeller(null)}>
              {t.changeSeller}
            </Button>
          </div>
        ) : (
          <>
            <Input
              value={sellerQuery}
              onChange={(e) => setSellerQuery(e.target.value)}
              placeholder={t.sellerSearchPlaceholder}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {sellerSearchQuery.isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t.searchingSellers}
                </p>
              ) : sellerOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noSellersFound}</p>
              ) : (
                sellerOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPickedSeller(s)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-start text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.legal_name}</span>
                      <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                        {[s.storeName, s.email].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Check className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <Field label={t.staffTitle} hint={t.staffTitleHint}>
        <Input value={staffTitle} onChange={(e) => setStaffTitle(e.target.value)} placeholder="Staff" />
      </Field>

      <div className="space-y-4">
        <p className="text-sm font-medium">{t.permissionsTitle}</p>
        {PERMISSION_GROUP_ORDER.map((group) => {
          const perms = WIZARD_STAFF_PERMISSIONS.filter((p) => p.group === group);
          if (!perms.length) return null;
          return (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {(t.permissionGroups as Record<string, string>)[group]}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {perms.map((p) => (
                  <label
                    key={p.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={staffPermissions.includes(p.key)}
                      onCheckedChange={() => togglePermission(p.key)}
                    />
                    <span dir="ltr">{(t.permissionLabels as Record<string, string>)[p.key]}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const rows: { label: string; value: string; ltr?: boolean }[] = [
      { label: `${t.firstName} ${t.lastName}`, value: `${firstName.trim()} ${lastName.trim()}`.trim() },
      { label: t.loginEmailLabel, value: email.trim(), ltr: true },
      { label: t.phone, value: phone.trim(), ltr: true },
    ];
    if (effectiveMode === "owner") {
      rows.push(
        { label: t.storeName, value: `${storeName.trim()} /${slug}`, ltr: true },
        { label: t.commissionRate, value: `${commissionRate}%` },
        { label: t.steps.permissions, value: t.reviewRoleOwner },
      );
    } else {
      rows.push(
        { label: t.sellerNameLabel, value: pickedSeller?.legal_name ?? "—" },
        { label: t.staffTitle, value: staffTitle.trim() || "Staff" },
        { label: t.permissionsTitle, value: t.reviewRoleStaff(staffPermissions.length) },
      );
    }
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-xs text-muted-foreground">{r.label}</dt>
              <dd className="font-medium" dir={r.ltr ? "ltr" : undefined}>
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
        {effectiveMode === "staff" && staffPermissions.length > 0 && (
          <div className="rounded-lg border p-4 text-sm">
            <p className="mb-2 font-medium">{t.permissionsTitle}</p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {staffPermissions.map((k) => (
                <li key={k} className="text-muted-foreground" dir="ltr">
                  {(t.permissionLabels as Record<string, string>)[k]}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-sm text-muted-foreground">{t.reviewHint}</p>
      </div>
    );
  };

  const renderCreateStep = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <h3 className="font-semibold">{t.readyTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {effectiveMode === "owner" ? t.readyOwner : t.readyStaff}
        </p>
      </div>
      {createMutation.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(createMutation.error as Error).message}
        </p>
      )}
    </div>
  );

  /** Section 19 — one-time credential delivery. State only, never persisted. */
  const renderResult = () => {
    if (!result || !resultMeta) return null;
    const isOwner = result.mode === "owner";
    const email = resultMeta.email;
    const storeUrl = result.storeSlug ? `/store/${result.storeSlug}` : null;
    const fields: { key: string; label: string; value: string; ltr: boolean }[] = [
      { key: "email", label: t.loginEmailLabel, value: email, ltr: true },
      { key: "password", label: t.tempPasswordLabel, value: result.tempPassword, ltr: true },
    ];
    if (isOwner) {
      if (resultMeta.storeName) fields.push({ key: "store", label: t.storeNameLabel, value: resultMeta.storeName, ltr: false });
      if (storeUrl) fields.push({ key: "url", label: t.storeUrlLabel, value: storeUrl, ltr: true });
    } else {
      if (resultMeta.sellerName) fields.push({ key: "seller", label: t.sellerNameLabel, value: resultMeta.sellerName, ltr: false });
    }
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-brand/40 bg-brand/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-brand">{t.resultTitle}</p>
              <p className="mt-1 text-sm text-brand/90">
                {isOwner
                  ? t.resultOwnerBody(email, result.storeSlug ?? "")
                  : t.resultStaffBody(email, resultMeta.sellerName)}
              </p>
              <p className="mt-2 text-sm font-medium text-brand">
                {t.onceWarning}
              </p>
            </div>
          </div>
        </div>

        <dl className="space-y-2">
          {fields.map((f) => (
            <div key={f.key} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0 flex-1">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd
                  className="truncate font-mono text-sm font-medium"
                  dir={f.ltr ? "ltr" : undefined}
                >
                  {f.key === "password" && !showPassword ? "••••••••••••••••" : f.value}
                </dd>
              </div>
              {f.key === "password" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t.hide : t.show}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => copyField(f.key, f.value)}>
                {copiedField === f.key ? (
                  <Check className="size-4 me-1" />
                ) : (
                  <Copy className="size-4 me-1" />
                )}
                {copiedField === f.key ? t.copied : t.copy}
              </Button>
            </div>
          ))}
        </dl>

        <p className="text-sm text-muted-foreground">{t.passwordChangeNote}</p>

        <Button className="w-full sm:w-auto" onClick={doClose}>
          {t.dismiss}
        </Button>
      </div>
    );
  };

  const renderStepBody = () => {
    switch (stepKey) {
      case "mode":
        return renderModeStep();
      case "identity":
        return renderIdentityStep();
      case "account":
        return renderAccountStep();
      case "store":
        return renderStoreStep();
      case "commission":
        return renderCommissionStep();
      case "permissions":
        return renderOwnerPermissionsStep();
      case "seller":
        return renderSellerStep();
      case "review":
        return renderReviewStep();
      case "create":
        return renderCreateStep();
      default:
        return null;
    }
  };

  const isLastStep = step === lastStepIndex;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {application
              ? t.descriptionWithApp(application.first_name, application.last_name)
              : t.description}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          renderResult()
        ) : (
          <>
            {step > 0 && renderStepper()}
            <div className="min-h-64 py-2">{renderStepBody()}</div>

            {fieldError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {fieldError}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" disabled={step <= startStep} onClick={goBack}>
                <ArrowLeft className="size-4 me-1.5" />
                {t.back}
              </Button>
              {isLastStep ? (
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="size-4 me-1.5 animate-spin" />}
                  {createMutation.isPending
                    ? t.creating
                    : effectiveMode === "owner"
                      ? t.createOwner
                      : t.createStaff}
                </Button>
              ) : (
                <Button onClick={goNext}>
                  {t.next}
                  <ArrowRight className="size-4 ms-1.5" />
                </Button>
              )}
            </div>
          </>
        )}

        <ConfirmDialog
          open={confirmDiscardOpen}
          onOpenChange={(next) => {
            if (!next) setConfirmDiscardOpen(false);
          }}
          title={t.unsavedTitle}
          description={t.unsavedDesc}
          confirmLabel={t.discard}
          danger
          onConfirm={doClose}
        />
      </DialogContent>
    </Dialog>
  );
}
