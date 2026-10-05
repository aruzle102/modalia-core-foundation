import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { canonicalUrl, faqJsonLd, jsonLdScript } from "@/lib/seo";
import type { SupportedLocale } from "@/config/platform";

type Faq = { question: string; answer: string };

type HelpContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lead: string;
  faqEyebrow: string;
  faqTitle: string;
  faqs: Faq[];
  ctaEyebrow: string;
  ctaTitle: string;
  ctaBody: string;
  trackCta: string;
  contactCta: string;
};

const content: Record<SupportedLocale, HelpContent> = {
  ar: {
    metaTitle: "مركز المساعدة — موداليا",
    metaDescription:
      "أجوبة عن الطلب، الدفع عند الاستلام، الشحن إلى 58 ولاية، تتبّع الطلب، الإرجاع، والبيع على موداليا.",
    eyebrow: "مركز المساعدة",
    title: "مساعدة الطلبات، بكل بساطة.",
    lead: "كل ما تحتاج معرفته عن الطلب من موداليا: من تأكيد الطلب إلى التوصيل والإرجاع. لم تجد جوابك؟ فريقنا في الخدمة.",
    faqEyebrow: "الأسئلة الشائعة",
    faqTitle: "أجوبة سريعة عن أكثر ما يُسأل.",
    faqs: [
      {
        question: "كيف أطلب من موداليا؟",
        answer:
          "أضف المنتجات إلى السلة، ثم انتقل إلى صفحة الدفع وأدخل اسمك ورقم هاتفك والولاية والبلدية والعنوان، وأكّد الطلب. ستصلك مكالمة أو رسالة تأكيد قبل الشحن، ثم يصلك الطرد إلى العنوان الذي اخترته.",
      },
      {
        question: "ما هي وسائل الدفع المقبولة؟",
        answer:
          "الدفع عند الاستلام نقدًا فقط. تدفع ثمن طلبك (المنتجات + الشحن) لساعي التوصيل لحظة استلام الطرد — لا حاجة لبطاقة بنكية ولا لأي دفع مسبق.",
      },
      {
        question: "هل توصّلون إلى ولايتي؟",
        answer:
          "نعم، نوصّل إلى جميع الولايات الـ58. يمكنك اختيار التوصيل إلى المنزل أو الاستلام من مكتب التوصيل (stopdesk) حسب ما يتوفر في ولايتك وبلديتك.",
      },
      {
        question: "كم تكلفة الشحن؟",
        answer:
          "تُحسب تكلفة الشحن في صفحة الدفع حسب ولايتك وبلديتك وطريقة التوصيل (منزلي أو مكتبي) ووزن الطرد. سترى السعر النهائي كاملًا قبل تأكيد الطلب، بلا أي رسوم خفية.",
      },
      {
        question: "كيف أتتبّع طلبي؟",
        answer:
          "استعمل رمز الطلب الذي استلمته عند تأكيد الطلب مع رقم الهاتف المستعمل فيه، في صفحة «تتبّع الطلب»، لمتابعة حالة التوصيل خطوة بخطوة.",
      },
      {
        question: "كم تستغرق مدة التوصيل؟",
        answer:
          "عادة من 24 إلى 72 ساعة للولايات الكبرى، ومن يومين إلى 5 أيام لبقية الولايات. قد تطول المدة قليلًا في المناطق النائية أو خلال مواسم الذروة.",
      },
      {
        question: "ما هي سياسة الإرجاع والاستبدال؟",
        answer:
          "يمكنك طلب الإرجاع أو الاستبدال خلال 7 أيام من استلام الطلب، بشرط أن يكون المنتج غير مستعمل وفي تغليفه الأصلي. راجع صفحة سياسة الإرجاع للاطلاع على الشروط والخطوات الكاملة.",
      },
      {
        question: "هل يمكنني تعديل طلبي أو إلغاؤه؟",
        answer:
          "نعم، ما دام الطلب لم يُشحن بعد. تواصل معنا عبر نموذج الاتصال مع ذكر رمز طلبك، وسنساعدك في التعديل أو الإلغاء في أقرب وقت.",
      },
      {
        question: "كيف أصبح بائعًا على موداليا؟",
        answer:
          "قدّم طلبك من صفحة «كن بائعًا» مع معلومات متجرك ومنتجاتك. نراجع كل طلب بعناية، وعند القبول تحصل على لوحة تحكّم لإدارة منتجاتك وطلباتك ومخزونك.",
      },
      {
        question: "هل معلوماتي الشخصية آمنة؟",
        answer:
          "نعم. نستخدم بياناتك فقط لمعالجة طلبك وتحسين الخدمة، ولا نبيعها لأي طرف ثالث إطلاقًا. راجع سياسة الخصوصية لمعرفة التفاصيل الكاملة.",
      },
    ],
    ctaEyebrow: "ما زلت تحتاج مساعدة؟",
    ctaTitle: "فريقنا جاهز لخدمتك.",
    ctaBody: "تتبّع طلبك مباشرة برمز الطلب، أو راسلنا وسنردّ عليك في أقرب وقت.",
    trackCta: "تتبّع طلبك",
    contactCta: "اتصل بنا",
  },
  fr: {
    metaTitle: "Centre d'aide — Modalia",
    metaDescription:
      "Réponses sur la commande, le paiement à la livraison, l'expédition vers 58 wilayas, le suivi, les retours et la vente sur Modalia.",
    eyebrow: "Centre d'aide",
    title: "L'aide aux commandes, en toute simplicité.",
    lead: "Tout ce qu'il faut savoir pour commander sur Modalia : de la confirmation à la livraison et aux retours. Vous ne trouvez pas votre réponse ? Notre équipe est là.",
    faqEyebrow: "Questions fréquentes",
    faqTitle: "Des réponses rapides aux questions les plus posées.",
    faqs: [
      {
        question: "Comment commander sur Modalia ?",
        answer:
          "Ajoutez les produits au panier, puis rendez-vous au checkout : saisissez votre nom, votre numéro de téléphone, votre wilaya, votre commune et votre adresse, puis confirmez. Vous recevrez un appel ou un message de confirmation avant l'expédition, puis votre colis arrivera à l'adresse choisie.",
      },
      {
        question: "Quels moyens de paiement acceptez-vous ?",
        answer:
          "Le paiement à la livraison en espèces uniquement. Vous réglez le montant de votre commande (produits + livraison) au livreur à la réception du colis — aucune carte bancaire ni paiement d'avance n'est nécessaire.",
      },
      {
        question: "Livrez-vous dans ma wilaya ?",
        answer:
          "Oui, nous livrons dans les 58 wilayas. Vous pouvez choisir la livraison à domicile ou le retrait au bureau (stopdesk), selon les options disponibles dans votre wilaya et votre commune.",
      },
      {
        question: "Combien coûte la livraison ?",
        answer:
          "Les frais de livraison sont calculés au checkout selon votre wilaya, votre commune, le mode de livraison (domicile ou bureau) et le poids du colis. Vous voyez le prix final complet avant de confirmer votre commande, sans aucun frais caché.",
      },
      {
        question: "Comment suivre ma commande ?",
        answer:
          "Utilisez le code de commande reçu lors de la confirmation, avec le numéro de téléphone utilisé pour la commande, sur la page « Suivre ma commande » pour voir l'avancement de la livraison étape par étape.",
      },
      {
        question: "Quel est le délai de livraison ?",
        answer:
          "En général 24 à 72 heures pour les grandes wilayas, et 2 à 5 jours pour les autres. Le délai peut être un peu plus long dans les zones reculées ou pendant les périodes de forte demande.",
      },
      {
        question: "Quelle est votre politique de retour et d'échange ?",
        answer:
          "Vous pouvez demander un retour ou un échange dans les 7 jours suivant la réception, à condition que le produit soit inutilisé et dans son emballage d'origine. Consultez la page de politique de retour pour les conditions et les étapes complètes.",
      },
      {
        question: "Puis-je modifier ou annuler ma commande ?",
        answer:
          "Oui, tant que la commande n'a pas encore été expédiée. Contactez-nous via le formulaire de contact en indiquant votre code de commande, et nous vous aiderons à la modifier ou à l'annuler au plus vite.",
      },
      {
        question: "Comment devenir vendeur sur Modalia ?",
        answer:
          "Déposez votre candidature depuis la page « Devenir vendeur » avec les informations sur votre boutique et vos produits. Chaque demande est examinée avec soin ; une fois acceptée, vous accédez à un tableau de bord pour gérer vos produits, vos commandes et votre stock.",
      },
      {
        question: "Mes données personnelles sont-elles en sécurité ?",
        answer:
          "Oui. Nous utilisons vos données uniquement pour traiter votre commande et améliorer le service, et nous ne les vendons jamais à des tiers. Consultez notre politique de confidentialité pour tous les détails.",
      },
    ],
    ctaEyebrow: "Encore besoin d'aide ?",
    ctaTitle: "Notre équipe est prête à vous aider.",
    ctaBody:
      "Suivez votre commande directement avec votre code, ou écrivez-nous et nous vous répondrons au plus vite.",
    trackCta: "Suivre ma commande",
    contactCta: "Nous contacter",
  },
  en: {
    metaTitle: "Help center — Modalia",
    metaDescription:
      "Answers about ordering, cash on delivery, shipping to 58 wilayas, order tracking, returns, and selling on Modalia.",
    eyebrow: "Help center",
    title: "Order help, made simple.",
    lead: "Everything you need to know about ordering from Modalia: from checkout to delivery and returns. Can't find your answer? Our team is here to help.",
    faqEyebrow: "Frequently asked questions",
    faqTitle: "Quick answers to the most asked questions.",
    faqs: [
      {
        question: "How do I place an order on Modalia?",
        answer:
          "Add products to your cart, then go to checkout: enter your name, phone number, wilaya, commune, and address, then confirm. You'll receive a confirmation call or message before shipping, and your parcel will arrive at the address you chose.",
      },
      {
        question: "What payment methods do you accept?",
        answer:
          "Cash on delivery only. You pay for your order (products + shipping) to the courier when you receive your parcel — no bank card or advance payment needed.",
      },
      {
        question: "Do you deliver to my wilaya?",
        answer:
          "Yes, we deliver to all 58 wilayas. You can choose home delivery or stopdesk pickup, depending on what's available in your wilaya and commune.",
      },
      {
        question: "How much does shipping cost?",
        answer:
          "Shipping fees are calculated at checkout based on your wilaya, commune, delivery method (home or stopdesk), and parcel weight. You see the full final price before confirming your order, with no hidden fees.",
      },
      {
        question: "How do I track my order?",
        answer:
          "Use the order code you received at confirmation, along with the phone number used for the order, on the “Track order” page to follow your delivery step by step.",
      },
      {
        question: "How long does delivery take?",
        answer:
          "Usually 24 to 72 hours for major wilayas, and 2 to 5 days for the rest. It may take a little longer in remote areas or during peak periods.",
      },
      {
        question: "What is your return and exchange policy?",
        answer:
          "You can request a return or exchange within 7 days of receiving your order, provided the product is unused and in its original packaging. See the returns policy page for the full conditions and steps.",
      },
      {
        question: "Can I modify or cancel my order?",
        answer:
          "Yes, as long as the order hasn't shipped yet. Contact us through the contact form with your order code, and we'll help you modify or cancel it as soon as possible.",
      },
      {
        question: "How do I become a seller on Modalia?",
        answer:
          "Apply from the “Become a seller” page with your store and product information. Every application is carefully reviewed; once accepted, you get a dashboard to manage your products, orders, and inventory.",
      },
      {
        question: "Is my personal information safe?",
        answer:
          "Yes. We use your data only to process your order and improve the service, and we never sell it to third parties. See our privacy policy for the full details.",
      },
    ],
    ctaEyebrow: "Still need help?",
    ctaTitle: "Our team is ready to help.",
    ctaBody:
      "Track your order directly with your order code, or write to us and we'll reply as soon as possible.",
    trackCta: "Track your order",
    contactCta: "Contact us",
  },
};

export const Route = createFileRoute("/help")({
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
      links: [{ rel: "canonical", href: canonicalUrl("/help") }],
      scripts: [jsonLdScript(faqJsonLd(c.faqs))],
    };
  },
  component: HelpPage,
});

function HelpPage() {
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

        <section className="mt-14">
          <p className="text-eyebrow text-muted-foreground">{c.faqEyebrow}</p>
          <h2 className="mt-2 text-h3">{c.faqTitle}</h2>
          <Accordion type="single" collapsible className="mt-6">
            {c.faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-start text-body">{faq.question}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-small text-muted-foreground">{faq.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="mt-14 rounded-[30px] border border-border bg-card p-8 text-center sm:p-10">
          <p className="text-eyebrow text-muted-foreground">{c.ctaEyebrow}</p>
          <h2 className="mt-2 text-h3">{c.ctaTitle}</h2>
          <p className="mx-auto mt-4 max-w-md text-small text-muted-foreground">{c.ctaBody}</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="h-12 rounded-full px-8">
              <Link to="/track-order" search={{ locale }}>
                {c.trackCta}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-full px-8">
              <Link to="/contact" search={{ locale }}>
                {c.contactCta}
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
