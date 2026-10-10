import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** Short title, e.g. "Section could not be loaded". */
  title: string;
  /** The real (sanitized) error message or explanation. */
  description?: ReactNode;
  /** Optional action, e.g. a retry button. */
  action?: ReactNode;
  className?: string;
}

/**
 * ErrorState — honest error state for dashboard sections.
 *
 * Uses a warning icon tile (never emoji). The description should carry
 * the sanitized real error so the user can report it.
 */
export function ErrorState({ title, description, action, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
        aria-hidden="true"
      >
        <TriangleAlert className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
