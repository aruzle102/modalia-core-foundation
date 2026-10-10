/**
 * ProductRail — horizontal rail with drag (mouse) + native swipe (touch).
 *
 * Built for product/collection rails: scroll-snap items, drag-to-scroll on
 * fine pointers, arrow buttons that respect reading direction (RTL-aware),
 * and keyboard scrolling via native focus behavior. Items snap; arrows
 * hide at the scroll ends (observed, not guessed).
 *
 * - Touch: native momentum scrolling, no JS interference.
 * - Mouse: pointer drag with grab cursor; a drag suppresses the click that
 *   would otherwise fire on release (prevents accidental navigation).
 * - Arrows scroll one viewport-page toward the inline end; they are real
 *   `<button>`s with translated labels passed via props (no hardcoded copy).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMotionPolicy } from "@/hooks/use-motion-policy";
import { cn } from "@/lib/utils";

export interface ProductRailProps {
  children: ReactNode;
  /** Accessible label for the rail region. */
  ariaLabel: string;
  /** Translated label for the "scroll forward" button. */
  nextLabel: string;
  /** Translated label for the "scroll back" button. */
  prevLabel: string;
  className?: string;
  /** Extra classes for the scroll viewport. */
  viewportClassName?: string;
  /** Extra classes for each item wrapper is the caller's job (children). */
}

function isRtl(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dir === "rtl";
}

export function ProductRail({
  children,
  ariaLabel,
  nextLabel,
  prevLabel,
  className = "",
  viewportClassName = "",
}: ProductRailProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const { canAnimate } = useMotionPolicy();
  const drag = useRef<{
    startX: number;
    startScrollLeft: number;
    pointerId: number;
  } | null>(null);
  // Timestamp until which clicks are suppressed (set when a real drag ends).
  const suppressClickUntil = useRef(0);

  const updateArrows = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) {
      setCanPrev(false);
      setCanNext(false);
      return;
    }
    const rtl = isRtl();
    const sl = el.scrollLeft;
    if (rtl) {
      // RTL (Chrome/FF): scrollLeft runs 0 (inline-start) → -max (inline-end).
      setCanPrev(sl < -1);
      setCanNext(sl > -(max - 1));
    } else {
      setCanPrev(sl > 1);
      setCanNext(sl < max - 1);
    }
  }, []);

  useEffect(() => {
    updateArrows();
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    const onResize = () => updateArrows();
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", onResize);
    };
  }, [updateArrows, children]);

  const scrollPage = useCallback((forward: boolean) => {
    const el = viewportRef.current;
    if (!el) return;
    const page = Math.max(el.clientWidth * 0.85, 1);
    const dir = isRtl() ? -1 : 1;
    el.scrollBy({
      left: (forward ? 1 : -1) * dir * page,
      behavior: canAnimate ? "smooth" : "auto",
    });
  }, [canAnimate]);

  // Drag-to-scroll for fine pointers only; touch keeps native momentum.
  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const el = viewportRef.current;
    if (!el) return;
    drag.current = {
      startX: event.clientX,
      startScrollLeft: el.scrollLeft,
      pointerId: event.pointerId,
    };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const state = drag.current;
    const el = viewportRef.current;
    if (!state || !el || event.pointerId !== state.pointerId) return;
    const dx = event.clientX - state.startX;
    if (Math.abs(dx) > 6) {
      el.classList.add("is-dragging");
      el.scrollLeft = state.startScrollLeft - dx;
      // Any real drag suppresses the click that fires on release.
      suppressClickUntil.current = Date.now() + 350;
    }
  }, []);

  const endDrag = useCallback((event: React.PointerEvent) => {
    const state = drag.current;
    const el = viewportRef.current;
    if (state && event.pointerId === state.pointerId) {
      drag.current = null;
      el?.classList.remove("is-dragging");
    }
  }, []);

  // Suppress the click that fires after a real drag (prevents navigating
  // to a product the shopper was only scrolling past).
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (Date.now() < suppressClickUntil.current) {
      event.stopPropagation();
      event.preventDefault();
    }
  }, []);

  return (
    <div className={cn("product-rail relative", className)}>
      <div
        ref={viewportRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={cn(
          "rail-viewport no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-1",
          viewportClassName,
        )}
      >
        {children}
      </div>

      {canPrev && (
        <button
          type="button"
          aria-label={prevLabel}
          onClick={() => scrollPage(false)}
          className="rail-arrow pressable absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-background/95 p-2 shadow-sm backdrop-blur transition-opacity hover:bg-muted md:block start-2"
        >
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
        </button>
      )}
      {canNext && (
        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => scrollPage(true)}
          className="rail-arrow pressable absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-background/95 p-2 shadow-sm backdrop-blur transition-opacity hover:bg-muted md:block end-2"
        >
          <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden />
        </button>
      )}
    </div>
  );
}
