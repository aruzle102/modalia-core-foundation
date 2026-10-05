import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { canonicalUrl } from "@/lib/seo";
import type { SupportedLocale } from "@/config/platform";

type ReturnsContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lead: string;
  windowTitle: string;
  windowBody: string;
  conditionsTitle: string;
  conditions: string[];
  stepsTitle: string;
  steps: string[];
  exceptionsTitle: string;
  exceptions: string[];
  refundTitle: string;
  refundBody: string;
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
};

const content: Record<SupportedLocale, ReturnsContent> = {
  ar: {
    metaTitle: "سياسة الإرجاع والاستبدال — موداليا",
    metaDescription: "شروط الإرجاع والاستبدال على موداليا: المهلة، الشروط، الخطوات، والاستثناءات.",
    eyebrow: "الإرجاع",
    title: "الإرجاع والاستبدال",
    lead: "رضاك أولويتنا. إن لم يعجبك المنتج أو وصلك تالفًا أو مختلفًا عمّا طلبت، يمكنك طلب الإرجاع أو الاستبدال وفق الشروط التالية.",
    windowTitle: "مهلة الإرجاع: 7 أيام",
    windowBody:
      "يمكنك تقديم طلب الإرجاع أو الاستبدال خلال 7 أيام من تاريخ استلام الطرد. بعد انتهاء هذه المهلة لا يمكن قبول طلبات الإرجاع إلا في حالة عيب مصنعي.",
    conditionsTitle: "شروط قبول الإرجاع",
    conditions: [
      "أن يكون المنتج غير مستعمل وفي حالته الأصلية، مع جميع ملحقاته.",
      "أن يكون في تغليفه الأصلي مع البطاقات والملصقات سليمة.",
      "تقديم رمز الطلب وصور واضحة للمنتج عند تقديم الطلب.",
      "ألا يكون المنتج ضمن قائمة الاستثناءات أدناه.",
    ],
    stepsTitle: "خطوات الإرجاع",
    steps: [
      "تواصل معنا عبر نموذج الاتصال مع ذكر رمز طلبك وسبب الإرجاع، مرفقًا بصور للمنتج.",
      "يراجع فريقنا طلبك خلال 48 ساعة عمل ويؤكد قبوله أو يطلب توضيحات إضافية.",
      "أعد المنتج عبر نفس شركة التوصيل أو حسب التعليمات التي نرسلها لك.",
      "بعد استلام المنتج وفحصه، نرسل لك البديل أو نُصدر استرداد المبلغ خلال 7 أيام عمل.",
    ],
    exceptionsTitle: "استثناءات لا تُقبل للإرجاع",
    exceptions: [
      "منتجات العناية الشخصية والنظافة بعد فتحها (لأسباب صحية).",
      "الملابس الداخلية وملابس السباحة بعد إزالة بطاقاتها.",
      "المنتجات المخصصة أو المصنوعة حسب طلبك الخاص.",
      "المنتجات التي تظهر عليها آثار استعمال واضحة أو تلف ناتج عن سوء الاستخدام.",
    ],
    refundTitle: "كيف يتم استرداد المبلغ؟",
    refundBody:
      "بما أن الدفع يتم نقدًا عند الاستلام، يُسترجع المبلغ عبر تحويل بنكي أو بريدي إلى حسابك خلال 7 أيام عمل بعد قبول الإرجاع وفحص المنتج. تُخصم تكاليف الشحن الأصلية من المبلغ المسترد إلا إذا كان الخطأ من طرفنا (منتج خاطئ أو تالف).",
    ctaTitle: "تحتاج إلى إرجاع منتج؟",
    ctaBody: "جهّز رمز طلبك وصور المنتج، ثم راسلنا عبر نموذج الاتصال وسنتكفل بالباقي.",
    ctaButton: "اتصل بنا",
  },
  fr: {
    metaTitle: "Politique de retour et d'échange — Modalia",
    metaDescription:
      "Conditions de retour et d'échange sur Modalia : délai, conditions, étapes et exceptions.",
    eyebrow: "Retours",
    title: "Retours et échanges",
    lead: "Votre satisfaction est notre priorité. Si le produit ne vous plaît pas, ou s'il arrive endommagé ou différent de votre commande, vous pouvez demander un retour ou un échange selon les conditions suivantes.",
    windowTitle: "Délai de retour : 7 jours",
    windowBody:
      "Vous pouvez demander un retour ou un échange dans les 7 jours suivant la réception du colis. Passé ce délai, les retours ne sont acceptés qu'en cas de défaut de fabrication.",
    conditionsTitle: "Conditions d'acceptation du retour",
    conditions: [
      "Le produit doit être inutilisé et dans son état d'origine, avec tous ses accessoires.",
      "Il doit être dans son emballage d'origine, étiquettes et cartes intactes.",
      "Fournir le code de commande et des photos claires du produit lors de la demande.",
      "Le produit ne doit pas figurer dans la liste des exceptions ci-dessous.",
    ],
    stepsTitle: "Étapes du retour",
    steps: [
      "Contactez-nous via le formulaire de contact en indiquant votre code de commande et le motif du retour, avec des photos du produit.",
      "Notre équipe examine votre demande sous 48 heures ouvrées et confirme son acceptation ou demande des précisions.",
      "Renvoyez le produit via le même transporteur ou selon les instructions que nous vous envoyons.",
      "Après réception et contrôle du produit, nous vous envoyons le remplacement ou procédons au remboursement sous 7 jours ouvrés.",
    ],
    exceptionsTitle: "Exceptions non acceptées au retour",
    exceptions: [
      "Produits d'hygiène et de soin personnel après ouverture (raisons sanitaires).",
      "Sous-vêtements et maillots de bain dont les étiquettes ont été retirées.",
      "Produits personnalisés ou fabriqués sur mesure à votre demande.",
      "Produits présentant des traces d'usage évidentes ou un dommage dû à une mauvaise utilisation.",
    ],
    refundTitle: "Comment se fait le remboursement ?",
    refundBody:
      "Le paiement se faisant en espèces à la livraison, le remboursement s'effectue par virement bancaire ou postal sur votre compte sous 7 jours ouvrés après acceptation du retour et contrôle du produit. Les frais de livraison initiaux sont déduits du montant remboursé, sauf si l'erreur vient de nous (produit erroné ou endommagé).",
    ctaTitle: "Besoin de retourner un produit ?",
    ctaBody:
      "Préparez votre code de commande et des photos du produit, puis écrivez-nous via le formulaire de contact : nous nous occupons du reste.",
    ctaButton: "Nous contacter",
  },
  en: {
    metaTitle: "Return & exchange policy — Modalia",
    metaDescription:
      "Modalia's return and exchange terms: time window, conditions, steps, and exceptions.",
    eyebrow: "Returns",
    title: "Returns and exchanges",
    lead: "Your satisfaction is our priority. If you don't like the product, or it arrives damaged or different from what you ordered, you can request a return or exchange under the following terms.",
    windowTitle: "Return window: 7 days",
    windowBody:
      "You can request a return or exchange within 7 days of receiving your parcel. After this period, returns are only accepted for manufacturing defects.",
    conditionsTitle: "Conditions for accepting a return",
    conditions: [
      "The product must be unused and in its original condition, with all accessories.",
      "It must be in its original packaging with tags and labels intact.",
      "Provide your order code and clear photos of the product when submitting the request.",
      "The product must not be in the exceptions list below.",
    ],
    stepsTitle: "Return steps",
    steps: [
      "Contact us via the contact form with your order code and the reason for the return, attaching photos of the product.",
      "Our team reviews your request within 48 business hours and confirms acceptance or asks for clarification.",
      "Send the product back via the same carrier or according to the instructions we send you.",
      "After receiving and inspecting the product, we ship the replacement or issue your refund within 7 business days.",
    ],
    exceptionsTitle: "Exceptions not accepted for return",
    exceptions: [
      "Personal hygiene and care products after opening (for health reasons).",
      "Underwear and swimwear with tags removed.",
      "Products customized or made to your specific order.",
      "Products showing clear signs of use or damage caused by misuse.",
    ],
    refundTitle: "How is the refund issued?",
    refundBody:
      "Since payment is made in cash on delivery, refunds are issued via bank or postal transfer to your account within 7 business days after the return is accepted and the product inspected. Original shipping costs are deducted from the refunded amount unless the error was ours (wrong or damaged product).",
    ctaTitle: "Need to return a product?",
    ctaBody:
      "Have your order code and product photos ready, then write to us via the contact form and we'll take care of the rest.",
    ctaButton: "Contact us",
  },
};

