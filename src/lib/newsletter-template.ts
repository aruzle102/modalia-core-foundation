/**
 * MODALIA — Premium Newsletter Email Template
 *
 * Responsive, email-client-compatible HTML template.
 * Supports AR (RTL), FR, EN. Uses real MODALIA branding.
 */

export interface NewsletterProduct {
  name: string;
  price: number;
  compareAtPrice?: number;
  imageUrl?: string;
  productUrl: string;
}

export interface NewsletterTemplateArgs {
  title: string;
  previewText?: string;
  contentHtml: string;
  products?: NewsletterProduct[];
  locale: "ar" | "fr" | "en";
  unsubscribeUrl: string;
  siteUrl: string;
  logoUrl: string;
}

function formatPrice(price: number, locale: string): string {
  return `${price.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-FR")} دج`;
}

const CTA_TEXT = {
  ar: "تسوق الآن",
  fr: "Acheter",
  en: "Shop Now",
};

const FOOTER_TAGLINE = {
  ar: "سوق جزائري يجمع أفضل المتاجر",
  fr: "Le marketplace algérien",
  en: "The Algerian marketplace",
};

export function buildNewsletterHtml(args: NewsletterTemplateArgs): string {
  const { title, previewText, contentHtml, products, locale, unsubscribeUrl, siteUrl, logoUrl } = args;
  const isRtl = locale === "ar";
  const dir = isRtl ? "rtl" : "ltr";
  const align = isRtl ? "right" : "left";

  const productCards = (products ?? [])
    .map(
      (p) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:#ffffff;border:1px solid #e8e8e8;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:0;">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" width="100%" style="display:block;max-width:100%;height:auto;" />` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:20px;text-align:${align};">
            <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a1a;">${escapeHtml(p.name)}</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;">
              ${formatPrice(p.price, locale)}
              ${p.compareAtPrice && p.compareAtPrice > p.price ? `<span style="font-size:14px;font-weight:400;color:#999;text-decoration:line-through;margin-inline-start:8px;">${formatPrice(p.compareAtPrice, locale)}</span>` : ""}
            </p>
            <a href="${p.productUrl}" style="display:inline-block;padding:12px 32px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${CTA_TEXT[locale]}</a>
          </td>
        </tr>
      </table>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(title)}</title>
<!--[if mso]><style>table{border-collapse:collapse;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(previewText)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">

<!-- Header -->
<tr><td style="padding:32px;text-align:center;background:#1a1a1a;">
<img src="${logoUrl}" alt="MODALIA" width="180" style="display:inline-block;max-width:180px;height:auto;" />
<p style="margin:12px 0 0;font-size:12px;color:#999;letter-spacing:2px;">${FOOTER_TAGLINE[locale].toUpperCase()}</p>
</td></tr>

<!-- Title -->
<tr><td style="padding:32px 32px 16px;text-align:${align};">
<h1 style="margin:0;font-size:28px;font-weight:700;color:#1a1a1a;line-height:1.3;">${escapeHtml(title)}</h1>
</td></tr>

<!-- Content -->
<tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.7;color:#444;text-align:${align};">
${contentHtml}
</td></tr>

<!-- Products -->
${productCards ? `<tr><td style="padding:0 32px 32px;">${productCards}</td></tr>` : ""}

<!-- Footer -->
<tr><td style="padding:32px;background:#f9f9f9;text-align:center;border-top:1px solid #eee;">
<img src="${logoUrl}" alt="MODALIA" width="120" style="display:inline-block;max-width:120px;height:auto;margin-bottom:16px;" />
<p style="margin:0 0 8px;font-size:13px;color:#666;"><a href="${siteUrl}" style="color:#1a1a1a;text-decoration:none;font-weight:600;">${siteUrl.replace("https://", "")}</a></p>
<p style="margin:0 0 16px;font-size:12px;color:#999;">${FOOTER_TAGLINE[locale]}</p>
<p style="margin:0;font-size:11px;color:#aaa;">
<a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">${locale === "ar" ? "إلغاء الاشتراك" : locale === "fr" ? "Se désabonner" : "Unsubscribe"}</a>
</p>
</td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
