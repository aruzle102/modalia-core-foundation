/**
 * Modalia Intelligence — custom brand icon.
 *
 * Minimal geometric mark combining "M" with an intelligence/signal motif.
 * Monochrome, recognizable at 16px. Replaces generic Sparkles.
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
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* M letterform */}
      <path d="M4 18V6l4 6 4-6v12" />
      {/* Signal/discovery dot — the "intelligence" spark */}
      <circle cx="18.5" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
      {/* Signal arc */}
      <path d="M15 9.5a5 5 0 0 1 6 0" strokeWidth={1.5} opacity={0.6} />
    </svg>
  );
}
