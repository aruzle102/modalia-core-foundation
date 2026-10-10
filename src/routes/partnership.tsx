import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { submitPartnershipRequest } from "@/lib/partnership.functions";

export const Route = createFileRoute("/partnership")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [
      { title: "Partnership — Modalia" },
      { name: "description", content: "Partner with Modalia: suppliers, distributors, brands." },
    ],
  }),
  component: PartnershipPage,
});

const TYPES = [
  { value: "supplier", label: "Supplier" },
  { value: "distributor", label: "Distributor" },
  { value: "brand", label: "Brand" },
  { value: "logistics", label: "Logistics" },
  { value: "general", label: "General cooperation" },
  { value: "other", label: "Other" },
] as const;

function PartnershipPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    partnershipType: "general",
    description: "",
    website: "",
  });
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submitPartnershipRequest({
        data: {
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone || undefined,
          partnershipType: form.partnershipType as (typeof TYPES)[number]["value"],
          description: form.description,
          website: form.website || undefined,
        },
      }),
    onSuccess: () => setDone(true),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div dir={localeDirections[locale]} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 text-center">
          <Building2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-3xl font-bold">Partner with Modalia</h1>
          <p className="mt-2 text-muted-foreground">
            Suppliers, distributors, brands — let's work together.
          </p>
        </div>

        {done ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <h2 className="mt-4 text-xl font-semibold">Request received</h2>
            <p className="mt-2 text-muted-foreground">
              Our team will review your request and contact you soon.
            </p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Company name *</label>
                <Input value={form.companyName} onChange={set("companyName")} required maxLength={200} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Contact name *</label>
                <Input value={form.contactName} onChange={set("contactName")} required maxLength={200} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Email *</label>
                <Input type="email" value={form.email} onChange={set("email")} required maxLength={254} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Phone (optional)</label>
                <Input value={form.phone} onChange={set("phone")} maxLength={40} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Partnership type *</label>
                <Select
                  value={form.partnershipType}
                  onValueChange={(v) => setForm((f) => ({ ...f, partnershipType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((ty) => (
                      <SelectItem key={ty.value} value={ty.value}>
                        {ty.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Website (optional)</label>
                <Input value={form.website} onChange={set("website")} maxLength={254} placeholder="https://" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Describe your proposal *</label>
              <Textarea
                value={form.description}
                onChange={set("description")}
                required
                minLength={20}
                maxLength={5000}
                rows={5}
                placeholder="Tell us about your company and how you'd like to cooperate…"
              />
            </div>
            {mutation.isError ? (
              <p className="text-sm text-red-600">
                {(mutation.error as Error)?.message ?? "Submission failed. Please try again."}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                "Submit partnership request"
              )}
            </Button>
          </form>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
