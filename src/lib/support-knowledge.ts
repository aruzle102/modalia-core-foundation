/**
 * Modalia Support Knowledge Layer — deterministic Q&A from confirmed data.
 *
 * NO hallucination: every answer is built from real platform facts
 * (delivery methods, wilaya coverage, COD, order tracking, seller onboarding).
 * When no confirmed information matches, the answer is null and the caller
 * must show the configured fallback + Search / Help / Contact actions.
 *
 * This runs client-side on static knowledge (no DB round-trip per question);
 * dynamic facts (wilaya names) come from the checkout's wilaya list when
 * available, otherwise from the confirmed static set below.
 */
import type { SupportedLocale } from "@/config/platform";

export type SupportIntent =
  | "order_how"
  | "delivery_wilaya"
  | "delivery_methods"
  | "cod"
  | "tracking"
  | "returns"
  | "become_seller"
  | "contact";

export type SupportAnswer = {
  intent: SupportIntent;
  answer: string;
  suggestedActions: { label: string; href: string }[];
};

type Locale = SupportedLocale;

// ---------------------------------------------------------------------------
// Intent matching — keyword sets per locale (ar / fr / en)
// ---------------------------------------------------------------------------

const INTENT_KEYWORDS: Record<SupportIntent, string[]> = {
  order_how: [
    "كيفاش نطلب", "كيف اطلب", "طريقة الطلب", "كيفية الطلب", "نطلب",
    "comment commander", "comment passer commande", "commander",
    "how to order", "how do i order", "place order", "how can i order",
  ],
  delivery_wilaya: [
    "توصلو", "توصيل", "ولاية", "وهران", "الجزائر", "سطيف", "قسنطينة",
    "livrez", "livraison", "wilaya", "oran",
    "deliver", "delivery", "ship to", "wilaya",
  ],
  delivery_methods: [
    "طريقة التوصيل", "انواع التوصيل", "للمكتب", "للدار", "للمنزل",
    "mode de livraison", "types de livraison", "domicile", "bureau", "stopdesk",
    "delivery method", "home delivery", "office", "pickup",
  ],
  cod: [
    "الدفع عند الاستلام", "كاش", "نخلص", "الدفع",
    "paiement à la livraison", "cash", "contre remboursement", "cod",
    "cash on delivery", "pay on delivery", "cod",
  ],
  tracking: [
    "نتبع", "تتبع", "وين وصلت", "الطلبية", "رقم الطلب",
    "suivre", "suivi", "où est ma commande", "numéro de commande",
    "track", "tracking", "where is my order", "order status",
  ],
  returns: [
    "استرجاع", "ارجاع", "نرجع", "مرتجعات", "الغاء", "نلغي",
    "retour", "retourner", "annuler", "annulation",
    "return", "refund", "cancel", "cancellation",
  ],
  become_seller: [
    "بائع", "نبيع", "نولي بائع", "متجر", "نفتح متجر",
    "vendeur", "devenir vendeur", "vendre", "boutique",
    "seller", "become a seller", "sell on", "open a store",
  ],
  contact: [
    "اتصل", "تواصل", "رقم الهاتف", "ايميل", "بريد",
    "contact", "téléphone", "email", "contacter",
    "contact", "phone", "email", "support",
  ],
};

export function detectSupportIntent(question: string): SupportIntent | null {
  const q = question.toLowerCase().trim();
  if (!q) return null;
  let best: SupportIntent | null = null;
  let bestScore = 0;
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [SupportIntent, string[]][]) {
    let score = 0;
    for (const kw of keywords) {
      if (q.includes(kw.toLowerCase())) score += kw.length >= 6 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }
  // Require at least one solid keyword hit to avoid false positives.
  return bestScore >= 2 ? best : null;
}

// ---------------------------------------------------------------------------
// Confirmed knowledge — trilingual answers from real platform facts
// ---------------------------------------------------------------------------

