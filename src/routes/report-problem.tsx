import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
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
import { submitProblemReport, getReportUploadUrl } from "@/lib/problem-reports.functions";

export const Route = createFileRoute("/report-problem")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [
      { title: "Report a problem — Modalia" },
      { name: "description", content: "Report an issue with your order, product, or account." },
    ],
  }),
  component: ReportProblemPage,
});

const CATEGORIES = [
  { value: "order", label: "Order" },
  { value: "product", label: "Product" },
  { value: "store", label: "Store" },
  { value: "payment", label: "Payment" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
] as const;

async function uploadImage(file: File): Promise<string> {
  const { signedUrl, path } = await getReportUploadUrl({
    data: { contentType: file.type as "image/jpeg" | "image/png" | "image/webp" },
  });
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed");
  // Public URL pattern for the bucket
  return path;
}

function ReportProblemPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    reporterName: "",
    reporterEmail: "",
    reporterPhone: "",
    category: "other",
    subject: "",
    description: "",
  });
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submitProblemReport({
        data: {
          reporterName: form.reporterName || undefined,
          reporterEmail: form.reporterEmail || undefined,
          reporterPhone: form.reporterPhone || undefined,
          category: form.category as (typeof CATEGORIES)[number]["value"],
          subject: form.subject,
          description: form.description,
          imageUrls: images,
        },
      }),
    onSuccess: () => setDone(true),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - images.length)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) continue;
        if (file.size > 5 * 1024 * 1024) continue;
        const path = await uploadImage(file);
        setImages((prev) => [...prev, path]);
      }
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  return (
    <div dir={localeDirections[locale]} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-3xl font-bold">Report a problem</h1>
          <p className="mt-2 text-muted-foreground">
            Tell us what went wrong — we'll look into it.
          </p>
        </div>

        {done ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <h2 className="mt-4 text-xl font-semibold">Report received</h2>
            <p className="mt-2 text-muted-foreground">Thank you — our team will review it shortly.</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div>
              <label className="mb-1 block text-sm font-medium">Category *</label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Subject *</label>
              <Input value={form.subject} onChange={set("subject")} required minLength={3} maxLength={200} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Describe the problem *</label>
              <Textarea
                value={form.description}
                onChange={set("description")}
                required
                minLength={20}
                maxLength={5000}
                rows={5}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Photos (optional, up to 5)</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border">
                    <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Image {i + 1}
                    </span>
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {images.length < 5 ? (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:border-primary"
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-5 w-5" />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Name (optional)</label>
                <Input value={form.reporterName} onChange={set("reporterName")} maxLength={200} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email (optional)</label>
                <Input type="email" value={form.reporterEmail} onChange={set("reporterEmail")} maxLength={254} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Phone (optional)</label>
                <Input value={form.reporterPhone} onChange={set("reporterPhone")} maxLength={40} />
              </div>
            </div>
            {mutation.isError ? (
              <p className="text-sm text-red-600">
                {(mutation.error as Error)?.message ?? "Submission failed."}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={mutation.isPending || uploading}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                "Submit report"
              )}
            </Button>
          </form>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
