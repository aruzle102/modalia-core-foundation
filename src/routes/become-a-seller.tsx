import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { submitSellerApplication } from "@/lib/seller-application.functions";
import {
  createSellerApplicationFormSchema,
  toServerCategories,
  type SellerApplicationFormValues,
} from "@/lib/seller-application.schema";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/become-a-seller")({
  head: () =>
    pageHead({
      title: "Become a seller — Modalia",
      description: "Apply to build a verified store on Modalia.",
      path: "/become-a-seller",
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  component: SellerApplicationPage,
});

const inputClass = "mt-2";

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-small text-destructive">
      {message}
    </p>
  );
}

function SellerApplicationPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const ts = t.sellerApp;
  const tc = t.checkout;

  const schema = useMemo(
    () => createSellerApplicationFormSchema({ ...ts.errors }),
    [locale, ts.errors],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SellerApplicationFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      storeName: "",
      categories: "",
      description: "",
      additionalInformation: "",
    },
  });

  const submit = useMutation({
    mutationFn: (values: SellerApplicationFormValues) =>
      submitSellerApplication({
        data: {
          ...values,
          categories: toServerCategories(values.categories),
        },
      }),
  });

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-eyebrow text-muted-foreground">{ts.eyebrow}</p>
          <h1 className="mt-2 text-display">{ts.title}</h1>
          <p className="mt-4 text-body text-muted-foreground">{ts.text}</p>
        </div>

        {submit.isSuccess ? (
          <section
            aria-live="polite"
            className="mt-8 rounded-3xl border border-border bg-card p-8 text-center sm:p-12"
          >
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" aria-hidden />
            <h2 className="mt-4 text-h3">{ts.successTitle}</h2>
            <p className="mx-auto mt-3 max-w-md text-body text-muted-foreground">{ts.successText}</p>
            <Button asChild className="mt-8 h-12 rounded-full px-8">
              <Link to="/" search={{ locale }}>
                {t.shell.back}
              </Link>
            </Button>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit((values) => submit.mutate(values))}
            noValidate
            className="mt-8 rounded-3xl border border-border bg-card p-6 sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-small">
                {tc.firstName}
                <Input
                  className={cn(inputClass, errors.firstName && "border-destructive")}
                  aria-invalid={!!errors.firstName}
                  {...register("firstName")}
                />
                <FieldError message={errors.firstName?.message} />
              </label>
              <label className="text-small">
                {tc.lastName}
                <Input
                  className={cn(inputClass, errors.lastName && "border-destructive")}
                  aria-invalid={!!errors.lastName}
                  {...register("lastName")}
                />
                <FieldError message={errors.lastName?.message} />
              </label>
            </div>
            <label className="mt-4 block text-small">
              {tc.phone}
              <Input
                className={cn(inputClass, errors.phone && "border-destructive")}
                aria-invalid={!!errors.phone}
                placeholder="+213551234567"
                inputMode="tel"
                autoComplete="tel"
                {...register("phone")}
              />
              <FieldError message={errors.phone?.message} />
            </label>
            <label className="mt-4 block text-small">
              {ts.email}
              <Input
                className={cn(inputClass, errors.email && "border-destructive")}
                aria-invalid={!!errors.email}
                type="email"
                autoComplete="email"
                {...register("email")}
              />
              <FieldError message={errors.email?.message} />
            </label>
            <label className="mt-4 block text-small">
              {ts.storeName}
              <Input
                className={cn(inputClass, errors.storeName && "border-destructive")}
                aria-invalid={!!errors.storeName}
                {...register("storeName")}
              />
              <FieldError message={errors.storeName?.message} />
            </label>
            <label className="mt-4 block text-small">
              {ts.categories}
              <Input
                className={cn(inputClass, errors.categories && "border-destructive")}
                aria-invalid={!!errors.categories}
                placeholder={ts.categoriesPlaceholder}
                {...register("categories")}
              />
              <FieldError message={errors.categories?.message} />
            </label>
            <label className="mt-4 block text-small">
              {ts.description}
              <textarea
                aria-invalid={!!errors.description}
                {...register("description")}
                className={cn(
                  "mt-2 min-h-36 w-full rounded-xl border border-input bg-background px-3 py-3",
                  errors.description && "border-destructive",
                )}
              />
              <FieldError message={errors.description?.message} />
            </label>
            <label className="mt-4 block text-small">
              {ts.additionalInfo} <span className="text-muted-foreground">({tc.optional})</span>
              <textarea
                aria-invalid={!!errors.additionalInformation}
                {...register("additionalInformation")}
                className={cn(
                  "mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-3",
                  errors.additionalInformation && "border-destructive",
                )}
              />
              <FieldError message={errors.additionalInformation?.message} />
            </label>
            {submit.error ? (
              <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-small text-destructive">
                {submit.error instanceof Error ? submit.error.message : ts.submitError}
              </p>
            ) : null}
            <Button type="submit" className="mt-6 h-12 rounded-full" disabled={submit.isPending}>
              {submit.isPending ? ts.submitting : ts.submit}
            </Button>
          </form>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
