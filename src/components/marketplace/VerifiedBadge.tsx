import { BadgeCheck } from "lucide-react";

interface VerifiedBadgeProps {
  /** Only verified stores render the badge — regular stores get nothing. */
  verified: boolean;
  /** Accessible label, e.g. t.store.verifiedStore. */
  label: string;
  className?: string;
}

/**
 * Blue verification badge for the official Modalia store (and any store whose
 * stores.verification_status = 'verified'). Renders nothing for unverified
 * stores — regular merchants never receive it.
 */
export function VerifiedBadge({ verified, label, className }: VerifiedBadgeProps) {
  if (!verified) return null;
  return (
    <BadgeCheck
      role="img"
      aria-label={label}
      className={`size-5 shrink-0 fill-sky-500 text-white ${className ?? ""}`}
    />
  );
}
