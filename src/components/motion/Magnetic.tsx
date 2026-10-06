/**
 * Magnetic — wrapper that translates its child slightly toward the cursor.
 *
 * Calm, premium cursor interaction for hero CTAs and primary buttons.
 * Fine pointers only (`hover: hover` + `pointer: fine`); no-op on touch
 * and under `prefers-reduced-motion`. rAF-throttled pointermove, transform
 * reset on pointerleave with a soft transition back.
 *
 * Uses `translate3d` only — no layout effects, and symmetric on the
 * x-axis so it is safe in both LTR and RTL.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

export interface MagneticProps {
  children: ReactNode;
  /** Fraction of the cursor offset applied to the child (0–1). */
  strength?: number;
  className?: string;
  style?: CSSProperties;
}

export function Magnetic({
  children,
  strength = 0.3,
  className = "",
  style,
}: MagneticProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let raf = 0;
    const apply = (clientX: number, clientY: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = outer.getBoundingClientRect();
        const dx = (clientX - (rect.left + rect.width / 2)) * strength;
        const dy = (clientY - (rect.top + rect.height / 2)) * strength;
        inner.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
      });
    };
    const onMove = (event: PointerEvent) => apply(event.clientX, event.clientY);
    const onLeave = () => {
      cancelAnimationFrame(raf);
      inner.style.transform = "";
    };
    outer.addEventListener("pointermove", onMove);
    outer.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      outer.removeEventListener("pointermove", onMove);
      outer.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced, strength]);

  return (
    <div ref={outerRef} className={`magnetic ${className}`.trim()} style={style}>
      <div ref={innerRef} className="magnetic-inner">
        {children}
      </div>
    </div>
  );
}
