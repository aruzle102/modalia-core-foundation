/**
 * Modalia Intelligence — distinctive brand symbol.
 *
 * An elegant four-point "smart spark": a geometric star that fuses the
 * idea of AI brilliance with a guiding compass point for smart shopping.
 * Filled monochrome, symmetric (RTL-safe), recognizable from 16px up.
 */
import { cn } from "@/lib/utils";

export function ModaliaIntelligenceIcon({
  className,
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* Smart spark — four-point star */}
      <path d="M12 2.5c.62 5.14 3.36 7.88 8.5 8.5-5.14.62-7.88 3.36-8.5 8.5-.62-5.14-3.36-7.88-8.5-8.5 5.14-.62 7.88-3.36 8.5-8.5Z" />
      {/* Intelligence node — the spark's core */}
      <circle cx="12" cy="12" r="1.4" fill="currentColor" opacity={0.9} />
    </svg>
  );
}
