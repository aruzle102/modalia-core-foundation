import { BadgeCheck, ShieldCheck } from "lucide-react";

interface BadgeProps {
  label: string;
  className?: string;
}

/**
 * Official Modalia store badge — blue checkmark.
 * Reserved EXCLUSIVELY for the official Modalia store.
 * Never shown for third-party sellers, even verified ones.
 */
export function OfficialStoreBadge({ label, className }: BadgeProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-600 ${className ?? ""}`}
    >
      <BadgeCheck className="size-3.5 fill-sky-500 text-white" aria-hidden="true" />
      Modalia Official
    </span>
  );
}

interface VerifiedSellerBadgeProps extends BadgeProps {
  verified: boolean;
}

/**
 * Verified seller badge — distinct from the official store badge.
 * Shown for third-party sellers whose store verification_status = 'verified'.
 * Uses a shield motif to avoid confusion with the official store checkmark.
 */
export function VerifiedSellerBadge({ verified, label, className }: VerifiedSellerBadgeProps) {
  if (!verified) return null;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 ${className ?? ""}`}
    >
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      Verified Seller
    </span>
  );
}
