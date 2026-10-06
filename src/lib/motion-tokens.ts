/**
 * Modalia motion tokens (Sec 43) — the single source of truth for animation timing.
 *
 * Every animation in the app references these tokens — no random values.
 * The module is consumed three ways:
 *
 * 1. TypeScript — `motionDuration`, `motionEasing`, `motionSpring`,
 *    `motionStagger`, `motionPreset`, `motionMarquee`, `motionAmbient` and
 *    the Tailwind class fragments in `motionTw` (used via template
 *    interpolation so the literal classes stay visible to Tailwind's
 *    scanner, which reads this file).
 * 2. CSS — the mirror `:root` custom properties in `src/styles.css`
 *    (`--motion-*`, marked "Sec 43"). Keep the two in sync; styles.css is
 *    the reference for keyframe-driven rules, this file for JS/TSX.
 * 3. `src/lib/motion.tsx` re-exports the canonical names so existing
 *    `@/lib/motion` imports keep working.
 *
 * Commerce law: commerce-critical paths (search input, cart operations,
 * checkout submit, admin mutations) stay INSTANT — they never wait on an
 * animation token. Feedback there is state + icon, never a timed reveal.
 *
 * Policy law: tokens are values, not gates. Every consumer must resolve
 * through `useMotionPolicy()` (`src/hooks/use-motion-policy.ts`) or the
 * global `prefers-reduced-motion` CSS guard, so level `"none"` (low tier,
 * data-saver, reduced motion) collapses everything to instant.
 */

/** Duration tokens (milliseconds) — the only sanctioned animation lengths. */
export const motionDuration = {
  /** 0 — commerce-critical: never gates interaction. */
  instant: 0,
  /** 150 — micro feedback: button press, checkbox toggles. */
  subtle: 150,
  /** 200 — standard UI micro: nav links, filter chips, accordion, dialogs. */
  base: 200,
  /** 250 — overlays: page enter, tilt return-to-rest. */
  overlay: 250,
  /** 300 — product hover, card affordances, cart nudge, sheet close. */
  feedback: 300,
  /** 350 — emphasis pops: wishlist pop, card-action settle. */
  emphasis: 350,
  /** 400 — emphasis transitions: gallery cross-fades. */
  slow: 400,
  /** 700 — cinematic: hero-scale entrances, image hovers. */
  cinematic: 700,
  /** 800 — scroll choreography settle, success orbit. */
  scroll: 800,
  /** 60 — pointer-tracking smoothing only (TiltCard); not a visual transition. */
  tracking: 60,
  /** 180 — magnetic pointer-release settle. */
  magnetic: 180,
} as const;

/** Easing tokens. */
export const motionEasing = {
  /** Snappy out-expo for entrances and reveals. */
  emphasized: "cubic-bezier(0.16, 0.8, 0.24, 1)",
  /** Soft ease for feedback pops and nudges. */
  soft: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  /** Material-standard curve for overlays and state changes. */
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Tailwind `ease-out` curve — hover lifts and image zooms. */
  out: "cubic-bezier(0, 0, 0.2, 1)",
  /** Straight linear — sidebar width, ambient loops. */
  linear: "linear",
} as const;

/**
 * Spring configs for JS-driven springs (no framer-motion in the bundle).
 * Stiffness/damping/mass triples for a rAF spring integrator.
 */
export const motionSpring = {
  /** Calm settle for pointer-release returns. */
  gentle: { stiffness: 170, damping: 26, mass: 1 },
  /** Snappy feedback springs. */
  snappy: { stiffness: 320, damping: 24, mass: 1 },
} as const;
export type MotionSpring = (typeof motionSpring)[keyof typeof motionSpring];

/** Stagger steps (ms). */
export const motionStagger = {
  /** Product grids: 60ms step, capped so long grids never feel sluggish. */
  grid: { step: 60, max: 480 },
  /** TextReveal words. */
  word: { step: 55, max: 480 },
  /** Hero copy lines. */
  hero: { step: 90, max: 270 },
  /** Brand-entrance letters: 40ms base + 60ms per letter. */
  letter: { base: 40, step: 60 },
} as const;

/** Marquee loop durations. */
export const motionMarquee = {
  normal: "42s",
  slow: "70s",
} as const;

/** Hero ambient loop durations (infinite keyframes, hero-scene only). */
export const motionAmbient = {
  gridDrift: "18s",
  floatA: "10s",
  floatB: "12s",
  ringSpinA: "24s",
  ringSpinB: "17s",
  cardFloatA: "8s",
  cardFloatB: "9s",
} as const;

/**
 * Semantic motion presets — the named animations the design system allows.
 * Each carries its exact timing so call sites never invent numbers.
 */
