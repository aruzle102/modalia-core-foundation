import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { Stagger } from "@/components/motion";
import { Reveal } from "@/lib/motion";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { submitSellerApplication } from "@/lib/seller-application.functions";
import {
  createSellerApplicationFormSchema,
  toServerCategories,
  type SellerApplicationFormValues,
} from "@/lib/seller-application.schema";
import { pageHead, pageHeadCopy, prefetchSeoSettings, seoRobotsFromHeadCtx } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/become-a-seller")({
  loader: ({ context }) => prefetchSeoSettings(context.queryClient),
  head: (context) => {
    const rawSearch = (context as unknown as { search?: Record<string, unknown> }).search ?? {};
    const locale = getLocale(typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined);
    const copy = pageHeadCopy(locale, "becomeSeller");
    return pageHead({
      robots: seoRobotsFromHeadCtx(context),
      title: copy.title,
      description: copy.description,
      path: "/become-a-seller",
    });
  },
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

function RequiredMark({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="ms-1 text-destructive">
        *
      </span>
      <span className="sr-only"> ({label})</span>
    </>
  );
}

function FieldLabel({
  htmlFor,
  required,
  requiredLabel,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  requiredLabel: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-small font-medium text-foreground">
      {children}
      {required ? <RequiredMark label={requiredLabel} /> : null}
    </label>
  );
}

