import { createFileRoute } from "@tanstack/react-router";
import { Banknote, MapPin, Package, Timer, Truck } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { canonicalUrl } from "@/lib/seo";
import type { SupportedLocale } from "@/config/platform";

type ShippingSection = { title: string; body: string };

type ShippingContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lead: string;
  coverageTitle: string;
  coverageBody: string;
  sections: ShippingSection[];
  noteTitle: string;
  noteBody: string;
};

const sectionIcons = [Truck, MapPin, Package, Timer, Banknote];

const content: Record<SupportedLocale, ShippingContent> = {
  ar: {
    metaTitle: "سياسة الشحن — موداليا",
    metaDescription:
      "التوصيل إلى 58 ولاية: توصيل منزلي أو مكتبي، أسعار حسب الوزن، الدفع عند الاستلام، ومدد التوصيل التقديرية.",
    eyebrow: "التوصيل",
    title: "الشحن على موداليا",
    lead: "نوصّل طلبك أينما كنت في الجزائر — إلى باب دارك أو إلى أقرب مكتب توصيل — مع أسعار واضحة تُحسب تلقائيًا في صفحة الدفع.",
    coverageTitle: "تغطية كاملة: 58 ولاية",
    coverageBody:
      "نغطي جميع الولايات الـ58 عبر شركاء توصيل معتمدين. أدخل ولايتك وبلديتك في صفحة الدفع لترى طرق التوصيل المتاحة وأسعارها الدقيقة قبل تأكيد طلبك.",
    sections: [
      {
        title: "طريقتا توصيل",
        body: "اختر التوصيل إلى المنزل ليصلك الطرد إلى عنوانك مباشرة، أو الاستلام من مكتب التوصيل (stopdesk) الأقرب إليك — وهو خيار أرخص غالبًا ومتاح في معظم الولايات.",
      },
      {
        title: "أسعار حسب الوزن",
        body: "تُحتسب أسعار الشحن حسب شريحتين: من 0 إلى 5 كغ بالسعر الأساسي، وأكثر من 5 كغ بسعر إضافي لكل شريحة وزن. السعر النهائي يظهر في صفحة الدفع قبل التأكيد.",
      },
      {
        title: "تغليف آمن",
        body: "يُغلَّف كل طلب بعناية من طرف البائع لحماية المنتجات أثناء النقل. إن وصلك طرد متضرر، لا تستلمه وأبلغنا فورًا عبر نموذج الاتصال مع ذكر رمز طلبك.",
      },
      {
        title: "مدد التوصيل التقديرية",
        body: "من 24 إلى 72 ساعة للولايات الكبرى (الجزائر، وهران، سطيف، قسنطينة…)، ومن يومين إلى 5 أيام لبقية الولايات. هذه مدد تقديرية قد تتأثر بالظروف الجوية أو مواسم الذروة.",
      },
      {
        title: "الدفع عند الاستلام",
        body: "تدفع ثمن المنتجات + الشحن نقدًا لساعي التوصيل عند استلام طردك. تأكد من تجهيز المبلغ، ومن صحة رقم هاتفك لأن الساعي سيتصل بك قبل التوصيل.",
      },
    ],
    noteTitle: "معلومة مهمة",
    noteBody:
      "أسعار الشحن تُحسب تلقائيًا في صفحة الدفع حسب ولايتك وبلديتك وطريقة التوصيل والمتجر ووزن الطرد الإجمالي. تأكد من إدخال رقم هاتف صحيح وعنوان دقيق لتفادي أي تأخير — فأي خطأ في العنوان قد يعيد الطرد إلى البائع على حسابك.",
  },
  fr: {
    metaTitle: "Politique de livraison — Modalia",
    metaDescription:
      "Livraison vers 58 wilayas : à domicile ou au bureau, tarifs selon le poids, paiement à la livraison et délais estimés.",
    eyebrow: "Livraison",
    title: "La livraison sur Modalia",
    lead: "Nous livrons votre commande partout en Algérie — jusqu'à votre porte ou au bureau de livraison le plus proche — avec des tarifs clairs calculés automatiquement au checkout.",
    coverageTitle: "Couverture totale : 58 wilayas",
    coverageBody:
      "Nous couvrons les 58 wilayas grâce à des partenaires de livraison agréés. Saisissez votre wilaya et votre commune au checkout pour voir les modes de livraison disponibles et leurs tarifs exacts avant de confirmer.",
    sections: [
      {
        title: "Deux modes de livraison",
        body: "Choisissez la livraison à domicile pour recevoir votre colis directement à votre adresse, ou le retrait au bureau (stopdesk) le plus proche — une option souvent moins chère, disponible dans la plupart des wilayas.",
      },
      {
        title: "Tarifs selon le poids",
        body: "Les frais de port sont calculés selon deux tranches : de 0 à 5 kg au tarif de base, et au-delà de 5 kg avec un supplément par tranche de poids. Le prix final s'affiche au checkout avant confirmation.",
      },
      {
        title: "Emballage soigné",
        body: "Chaque commande est soigneusement emballée par le vendeur pour protéger les produits pendant le transport. Si vous recevez un colis endommagé, ne le réceptionnez pas et prévenez-nous immédiatement via le formulaire de contact en indiquant votre code de commande.",
      },
      {
        title: "Délais de livraison estimés",
        body: "De 24 à 72 heures pour les grandes wilayas (Alger, Oran, Sétif, Constantine…), et de 2 à 5 jours pour les autres. Ces délais sont estimatifs et peuvent varier selon les conditions météo ou les périodes de forte demande.",
      },
      {
        title: "Paiement à la livraison",
        body: "Vous réglez le prix des produits + la livraison en espèces au livreur à la réception de votre colis. Préparez le montant exact et vérifiez votre numéro de téléphone : le livreur vous appellera avant la livraison.",
      },
    ],
    noteTitle: "Bon à savoir",
    noteBody:
      "Les frais de livraison sont calculés automatiquement au checkout selon votre wilaya, votre commune, le mode de livraison, la boutique et le poids total du colis. Vérifiez votre numéro de téléphone et votre adresse pour éviter tout retard — une adresse erronée peut renvoyer le colis au vendeur à vos frais.",
  },
  en: {
    metaTitle: "Shipping policy — Modalia",
    metaDescription:
      "Delivery to 58 wilayas: home or stopdesk delivery, weight-based pricing, cash on delivery, and estimated delivery times.",
    eyebrow: "Delivery",
    title: "Shipping on Modalia",
    lead: "We deliver your order anywhere in Algeria — to your door or to the nearest delivery office — with clear prices calculated automatically at checkout.",
    coverageTitle: "Full coverage: 58 wilayas",
    coverageBody:
      "We cover all 58 wilayas through certified delivery partners. Enter your wilaya and commune at checkout to see the available delivery methods and their exact prices before confirming your order.",
    sections: [
      {
        title: "Two delivery methods",
        body: "Choose home delivery to receive your parcel directly at your address, or stopdesk pickup at the nearest delivery office — often the cheaper option, available in most wilayas.",
      },
      {
        title: "Weight-based pricing",
        body: "Shipping fees are calculated in two tiers: 0 to 5 kg at the base rate, and above 5 kg with an additional charge per weight bracket. The final price is shown at checkout before confirmation.",
      },
      {
        title: "Careful packaging",
        body: "Every order is carefully packed by the seller to protect products during transit. If you receive a damaged parcel, do not accept it and notify us immediately via the contact form with your order code.",
      },
      {
        title: "Estimated delivery times",
        body: "24 to 72 hours for major wilayas (Algiers, Oran, Sétif, Constantine…), and 2 to 5 days for the rest. These are estimates and may vary with weather conditions or peak periods.",
      },
      {
        title: "Cash on delivery",
        body: "You pay for the products + shipping in cash to the courier when you receive your parcel. Have the amount ready, and double-check your phone number — the courier will call you before delivery.",
      },
    ],
    noteTitle: "Good to know",
    noteBody:
      "Shipping fees are calculated automatically at checkout based on your wilaya, commune, delivery method, store, and total parcel weight. Make sure your phone number and address are correct to avoid delays — a wrong address may send the parcel back to the seller at your expense.",
  },
};

export const Route = createFileRoute("/shipping")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: (context) => {
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
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/shipping") }],
    };
  },
  component: ShippingPage,
});

function ShippingPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const c = content[locale];
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <p className="text-eyebrow text-muted-foreground">{c.eyebrow}</p>
        <h1 className="mt-2 text-display">{c.title}</h1>
        <p className="mt-6 max-w-2xl text-body text-muted-foreground">{c.lead}</p>

        <section className="mt-10 rounded-[30px] border border-border bg-card p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-h3">{c.coverageTitle}</h2>
          </div>
          <p className="mt-4 text-body text-muted-foreground">{c.coverageBody}</p>
        </section>

        <section className="mt-10 grid gap-5 sm:grid-cols-2">
          {c.sections.map((section, index) => {
            const Icon = sectionIcons[index % sectionIcons.length]!;
            return (
              <div key={section.title} className="rounded-[24px] border border-border bg-card p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-h3">{section.title}</h3>
                <p className="mt-2 text-small text-muted-foreground">{section.body}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-10 rounded-[24px] border border-border bg-muted/50 p-6 sm:p-8">
          <h2 className="text-h3">{c.noteTitle}</h2>
          <p className="mt-3 text-small text-muted-foreground">{c.noteBody}</p>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
