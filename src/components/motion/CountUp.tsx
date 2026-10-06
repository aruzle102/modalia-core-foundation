/**
 * CountUp — animated number for REAL metrics only (dashboard KPIs, order
 * totals, review counts). Never use it to fabricate a number; the value
 * prop must come from real data.
 *
 * - eases from 0 (or `from`) to `value` over `durationMs` via rAF.
 * - Formats with `Intl.NumberFormat(locale, formatOptions)`; pass the
 *   shopper's locale for correct grouping/decimals (incl. ar-DZ).
 * - Under `prefers-reduced-motion` (or `none` motion level) it renders the
 *   final value immediately — no animation, no layout shift.
 */
import { useEffect, useRef, useState } from "react";
import { useMotionPolicy } from "@/hooks/use-motion-policy";
import { motionPreset } from "@/lib/motion-tokens";

export interface CountUpProps {
  /** The real numeric value to display. */
  value: number;
  /** BCP-47 locale for number formatting, e.g. "ar-DZ", "fr-FR", "en-US". */
  locale?: string;
  /** Intl.NumberFormat options (currency, maximumFractionDigits, …). */
  formatOptions?: Intl.NumberFormatOptions;
  /** Animation duration in ms. */
  durationMs?: number;
  /** Starting value (default 0). */
  from?: number;
  className?: string;
}

export function CountUp({
  value,
  locale,
  formatOptions,
  durationMs = motionPreset.countUp.durationMs,
  from = 0,
  className = "",
}: CountUpProps) {
  const { canAnimate } = useMotionPolicy();
  const [display, setDisplay] = useState(from);
  const raf = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!canAnimate || first.current) {
      // First paint (or no-motion): show the value instantly to avoid
      // layout shift and needless animation on mount.
      first.current = false;
      setDisplay(value);
      return;
    }
    const startValue = display;
    const delta = value - startValue;
    if (delta === 0) return;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / durationMs, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(startValue + delta * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // `display` intentionally omitted: the effect re-runs on `value` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, canAnimate, durationMs]);

  const formatted = new Intl.NumberFormat(locale, formatOptions).format(display);

  return (
    <span className={`tabular-nums ${className}`.trim()} aria-label={String(value)}>
      {formatted}
    </span>
  );
}
