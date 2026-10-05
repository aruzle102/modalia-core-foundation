import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Banknote, ShieldCheck, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/layout/site-shell";
import { getLocale, getTranslations, localeDirections } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

type Advantage = { title: string; body: string };

type AboutContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lead: string;
  missionEyebrow: string;
  missionTitle: string;
  missionParagraphs: string[];
  whyEyebrow: string;
  whyTitle: string;
  advantages: Advantage[];
  sellersEyebrow: string;
  sellersTitle: string;
  sellersBody: string;
  sellersCta: string;
};

const advantageIcons = [Banknote, Store, Truck, ShieldCheck];

const content: Record<SupportedLocale, AboutContent> = {
  ar: {
    metaTitle: "من نحن — موداليا",
    metaDescription:
      "موداليا سوق جزائري من الطراز الرفيع: بائعون مستقلون موثّقون، دفع عند الاستلام، وتوصيل شفاف إلى 58 ولاية.",
    eyebrow: "موداليا — من نحن",
    title: "تجارة تستحق أن تعود إليها.",
    lead: "موداليا سوق جزائري من الطراز الرفيع يجمع منتجات مختارة بعناية من بائعين مستقلين — مع توصيل شفاف إلى جميع الولايات، ودفع عند الاستلام، ومعايير ثقة صُمّمت خصيصًا للزبون الجزائري.",
    missionEyebrow: "مهمتنا",
    missionTitle: "سوق مبني على الثقة، من الجزائر وإليها.",
    missionParagraphs: [
      "بدأت موداليا من قناعة بسيطة: التسوّق عبر الإنترنت في الجزائر يستحق تجربة أفضل — منتجات أصلية، أسعار واضحة، وتوصيل يصل فعلًا إلى باب الدار.",
      "نجمع في مكان واحد بائعين مستقلين وحرفيين وعلامات محلية نثق بها، ونوحّد معايير الجودة وخدمة الزبائن، حتى تطلب براحة بال: تعرف من أين يأتي منتجك، وكم سيكلّفك التوصيل، ومتى سيصلك.",
    ],
    whyEyebrow: "لماذا موداليا",
    whyTitle: "أربع وعود نلتزم بها في كل طلب.",
    advantages: [
      {
        title: "الدفع عند الاستلام",
        body: "لا دفع مسبق ولا بطاقات بنكية. تدفع نقدًا فقط عندما يصل طلبك إلى يديك وتتأكد منه.",
      },
      {
        title: "بائعون موثّقون ومنتجات مختارة",
        body: "كل متجر على موداليا يمرّ بمراجعة قبل النشر. نتعاون مع بائعين مستقلين تُنتقى منتجاتهم بعناية — لا سوق مفتوح بلا معايير.",
      },
      {
        title: "توصيل شفاف إلى 58 ولاية",
        body: "توصيل منزلي أو إلى مكتب التوصيل، مع أسعار شحن واضحة تُحسب في صفحة الدفع حسب ولايتك ووزن الطرد — بلا مفاجآت.",
      },
      {
        title: "حماية المشتري",
        body: "إن وصلك منتج مختلف أو تالف، يتدخل فريقنا لحل المشكلة: استبدال أو استرجاع وفق سياسة واضحة تحمي حقك.",
      },
    ],
    sellersEyebrow: "للبائعين",
    sellersTitle: "عندك منتج يستحق أن يُرى؟",
    sellersBody:
      "انضم إلى موداليا واعرض منتجاتك أمام آلاف الزبائن في 58 ولاية، مع لوحة تحكّم للطلبات والمخزون ودعم لوجستي للتوصيل. التقديم مجاني، ونراجع كل طلب بعناية.",
    sellersCta: "قدّم طلبك كبائع",
  },
  fr: {
    metaTitle: "À propos — Modalia",
    metaDescription:
      "Modalia, marketplace algérienne premium : vendeurs indépendants vérifiés, paiement à la livraison et livraison transparente vers 58 wilayas.",
    eyebrow: "Modalia — À propos",
    title: "Un commerce qui donne envie de revenir.",
    lead: "Modalia est une marketplace algérienne premium qui réunit des produits sélectionnés avec soin auprès de vendeurs indépendants — livraison transparente vers les 58 wilayas, paiement à la livraison, et des standards de confiance pensés pour le client algérien.",
    missionEyebrow: "Notre mission",
    missionTitle: "Une marketplace bâtie sur la confiance, par l'Algérie et pour l'Algérie.",
    missionParagraphs: [
      "Modalia est née d'une conviction simple : l'achat en ligne en Algérie mérite mieux — des produits authentiques, des prix clairs et une livraison qui arrive vraiment jusqu'à votre porte.",
      "Nous réunissons en un seul endroit des vendeurs indépendants, des artisans et des marques locales en qui nous avons confiance, avec des standards unifiés de qualité et de service client, pour que vous commandiez l'esprit tranquille : vous savez d'où vient votre produit, combien coûte la livraison et quand il arrivera.",
    ],
    whyEyebrow: "Pourquoi Modalia",
    whyTitle: "Quatre promesses, tenues à chaque commande.",
    advantages: [
      {
        title: "Paiement à la livraison",
        body: "Ni paiement d'avance ni carte bancaire. Vous payez en espèces uniquement lorsque votre commande arrive entre vos mains.",
      },
      {
        title: "Vendeurs vérifiés, produits sélectionnés",
        body: "Chaque boutique Modalia est examinée avant publication. Nous travaillons avec des vendeurs indépendants dont les produits sont choisis avec soin — pas un marché ouvert sans standards.",
      },
      {
        title: "Livraison transparente vers 58 wilayas",
        body: "Livraison à domicile ou au bureau (stopdesk), avec des frais de port clairs calculés au checkout selon votre wilaya et le poids du colis — sans surprise.",
      },
      {
        title: "Protection de l'acheteur",
        body: "Si vous recevez un produit différent ou endommagé, notre équipe intervient : échange ou retour selon une politique claire qui protège vos droits.",
      },
    ],
    sellersEyebrow: "Pour les vendeurs",
    sellersTitle: "Vous avez un produit qui mérite d'être vu ?",
    sellersBody:
      "Rejoignez Modalia et présentez vos produits à des milliers de clients dans 58 wilayas, avec un tableau de bord pour les commandes et le stock, et un accompagnement logistique pour la livraison. La candidature est gratuite et chaque demande est examinée avec soin.",
    sellersCta: "Devenir vendeur",
  },
  en: {
    metaTitle: "About — Modalia",
    metaDescription:
      "Modalia is a premium Algerian marketplace: verified independent sellers, cash on delivery, and transparent shipping to 58 wilayas.",
    eyebrow: "Modalia — About",
    title: "Commerce worth returning to.",
    lead: "Modalia is a premium Algerian marketplace bringing together carefully curated products from independent sellers — transparent delivery across all 58 wilayas, cash on delivery, and trust standards designed for the Algerian customer.",
    missionEyebrow: "Our mission",
    missionTitle: "A marketplace built on trust, from Algeria and for Algeria.",
    missionParagraphs: [
      "Modalia started from a simple belief: online shopping in Algeria deserves better — authentic products, clear prices, and delivery that actually reaches your door.",
      "We bring independent sellers, artisans, and local brands we trust into one place, with unified standards for quality and customer care, so you can order with peace of mind: you know where your product comes from, what delivery costs, and when it will arrive.",
    ],
    whyEyebrow: "Why Modalia",
    whyTitle: "Four promises we keep on every order.",
    advantages: [
      {
        title: "Cash on delivery",
        body: "No advance payment, no bank cards. You pay in cash only when your order is in your hands.",
      },
      {
        title: "Verified sellers, curated products",
        body: "Every Modalia store is reviewed before going live. We work with independent sellers whose products are carefully selected — not an open market without standards.",
      },
      {
        title: "Transparent delivery to 58 wilayas",
        body: "Home delivery or stopdesk pickup, with clear shipping fees calculated at checkout based on your wilaya and parcel weight — no surprises.",
      },
      {
        title: "Buyer protection",
        body: "If you receive a wrong or damaged item, our team steps in: exchange or return under a clear policy that protects your rights.",
      },
    ],
    sellersEyebrow: "For sellers",
    sellersTitle: "Have a product that deserves to be seen?",
    sellersBody:
      "Join Modalia and showcase your products to thousands of customers across 58 wilayas, with a dashboard for orders and inventory and logistical support for delivery. Applying is free, and every application is carefully reviewed.",
    sellersCta: "Apply as a seller",
  },
};

