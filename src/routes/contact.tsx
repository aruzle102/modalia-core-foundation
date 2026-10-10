import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { canonicalUrl, prefetchSeoSettings, seoRobotsFromHeadCtx } from "@/lib/seo";
import { submitContactMessage } from "@/lib/engagement.functions";
import type { SupportedLocale } from "@/config/platform";

// Contact details are managed from the admin panel via the site_settings table.
// getSiteSettings() is a public server function in "@/lib/engagement.functions" provided by the
// engagement team. It may not exist yet: it is loaded dynamically, and any failure (missing module,
// missing export, server error) safely falls back to an empty settings object, so the page shows a
// neutral translated placeholder instead of fabricated details.
type SiteSettings = Record<string, unknown>;

async function fetchSiteSettings(): Promise<SiteSettings> {
  try {
    const mod = (await import("@/lib/engagement.functions").catch(() => null)) as {
      getSiteSettings?: unknown;
    } | null;
    const fn = mod?.getSiteSettings;
    if (typeof fn !== "function") return {};
    const result = await (fn as () => Promise<SiteSettings>)();
    return result !== null && typeof result === "object" ? result : {};
  } catch {
    return {};
  }
}

function getSettingValue(settings: SiteSettings, key: string): string | null {
  const value = settings[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

type ContactContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lead: string;
  detailsSoon: string;
  infoTitle: string;
  emailLabel: string;
  phoneLabel: string;
  locationLabel: string;
  hoursLabel: string;
  formTitle: string;
  formLead: string;
  nameLabel: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  phoneLabelForm: string;
  phonePlaceholder: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  messageLabel: string;
  messagePlaceholder: string;
  submit: string;
  sending: string;
  success: string;
  error: string;
};

const content: Record<SupportedLocale, ContactContent> = {
  ar: {
    metaTitle: "اتصل بنا — موداليا",
    metaDescription: "تواصل مع فريق موداليا: دعم الزبائن، استفسارات الطلبات، والشراكات.",
    eyebrow: "الدعم",
    title: "تواصل مع موداليا",
    lead: "عندك سؤال عن طلب معيّن؟ استعمل رمز الطلب في صفحة تتبّع الطلب. لأي استفسار آخر، راسلنا عبر النموذج أدناه وسنردّ عليك في أقرب وقت.",
    detailsSoon: "سيتم نشر معلومات الاتصال هنا قريبًا.",
    infoTitle: "معلومات الاتصال",
    emailLabel: "البريد الإلكتروني",
    phoneLabel: "الهاتف",
    locationLabel: "الموقع",
    hoursLabel: "أوقات العمل",
    formTitle: "أرسل لنا رسالة",
    formLead: "املأ النموذج وسنتواصل معك قريبًا.",
    nameLabel: "الاسم الكامل",
    namePlaceholder: "مثال: أمين بن علي",
    emailPlaceholder: "example@email.com",
    phoneLabelForm: "رقم الهاتف",
    phonePlaceholder: "+213 …",
    subjectLabel: "الموضوع",
    subjectPlaceholder: "موضوع رسالتك",
    messageLabel: "رسالتك",
    messagePlaceholder: "اكتب رسالتك هنا…",
    submit: "إرسال الرسالة",
    sending: "جارٍ الإرسال…",
    success: "شكرًا لك! استلمنا رسالتك وسنردّ عليك في أقرب وقت.",
    error: "تعذّر إرسال الرسالة. حاول مرة أخرى من فضلك.",
  },
  fr: {
    metaTitle: "Contact — Modalia",
    metaDescription:
      "Contactez l'équipe Modalia : support client, questions sur les commandes et partenariats.",
    eyebrow: "Assistance",
    title: "Contacter Modalia",
    lead: "Une question sur une commande précise ? Utilisez votre code de commande sur la page de suivi. Pour toute autre demande, écrivez-nous via le formulaire ci-dessous et nous vous répondrons au plus vite.",
    detailsSoon: "Les coordonnées seront publiées ici prochainement.",
    infoTitle: "Coordonnées",
    emailLabel: "E-mail",
    phoneLabel: "Téléphone",
    locationLabel: "Adresse",
    hoursLabel: "Horaires",
    formTitle: "Envoyez-nous un message",
    formLead: "Remplissez le formulaire et nous vous recontacterons rapidement.",
    nameLabel: "Nom complet",
    namePlaceholder: "Ex. : Amine Benali",
    emailPlaceholder: "exemple@email.com",
    phoneLabelForm: "Numéro de téléphone",
    phonePlaceholder: "+213 …",
    subjectLabel: "Objet",
    subjectPlaceholder: "Objet de votre message",
    messageLabel: "Votre message",
    messagePlaceholder: "Écrivez votre message ici…",
    submit: "Envoyer le message",
    sending: "Envoi en cours…",
    success: "Merci ! Nous avons bien reçu votre message et vous répondrons très vite.",
    error: "L'envoi du message a échoué. Veuillez réessayer.",
  },
  en: {
    metaTitle: "Contact — Modalia",
    metaDescription:
      "Get in touch with the Modalia team: customer support, order questions, and partnerships.",
    eyebrow: "Support",
    title: "Contact Modalia",
    lead: "Have a question about a specific order? Use your order code on the order tracking page. For anything else, write to us using the form below and we'll get back to you soon.",
    detailsSoon: "Contact details will be published here soon.",
    infoTitle: "Contact information",
    emailLabel: "Email",
    phoneLabel: "Phone",
    locationLabel: "Location",
    hoursLabel: "Working hours",
    formTitle: "Send us a message",
    formLead: "Fill in the form and we'll reach out shortly.",
    nameLabel: "Full name",
    namePlaceholder: "E.g. Amine Benali",
    emailPlaceholder: "example@email.com",
    phoneLabelForm: "Phone number",
    phonePlaceholder: "+213 …",
    subjectLabel: "Subject",
    subjectPlaceholder: "Subject of your message",
    messageLabel: "Your message",
    messagePlaceholder: "Write your message here…",
    submit: "Send message",
    sending: "Sending…",
    success: "Thank you! We've received your message and will reply soon.",
    error: "Couldn't send your message. Please try again.",
  },
};

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  loader: ({ context }) => prefetchSeoSettings(context.queryClient),
  head: (context) => {
    const robots = seoRobotsFromHeadCtx(context);
    const rawSearch = (context as unknown as { search?: Record<string, unknown> }).search ?? {};
    const locale = getLocale(
      typeof rawSearch["locale"] === "string" ? rawSearch["locale"] : undefined,
    );
    const c = content[locale];
    return {
      meta: [
        { title: c.metaTitle },
        { name: "description", content: c.metaDescription },
        { property: "og:title", content: c.metaTitle },
        { property: "og:description", content: c.metaDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(robots ? [{ name: "robots", content: robots }] : []),
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/contact") }],
    };
  },
  component: ContactPage,
});

function ContactPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const c = content[locale];
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const settingsQuery = useQuery({
    queryKey: ["site-settings"],
    queryFn: fetchSiteSettings,
    staleTime: 5 * 60 * 1000,
  });
  const settings = settingsQuery.data ?? {};
  const contactEmail = getSettingValue(settings, "contact_email");
  const contactPhone = getSettingValue(settings, "contact_phone");
  const contactAddress = getSettingValue(settings, "contact_address");
  const contactHours = getSettingValue(settings, "contact_hours");
  const submit = useMutation({
    mutationFn: () =>
      submitContactMessage({
        data: { ...form, locale },
      }),
    onSuccess: () => setForm({ name: "", email: "", phone: "", subject: "", message: "" }),
  });

  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <p className="text-eyebrow text-muted-foreground">{c.eyebrow}</p>
        <h1 className="mt-2 text-display">{c.title}</h1>
        <p className="mt-6 max-w-2xl text-body text-muted-foreground">{c.lead}</p>

        <section className="mt-10">
          <h2 className="text-h3">{c.infoTitle}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[24px] border border-border bg-card p-6">
              <Mail className="h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-small text-muted-foreground">{c.emailLabel}</p>
              {contactEmail ? (
                <p className="mt-1 break-all text-body font-medium" dir="ltr">
                  {contactEmail}
                </p>
              ) : (
                <p className="mt-1 text-small text-muted-foreground">{c.detailsSoon}</p>
              )}
            </div>
            <div className="rounded-[24px] border border-border bg-card p-6">
              <Phone className="h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-small text-muted-foreground">{c.phoneLabel}</p>
              {contactPhone ? (
                <p className="mt-1 text-body font-medium" dir="ltr">
                  {contactPhone}
                </p>
              ) : (
                <p className="mt-1 text-small text-muted-foreground">{c.detailsSoon}</p>
              )}
            </div>
            <div className="rounded-[24px] border border-border bg-card p-6">
              <MapPin className="h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-small text-muted-foreground">{c.locationLabel}</p>
              {contactAddress ? (
                <p className="mt-1 text-body font-medium">{contactAddress}</p>
              ) : (
                <p className="mt-1 text-small text-muted-foreground">{c.detailsSoon}</p>
              )}
            </div>
            <div className="rounded-[24px] border border-border bg-card p-6">
              <Clock className="h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-small text-muted-foreground">{c.hoursLabel}</p>
              {contactHours ? (
                <p className="mt-1 text-body font-medium">{contactHours}</p>
              ) : (
                <p className="mt-1 text-small text-muted-foreground">{c.detailsSoon}</p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-[30px] border border-border bg-card p-6 sm:p-8">
          <h2 className="text-h3">{c.formTitle}</h2>
          <p className="mt-2 text-small text-muted-foreground">{c.formLead}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
            className="mt-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-small">
                {c.nameLabel}
                <Input
                  className="mt-2"
                  required
                  placeholder={c.namePlaceholder}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="text-small">
                {c.emailLabel}
                <Input
                  className="mt-2"
                  type="email"
                  required
                  placeholder={c.emailPlaceholder}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-small">
                {c.phoneLabelForm}
                <Input
                  className="mt-2"
                  type="tel"
                  placeholder={c.phonePlaceholder}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label className="text-small">
                {c.subjectLabel}
                <Input
                  className="mt-2"
                  required
                  placeholder={c.subjectPlaceholder}
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </label>
            </div>
            <label className="mt-4 block text-small">
              {c.messageLabel}
              <textarea
                required
                minLength={10}
                placeholder={c.messagePlaceholder}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="mt-2 min-h-36 w-full rounded-xl border border-input bg-background px-3 py-3"
              />
            </label>
            {submit.isSuccess ? (
              <p className="mt-5 rounded-xl bg-muted p-3 text-small">{c.success}</p>
            ) : null}
            {submit.error ? (
              <p className="mt-5 rounded-xl bg-destructive/10 p-3 text-small text-destructive">
                {submit.error instanceof Error ? submit.error.message : c.error}
              </p>
            ) : null}
            <Button className="mt-6 h-12 rounded-full px-8" disabled={submit.isPending}>
              {submit.isPending ? c.sending : c.submit}
            </Button>
          </form>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
