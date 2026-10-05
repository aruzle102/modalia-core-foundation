/**
 * Modalia motion system — the single source of truth for UI animation.
 *
 * Every animation here exists to support shopping: scroll reveals draw the
 * eye down product grids, page fades orient the shopper after navigation,
 * overlay transitions keep focus inside drawers/modals, and micro-feedback
 * (wishlist pop, cart nudge) confirms the action just taken. No decoration
 * without a commerce purpose.
 *
 * Timing tokens: 150ms (micro feedback), 250ms (standard UI), 400ms
 * (emphasis), 700ms (cinematic, hero-scale only). Everything resolves to
 * instant under `prefers-reduced-motion` via the global stylesheet guard.
 */
import {
  createElement,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useEffect, useState } from "react";
import { useReveal } from "@/hooks/use-reveal";

/** Motion duration tokens (ms). */
export const motionDuration = {
  /** Micro feedback: wishlist pop, cart nudge, checkbox toggles. */
  fast: 150,
  /** Standard UI: page fades, drawer/modal panels, hover lifts. */
  base: 250,
  /** Emphasis: image zooms, gallery cross-fades. */
  slow: 400,
  /** Cinematic: hero-scale entrances only. */
  cinematic: 700,
} as const;

/** Motion easing tokens. */
export const motionEasing = {
  /** Snappy ease-out for entrances and reveals. */
  outExpo: "cubic-bezier(0.16, 0.8, 0.24, 1)",
  /** Soft ease for feedback pops and nudges. */
  outSoft: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  /** Material-standard curve for overlays. */
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** React to the user's reduced-motion preference (live updates). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Builds a `--reveal-delay` style for staggered scroll reveals.
 * Delay is capped so long grids never feel sluggish.
 */
export function staggerStyle(index: number, stepMs = 60, maxMs = 480): CSSProperties {
  return { "--reveal-delay": `${Math.min(index * stepMs, maxMs)}ms` } as CSSProperties;
}

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** Stagger delay in ms; use `staggerStyle` when mapping grids. */
  delay?: number;
  children: ReactNode;
}

/**
 * Scroll-reveal wrapper. Fades + lifts content the first time it enters the
 * viewport (paired with the `.reveal` CSS transition). Vertical-only motion
 * so it is safe in both LTR and RTL. Instantly visible under reduced motion.
 */
export function Reveal({ as: Tag = "div", delay = 0, className = "", children, style, ...rest }: RevealProps) {
  const ref = useReveal<HTMLElement>();
  const mergedStyle = { ...style, "--reveal-delay": `${delay}ms` } as CSSProperties;
  return createElement(
    Tag,
    { ...rest, ref, className: `reveal ${className}`.trim(), style: mergedStyle },
    children,
  );
}

/**
 * Route transition: a quick fade-and-rise on mount. Wrap `<Outlet />` keyed
 * by pathname so shoppers feel oriented after each navigation.
 */
export function PageFade({
  routeKey,
  className = "",
  children,
}: {
  routeKey: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div key={routeKey} className={`page-fade ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Canonical overlay transition presets. Mirror the Radix `data-[state]`
 * utilities used by `ui/dialog` and `ui/sheet` so every new drawer/modal
 * animates the same way: backdrop fades (base), panels zoom slightly
 * (dialog) or slide with a longer close (sheet) to keep focus on content.
 */
export const overlayMotion = {
  backdrop:
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
  dialogPanel:
    "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
  sheetPanel:
    "transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
} as const;

/** One-shot micro-animation classes (keyframes live in styles.css). */
export const microAnimationClass = {
  /** Heart pop when a product is wishlisted — confirms "saved". */
  wishlistPop: "wish-pop",
  /** Small directional nudge when an item lands in the cart. */
  cartNudge: "cart-nudge",
} as const;

/**
 * Replays a one-shot micro-animation class on an element (removes, reflows,
 * re-adds) so repeated wishlist/cart actions always give feedback.
 */
export function replayAnimation(element: HTMLElement | null, className: string): void {
  if (!element || typeof window === "undefined") return;
  element.classList.remove(className);
  // Force a reflow so the animation restarts even when re-added immediately.
  void element.offsetWidth;
  element.classList.add(className);
}
