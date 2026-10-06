/**
 * useParallax — lightweight scroll parallax.
 *
 * Returns a ref: the element is translated vertically against the scroll
 * by `speed` (fraction of its offset from the viewport center). Passive
 * scroll + resize listeners, rAF-throttled, single transform write per
 * frame. `translate3d` only — no layout effects.
 *
 * Disabled entirely under `prefers-reduced-motion`; on coarse pointers
 * (touch) the effect is reduced to 30% so it never fights the finger.
 * Listeners are removed on unmount.
 */
import { useEffect, useRef, type RefObject } from "react";

export function useParallax<T extends HTMLElement = HTMLDivElement>(
  speed = 0.12,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === "undefined") return;
    const reducedMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseMql = window.matchMedia("(hover: none), (pointer: coarse)");

    let raf = 0;
    const update = () => {
      raf = 0;
      const target = ref.current;
      if (!target) return;
      if (reducedMql.matches) {
        target.style.transform = "";
        return;
      }
      const rect = target.getBoundingClientRect();
      const centerOffset = rect.top + rect.height / 2 - window.innerHeight / 2;
      const effective = coarseMql.matches
        ? speedRef.current * 0.3
        : speedRef.current;
      target.style.transform = `translate3d(0, ${(-centerOffset * effective).toFixed(1)}px, 0)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      const target = ref.current;
      if (target) target.style.transform = "";
    };
  }, []);

  return ref;
}
