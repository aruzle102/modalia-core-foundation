/**
 * Rule-based moderation ASSISTANCE (Section 36, V8).
 *
 * Deterministic keyword/regex scan of a product's name + description, in
 * Arabic, French and English. It produces FLAGS with reasons for the human
 * moderator — it NEVER approves, rejects or hides anything on its own. All
 * moderation decisions stay in the server-authorized `moderateAdminProduct`
 * flow.
 *
 * Honest labeling: surfaces must call this a "rule-based check", never "AI".
 * Deterministic: same input → same flags, no randomness, no network.
 */

export type ModerationFlagCode =
  | "prohibited"
  | "counterfeit"
  | "medical_claim"
  | "sexual_content"
  | "dangerous"
  | "misleading";

export type ModerationFlagSeverity = "high" | "medium" | "low";

export interface ModerationFlag {
  code: ModerationFlagCode;
  severity: ModerationFlagSeverity;
  /** Short excerpt of the text that triggered the rule. */
  match: string;
}

interface Rule {
  code: ModerationFlagCode;
  severity: ModerationFlagSeverity;
  patterns: RegExp[];
}

/**
 * Arabic word-boundary guard: \b does not work on Arabic script, so Arabic
 * patterns match distinctive multi-word phrases or use explicit guards.
 */
const AR = (inner: string) => new RegExp(`(^|[^\\p{L}\\p{N}])(${inner})(?=[^\\p{L}\\p{N}]|$)`, "iu");

const RULES: Rule[] = [
  {
    code: "prohibited",
    severity: "high",
    patterns: [
      // Firearms / weapons
      /\b(gun|guns|rifle|rifles|pistol|pistols|revolver|firearm|firearms|machine gun|assault rifle|silencer|ammunition|ammo)\b/i,
      /\b(arme|armes|fusil|pistolet|revolver|mitraillette|silencieux|munitions|balle|balles)\b/i,
      AR("سلاح|أسلحة|مسدس|بندقية|رشاش|ذخيرة|رصاص"),
      // Illicit drugs
      /\b(cocaine|heroin|heroin|meth|crack cocaine|fentanyl|lsd|ecstasy pill|mdma)\b/i,
      /\b(cocaïne|héroïne|méthamphétamine|fentanyl|ecstasy)\b/i,
      AR("كوكايين|هيروين|مخدرات|حشيش|أفيون"),
      // Human trafficking / illicit services
      /\b(human trafficking|child labor|hitman|assassin for hire)\b/i,
      /\b(traite des êtres humains|tueur à gages)\b/i,
      AR("الاتجار بالبشر|قاتل مأجور"),
    ],
  },
  {
    code: "counterfeit",
    severity: "high",
    patterns: [
      /\b(replica|replicas|1:1 (copy|quality|replica)|aaa (quality|grade|replica)|mirror quality|fake (rolex|gucci|louis vuitton|chanel|nike|adidas))\b/i,
      /\b(contrefaçon|contrefacon|réplique|repliques?|faux (rolex|gucci|louis vuitton|chanel)|copie conforme)\b/i,
      AR("تقليد|مقلد|نسخة طبق الأصل|روليكس مقلد|ماركة مقلدة"),
    ],
  },
  {
    code: "medical_claim",
    severity: "medium",
    patterns: [
      /\b(cures? cancer|guaranteed cure|miracle cure|cures? diabetes|cures? hiv|clinically proven to cure)\b/i,
      /\b(guérit le cancer|remède miracle|guérison garantie|soigne le diabète)\b/i,
      AR("يعالج السرطان|شفاء مضمون|علاج معجزة|يعالج السكري"),
    ],
  },
  {
    code: "sexual_content",
    severity: "medium",
    patterns: [
      /\b(porn|pornographic|xxx (video|dvd|content)|escort service|sex (doll|toy|worker))\b/i,
      /\b(porno|pornographique|service d['’]escorte|poupée sexuelle)\b/i,
      AR("إباحي|إباحية|جنسية صريحة|خدمات جنسية"),
    ],
  },
  {
    code: "dangerous",
    severity: "high",
    patterns: [
      /\b(explosive|explosives|detonator|cyanide|ricin|sarin|dirty bomb|pipe bomb)\b/i,
      /\b(explosif|explosifs|détonateur|cyanure|bombe artisanale)\b/i,
      AR("متفجر|متفجرات|سيانيد|قنبلة"),
    ],
  },
  {
    code: "misleading",
    severity: "low",
    patterns: [
      /\b(100% guaranteed|risk[\s-]?free profit|get rich quick|double your money|no risk investment|earn \$\d+.*per day)\b/i,
      /\b(garanti à 100 ?%|devenez riche rapidement|doublez votre argent|revenu garanti sans risque)\b/i,
      AR("مضمون 100%|اربح المال بسرعة|ضاعف أموالك|دخل مضمون بدون مخاطرة"),
    ],
  },
];

const MAX_MATCH_EXCERPT = 80;

/**
 * Scan name + description text. Returns one flag per triggered rule (the
 * first match), with a short excerpt. Pure function — safe to call per row.
 */
export function scanProductForModerationFlags(
  name: string,
  description: string,
): ModerationFlag[] {
  const haystack = `${name}\n${description}`.slice(0, 20000);
  if (!haystack.trim()) return [];
  const flags: ModerationFlag[] = [];
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const m = pattern.exec(haystack);
      if (m) {
        const raw = (m[2] ?? m[0] ?? "").trim();
        const start = Math.max(0, (m.index ?? 0) - 24);
        const excerpt = haystack
          .slice(start, start + MAX_MATCH_EXCERPT)
          .replace(/\s+/g, " ")
          .trim();
        flags.push({ code: rule.code, severity: rule.severity, match: raw || excerpt });
        break;
      }
    }
  }
  return flags;
}

/** All flag codes, for i18n label maps. */
export const MODERATION_FLAG_CODES: ModerationFlagCode[] = [
  "prohibited",
  "counterfeit",
  "medical_claim",
  "sexual_content",
  "dangerous",
  "misleading",
];
