import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminCard } from "@/components/admin/ui";
import { getLocale, localeDirections } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import {
  checkStoreSlugAvailable,
  completeSellerOnboarding,
  getOnboardingStatus,
  listWilayasForOnboarding,
  saveOnboardingAppearance,
  saveOnboardingPersonalInfo,
  saveOnboardingStoreInfo,
  slugifyName,
} from "@/lib/seller-onboarding.functions";

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

const STEPS = ["Personal info", "Store info", "Appearance", "Credentials"] as const;

type CustomLink = { title: string; url: string };

function SellerOnboardingPage() {
  const { locale } = Route.useSearch();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — personal
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [address, setAddress] = useState("");
  const [idCard, setIdCard] = useState("");

  // Step 2 — store
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");

  // Step 3 — appearance
  const [logoPath, setLogoPath] = useState("");
  const [bannerPath, setBannerPath] = useState("");
  const [bio, setBio] = useState("");
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);

  // Step 4 — credentials
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => getOnboardingStatus(),
  });

  const wilayasQuery = useQuery({
    queryKey: ["onboarding-wilayas"],
    queryFn: () => listWilayasForOnboarding(),
  });

  // Already onboarded → dashboard
  useEffect(() => {
    if (statusQuery.data?.onboarded) {
      void nav({ to: "/seller", search: { locale } as never });
    }
  }, [statusQuery.data, nav, locale]);

  // Auto-suggest slug from store name
  useEffect(() => {
    if (!slugTouched && storeName) {
      setStoreSlug(slugifyName(storeName));
    }
  }, [storeName, slugTouched]);

  // Debounced slug availability check
  useEffect(() => {
    if (!storeSlug || storeSlug.length < 3) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const t = setTimeout(async () => {
      try {
        const r = await checkStoreSlugAvailable({ data: { slug: storeSlug } });
        setSlugStatus(r.available ? "ok" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [storeSlug]);

  // Pre-fill username with email when email changes
  useEffect(() => {
    if (email && !newUsername) setNewUsername(email.toLowerCase());
  }, [email, newUsername]);

  const next = async () => {
    setError("");
    setSaving(true);
    try {
      if (step === 0) {
        if (!firstName.trim() || !lastName.trim()) throw new Error("First and last name are required.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required.");
        if (phone.trim().length < 6) throw new Error("A valid phone number is required.");
        if (!wilaya) throw new Error("Please select your wilaya.");
        await saveOnboardingPersonalInfo({
          data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), wilaya, address: address.trim(), idCardNumber: idCard.trim() },
        });
        setStep(1);
      } else if (step === 1) {
        if (storeName.trim().length < 2) throw new Error("Store name is required (min 2 characters).");
        if (!/^[a-z0-9-]{3,60}$/.test(storeSlug)) throw new Error("Store URL must be 3–60 lowercase letters, numbers or hyphens.");
        if (slugStatus === "taken") throw new Error("This store URL is taken. Choose another.");
        await saveOnboardingStoreInfo({
          data: {
            storeName: storeName.trim(),
            storeSlug: storeSlug.trim(),
            description: description.trim(),
            contactEmail: contactEmail.trim(),
            contactPhone: contactPhone.trim(),
            facebookUrl: facebook.trim(),
            instagramUrl: instagram.trim(),
            tiktokUrl: tiktok.trim(),
          },
        });
        setStep(2);
      } else if (step === 2) {
        await saveOnboardingAppearance({
          data: { logoPath: logoPath.trim(), bannerPath: bannerPath.trim(), bio: bio.trim(), customLinks },
        });
        setStep(3);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newUsername.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    setSaving(true);
    try {
      await completeSellerOnboarding({ data: { newUsername: newUsername.trim(), newPassword } });
      void nav({ to: "/seller", search: { locale } as never });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete setup.");
    } finally {
      setSaving(false);
    }
  };

  if (statusQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const dir = localeDirections[locale];

  return (
    <div dir={dir} lang={locale} className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-eyebrow text-muted-foreground">Seller setup</p>
        <h1 className="mt-1 text-display">Welcome to Modalia</h1>
        <p className="mt-2 text-small text-muted-foreground">
          Complete these steps to activate your store.
        </p>

        {/* Stepper */}
        <nav aria-label="Setup progress" className="mt-6">
          <ol className="flex items-center gap-1">
            {STEPS.map((label, i) => (
              <li key={label} className="flex flex-1 items-center gap-1">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`grid size-8 place-items-center rounded-full text-xs font-bold ${
                      i < step
                        ? "bg-green-600 text-white"
                        : i === step
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground"
                    }`}
                    aria-current={i === step ? "step" : undefined}
                  >
                    {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span className="hidden text-[10px] text-muted-foreground sm:block">{label}</span>
                </div>
                {i < STEPS.length - 1 ? <div className="mb-5 h-px flex-1 bg-border" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        </nav>

        <AdminCard className="mt-6">
          {error ? (
            <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {step === 0 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Personal information</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fn">First name *</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ln">Last name *</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="em">Email * (will become your login)</Label>
                <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ph">Phone *</Label>
                <Input id="ph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wilaya">Wilaya *</Label>
                <Select value={wilaya} onValueChange={setWilaya}>
                  <SelectTrigger id="wilaya">
                    <SelectValue placeholder="Select wilaya" />
                  </SelectTrigger>
                  <SelectContent>
                    {(wilayasQuery.data?.wilayas ?? []).map((w: { id: string; code: string; name: string }) => (
                      <SelectItem key={w.id} value={w.code}>
                        {w.code} — {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr">Address (optional)</Label>
                <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idcard">ID card number (optional)</Label>
                <Input id="idcard" value={idCard} onChange={(e) => setIdCard(e.target.value)} />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Store information</h2>
              <div className="space-y-2">
                <Label htmlFor="sname">Store name *</Label>
                <Input id="sname" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sslug">Store URL *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">modalia.app/stores/</span>
                  <Input
                    id="sslug"
                    value={storeSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    required
                  />
                </div>
                {slugStatus === "checking" ? (
                  <p className="text-xs text-muted-foreground">Checking availability…</p>
                ) : slugStatus === "ok" ? (
                  <p className="text-xs text-green-600">Available ✓</p>
                ) : slugStatus === "taken" ? (
                  <p className="text-xs text-destructive">Already taken — choose another.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sdesc">Description</Label>
                <Textarea id="sdesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cemail">Contact email</Label>
                  <Input id="cemail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder={email || "Defaults to your email"} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cphone">Contact phone</Label>
                  <Input id="cphone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={phone || "Defaults to your phone"} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Social links (optional)</Label>
                <Input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="Facebook URL" />
                <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram URL" />
                <Input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="TikTok URL" />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Store appearance</h2>
              <div className="space-y-2">
                <Label htmlFor="logo">Logo image URL</Label>
                <Input id="logo" value={logoPath} onChange={(e) => setLogoPath(e.target.value)} placeholder="https://…" />
                {logoPath ? <img src={logoPath} alt="Logo preview" className="size-16 rounded-full object-cover" /> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner">Banner image URL</Label>
                <Input id="banner" value={bannerPath} onChange={(e) => setBannerPath(e.target.value)} placeholder="https://…" />
                {bannerPath ? <img src={bannerPath} alt="Banner preview" className="h-20 w-full rounded-xl object-cover" /> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sbio">Store bio</Label>
                <Textarea id="sbio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Tell customers about your store…" />
              </div>
              <div className="space-y-2">
                <Label>Custom links</Label>
                {customLinks.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={l.title} onChange={(e) => setCustomLinks(customLinks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" />
                    <Input value={l.url} onChange={(e) => setCustomLinks(customLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" />
                    <Button variant="ghost" size="icon" onClick={() => setCustomLinks(customLinks.filter((_, j) => j !== i))} aria-label="Remove link">
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
                {customLinks.length < 10 ? (
                  <Button variant="outline" size="sm" onClick={() => setCustomLinks([...customLinks, { title: "", url: "" }])}>
                    <Plus className="mr-1 size-4" aria-hidden /> Add link
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Change your login credentials</h2>
              <p className="text-sm text-muted-foreground">
                Replace the temporary credentials with your own. Your username can be your email.
              </p>
              <div className="space-y-2">
                <Label htmlFor="nuser">Username / login email *</Label>
                <Input id="nuser" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="npw">New password * (min 8 characters)</Label>
                <div className="relative">
                  <Input
                    id="npw"
                    type={showPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpw">Confirm password *</Label>
                <Input
                  id="cpw"
                  type={showPw ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex justify-between gap-3">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
                <ArrowLeft className="mr-1 size-4" aria-hidden /> Back
              </Button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <Button onClick={next} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Saving…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="ml-1 size-4" aria-hidden />
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Finishing…
                  </>
                ) : (
                  <>
                    <Check className="mr-1 size-4" aria-hidden /> Complete setup
                  </>
                )}
              </Button>
            )}
          </div>
        </AdminCard>
      </main>
    </div>
  );
}
