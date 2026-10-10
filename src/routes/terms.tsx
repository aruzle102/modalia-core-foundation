import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { canonicalUrl, prefetchSeoSettings, seoRobotsFromHeadCtx } from "@/lib/seo";
import type { SupportedLocale } from "@/config/platform";

type TermsSection = { title: string; paragraphs: string[] };

type TermsContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  sections: TermsSection[];
};

const content: Record<SupportedLocale, TermsContent> = {
  ar: {
    metaTitle: "الشروط والأحكام — موداليا",
    metaDescription: "شروط استخدام سوق موداليا: الحسابات، الطلبات، الأسعار، البائعون، والمسؤولية.",
    eyebrow: "الشروط",
    title: "الشروط والأحكام",
    lead: "باستخدامك لمنصة موداليا فأنت توافق على الشروط التالية. ننصحك بقراءتها بعناية قبل الطلب أو البيع على المنصة.",
    updated: "آخر تحديث: أكتوبر 2026",
    sections: [
      {
        title: "1. تعريفات",
        paragraphs: [
          "«موداليا» أو «المنصة»: السوق الإلكتروني متعدد البائعين الذي تديره موداليا. «البائع»: التاجر المستقل الذي يعرض منتجاته على المنصة. «الزبون» أو «أنت»: كل شخص يتصفح المنصة أو يطلب منها. «الطلب»: عملية الشراء المؤكدة عبر صفحة الدفع.",
        ],
      },
      {
        title: "2. الحسابات",
        paragraphs: [
          "يمكنك التسوّق كزائر دون حساب، لكن إنشاء حساب يمنحك تتبّعًا أسهل لطلباتك وسجل مشترياتك. أنت مسؤول عن الحفاظ على سرية بيانات دخولك وعن كل نشاط يتم عبر حسابك.",
          "يجب أن تكون المعلومات التي تقدمها (الاسم، الهاتف، العنوان) صحيحة ومحدّثة. نحتفظ بالحق في تعليق أي حساب يُستخدم في نشاط احتيالي أو مخالف لهذه الشروط.",
        ],
      },
      {
        title: "3. الطلبات والدفع عند الاستلام",
        paragraphs: [
          "يُعتبر الطلب مؤكدًا بعد إدخال بياناتك في صفحة الدفع والضغط على زر التأكيد. قد نتصل بك هاتفيًا لتأكيد الطلب قبل الشحن — وعدم الرد المتكرر قد يؤدي إلى إلغاء الطلب.",
          "الدفع يتم نقدًا عند استلام الطرد. يجب دفع المبلغ الكامل (ثمن المنتجات + الشحن) لساعي التوصيل. رفض استلام الطرد دون سبب وجيه قد يعرّض حسابك لقيود على الطلبات المستقبلية.",
        ],
      },
      {
        title: "4. الأسعار والشحن",
        paragraphs: [
          "جميع الأسعار معروضة بالدينار الجزائري وتشمل كل الضرائب المطبقة. تُحسب تكاليف الشحن تلقائيًا في صفحة الدفع حسب الولاية والبلدية وطريقة التوصيل ووزن الطرد، وتظهر بوضوح قبل تأكيد الطلب.",
          "نحتفظ بالحق في تصحيح أي خطأ واضح في الأسعار. في حال حدوث ذلك بعد تأكيد طلبك، سنعلمك ونمنحك خيار المتابعة بالسعر الصحيح أو إلغاء الطلب.",
        ],
      },
      {
        title: "5. البائعون والمنتجات",
        paragraphs: [
          "المنتجات معروضة من بائعين مستقلين يتحمل كل منهم مسؤولية دقة وصف منتجاته وجودتها وتوفرها. تراجع موداليا المتاجر قبل قبولها وتضع معايير جودة ملزمة، لكن العقد التجاري للبيع يُبرم بينك وبين البائع.",
          "تبذل موداليا جهودًا معقولة لضمان دقة الصور والأوصاف، لكن قد توجد اختلافات طفيفة (مثل اختلاف درجة اللون حسب الشاشة) لا تُعتبر عيبًا.",
        ],
      },
      {
        title: "6. التوصيل والإرجاع",
        paragraphs: [
          "نوصّل إلى جميع الولايات الـ58 عبر شركاء معتمدين، والمدد المعلنة تقديرية. راجع صفحة سياسة الشحن للتفاصيل.",
          "تخضع طلبات الإرجاع والاستبدال لسياسة الإرجاع الخاصة بنا (مهلة 7 أيام من الاستلام وفق الشروط المعلنة). في حال الخلاف، تتدخل موداليا كوسيط لحماية حق الطرفين وفق سياسة حماية المشتري.",
        ],
      },
      {
        title: "7. الاستخدام الممنوع",
        paragraphs: [
          "يُمنع استخدام المنصة لأي غرض غير قانوني، أو محاولة اختراقها أو تعطيلها، أو تقديم معلومات كاذبة، أو إساءة استخدام نظام الطلبات (مثل الطلبات الوهمية المتكررة). أي مخالفة قد تؤدي إلى تعليق الحساب واتخاذ الإجراءات القانونية اللازمة.",
        ],
      },
      {
        title: "8. المسؤولية",
        paragraphs: [
          "تعمل موداليا كوسيط تقني بين الزبائن والبائعين المستقلين. لا نتحمل المسؤولية عن الأضرار غير المباشرة الناتجة عن استخدام المنصة، وتقتصر مسؤوليتنا — في أقصى حد يسمح به القانون — على قيمة الطلب المعني.",
          "لا نضمن عمل المنصة دون انقطاع تام، لكننا نعمل باستمرار على استقرارها وأمانها.",
        ],
      },
      {
        title: "9. تعديل الشروط والقانون المطبق",
        paragraphs: [
          "قد نحدّث هذه الشروط عند الحاجة، وسيُعلن عن أي تغيير جوهري على المنصة. استمرارك في استخدام موداليا بعد التحديث يعني قبولك للشروط الجديدة.",
          "تخضع هذه الشروط وأي نزاع ناشئ عنها للقانون الجزائري، وتكون المحاكم الجزائرية المختصة هي المرجع في حال تعذّر الحل الودي.",
        ],
      },
    ],
  },
  fr: {
    metaTitle: "Conditions générales — Modalia",
    metaDescription:
      "Conditions d'utilisation de la marketplace Modalia : comptes, commandes, prix, vendeurs et responsabilité.",
    eyebrow: "Conditions",
    title: "Conditions générales d'utilisation",
    lead: "En utilisant la plateforme Modalia, vous acceptez les conditions suivantes. Nous vous invitons à les lire attentivement avant de commander ou de vendre sur la plateforme.",
    updated: "Dernière mise à jour : octobre 2026",
    sections: [
      {
        title: "1. Définitions",
        paragraphs: [
          "« Modalia » ou « la plateforme » : la marketplace multi-vendeurs exploitée par Modalia. « Vendeur » : le commerçant indépendant qui propose ses produits sur la plateforme. « Client » ou « vous » : toute personne qui navigue sur la plateforme ou y commande. « Commande » : l'achat confirmé via la page de checkout.",
        ],
      },
      {
        title: "2. Comptes",
        paragraphs: [
          "Vous pouvez acheter en tant qu'invité sans compte, mais créer un compte vous offre un suivi plus simple de vos commandes et un historique d'achats. Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée via votre compte.",
          "Les informations que vous fournissez (nom, téléphone, adresse) doivent être exactes et à jour. Nous nous réservons le droit de suspendre tout compte utilisé à des fins frauduleuses ou contraires aux présentes conditions.",
        ],
      },
      {
        title: "3. Commandes et paiement à la livraison",
        paragraphs: [
          "La commande est considérée comme confirmée après la saisie de vos informations au checkout et le clic sur le bouton de confirmation. Nous pouvons vous appeler pour confirmer la commande avant expédition — des non-réponses répétées peuvent entraîner l'annulation de la commande.",
          "Le paiement s'effectue en espèces à la réception du colis. Le montant total (produits + livraison) doit être réglé au livreur. Refuser un colis sans motif valable peut entraîner des restrictions sur vos futures commandes.",
        ],
      },
      {
        title: "4. Prix et livraison",
        paragraphs: [
          "Tous les prix sont affichés en dinars algériens et incluent les taxes applicables. Les frais de livraison sont calculés automatiquement au checkout selon la wilaya, la commune, le mode de livraison et le poids du colis, et s'affichent clairement avant confirmation.",
          "Nous nous réservons le droit de corriger toute erreur manifeste de prix. Si cela survient après la confirmation de votre commande, nous vous en informerons et vous pourrez choisir de poursuivre au prix correct ou d'annuler la commande.",
        ],
      },
      {
        title: "5. Vendeurs et produits",
        paragraphs: [
          "Les produits sont proposés par des vendeurs indépendants, chacun responsable de l'exactitude de la description, de la qualité et de la disponibilité de ses produits. Modalia examine les boutiques avant leur acceptation et impose des standards de qualité, mais le contrat de vente est conclu entre vous et le vendeur.",
          "Modalia fait des efforts raisonnables pour garantir l'exactitude des photos et descriptions, mais de légères différences (comme une nuance de couleur selon l'écran) ne constituent pas un défaut.",
        ],
      },
      {
        title: "6. Livraison et retours",
        paragraphs: [
          "Nous livrons dans les 58 wilayas via des partenaires agréés ; les délais annoncés sont estimatifs. Consultez la page de politique de livraison pour les détails.",
          "Les retours et échanges sont soumis à notre politique de retour (délai de 7 jours après réception, selon les conditions publiées). En cas de litige, Modalia intervient en médiateur pour protéger les droits des deux parties, conformément à la protection de l'acheteur.",
        ],
      },
      {
        title: "7. Usages interdits",
        paragraphs: [
          "Il est interdit d'utiliser la plateforme à des fins illégales, de tenter de la pirater ou de la perturber, de fournir de fausses informations, ou d'abuser du système de commandes (par exemple des commandes fictives répétées). Toute violation peut entraîner la suspension du compte et des poursuites judiciaires.",
        ],
      },
      {
        title: "8. Responsabilité",
        paragraphs: [
          "Modalia agit comme intermédiaire technique entre les clients et les vendeurs indépendants. Nous ne sommes pas responsables des dommages indirects résultant de l'utilisation de la plateforme, et notre responsabilité est limitée — dans la mesure permise par la loi — à la valeur de la commande concernée.",
          "Nous ne garantissons pas un fonctionnement sans aucune interruption, mais nous travaillons en continu à la stabilité et à la sécurité de la plateforme.",
        ],
      },
      {
        title: "9. Modification des conditions et droit applicable",
        paragraphs: [
          "Nous pouvons mettre à jour ces conditions si nécessaire ; tout changement substantiel sera annoncé sur la plateforme. Continuer à utiliser Modalia après une mise à jour vaut acceptation des nouvelles conditions.",
          "Les présentes conditions et tout litige en découlant sont soumis au droit algérien, et les tribunaux algériens compétents seront saisis en cas d'échec d'une résolution amiable.",
        ],
      },
    ],
  },
  en: {
    metaTitle: "Terms & conditions — Modalia",
    metaDescription:
      "Terms for using the Modalia marketplace: accounts, orders, pricing, sellers, and liability.",
    eyebrow: "Terms",
    title: "Terms & conditions",
    lead: "By using the Modalia platform, you agree to the following terms. Please read them carefully before ordering or selling on the platform.",
    updated: "Last updated: October 2026",
    sections: [
      {
        title: "1. Definitions",
        paragraphs: [
          "“Modalia” or “the platform”: the multi-vendor marketplace operated by Modalia. “Seller”: the independent merchant offering products on the platform. “Customer” or “you”: anyone browsing or ordering from the platform. “Order”: a purchase confirmed through the checkout page.",
        ],
      },
      {
        title: "2. Accounts",
        paragraphs: [
          "You can shop as a guest without an account, but creating one gives you easier order tracking and a purchase history. You are responsible for keeping your login credentials confidential and for all activity under your account.",
          "The information you provide (name, phone, address) must be accurate and up to date. We reserve the right to suspend any account used for fraudulent activity or in violation of these terms.",
        ],
      },
      {
        title: "3. Orders and cash on delivery",
        paragraphs: [
          "An order is considered confirmed after you enter your details at checkout and click the confirmation button. We may call you to confirm the order before shipping — repeated non-responses may lead to cancellation.",
          "Payment is made in cash upon receiving the parcel. The full amount (products + shipping) must be paid to the courier. Refusing a parcel without valid reason may result in restrictions on future orders.",
        ],
      },
      {
        title: "4. Pricing and shipping",
        paragraphs: [
          "All prices are shown in Algerian dinars and include applicable taxes. Shipping fees are calculated automatically at checkout based on wilaya, commune, delivery method, and parcel weight, and are shown clearly before order confirmation.",
          "We reserve the right to correct any obvious pricing error. If this happens after your order is confirmed, we will inform you and you may choose to proceed at the correct price or cancel the order.",
        ],
      },
      {
        title: "5. Sellers and products",
        paragraphs: [
          "Products are offered by independent sellers, each responsible for the accuracy of their product descriptions, quality, and availability. Modalia reviews stores before acceptance and enforces quality standards, but the sales contract is between you and the seller.",
          "Modalia makes reasonable efforts to ensure photo and description accuracy, but minor differences (such as shade variations depending on the screen) do not constitute a defect.",
        ],
      },
      {
        title: "6. Delivery and returns",
        paragraphs: [
          "We deliver to all 58 wilayas through certified partners; announced timeframes are estimates. See the shipping policy page for details.",
          "Returns and exchanges are subject to our returns policy (7-day window after receipt, per the published conditions). In case of dispute, Modalia acts as mediator to protect both parties' rights under buyer protection.",
        ],
      },
      {
        title: "7. Prohibited use",
        paragraphs: [
          "You may not use the platform for any unlawful purpose, attempt to hack or disrupt it, provide false information, or abuse the ordering system (e.g. repeated fake orders). Any violation may lead to account suspension and legal action.",
        ],
      },
      {
        title: "8. Liability",
        paragraphs: [
          "Modalia acts as a technical intermediary between customers and independent sellers. We are not liable for indirect damages resulting from platform use, and our liability is limited — to the maximum extent permitted by law — to the value of the order in question.",
          "We do not guarantee completely uninterrupted operation, but we work continuously on the platform's stability and security.",
        ],
      },
      {
        title: "9. Changes to terms and governing law",
        paragraphs: [
          "We may update these terms when needed; any material change will be announced on the platform. Continuing to use Modalia after an update constitutes acceptance of the new terms.",
          "These terms and any dispute arising from them are governed by Algerian law, and the competent Algerian courts shall have jurisdiction if an amicable resolution fails.",
        ],
      },
    ],
  },
};

export const Route = createFileRoute("/terms")({
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
      links: [{ rel: "canonical", href: canonicalUrl("/terms") }],
    };
  },
  component: TermsPage,
});

function TermsPage() {
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
        <p className="mt-3 text-caption text-muted-foreground">{c.updated}</p>

        <div className="mt-10 space-y-10">
          {c.sections.map((section) => (
            <section key={section.title}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-h3">{section.title}</h2>
              </div>
              <div className="mt-4 space-y-3">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="text-body text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