const textareaClass =
  "mt-2 min-h-36 w-full rounded-xl border border-input bg-background px-3 py-3 text-body text-foreground placeholder:text-muted-foreground";

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

  const requiredLabel = ts.errors.required;

  const benefits = [
    { icon: Truck, title: ts.benefits.b1t, text: ts.benefits.b1d },
    { icon: Store, title: ts.benefits.b2t, text: ts.benefits.b2d },
    { icon: ShieldCheck, title: ts.benefits.b3t, text: ts.benefits.b3d },
  ];

  const howSteps = [
    { n: "01", title: ts.howSteps.h1t, text: ts.howSteps.h1d },
    { n: "02", title: ts.howSteps.h2t, text: ts.howSteps.h2d },
    { n: "03", title: ts.howSteps.h3t, text: ts.howSteps.h3d },
  ];

  const nextSteps = [
    { n: "01", title: ts.nextSteps.n1t, text: ts.nextSteps.n1d },
    { n: "02", title: ts.nextSteps.n2t, text: ts.nextSteps.n2d },
    { n: "03", title: ts.nextSteps.n3t, text: ts.nextSteps.n3d },
  ];

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1}>
        {/* ——— Hero ——— */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <Reveal>
              <p className="text-eyebrow text-brand">{ts.eyebrow}</p>
              <h1 className="mt-4 max-w-3xl text-display text-foreground">{ts.title}</h1>
              <p className="mt-5 max-w-2xl text-body text-muted-foreground">{ts.text}</p>
            </Reveal>
          </div>
        </section>

        {/* ——— How it works ——— */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <Reveal>
              <h2 className="text-h2 text-foreground">{ts.howTitle}</h2>
            </Reveal>
            <Stagger className="mt-8 grid gap-8 sm:grid-cols-3" stepMs={90} maxMs={270}>
              {howSteps.map((step) => (
                <div key={step.n} className="border-t border-border pt-6">
                  <p aria-hidden="true" className="text-4xl font-semibold text-brand">
                    {step.n}
                  </p>
                  <h3 className="mt-3 text-h3 text-foreground">{step.title}</h3>
                  <p className="mt-2 text-body text-muted-foreground">{step.text}</p>
                </div>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ——— Why Modalia ——— */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <Stagger className="grid gap-10 sm:grid-cols-3" stepMs={90} maxMs={270}>
              {benefits.map((benefit) => (
                <div key={benefit.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-card"
                  >
                    <benefit.icon className="size-5 text-brand" />
                  </span>
                  <div>
                    <h3 className="text-h3 text-foreground">{benefit.title}</h3>
                    <p className="mt-2 text-body text-muted-foreground">{benefit.text}</p>
                  </div>
                </div>
              ))}
            </Stagger>
          </div>
        </section>

        {submit.isSuccess ? (
          /* ——— Success state ——— */
          <section aria-live="polite" className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
            <Reveal className="text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-brand" aria-hidden />
              <h2 className="mt-5 text-h2 text-foreground">{ts.successTitle}</h2>
              <p className="mx-auto mt-3 max-w-xl text-body text-muted-foreground">
                {ts.successText}
              </p>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-12 rounded-xl border border-border bg-card p-6 text-start sm:p-8">
                <h3 className="text-h3 text-foreground">{ts.successStepsTitle}</h3>
                <ol className="mt-6 space-y-6">
                  {nextSteps.map((step) => (
                    <li key={step.n} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-small font-semibold text-brand"
                      >
                        {step.n}
                      </span>
                      <div>
                        <p className="text-small font-semibold text-foreground">{step.title}</p>
                        <p className="mt-1 text-small text-muted-foreground">{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
            <div className="mt-10 text-center">
              <Button asChild className="h-12 px-8">
                <Link to="/" search={{ locale }}>
                  {t.shell.back}
                </Link>
              </Button>
            </div>
          </section>
        ) : (
          /* ——— Application form ——— */
          <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-5 lg:gap-14">
              <div className="lg:col-span-2">
                <div className="lg:sticky lg:top-24">
                  <Reveal>
                    <p className="text-eyebrow text-brand">{ts.formEyebrow}</p>
                    <h2 className="mt-3 text-h2 text-foreground">{ts.formTitle}</h2>
                    <p className="mt-4 text-body text-muted-foreground">{ts.formText}</p>
                    <p className="mt-6 border-s-2 border-brand ps-4 text-small text-muted-foreground">
                      {ts.noAccountNote}
                    </p>
                  </Reveal>
                </div>
              </div>
              <Reveal delay={100} className="lg:col-span-3">
                <form
                  onSubmit={handleSubmit((values) => submit.mutate(values))}
                  noValidate
                  className="rounded-xl border border-border bg-card p-6 sm:p-8"
                >
                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="text-eyebrow text-muted-foreground">
                      {ts.contactGroup}
                    </legend>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="seller-first-name" required requiredLabel={requiredLabel}>
                          {tc.firstName}
                        </FieldLabel>
                        <Input
                          id="seller-first-name"
                          className={cn(inputClass, errors.firstName && "border-destructive")}
                          aria-invalid={!!errors.firstName}
                          autoComplete="given-name"
                          {...register("firstName")}
                        />
                        <FieldError message={errors.firstName?.message} />
                      </div>
                      <div>
                        <FieldLabel htmlFor="seller-last-name" required requiredLabel={requiredLabel}>
                          {tc.lastName}
                        </FieldLabel>
                        <Input
                          id="seller-last-name"
                          className={cn(inputClass, errors.lastName && "border-destructive")}
                          aria-invalid={!!errors.lastName}
                          autoComplete="family-name"
                          {...register("lastName")}
                        />
                        <FieldError message={errors.lastName?.message} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <FieldLabel htmlFor="seller-phone" required requiredLabel={requiredLabel}>
                        {tc.phone}
                      </FieldLabel>
                      <Input
                        id="seller-phone"
                        className={cn(inputClass, errors.phone && "border-destructive")}
                        aria-invalid={!!errors.phone}
                        placeholder="+213551234567"
                        inputMode="tel"
                        autoComplete="tel"
                        {...register("phone")}
                      />
                      <FieldError message={errors.phone?.message} />
                    </div>
                    <div className="mt-4">
                      <FieldLabel htmlFor="seller-email" required requiredLabel={requiredLabel}>
                        {ts.email}
                      </FieldLabel>
                      <Input
                        id="seller-email"
                        className={cn(inputClass, errors.email && "border-destructive")}
                        aria-invalid={!!errors.email}
                        type="email"
                        autoComplete="email"
                        {...register("email")}
                      />
                      <FieldError message={errors.email?.message} />
                    </div>
                  </fieldset>

                  <fieldset className="m-0 mt-8 min-w-0 border-0 border-t border-border p-0 pt-8">
                    <legend className="text-eyebrow text-muted-foreground">
                      {ts.storeGroup}
                    </legend>
                    <div className="mt-4">
                      <FieldLabel htmlFor="seller-store-name" required requiredLabel={requiredLabel}>
                        {ts.storeName}
                      </FieldLabel>
                      <Input
                        id="seller-store-name"
                        className={cn(inputClass, errors.storeName && "border-destructive")}
                        aria-invalid={!!errors.storeName}
                        autoComplete="organization"
                        {...register("storeName")}
                      />
                      <FieldError message={errors.storeName?.message} />
                    </div>
                    <div className="mt-4">
                      <FieldLabel htmlFor="seller-categories" required requiredLabel={requiredLabel}>
                        {ts.categories}
                      </FieldLabel>
                      <Input
                        id="seller-categories"
                        className={cn(inputClass, errors.categories && "border-destructive")}
                        aria-invalid={!!errors.categories}
                        placeholder={ts.categoriesPlaceholder}
                        {...register("categories")}
                      />
                      <FieldError message={errors.categories?.message} />
                    </div>
                    <div className="mt-4">
                      <FieldLabel htmlFor="seller-description" required requiredLabel={requiredLabel}>
                        {ts.description}
                      </FieldLabel>
                      <textarea
                        id="seller-description"
                        aria-invalid={!!errors.description}
                        {...register("description")}
                        className={cn(textareaClass, errors.description && "border-destructive")}
                      />
                      <FieldError message={errors.description?.message} />
                    </div>
                    <div className="mt-4">
                      <FieldLabel htmlFor="seller-additional-info" requiredLabel={requiredLabel}>
                        {ts.additionalInfo}{" "}
                        <span className="font-normal text-muted-foreground">({tc.optional})</span>
                      </FieldLabel>
                      <textarea
                        id="seller-additional-info"
                        aria-invalid={!!errors.additionalInformation}
                        {...register("additionalInformation")}
                        className={cn(
                          textareaClass,
                          "min-h-24",
                          errors.additionalInformation && "border-destructive",
                        )}
                      />
                      <FieldError message={errors.additionalInformation?.message} />
                    </div>
                  </fieldset>

                  {submit.error ? (
                    <p
                      role="alert"
                      className="mt-6 rounded-xl bg-destructive/10 p-3 text-small text-destructive"
                    >
                      {submit.error instanceof Error ? submit.error.message : ts.submitError}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className="mt-8 h-12 px-8"
                    disabled={submit.isPending}
                  >
                    {submit.isPending ? ts.submitting : ts.submit}
                  </Button>
                </form>
              </Reveal>
            </div>
          </section>
        )}
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
