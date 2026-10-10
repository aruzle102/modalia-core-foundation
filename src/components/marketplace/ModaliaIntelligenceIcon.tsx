/**
 * Modalia Intelligence — distinctive brand symbol.
 *
 * Geometric "M" formed by connected intelligence nodes.
 * The central node represents discovery; the connecting paths
 * represent search and commerce intelligence.
 * Monochrome, premium, recognizable at 16px.
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
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* M letterform as connected nodes */}
      <path d="M4 19V7l5 7 3-4.5L15 14l5-7v12" />
      {/* Intelligence nodes */}
      <circle cx="4" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="20" cy="7" r="1.3" fill="currentColor" stroke="none" />
      {/* Discovery signal — central pulse */}
      <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" opacity={0.7} />
    </svg>
  );
}
