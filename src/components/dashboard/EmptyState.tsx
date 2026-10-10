import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Icon shown in the tile. Defaults to an inbox icon. */
  icon?: ReactNode;
  /** Short title, e.g. "No orders yet". */
  title: string;
  /** Honest one-line explanation. Never invent data here. */
  description?: ReactNode;
  /** Optional action, e.g. a Button linking somewhere real. */
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState — honest empty state for dashboard sections.
 *
 * Copy must describe the real situation (no fake "sample" rows). Pass
 * localized strings from the caller; English fallbacks are fine.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}>
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        aria-hidden="true"
      >
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
