/**
 * ImageReveal — clip-path reveal on scroll.
 *
 * The image settles from a slight zoom (1.12) while a soft clip inset
 * animates away, the classic editorial "develop" reveal. Triggered once
 * on scroll into view (same IntersectionObserver pattern as `useReveal`).
 *
 * Calm 900ms ease-out; under `prefers-reduced-motion` the global guard
 * collapses it to an instant appearance.
 */
import { useReveal } from "@/hooks/use-reveal";

export interface ImageRevealProps {
  src: string;
  alt: string;
  /** Aspect-ratio utility, e.g. "aspect-[4/3]". */
  aspect?: string;
  className?: string;
  imgClassName?: string;
  /** Load eagerly for above-the-fold hero imagery. */
  eager?: boolean;
}

export function ImageReveal({
  src,
  alt,
  aspect = "aspect-[4/3]",
  className = "",
  imgClassName = "",
  eager = false,
}: ImageRevealProps) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`image-reveal ${aspect} ${className}`.trim()}>
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        className={imgClassName}
      />
    </div>
  );
}
