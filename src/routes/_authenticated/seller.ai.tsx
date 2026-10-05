import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminCard, EmptyState, Field, TableSkeleton } from "@/components/admin/ui";
import { getSellerAiCatalog, type AiCatalogProduct } from "@/lib/seller-orders.functions";
import { getLocale } from "@/lib/i18n";
import { SellerShell } from "@/components/seller/SellerShell";
import { errMsg } from "../admin/_shared";

export const Route = createFileRoute("/_authenticated/seller/ai")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  head: () => ({ meta: [{ title: "AI tools — Seller — Modalia" }, { name: "description", content: "Rule-based writing helpers for your listings." }] }),
  component: SellerAiPage,
});

// ---------------------------------------------------------------------------
// Rule-based generators (deterministic, client-side — no external AI provider)
// ---------------------------------------------------------------------------

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).replace(/\s+\S*$/, "");
  return `${cut.trim()}…`;
}

function keywordsFor(product: AiCatalogProduct): string[] {
  const words = new Set<string>();
  const add = (text: string) => {
    for (const token of text.toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/i)) {
      if (token.length >= 3 && words.size < 12) words.add(token);
    }
  };
  add(product.name);
  if (product.category) add(product.category);
  for (const value of Object.values(product.attributes)) add(value);
  return [...words];
}

function seoPack(product: AiCatalogProduct) {
  const price = product.basePrice > 0 ? `${new Intl.NumberFormat("en-US").format(product.basePrice)} DZD` : "great price";
  const title = trimTo(product.category ? `${product.name} | ${product.category}` : product.name, 60);
  const description = trimTo(
    `${product.name}${product.category ? ` — ${product.category}` : ""}. Available now at ${price} on Modalia. Fast delivery across Algeria, cash on delivery.`,
    160,
  );
  const slug = product.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
  return { title, description, slug, keywords: keywordsFor(product) };
}

function improveDescription(product: AiCatalogProduct): string {
  const lines: string[] = [];
  lines.push(product.name.toUpperCase());
  lines.push("");
  const intro = product.shortDescription || product.description;
  lines.push(intro || `Discover the ${product.name} — available now on Modalia.`);
  lines.push("");
  const entries = Object.entries(product.attributes);
  if (entries.length > 0) {
    lines.push("HIGHLIGHTS");
    for (const [key, value] of entries) {
      lines.push(`• ${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: ${value}`);
    }
    lines.push("");
  }
  const specs: string[] = [];
  if (product.category) specs.push(`Category: ${product.category}`);
  if (product.sku) specs.push(`SKU: ${product.sku}`);
  if (product.basePrice > 0) specs.push(`Price: ${new Intl.NumberFormat("en-US").format(product.basePrice)} DZD`);
  if (specs.length > 0) {
    lines.push("DETAILS");
    lines.push(specs.join(" · "));
    lines.push("");
  }
  lines.push("Order today — cash on delivery available across Algeria.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SellerAiPage() {
  const { locale } = Route.useSearch();
  const catalogQuery = useQuery({
    queryKey: ["seller-ai-catalog"],
    queryFn: () => getSellerAiCatalog({ data: {} }),
    retry: false,
  });

  const products = catalogQuery.data?.products ?? [];
  const [productId, setProductId] = useState<string>("");

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? products[0] ?? null,
    [products, productId],
  );

  const seo = useMemo(() => (product ? seoPack(product) : null), [product]);
  const improved = useMemo(() => (product ? improveDescription(product) : null), [product]);

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="AI tools"
    >
      <p className="text-body text-muted-foreground">"Writing helpers that turn your product data into ready-to-paste listing text."</p>
      {/* Honesty banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <Info className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-sm">
          <p className="font-semibold text-amber-800 dark:text-amber-300">Rule-based assistant — no external AI provider connected.</p>
          <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
            These tools run entirely on this page using fixed templates and your own product fields (name, category,
            attributes, price). They are not an AI model and generate no new knowledge — always review the text before publishing.
          </p>
        </div>
      </div>

      {catalogQuery.isLoading ? (
        <div className="mt-6"><TableSkeleton rows={4} /></div>
      ) : catalogQuery.isError ? (
        <div className="mt-6">
          <AdminCard><EmptyState title="Products could not be loaded" text={errMsg(catalogQuery.error)} /></AdminCard>
        </div>
      ) : products.length === 0 ? (
        <div className="mt-6">
          <AdminCard>
            <EmptyState title="No products yet" text="Add a product first — the tools will use its name, category, attributes and price." />
          </AdminCard>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <AdminCard title="Choose a product">
            <div className="max-w-md">
              <Field label="Product">
                <Select value={product?.id ?? ""} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </AdminCard>

          {product && seo ? (
            <AdminCard
              title="SEO title & description generator"
              subtitle="Deterministic template output from your product fields."
              actions={<Sparkles className="size-4 text-muted-foreground" />}
            >
              <div className="space-y-5">
                <CopyableBlock label="SEO title (max 60 chars)" value={seo.title} hint={`${seo.title.length}/60 characters`} />
                <CopyableBlock label="Meta description (max 160 chars)" value={seo.description} hint={`${seo.description.length}/160 characters`} />
                <CopyableBlock label="URL slug suggestion" value={seo.slug} mono />
                <div>
                  <p className="text-sm font-medium">Keyword suggestions</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {seo.keywords.map((keyword) => (
                      <span key={keyword} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground" dir="auto">
                        {keyword}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Extracted from your product name, category and attributes.</p>
                </div>
              </div>
            </AdminCard>
          ) : null}

          {product && improved ? (
            <AdminCard
              title="Product description improver"
              subtitle="Structured rewrite built from your existing description, attributes and price."
              actions={<Sparkles className="size-4 text-muted-foreground" />}
            >
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium">Current description</p>
                  <p className="mt-2 rounded-xl bg-muted p-3 text-sm leading-6 text-muted-foreground">
                    {product.description || product.shortDescription || "No description yet — the improver will build one from your product fields."}
                  </p>
                </div>
                <CopyableBlock label="Improved description" value={improved} multiline />
              </div>
            </AdminCard>
          ) : null}
        </div>
      )}
    </SellerShell>
  );
}

function CopyableBlock({
  label,
  value,
  hint,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {multiline ? (
        <Textarea readOnly value={value} rows={12} className={mono ? "font-mono text-xs" : "text-sm leading-6"} dir="auto" />
      ) : (
        <p className={`mt-2 rounded-xl border border-border p-3 text-sm ${mono ? "font-mono text-xs" : ""}`} dir="auto">
          {value}
        </p>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
