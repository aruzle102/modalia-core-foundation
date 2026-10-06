/**
 * ParallaxLayer — scroll-linked vertical drift for editorial depth
 * (Magic UI-style parallax, adapted: monochrome, restrained, commerce-safe).
 *
 * The child translates vertically proportional to how far the layer's center
 * sits from the viewport center. `speed` 0.12 ≈ 12% of that offset.
 *
 * - `full` motion level only; static on `light`/`none` (incl. reduced motion
 *   and data-saver). Never moves layout — `translate3d` on a wrapper.
 * - rAF-throttled passive scroll/resize listeners; disconnects on unmount.
 * - Vertical-only motion: safe in LTR and RTL.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useMotionPolicy } from "@/hooks/use-motion-policy";

export interface ParallaxLayerProps {
  children: ReactNode;
  /** Fraction of the viewport offset applied (0–0.5). */
  speed?: number;
  className?: string;
  style?: CSSProperties;
}

export function ParallaxLayer({
  children,
  speed = 0.12,
  className = "",
  style,
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { canAnimateRich } = useMotionPolicy();

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") return;
    if (!canAnimateRich) return;

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const viewportCenter = window.innerHeight / 2;
        const elementCenter = rect.top + rect.height / 2;
        const offset = (elementCenter - viewportCenter) * speed;
        element.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      element.style.transform = "";
    };
  }, [canAnimateRich, speed]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, willChange: canAnimateRich ? "transform" : undefined }}
    >
      {children}
    </div>
  );
}
