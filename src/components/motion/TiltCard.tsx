/**
 * TiltCard — restrained 3D tilt on pointer (Aceternity-style 3D card,
 * adapted to the Modalia editorial language: no glow, no glare, no neon —
 * just physical depth with a single soft shadow layer).
 *
 * - Fine pointers only (`hover: hover` + `pointer: fine`); inert on touch.
 * - `full` motion level: up to `maxTilt` degrees; `light`: half; `none`:
 *   no tilt at all (static card).
 * - rAF-throttled pointermove; transform eases back on pointerleave.
 * - Symmetric tilt math is direction-agnostic, safe in LTR and RTL.
 */
import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMotionPolicy } from "@/hooks/use-motion-policy";
import { motionDuration, motionEasing, motionTransition } from "@/lib/motion-tokens";

export interface TiltCardProps {
  children: ReactNode;
  /** Maximum tilt in degrees at the card edge. */
  maxTilt?: number;
  /** Perspective distance. */
  perspective?: number;
  className?: string;
  style?: CSSProperties;
}

export function TiltCard({
  children,
  maxTilt = 7,
  perspective = 900,
  className = "",
  style,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { level } = useMotionPolicy();

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") return;
    if (level === "none") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }

    const tilt = level === "full" ? maxTilt : Math.max(2, maxTilt / 2);
    let raf = 0;

    const apply = (clientX: number, clientY: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const px = (clientX - rect.left) / rect.width - 0.5;
        const py = (clientY - rect.top) / rect.height - 0.5;
        // No transition while tracking — 1:1 cursor response. The soft
        // return transition is restored on pointerleave.
        element.style.transition = motionTransition(
          "transform",
          motionDuration.tracking,
          motionEasing.linear,
        );
        element.style.transform =
          `perspective(${perspective}px) ` +
          `rotateX(${(-py * tilt).toFixed(2)}deg) ` +
          `rotateY(${(px * tilt).toFixed(2)}deg)`;
      });
    };
    const onMove = (event: PointerEvent) => apply(event.clientX, event.clientY);
    const onLeave = () => {
      cancelAnimationFrame(raf);
      element.style.transition = "";
      element.style.transform = "";
    };

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [level, maxTilt, perspective]);

  return (
    <div
      ref={ref}
      className={`tilt-card ${className}`.trim()}
      style={{
        ...style,
        // The return-to-rest transition lives on the element; pointermove
        // writes transforms directly (no transition) for 1:1 tracking.
        transition: motionTransition("transform", motionDuration.overlay, motionEasing.soft),
        willChange: level === "none" ? undefined : "transform",
      }}
    >
      {children}
    </div>
  );
}
