import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  TableSkeleton,
  Field,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getSiteSettings, updateSiteSettings } from "@/lib/admin-ops.functions";
import { getLocale, getTranslations } from "@/lib/i18n";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/seo")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ title: "SEO — Modalia Admin" }],
  }),
  component: SeoPage,
});

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

const CAPABILITIES = [
  {
    name: "Dynamic metadata",
    description: "Every page sets its own title, description and Open Graph / Twitter tags.",
    href: null as string | null,
  },
  {
    name: "JSON-LD structured data",
    description: "Product, Organization, Breadcrumb and FAQ schemas on the matching pages.",
    href: null,
  },
  {
    name: "Dynamic sitemap",
    description: "Generated from the live catalog and served at /sitemap.xml.",
    href: "/sitemap.xml",
  },
  {
    name: "robots.txt",
    description: "Crawler rules served at /robots.txt.",
    href: "/robots.txt",
  },
];

function SeoPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale).adminNav.items;
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: () => getSiteSettings({ data: {} }),
    retry: false,
  });

  const values = settingsQuery.data?.values ?? {};
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [allowIndex, setAllowIndex] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !hydrated) {
      setTitle(str(values["seo_title"]));
      setDescription(str(values["seo_description"]));
      setKeywords(str(values["seo_keywords"]));
      setAllowIndex(str(values["seo_robots_index"]) !== "noindex");
      setHydrated(true);
    }
  }, [settingsQuery.data, hydrated, values]);

  const save = useMutation({
    mutationFn: () =>
      updateSiteSettings({
        data: {
          values: {
            seo_title: title.trim(),
            seo_description: description.trim(),
            seo_keywords: keywords.trim(),
            seo_robots_index: allowIndex ? "index" : "noindex",
          },
        },
      }),
    onSuccess: (r) => {
      toast.success(`Saved ${r.saved} setting(s).`);
      queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <AdminGate>
      <AdminShell
        title={t.seo}
        subtitle="Default search-engine metadata for the storefront, plus the platform's SEO capabilities."
        breadcrumbs={[{ label: t.seo }]}
      >
        <div className="space-y-6">
          <AdminCard title="Default metadata" subtitle="Used when a page does not set its own tags.">
            {settingsQuery.isPending ? (
              <TableSkeleton rows={4} />
            ) : settingsQuery.isError ? (
              <EmptyState title="Could not load SEO settings" text={errMsg(settingsQuery.error)} />
            ) : (
              <div className="space-y-4">
                <Field label="Default site title">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Modalia — Premium Algerian Marketplace"
                  />
                </Field>
                <Field label="Default meta description" hint="~150 characters, shown in search results.">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Shop authentic Algerian products…"
                  />
                </Field>
                <Field label="Default keywords" hint="Comma-separated.">
                  <Input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="algeria, marketplace, shopping"
                  />
                </Field>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="seo-index">Allow search engines to index the storefront</Label>
                  <Switch id="seo-index" checked={allowIndex} onCheckedChange={setAllowIndex} />
                </div>
                <div>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save SEO settings"}
                  </Button>
                </div>
              </div>
            )}
          </AdminCard>

          <AdminCard title="Platform capabilities" subtitle="SEO infrastructure already serving the storefront.">
            <ul className="divide-y divide-border">
              {CAPABILITIES.map((c) => (
                <li key={c.name} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 max-w-xl">
                    <p className="font-medium">{c.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                  </div>
                  {c.href ? (
                    <a
                      href={c.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      Open
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </AdminCard>
        </div>
      </AdminShell>
    </AdminGate>
  );
}