export const Route = createFileRoute("/about")({
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
    };
  },
  component: AboutPage,
});

function AboutPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const c = content[locale];
  return (
    <div dir={localeDirections[locale]} lang={locale} className="min-h-screen bg-background">
      <SiteHeader locale={locale} t={t} />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <p className="text-eyebrow text-muted-foreground">{c.eyebrow}</p>
        <h1 className="mt-2 max-w-2xl text-display">{c.title}</h1>
        <p className="mt-6 max-w-2xl text-body text-muted-foreground">{c.lead}</p>

        <section className="mt-16">
          <p className="text-eyebrow text-muted-foreground">{c.missionEyebrow}</p>
          <h2 className="mt-2 text-h3">{c.missionTitle}</h2>
          <div className="mt-6 space-y-4">
            {c.missionParagraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="text-body text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <p className="text-eyebrow text-muted-foreground">{c.whyEyebrow}</p>
          <h2 className="mt-2 text-h3">{c.whyTitle}</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {c.advantages.map((advantage, index) => {
              const Icon = advantageIcons[index % advantageIcons.length]!;
              return (
                <div
                  key={advantage.title}
                  className="rounded-[24px] border border-border bg-card p-6"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-h3">{advantage.title}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{advantage.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-16 rounded-[30px] border border-border bg-card p-8 sm:p-10">
          <p className="text-eyebrow text-muted-foreground">{c.sellersEyebrow}</p>
          <h2 className="mt-2 text-h3">{c.sellersTitle}</h2>
          <p className="mt-4 text-body text-muted-foreground">{c.sellersBody}</p>
          <Button asChild className="mt-6 h-12 rounded-full px-8">
            <Link to="/become-a-seller" search={{ locale }}>
              <Store className="h-4 w-4" aria-hidden />
              {c.sellersCta}
            </Link>
          </Button>
        </section>

        <section className="mt-10 flex items-center gap-2 text-small text-muted-foreground">
          <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span>Modalia — {c.eyebrow}</span>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}