export const motionPreset = {
  /** Route transition: quick fade-and-rise on navigation (`.page-fade`). */
  pageEnter: { durationMs: 250, easing: motionEasing.emphasized },
  /** Scroll reveal settle (`.reveal` transform; opacity uses cinematic). */
  sectionReveal: { durationMs: 800, easing: motionEasing.emphasized },
  /** Editorial "develop" image reveal (`.image-reveal`). */
  imageReveal: { durationMs: 900, easing: motionEasing.emphasized },
  /** Product card hover zoom (`group-hover:scale`). */
  productHover: { durationMs: 300, easing: motionEasing.out },
  /** Button press settle (`active:scale`). */
  buttonPress: { durationMs: 150, easing: motionEasing.standard },
  /** Cart nudge confirmation (`.cart-nudge`). */
  cartAdd: { durationMs: 300, easing: motionEasing.soft },
  /** Wishlist heart pop (`.wish-pop`). */
  wishlistPop: { durationMs: 350, easing: motionEasing.soft },
  /** Sheet/drawer: 500ms open, 300ms close, focus stays on content. */
  drawer: { openMs: 500, closeMs: 300, easing: motionEasing.standard },
  /** Dialog zoom+fade. */
  modal: { durationMs: 200, easing: motionEasing.emphasized },
  /** Filter chips. */
  filterChip: { durationMs: 200, easing: motionEasing.standard },
  /** Nav link underline. */
  navLink: { durationMs: 200, easing: motionEasing.standard },
  /** Scroll choreography: settle + grid stagger. */
  scrollChoreography: {
    durationMs: 800,
    easing: motionEasing.emphasized,
    stagger: motionStagger.grid,
  },
  /** Hero copy entrance lines (`.hero-copy`, `.hero-line`). */
  heroEntrance: { durationMs: 850, easing: motionEasing.emphasized, stagger: motionStagger.hero },
  /** Brand entrance: 1.2s wordmark, letters stagger, JS unmounts after dwell. */
  brandEntrance: {
    durationMs: 1200,
    letterMs: 650,
    dwellMs: 1250,
    easing: motionEasing.emphasized,
    stagger: motionStagger.letter,
  },
  /** Hero image slow zoom (`duration-[1200ms]` hotspot). */
  heroImage: { durationMs: 1200, easing: motionEasing.out },
  /** Animated metric numbers (CountUp default). */
  countUp: { durationMs: 900, easing: motionEasing.soft },
  /** Text input caret blink. */
  caretBlink: { durationMs: 1000 },
} as const;
export type MotionPresetName = keyof typeof motionPreset;

/**
 * Tailwind class fragments derived from the tokens. Interpolate these into
 * `className` instead of writing ad-hoc `duration-*` / `ease-*` values.
 * The literal classes live in this file, so Tailwind v4's scanner (which
 * reads source text, including .ts) still generates them — including the
 * dynamic bare values (`duration-250`) that v4 derives as `<number>ms`.
 */
export const motionTw = {
  duration: {
    subtle: "duration-150",
    base: "duration-200",
    overlay: "duration-250",
    feedback: "duration-300",
    slow: "duration-400",
    cinematic: "duration-700",
    /** Deliberate 500ms transitions: gallery cross-fades, underline sweeps. */
    crossfade: "duration-500",
    sweep: "duration-500",
    heroImage: "duration-[1200ms]",
    blink: "duration-1000",
  },
  /**
   * Radix `data-[state=…]` variant durations. These MUST stay whole
   * literals: Tailwind's scanner only generates a variant utility when the
   * complete `data-[state=…]:duration-*` candidate appears verbatim in
   * source — splitting it across an interpolation boundary (e.g.
   * `data-[state=closed]:${…}`) silently drops the rule.
   */
  stateDuration: {
    closed: "data-[state=closed]:duration-300",
    open: "data-[state=open]:duration-500",
  },
  ease: {
    out: "ease-out",
    standard: "ease-in-out",
    linear: "ease-linear",
  },
  transition: {
    /** Colors, opacity, shadow, transform — covers buttons, chips, links. */
    interactive: "transition",
    /** Transform-only — hovers, chevrons, image zooms. */
    transform: "transition-transform",
    /** Opacity-only — fades, tab underlines. */
    opacity: "transition-opacity",
    /** Colors-only — text/border affordances. */
    colors: "transition-colors",
  },
} as const;

/**
 * Builds an inline CSS transition string from tokens
 * (for JS-driven styles like TiltCard's pointer tracking).
 */
export function motionTransition(
  property: string,
  durationMs: number,
  easing: string = motionEasing.standard,
): string {
  return `${property} ${durationMs}ms ${easing}`;
}

/**
 * Commerce-critical paths must never wait on animation. Call sites on the
 * search input, cart operations, checkout submit, and admin mutations pass
 * `motionDuration.instant` (or omit transitions entirely) — this helper makes
 * the intent explicit at the call site.
 */
export function commerceInstant(): number {
  return motionDuration.instant;
}
