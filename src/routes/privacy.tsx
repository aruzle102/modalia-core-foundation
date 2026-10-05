import { createFileRoute } from "@tanstack/react-router";
import { Cookie, Eye, Lock, Share2, UserCheck } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import { canonicalUrl } from "@/lib/seo";
import type { SupportedLocale } from "@/config/platform";

type PrivacySection = { title: string; paragraphs: string[]; bullets?: string[] };

type PrivacyContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  sections: PrivacySection[];
};

const sectionIcons = [Eye, Lock, Share2, Cookie, UserCheck];

const content: Record<SupportedLocale, PrivacyContent> = {
  ar: {
    metaTitle: "سياسة الخصوصية — موداليا",
    metaDescription:
      "كيف تجمع موداليا بياناتك وتستخدمها وتحميها: البيانات المجمّعة، الاستخدام، الكوكيز، وحقوقك.",
    eyebrow: "الخصوصية",
    title: "سياسة الخصوصية",
    lead: "نأخذ خصوصيتك بجدية. توضح هذه السياسة البيانات التي نجمعها عند استخدامك موداليا، وكيف نستخدمها، ومع من نشاركها، وما هي حقوقك.",
    updated: "آخر تحديث: أكتوبر 2026",
    sections: [
      {
        title: "البيانات التي نجمعها",
        paragraphs: ["نجمع فقط البيانات الضرورية لتشغيل السوق ومعالجة طلباتك:"],
        bullets: [
          "بيانات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف، وكلمة المرور المشفّرة.",
          "بيانات الطلب: عنوان التوصيل، الولاية والبلدية، تفاصيل الطلب، وسجل المشتريات.",
          "بيانات التواصل: رسائلك عبر نموذج الاتصال ومراسلات خدمة الزبائن.",
          "بيانات الاستخدام التقنية: نوع الجهاز والمتصفح، الصفحات المزارة، وعنوان IP — لأغراض الأمان وتحسين الخدمة.",
        ],
      },
      {
        title: "كيف نستخدم بياناتك",
        paragraphs: ["نستخدم بياناتك حصريًا للأغراض التالية:"],
        bullets: [
          "معالجة طلباتك وتنسيق التوصيل مع البائعين وشركات الشحن.",
          "التواصل معك بخصوص طلباتك (تأكيد، تتبّع، دعم).",
          "حماية المنصة من الاحتيال وإساءة الاستخدام.",
          "تحسين تجربة التسوّق وخدماتنا — بشكل مجهول الهوية كلما أمكن.",
        ],
      },
      {
        title: "مع من نشارك بياناتك",
        paragraphs: [
          "لا نبيع بياناتك الشخصية لأي طرف ثالث إطلاقًا. نشارك الحد الأدنى الضروري فقط مع:",
        ],
        bullets: [
          "البائعون: يرون فقط بيانات التوصيل الخاصة بطلباتهم (الاسم، الهاتف، العنوان) لتنفيذ طلبك — ولا يطّلعون على بيانات حسابك الأخرى.",
          "شركات التوصيل: بيانات التوصيل اللازمة لإيصال طردك.",
          "الجهات القانونية: عند وجود التزام قانوني أو طلب قضائي رسمي.",
        ],
      },
      {
        title: "ملفات تعريف الارتباط (الكوكيز)",
        paragraphs: [
          "نستخدم ملفات تعريف ارتباط أساسية لعمل الموقع (تسجيل الدخول، السلة، لغة العرض). ولفهم كيفية استخدام السوق، نسجّل أحداث تصفّح مجهولة — مشاهدات الصفحات والمنتجات، عمليات البحث، السلال، بدء إتمام الشراء والمشتريات. ترتبط هذه الأحداث بمعرّف عشوائي محفوظ على جهازك فقط؛ لا توجد كوكيز تتبّع من طرف ثالث ولا ملفات إعلانية.",
          "نحترم إشارة «عدم التتبع» (Do-Not-Track) في متصفحك: عند تفعيلها لا يُسجَّل أي شيء. يرى البائعون فقط أحداثاً مجمّعة لمتجرهم، ويرى المسؤولون إحصائيات مجمّعة للمنصة. كل رقم معروض يُحسب من أحداث حقيقية مسجّلة — لا تقديرات ولا بيانات خارجية.",
        ],
      },
      {
        title: "حقوقك",
        paragraphs: ["لك الحق الكامل في بياناتك الشخصية:"],
        bullets: [
          "الاطلاع: طلب نسخة من البيانات التي نحتفظ بها عنك.",
          "التصحيح: تعديل أي بيانات غير دقيقة من إعدادات حسابك أو عبر مراسلتنا.",
          "الحذف: طلب حذف حسابك وبياناتك الشخصية، مع مراعاة الالتزامات القانونية للاحتفاظ ببعض السجلات.",
          "الاعتراض: الاعتراض على معالجة بياناتك لأغراض تسويقية — ونؤكد أننا لا نرسل رسائل تسويقية دون موافقتك.",
        ],
      },
    ],
  },
  fr: {
    metaTitle: "Politique de confidentialité — Modalia",
    metaDescription:
      "Comment Modalia collecte, utilise et protège vos données : données collectées, usage, cookies et vos droits.",
    eyebrow: "Confidentialité",
    title: "Politique de confidentialité",
    lead: "Votre vie privée nous tient à cœur. Cette politique explique les données que nous collectons lorsque vous utilisez Modalia, comment nous les utilisons, avec qui nous les partageons et quels sont vos droits.",
    updated: "Dernière mise à jour : octobre 2026",
    sections: [
      {
        title: "Les données que nous collectons",
        paragraphs: [
          "Nous collectons uniquement les données nécessaires au fonctionnement de la marketplace et au traitement de vos commandes :",
        ],
        bullets: [
          "Données de compte : nom, e-mail, numéro de téléphone et mot de passe chiffré.",
          "Données de commande : adresse de livraison, wilaya et commune, détails de la commande et historique d'achats.",
          "Données de contact : vos messages via le formulaire de contact et les échanges avec le service client.",
          "Données techniques d'usage : type d'appareil et de navigateur, pages visitées et adresse IP — pour la sécurité et l'amélioration du service.",
        ],
      },
      {
        title: "Comment nous utilisons vos données",
        paragraphs: ["Nous utilisons vos données exclusivement pour :"],
        bullets: [
          "Traiter vos commandes et coordonner la livraison avec les vendeurs et les transporteurs.",
          "Communiquer avec vous au sujet de vos commandes (confirmation, suivi, assistance).",
          "Protéger la plateforme contre la fraude et les abus.",
          "Améliorer l'expérience d'achat et nos services — de manière anonymisée chaque fois que possible.",
        ],
      },
      {
        title: "Avec qui nous partageons vos données",
        paragraphs: [
          "Nous ne vendons jamais vos données personnelles à des tiers. Nous partageons uniquement le strict nécessaire avec :",
        ],
        bullets: [
          "Les vendeurs : ils ne voient que les données de livraison de leurs propres commandes (nom, téléphone, adresse) pour les exécuter — sans accès au reste de votre compte.",
          "Les transporteurs : les données de livraison nécessaires à l'acheminement de votre colis.",
          "Les autorités : en cas d'obligation légale ou de demande judiciaire officielle.",
        ],
      },
      {
        title: "Cookies",
        paragraphs: [
          "Nous utilisons des cookies essentiels au fonctionnement du site (connexion, panier, langue d'affichage). Pour comprendre l'usage de la marketplace, nous enregistrons des événements de navigation anonymes — pages vues, produits vus, recherches, paniers, démarrages de commande et achats. Ces événements sont liés à un identifiant aléatoire stocké sur votre seul appareil ; aucun cookie de suivi tiers ni profil publicitaire.",
          "Le signal Do-Not-Track de votre navigateur est respecté : lorsqu'il est activé, rien n'est enregistré. Les vendeurs ne voient que les événements agrégés de leur propre boutique, et les administrateurs des agrégats à l'échelle de la plateforme. Chaque chiffre publié est calculé à partir d'événements réellement enregistrés — jamais estimé ni enrichi de données externes.",
        ],
      },
      {
        title: "Vos droits",
        paragraphs: ["Vous disposez de droits complets sur vos données personnelles :"],
        bullets: [
          "Accès : demander une copie des données que nous détenons sur vous.",
          "Rectification : corriger toute donnée inexacte depuis les paramètres de votre compte ou en nous écrivant.",
          "Suppression : demander la suppression de votre compte et de vos données personnelles, sous réserve des obligations légales de conservation.",
          "Opposition : vous opposer au traitement de vos données à des fins marketing — nous ne vous envoyons d'ailleurs aucun message marketing sans votre consentement.",
        ],
      },
    ],
  },
  en: {
    metaTitle: "Privacy policy — Modalia",
    metaDescription:
      "How Modalia collects, uses, and protects your data: collected data, usage, cookies, and your rights.",
    eyebrow: "Privacy",
    title: "Privacy policy",
    lead: "We take your privacy seriously. This policy explains what data we collect when you use Modalia, how we use it, who we share it with, and what your rights are.",
    updated: "Last updated: October 2026",
    sections: [
      {
        title: "Data we collect",
        paragraphs: [
          "We collect only the data needed to run the marketplace and process your orders:",
        ],
        bullets: [
          "Account data: name, email, phone number, and encrypted password.",
          "Order data: delivery address, wilaya and commune, order details, and purchase history.",
          "Contact data: your messages via the contact form and customer-service correspondence.",
          "Technical usage data: device and browser type, visited pages, and IP address — for security and service improvement.",
        ],
      },
      {
        title: "How we use your data",
        paragraphs: ["We use your data exclusively for:"],
        bullets: [
          "Processing your orders and coordinating delivery with sellers and carriers.",
          "Communicating with you about your orders (confirmation, tracking, support).",
          "Protecting the platform against fraud and abuse.",
          "Improving the shopping experience and our services — anonymized whenever possible.",
        ],
      },
      {
        title: "Who we share your data with",
        paragraphs: [
          "We never sell your personal data to any third party. We share only the minimum necessary with:",
        ],
        bullets: [
          "Sellers: they only see the delivery details of their own orders (name, phone, address) to fulfill them — with no access to the rest of your account.",
          "Delivery carriers: the delivery details needed to get your parcel to you.",
          "Authorities: when required by law or an official judicial request.",
        ],
      },
      {
        title: "Cookies & analytics",
        paragraphs: [
          "We use essential cookies for the site to work (login, cart, display language). To understand how the marketplace is used, we record anonymous storefront events — page views, product views, searches, bags, checkouts and purchases. These events are linked to a random identifier stored on your own device only; there are no third-party tracking cookies and no advertising profiles.",
          "Your browser's Do-Not-Track signal is honored: when it is on, nothing is recorded. Sellers see only aggregated events for their own store, and administrators see platform-wide aggregates. Every published metric is computed from real recorded events — never estimated or enriched with outside data.",
        ],
      },
      {
        title: "Your rights",
        paragraphs: ["You have full rights over your personal data:"],
        bullets: [
          "Access: request a copy of the data we hold about you.",
          "Correction: fix any inaccurate data from your account settings or by writing to us.",
          "Deletion: request deletion of your account and personal data, subject to legal record-keeping obligations.",
          "Objection: object to your data being processed for marketing — and we never send marketing messages without your consent.",
        ],
      },
    ],
  },
};

export const Route = createFileRoute("/privacy")({
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
      links: [{ rel: "canonical", href: canonicalUrl("/privacy") }],
    };
  },
  component: PrivacyPage,
});

function PrivacyPage() {
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
          {c.sections.map((section, index) => {
            const Icon = sectionIcons[index % sectionIcons.length]!;
            return (
              <section key={section.title}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                    <Icon className="h-5 w-5" aria-hidden />
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
                {section.bullets ? (
                  <ul className="mt-4 list-disc space-y-2 ps-5 text-small text-muted-foreground">
                    {section.bullets.map((bullet) => (
                      <li key={bullet.slice(0, 24)}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
