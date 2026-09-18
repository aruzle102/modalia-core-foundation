import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { productEditorSchema, type ProductEditorValues } from "@/lib/validation";

export type ProductFormProps = { initialValues?: Partial<ProductEditorValues>; onSubmit: (values: ProductEditorValues) => void | Promise<void>; submitting?: boolean };

export function ProductForm({ initialValues, onSubmit, submitting = false }: ProductFormProps) {
  const form = useForm<ProductEditorValues>({ resolver: zodResolver(productEditorSchema), defaultValues: { name: "", slug: "", categoryId: "", brandId: "", description: "", shortDescription: "", sku: "", price: 0, compareAtPrice: undefined, weightGrams: 0, visibility: "private", inventory: 0, imageUrls: [], ...initialValues } });
  const fieldError = (name: keyof ProductEditorValues) => form.formState.errors[name]?.message;
  return <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
    <fieldset className="grid gap-5 sm:grid-cols-2"><legend className="text-h3 text-foreground">Basic information</legend><Field label="Product name" error={fieldError("name")}><Input {...form.register("name")} autoComplete="off" /></Field><Field label="URL slug" error={fieldError("slug")}><Input {...form.register("slug")} autoComplete="off" /></Field><Field label="SKU" error={fieldError("sku")}><Input {...form.register("sku")} autoComplete="off" /></Field><Field label="Category ID" error={fieldError("categoryId")}><Input {...form.register("categoryId")} /></Field></fieldset>
    <fieldset className="grid gap-5 sm:grid-cols-2"><legend className="text-h3 text-foreground">Description</legend><Field label="Short description" error={fieldError("shortDescription")}><Textarea {...form.register("shortDescription")} maxLength={320} /></Field><Field label="Full description" error={fieldError("description")}><Textarea {...form.register("description")} maxLength={8000} /></Field></fieldset>
    <fieldset className="grid gap-5 sm:grid-cols-2"><legend className="text-h3 text-foreground">Pricing and inventory</legend><Field label="Current price" error={fieldError("price")}><Input type="number" min="0.01" step="0.01" {...form.register("price")} /></Field><Field label="Original price" error={fieldError("compareAtPrice")}><Input type="number" min="0" step="0.01" {...form.register("compareAtPrice")} /></Field><Field label="Inventory" error={fieldError("inventory")}><Input type="number" min="0" step="1" {...form.register("inventory")} /></Field><Field label="Weight (g)" error={fieldError("weightGrams")}><Input type="number" min="1" step="1" {...form.register("weightGrams")} /></Field></fieldset>
    <fieldset><legend className="text-h3 text-foreground">Visibility</legend><div className="mt-4 flex flex-wrap gap-4">{(["private", "hidden", "public"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-small text-foreground"><input type="radio" value={value} {...form.register("visibility")} />{value}</label>)}</div></fieldset>
    <Button type="submit" disabled={submitting}>{submitting ? "Saving" : "Save product"}</Button>
  </form>;
}

function Field({ label, error, children }: { label: string; error: string | undefined; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}{error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}</div>; }