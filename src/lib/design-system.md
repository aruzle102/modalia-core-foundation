# Modalia Design System — Section 1 (V8)

Single source of truth for visual language. Sections 2–66 MUST follow this.
Tokens live in `src/styles.css` (Tailwind v4 `@theme inline`, oklch only).

## Brand

- Wordmark: **MODALIA** — all caps, `text-wordmark` (Manrope 700). Never "Modalia".
- Nothing inside the logo: no "Store", no "Marketplace", no tagline.
- Protected names (never translated, never altered): `Modalia`, `Modalia Official Store`.
- Brand is Latin text in all locales, including Arabic pages.

## Color system

| Token | Use | Light | Dark |
|---|---|---|---|
| `primary` / `ink` | Text, primary buttons, footer bg (`bg-ink`) | oklch(0.18…) / oklch(0.12…) | inverted |
| `brand` (bronze) | Accents, sale badges, key highlights — sparingly | oklch(0.52 0.11 78) | — |
| `official` | Official Modalia store identity ONLY (badge, checkmark) | oklch(0.55 0.13 255) | oklch(0.72 0.11 255) |
| `verified` | Verified third-party sellers ONLY (shield) | oklch(0.60 0.13 162) | oklch(0.72 0.12 162) |
| `info` | Informational callouts/banners | oklch(0.55 0.13 255) | oklch(0.72 0.11 255) |
| `destructive` | Errors, dangerous actions | oklch(0.56 0.2 28) | — |

Badge law: official store = blue check (`OfficialStoreBadge`); verified seller =
green shield (`VerifiedSellerBadge`). Never swap. Never use raw `sky-*` /
`emerald-*` / hex — always the tokens above (they carry their own dark values;
do NOT add `dark:` overrides on top of them).

## Typography

- Display: Manrope (`text-display`, `text-h2`, `text-h3`); Body/UI: IBM Plex Sans;
  Arabic: Noto Sans Arabic. Arabic never letterspaced (see styles.css).
- Type utilities: `text-eyebrow` (labels), `text-nav`, `text-body`, `text-small`,
  `text-caption`, `text-price` (tabular-nums).

## Shape, depth, borders

- Radius base `0.375rem`; scale stays restrained — no pill-everything, no
  oversized rounded cards.
- Shadows: one restrained layer max (`0 10px 28px black 8%` via `.hover-lift`);
  no stacked/glowing shadows.
- Borders: `border-border` hairlines; no random glowing borders.

## Modalia visual law (hard rules)

1. No cheap gradients — subtle monochrome light/shadow for depth only.
2. No overused glassmorphism — `backdrop-blur` on nav/overlays only.
3. No gaming neon, no glowing borders, no neon color accents.
4. No AI-generated imagery as decoration — real product/store media, CSS/SVG.
5. No visual clutter — every decorative element must serve hierarchy or feedback.
6. Cards must earn their existence (discovery, comparison, purchase) — prefer
   editorial layouts, rails, asymmetric grids (see Sections 4–6).

## Interaction patterns (own code, no new libs)

- `.link-underline` — animated underline, hover/focus-visible, RTL-safe.
- `.img-zoom` — image reveal/scale on hover for editorial imagery.
- `.hover-lift` — subtle depth on hover (transform only, no layout shift).
- `.pressable` / `active:scale-[0.98]` — press feedback on buttons.
- `.magnetic` / `.magnetic-inner` — cursor-following buttons (existing).
- `.card-action` — hover/focus actions, always visible on touch (`hover: none`).
- `.no-scrollbar` — hide scrollbars on rails (content stays scrollable).
- Buttons (shadcn): token variants, `focus-visible:ring-ring`, press feedback,
  `rounded-md`. Wishlist = separate icon button, never nested in a link.
- All effects honor `prefers-reduced-motion` (global guard + per-utility guards).

### Motion primitives (`src/components/motion/`, Sec 2–3)

- `useMotionPolicy` (`src/hooks/use-motion-policy.ts`) — single decision point:
  `full` (high tier) / `light` (mid) / `none` (low, data-saver, reduced-motion).
  All new primitives gate on it. Commerce actions never depend on animation.
- `TiltCard` — restrained 3D tilt (fine pointers, full/light only), no glow.
- `ProductRail` — drag (mouse) + swipe (touch) horizontal rail, scroll-snap,
  RTL-aware arrows, keyboard scrollable, drag suppresses accidental clicks.
- `ParallaxLayer` — scroll-linked vertical drift, full-tier only, rAF-throttled.
- `AsyncButton` — idle/loading/success state machine for commerce actions;
  no double-submit; optional wish-pop/cart-nudge replay; labels via props.
- `CountUp` — animated number for REAL metrics only; instant under no-motion.
- `Stagger` — staggered `Reveal` cascade for grids/lists (capped delays).
- `ChipGroup` — animated filter chips, radiogroup semantics, arrow-key nav
  (RTL-aware), labels via props.
- Existing: `Magnetic`, `Marquee`, `TextReveal`, `ImageReveal`, `Reveal`,
  `PageFade`, `overlayMotion` presets (Radix), vaul `Drawer` (own animation).

## i18n / RTL

- ar/fr/en parity for every user-facing string added or changed.
- `storeFallback` key: `getTranslations(locale).cart.storeFallback`
  (en "Modalia store" / fr "Boutique Modalia" / ar "متجر موداليا") — server fns
  use `getTranslations(getLocale(locale))`; never hardcode the English string.
- RTL: no directional (`left/right/ml/mr`) utilities; use logical properties
  (`ms/me`, `inset-inline-*`, `text-start/end`).

## Known hand-offs to later sections

- Sec 39: header nested `<button>` in `<a>` (not touched here).
- Sec 43: motion duration/easing centralization — DONE: `src/lib/motion-tokens.ts` is the single source of truth (durations, easings, springs, staggers, 16 semantic presets, Tailwind `motionTw` fragments); `:root --motion-*` mirror in `src/styles.css`. Every animation references these; no ad-hoc values.
- Sec 52: SEO titles still contain "— Modalia" (canonical work owns this).
- Sec 56: "Verified Seller" badge text still hardcoded (needs translation key);
  seller.ai/shop banner copy unchanged.