export const Route = createFileRoute("/returns")({
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
      links: [{ rel: "canonical", href: canonicalUrl("/returns") }],
    };
  },
  component: ReturnsPage,
});

function ReturnsPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const c = content[locale];
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="text-eyebrow text-muted-foreground">{c.eyebrow}</p>
        <h1 className="mt-2 text-display">{c.title}</h1>
        <p className="mt-6 text-body text-muted-foreground">{c.lead}</p>

        <section className="mt-10 rounded-[30px] border border-border bg-card p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
              <Timer className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-h3">{c.windowTitle}</h2>
          </div>
          <p className="mt-4 text-body text-muted-foreground">{c.windowBody}</p>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-h3">{c.conditionsTitle}</h2>
          </div>
          <ul className="mt-5 space-y-3">
            {c.conditions.map((condition) => (
              <li
                key={condition.slice(0, 24)}
                className="rounded-[16px] border border-border bg-card px-5 py-4 text-small text-muted-foreground"
              >
                {condition}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
              <RotateCcw className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-h3">{c.stepsTitle}</h2>
          </div>
          <ol className="mt-5 space-y-3">
            {c.steps.map((step, index) => (
              <li key={step.slice(0, 24)} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-small font-semibold">
                  {index + 1}
                </span>
                <p className="pt-1 text-small text-muted-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 rounded-[24px] border border-border bg-muted/50 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h2 className="text-h3">{c.exceptionsTitle}</h2>
          </div>
          <ul className="mt-4 list-disc space-y-2 ps-5 text-small text-muted-foreground">
            {c.exceptions.map((exception) => (
              <li key={exception.slice(0, 24)}>{exception}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-h3">{c.refundTitle}</h2>
          <p className="mt-4 text-body text-muted-foreground">{c.refundBody}</p>
        </section>

        <section className="mt-10 rounded-[30px] border border-border bg-card p-8 text-center sm:p-10">
          <h2 className="text-h3">{c.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-md text-small text-muted-foreground">{c.ctaBody}</p>
          <Button asChild className="mt-6 h-12 rounded-full px-8">
            <Link to="/contact" search={{ locale }}>
              {c.ctaButton}
            </Link>
          </Button>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
