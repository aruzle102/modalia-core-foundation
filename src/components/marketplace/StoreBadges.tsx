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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-official/10 px-2 py-0.5 text-xs font-semibold text-official ${className ?? ""}`}
    >
      <BadgeCheck className="size-3.5 fill-official text-white" aria-hidden="true" />
      Modalia Official
    </span>
  );
}

interface VerifiedSellerBadgeProps extends BadgeProps {
  verified: boolean;
  /**
   * Badge tone chosen by the admin: "blue" = platform-affiliated store,
   * "green" = classic quality-guarantee badge. Defaults to blue.
   */
  tone?: "blue" | "green";
}

/**
 * Verified seller badge — distinct from the official store badge.
 * Shown for third-party sellers whose store verification_status = 'verified'
 * or 'manual' (admin-granted). Uses a shield motif to avoid confusion with
 * the official store checkmark.
 * The visible text is the translated `label` passed by the caller, so the
 * badge renders in the active locale.
 */
export function VerifiedSellerBadge({ verified, label, className, tone = "blue" }: VerifiedSellerBadgeProps) {
  if (!verified) return null;
  const green = tone === "green";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        green
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-verified/10 text-verified"
      } ${className ?? ""}`}
    >
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
