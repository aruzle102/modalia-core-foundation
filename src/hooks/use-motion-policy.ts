import { useDeviceTier, type DeviceTier } from "./use-device-tier";

/**
 * Modalia motion policy — the single decision point for whether a component
 * is allowed to animate, and how richly.
 *
 * Levels:
 * - `"full"`: high-tier devices — tilt, parallax, magnetic, staggered reveals.
 * - `"light"`: mid-tier — reveals and micro-feedback only, no pointer-chasing
 *   or scroll-linked effects.
 * - `"none"`: low tier, data-saver, or `prefers-reduced-motion` — everything
 *   resolves to instant state changes. Commerce actions must never depend on
 *   animation to communicate outcome; pair with text/icon state instead.
 *
 * SSR-safe: falls back to `"none"` until hydration (via useDeviceTier).
 */
export type MotionLevel = "full" | "light" | "none";

export interface MotionPolicy {
  tier: DeviceTier;
  reducedMotion: boolean;
  /** Effective animation budget for this device + user preference. */
  level: MotionLevel;
  /** Shorthand: `level !== "none"`. */
  canAnimate: boolean;
  /** Shorthand: `level === "full"`. */
  canAnimateRich: boolean;
}

function levelFor(tier: DeviceTier, reducedMotion: boolean): MotionLevel {
  if (reducedMotion) return "none";
  switch (tier) {
    case "high":
      return "full";
    case "mid":
      return "light";
    case "low":
    case "data-saver":
      return "none";
  }
}

export function useMotionPolicy(): MotionPolicy {
  const { tier, reducedMotion } = useDeviceTier();
  const level = levelFor(tier, reducedMotion);
  return {
    tier,
    reducedMotion,
    level,
    canAnimate: level !== "none",
    canAnimateRich: level === "full",
  };
}
