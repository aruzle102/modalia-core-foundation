import { createElement, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  JSX,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

/**
 * Motion foundation for Modalia.
 *
 * Relationship with `src/config/motion.ts`: that module holds Tailwind-class
 * tokens (`duration-150`, `ease-out`, …) for CSS-driven micro-interactions.
 * This module holds the *numeric* runtime tokens plus the JS-driven primitives
 * (scroll reveals, magnetic buttons, page fades) that need exact millisecond
 * and cubic-bezier values. Keep the two in sync conceptually; `instant` here
 * (150ms) matches the `fast` class there.
 *
 * All primitives are RTL-safe: vertical translation only, never translateX.
 */

/** Single source of truth for JS-driven animation timing. */
export const motionTokens = {
  durations: {
    instant: 150,
    fast: 250,
    standard: 400,
    slow: 700,
  },
  easings: {
    /** Decelerating exit — default for entrances. */
    out: "cubic-bezier(0.22, 1, 0.36, 1)",
    /** Symmetric — for fades and state changes. */
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    /** Slight overshoot — for magnetic return and playful UI. */
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  distances: {
    small: 12,
    medium: 24,
    large: 48,
  },
  /** Default stagger step (ms) between sibling reveals. */
  stagger: 70,
} as const;

export type MotionTokens = typeof motionTokens;

/** Shared reduced-motion subscription for the motion primitives. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export interface RevealProps {
  /** Polymorphic wrapper tag. Defaults to `"div"`. */
  as?: keyof JSX.IntrinsicElements;
  /** Entrance delay in ms — use `index * motionTokens.stagger` for lists. */
  delay?: number;
  /** Vertical travel distance in px (translateY only, RTL-safe). */
  y?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Scroll-triggered reveal: fades + rises once when the element enters the
 * viewport (IntersectionObserver, threshold 0.15, fires once). Inline styles
 * carry the transition so no dynamic Tailwind classes are needed. With
 * `prefers-reduced-motion` the content appears immediately with no movement.
 */
export function Reveal({
  as = "div",
  delay = 0,
  y = 24,
  className,
  children,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const { durations, easings } = motionTokens;
  const style: CSSProperties = reducedMotion
    ? { opacity: 1 }
    : {
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translate3d(0, 0, 0)"
          : `translate3d(0, ${y}px, 0)`,
        transitionProperty: "opacity, transform",
        transitionDuration: `${durations.standard}ms`,
        transitionTimingFunction: easings.out,
      };
  if (!reducedMotion && delay > 0) {
    style.transitionDelay = `${delay}ms`;
  }
  if (!reducedMotion && !visible) {
    style.willChange = "opacity, transform";
  }

  // `as` is a host tag union, so props go through a record: keeps this file
  // `.ts` (createElement, no JSX) and stays type-safe under strict TS.
  const props: Record<string, unknown> = { ref, style };
  if (className !== undefined) props["className"] = className;
  return createElement(as, props, children);
}

export interface MagneticProps {
  children: ReactNode;
  /** Fraction (0–1) of the cursor offset applied to the element. */
  strength?: number;
  className?: string;
}

/**
 * Magnetic hover: the element drifts vertically toward the cursor and springs
 * back on leave. Active only on fine pointers
 * (`(hover: hover) and (pointer: fine)`), and disabled entirely under
 * `prefers-reduced-motion`. RTL-safe: translateY only.
 */
export function Magnetic({
  children,
  strength = 0.25,
  className,
}: MagneticProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFinePointer(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // Reduced motion: render a plain wrapper, no listeners, no transform.
  if (reducedMotion) {
    const plainProps: Record<string, unknown> = {};
    if (className !== undefined) plainProps["className"] = className;
    return createElement("div", plainProps, children);
  }

  const { durations, easings } = motionTokens;
  const style: CSSProperties = {
    display: "inline-block",
    transform: "translate3d(0, 0, 0)",
    transition: `transform ${durations.fast}ms ${easings.spring}`,
    willChange: "transform",
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!finePointer) return;
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    // Vertical pull toward the cursor only — never translateX (RTL-safe).
    const dy = event.clientY - (rect.top + rect.height / 2);
    element.style.transform = `translate3d(0, ${(dy * strength).toFixed(2)}px, 0)`;
  };

  const handleMouseLeave = () => {
    const element = ref.current;
    if (!element) return;
    element.style.transform = "translate3d(0, 0, 0)";
  };

  const props: Record<string, unknown> = {
    ref,
    style,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
  };
  if (className !== undefined) props["className"] = className;
  return createElement("div", props, children);
}

export interface PageFadeProps {
  children: ReactNode;
  className?: string;
}

/** Simple page-enter fade (opacity only, 400ms). Instant under reduced motion. */
export function PageFade({ children, className }: PageFadeProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const style: CSSProperties =
    entered || reducedMotion
      ? { opacity: 1 }
      : {
          opacity: 0,
          transition: `opacity ${motionTokens.durations.standard}ms ease-out`,
        };

  const props: Record<string, unknown> = { style };
  if (className !== undefined) props["className"] = className;
  return createElement("div", props, children);
}