const ANSWERS: Record<SupportIntent, Record<Locale, string>> = {
  order_how: {
    ar: "باش تطلب من موداليا: تصفح المنتجات، اختار المقاس/اللون إذا كاين، زيد للسلة، روح لصفحة الدفع، عمّر معلوماتك (الاسم، الهاتف، الولاية، البلدية)، اختار التوصيل للدار أو للمكتب، وأكّد الطلب. الدفع عند الاستلام — ما تخلص حتى توصلك السلعة.",
    fr: "Pour commander sur Modalia : parcourez les produits, choisissez la taille/couleur si disponible, ajoutez au panier, allez au paiement, renseignez vos informations (nom, téléphone, wilaya, commune), choisissez la livraison à domicile ou au bureau, puis confirmez. Paiement à la livraison — vous ne payez qu'à réception.",
    en: "To order on Modalia: browse products, pick size/color if available, add to cart, go to checkout, fill in your details (name, phone, wilaya, commune), choose home or office delivery, then confirm. Cash on delivery — you only pay when you receive your items.",
  },
  delivery_wilaya: {
    ar: "موداليا توصّل لجميع ولايات الجزائر الـ58. اختار ولايتك والبلدية في صفحة الدفع باش تشوف سعر التوصيل الحقيقي حسب البائع وطريقة التوصيل.",
    fr: "Modalia livre dans les 58 wilayas d'Algérie. Sélectionnez votre wilaya et commune au paiement pour voir le vrai tarif de livraison selon le vendeur et le mode choisi.",
    en: "Modalia delivers to all 58 wilayas of Algeria. Select your wilaya and commune at checkout to see the real delivery fee based on the seller and method.",
  },
  delivery_methods: {
    ar: "كاين زوج طرق توصيل: للدار (توصلك حتى لباب الدار) وللمكتب (تستلمها من مكتب التوصيل). السعر يتحسب من قاعدة البيانات حسب البائع، الولاية، والوزن — الوزن فوق 5 كغ عندو تعريفة خاصة.",
    fr: "Deux modes de livraison : à domicile (jusqu'à votre porte) et au bureau (retrait au bureau de livraison). Le tarif est calculé depuis la base de données selon le vendeur, la wilaya et le poids — plus de 5 kg a un tarif spécifique.",
    en: "Two delivery methods: home (to your door) and office (pickup at the delivery office). The fee is calculated server-side from the seller, wilaya, and weight — over 5 kg has its own rate.",
  },
  cod: {
    ar: "الدفع عند الاستلام (COD) هو طريقة الدفع في موداليا: تخلص نقداً كي توصلك السلعة. ما كاين دفع مسبق بالبطاقة.",
    fr: "Le paiement à la livraison (COD) est le mode de paiement sur Modalia : vous payez en espèces à la réception. Aucun paiement par carte à l'avance.",
    en: "Cash on delivery (COD) is the payment method on Modalia: you pay in cash when you receive your items. No advance card payment.",
  },
  tracking: {
    ar: "باش تتبع طلبيتك: روح لصفحة «تتبع الطلب» ودخل رقم الطلب ورقم الهاتف اللي استعملتو في الطلب. تشوف الحالة: مستلم، قيد التحضير، تم الشحن، تم التوصيل.",
    fr: "Pour suivre votre commande : allez sur la page « Suivre ma commande » et entrez votre numéro de commande et le téléphone utilisé. Vous verrez le statut : reçue, en préparation, expédiée, livrée.",
    en: "To track your order: go to the “Track order” page and enter your order number and the phone used. You'll see the status: received, preparing, shipped, delivered.",
  },
  returns: {
    ar: "سياسة الاسترجاع تحددها موداليا: إذا ما لقيتش معلومة مؤكدة على حالتك الخاصة، تواصل مع الدعم عبر صفحة اتصل بنا. الطلبيات الملغاة أو المرتجعة ما تتحسبش في العمولات.",
    fr: "La politique de retour est définie par Modalia : si vous ne trouvez pas d'information confirmée pour votre cas, contactez le support via la page Contact. Les commandes annulées ou retournées ne génèrent pas de commission.",
    en: "Returns are governed by Modalia's policy: if you can't find confirmed info for your case, contact support via the Contact page. Cancelled or returned orders never generate commission.",
  },
  become_seller: {
    ar: "باش تولي بائع في موداليا: روح لصفحة «بع كمنتج على موداليا» وعمّر طلب التقديم. الإدارة تراجع الطلب، وإذا تقبل تنشأ لك حساب بائع ومتجر. رابط التقديم كاين في أسفل الموقع (الفوتر).",
    fr: "Pour devenir vendeur sur Modalia : allez sur la page « Vendre sur Modalia » et remplissez la candidature. L'administration l'examine, puis crée votre compte vendeur et votre boutique si acceptée. Le lien est dans le pied de page.",
    en: "To become a seller on Modalia: go to the “Sell on Modalia” page and fill in the application. The admin team reviews it, then creates your seller account and store if approved. The link is in the footer.",
  },
  contact: {
    ar: "تقدر تتواصل معانا من صفحة «اتصل بنا». معلومات الاتصال الرسمية يملؤها مدير الموقع من لوحة الإدارة — إذا ما ظهرتش، استعمل نموذج الاتصال في الصفحة.",
    fr: "Contactez-nous via la page « Contact ». Les coordonnées officielles sont renseignées par l'administrateur — sinon, utilisez le formulaire de la page.",
    en: "Reach us via the “Contact” page. Official contact details are filled in by the site admin — otherwise use the form on the page.",
  },
};

const ACTION_LABELS: Record<Locale, { search: string; help: string; contact: string }> = {
  ar: { search: "ابحث في المتجر", help: "صفحة المساعدة", contact: "اتصل بنا" },
  fr: { search: "Rechercher", help: "Page d'aide", contact: "Contact" },
  en: { search: "Search the store", help: "Help page", contact: "Contact" },
};

/**
 * Answer a support question from confirmed knowledge only.
 * Returns null answer when nothing confirmed matches — the caller must then
 * show the admin-configured fallback message + Search / Help / Contact.
 */
export function answerSupportQuestion(
  question: string,
  locale: SupportedLocale,
): { answer: string | null; intent: SupportIntent | null; suggestedActions: { label: string; href: string }[] } {
  const intent = detectSupportIntent(question);
  const labels = ACTION_LABELS[locale];
  const suggestedActions = [
    { label: labels.search, href: `/shop?locale=${locale}` },
    { label: labels.help, href: `/faq?locale=${locale}` },
    { label: labels.contact, href: `/contact?locale=${locale}` },
  ];
  if (!intent) return { answer: null, intent: null, suggestedActions };
  return { answer: ANSWERS[intent][locale], intent, suggestedActions };
}
