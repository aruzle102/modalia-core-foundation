import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
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
import { Field } from "@/components/admin/ui";
import {
  checkStoreSlug,
  provisionSeller,
  WIZARD_STAFF_PERMISSIONS,
  type ProvisionSellerResult,
} from "@/lib/admin-sellers.functions";

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
  /** When set, the wizard is prefilled from an approved application. */
  application?: WizardApplication | null;
  onCreated?: () => void;
};

const STEPS = [
  { key: "seller", label: "Seller info" },
  { key: "account", label: "Account" },
  { key: "store", label: "Store" },
  { key: "commission", label: "Commission" },
  { key: "permissions", label: "Permissions" },
  { key: "review", label: "Review" },
];

const PHONE_RE = /^\+213[5-7][0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "store"
  );
}

export function SellerOnboardingWizard({ open, onOpenChange, application, onCreated }: WizardProps) {
  const [step, setStep] = useState(0);
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
  const [commissionRate, setCommissionRate] = useState("10");
  const [role, setRole] = useState<"seller_owner" | "seller_staff">("seller_owner");
  const [staffTitle, setStaffTitle] = useState("");
  const [staffPermissions, setStaffPermissions] = useState<string[]>([]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  // The temporary password lives only in component state: shown once, never in a URL.
  const [result, setResult] = useState<ProvisionSellerResult | null>(null);
  const [copied, setCopied] = useState(false);

  // (Re)initialize only when the dialog transitions from closed to open —
  // never on parent re-renders while the wizard is open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open || wasOpen.current) {
      wasOpen.current = open;
      return;
    }
    wasOpen.current = true;
    setStep(0);
    setFieldError(null);
    setResult(null);
    setCopied(false);
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
    setCommissionRate("10");
    setRole("seller_owner");
    setStaffTitle("");
    setStaffPermissions([]);
  }, [open, application]);

  // Auto-suggest the slug from the store name until the admin edits it manually.
  useEffect(() => {
    if (!slugTouched) setSlug(slugifyName(storeName));
  }, [storeName, slugTouched]);

  // Debounced slug availability check.
  useEffect(() => {
    if (!open || !slug) {
      setSlugState(null);
      return;
    }
    setSlugChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await checkStoreSlug({ data: { slug } });
        setSlugState({ checked: res.slug, available: res.available, suggestion: res.suggestion });
      } catch {
        setSlugState(null);
      } finally {
        setSlugChecking(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [slug, open]);

  const createMutation = useMutation({
    mutationFn: () =>
      provisionSeller({
        data: {
          applicationId: application?.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          storeName: storeName.trim(),
          storeSlug: slug,
          storeDescription: storeDescription.trim() || undefined,
          commissionRate: Number(commissionRate),
          role,
          staffTitle: role === "seller_staff" ? staffTitle.trim() || undefined : undefined,
          staffPermissions: role === "seller_staff" ? staffPermissions : [],
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      setCopied(false);
      toast.success("Seller and store created.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stepError = useMemo((): string | null => {
    switch (STEPS[step]?.key) {
      case "seller":
        if (firstName.trim().length < 2) return "First name is required (min 2 characters).";
        if (lastName.trim().length < 2) return "Last name is required (min 2 characters).";
        if (!PHONE_RE.test(phone.trim())) return "Use an Algerian mobile number, e.g. +213551234567.";
        if (!EMAIL_RE.test(email.trim())) return "Enter a valid email address.";
        return null;
      case "account":
        return null;
      case "store": {
        if (storeName.trim().length < 2) return "Store name is required (min 2 characters).";
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
          return "Slug may only contain lowercase letters, numbers and dashes.";
        if (slugState && slugState.checked === slug && !slugState.available)
          return `This slug is taken${slugState.suggestion ? ` — try “${slugState.suggestion}”.` : "."}`;
        return null;
      }
      case "commission": {
        const n = Number(commissionRate);
        if (!Number.isFinite(n) || n < 0 || n > 100) return "Commission must be between 0 and 100%.";
        return null;
      }
      case "permissions":
        if (role === "seller_staff" && staffPermissions.length === 0)
          return "Choose at least one permission for a staff account.";
        return null;
      default:
        return null;
    }
  }, [step, firstName, lastName, phone, email, storeName, slug, slugState, commissionRate, role, staffPermissions]);

  const goNext = () => {
    const err = stepError;
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const copyPassword = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tempPassword);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.tempPassword;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success("Temporary password copied.");
  };

  const close = () => {
    // Dropping `result` from state destroys the only copy of the temp password.
    setResult(null);
    onOpenChange(false);
    if (result) onCreated?.();
  };

  const done = result !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create seller &amp; store</DialogTitle>
          <DialogDescription>
            {application
              ? `Provisioning from approved application of ${application.first_name} ${application.last_name}.`
              : "Create a seller login, seller record, store, role and commission in one go."}
          </DialogDescription>
        </DialogHeader>

        {done && result ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  Seller account created — share this password securely
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  Created: login <span dir="ltr">{email.trim()}</span>, seller, store{" "}
                  <span dir="ltr">“{result.storeSlug}”</span>
                  {result.linkedExistingUser ? " (linked to an existing login; password rotated)" : ""}.
                  This temporary password is shown <strong>once</strong> and will never be displayed
                  again. Send it through a secure channel and ask the seller to change it on first
                  sign-in.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-background px-3 py-2 font-mono text-sm" dir="ltr">
                    {result.tempPassword}
                  </code>
                  <Button size="sm" onClick={copyPassword}>
                    {copied ? <Check className="size-4 me-1" /> : <Copy className="size-4 me-1" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={close}>
                  I have shared it securely — dismiss
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <ol className="flex flex-wrap items-center gap-1.5" aria-label="Wizard steps">
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      i === step
                        ? "bg-primary text-primary-foreground"
                        : i < step
                          ? "bg-primary/15 text-primary hover:bg-primary/25"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}. {s.label}
                  </button>
                  {i < STEPS.length - 1 && <span className="text-muted-foreground">·</span>}
                </li>
              ))}
            </ol>

            <div className="min-h-64 py-2">
              {STEPS[step]?.key === "seller" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="First name">
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </Field>
                  <Field label="Last name">
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </Field>
                  <Field label="Phone" hint="Algerian mobile, e.g. +213551234567.">
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="+213…" />
                  </Field>
                  <Field label="Email" hint="Becomes the seller login.">
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" type="email" />
                  </Field>
                </div>
              )}

              {STEPS[step]?.key === "account" && (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">Login account</p>
                    <p className="mt-1 text-muted-foreground">
                      A Supabase Auth login will be created for{" "}
                      <span className="font-medium text-foreground" dir="ltr">{email.trim() || "—"}</span>.
                      A secure temporary password is generated server-side and shown to you{" "}
                      <strong>once</strong> after creation. The seller must change it on first
                      sign-in. It is never placed in a URL and never logged.
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">What gets created</p>
                    <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
                      <li>Auth user (email confirmed)</li>
                      <li>Seller record with contact details</li>
                      <li>Store with a unique slug</li>
                      <li>Role assignment ({role === "seller_owner" ? "seller owner — full control" : "staff — limited permissions"})</li>
                      <li>Commission history entry</li>
                      <li>Audit log entry (no password stored)</li>
                    </ul>
                  </div>
                </div>
              )}

              {STEPS[step]?.key === "store" && (
                <div className="space-y-4">
                  <Field label="Store name">
                    <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
                  </Field>
                  <Field
                    label="Store slug"
                    hint={
                      slugChecking
                        ? "Checking availability…"
                        : slugState && slugState.checked === slug
                          ? slugState.available
                            ? "Available."
                            : `Taken${slugState.suggestion ? ` — suggestion: ${slugState.suggestion}` : "."}`
                          : "Lowercase letters, numbers and dashes."
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
                          Use suggestion
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label="Description" hint="Shown on the storefront. Optional.">
                    <Textarea
                      value={storeDescription}
                      onChange={(e) => setStoreDescription(e.target.value)}
                      rows={4}
                    />
                  </Field>
                </div>
              )}

              {STEPS[step]?.key === "commission" && (
                <Field label="Commission rate (%)" hint="Applies to future orders; every change is versioned in the commission history.">
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      dir="ltr"
                      className="w-32"
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground">
                      ={" "}
                      {Number.isFinite(Number(commissionRate))
                        ? (Number(commissionRate) / 100).toFixed(4)
                        : "—"}{" "}
                      as a fraction
                    </span>
                  </div>
                </Field>
              )}

              {STEPS[step]?.key === "permissions" && (
                <div className="space-y-4">
                  <RadioGroup
                    value={role}
                    onValueChange={(v) => setRole(v as "seller_owner" | "seller_staff")}
                    className="grid gap-3"
                  >
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                      <RadioGroupItem value="seller_owner" id="role-owner" className="mt-1" />
                      <Label htmlFor="role-owner" className="cursor-pointer">
                        <span className="font-medium">Seller owner</span>
                        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                          Full control over the store: products, orders, staff, settings.
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                      <RadioGroupItem value="seller_staff" id="role-staff" className="mt-1" />
                      <Label htmlFor="role-staff" className="cursor-pointer">
                        <span className="font-medium">Staff member</span>
                        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                          Limited access — choose the permissions below.
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>

                  {role === "seller_staff" && (
                    <div className="space-y-4 rounded-lg border p-4">
                      <Field label="Staff title" hint="e.g. Manager, Support.">
                        <Input
                          value={staffTitle}
                          onChange={(e) => setStaffTitle(e.target.value)}
                          placeholder="Staff"
                        />
                      </Field>
                      <div>
                        <p className="mb-2 text-sm font-medium">Permissions</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {WIZARD_STAFF_PERMISSIONS.map((p) => (
                            <label
                              key={p.key}
                              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={staffPermissions.includes(p.key)}
                                onCheckedChange={(checked) =>
                                  setStaffPermissions((prev) =>
                                    checked
                                      ? [...prev, p.key]
                                      : prev.filter((k) => k !== p.key),
                                  )
                                }
                              />
                              <span dir="ltr">{p.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {STEPS[step]?.key === "review" && (
                <div className="space-y-4">
                  <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Seller</dt>
                      <dd className="font-medium">
                        {firstName.trim()} {lastName.trim()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Login email</dt>
                      <dd className="font-medium" dir="ltr">{email.trim()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Phone</dt>
                      <dd className="font-medium" dir="ltr">{phone.trim()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Store</dt>
                      <dd className="font-medium">
                        {storeName.trim()} <span className="text-muted-foreground" dir="ltr">/{slug}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Commission</dt>
                      <dd className="font-medium">{commissionRate}%</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Role</dt>
                      <dd className="font-medium">
                        {role === "seller_owner"
                          ? "Seller owner (full control)"
                          : `Staff — ${staffPermissions.length} permission${staffPermissions.length === 1 ? "" : "s"}`}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-sm text-muted-foreground">
                    Creating will write real records: auth user, seller, store, role
                    {role === "seller_staff" ? ", staff permissions" : ""}, commission history and
                    audit log. The temporary password is shown once afterwards.
                  </p>
                  {createMutation.isError && (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {(createMutation.error as Error).message}
                    </p>
                  )}
                </div>
              )}
            </div>

            {fieldError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {fieldError}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" disabled={step === 0} onClick={() => { setFieldError(null); setStep((s) => s - 1); }}>
                <ArrowLeft className="size-4 me-1.5" />
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={goNext}>
                  Next
                  <ArrowRight className="size-4 ms-1.5" />
                </Button>
              ) : (
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="size-4 me-1.5 animate-spin" />}
                  {createMutation.isPending ? "Creating…" : "Create seller & store"}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
