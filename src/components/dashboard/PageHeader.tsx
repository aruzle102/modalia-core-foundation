import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Small uppercase label above the title (e.g. "Seller overview"). */
  eyebrow?: ReactNode;
  /** Page title. */
  title: ReactNode;
  /** One-line description below the title. */
  description?: ReactNode;
  /** Action buttons/links, rendered at the end. */
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader — the canonical page header for dashboard pages.
 *
 * Renders eyebrow + title + description + an actions slot with the same
 * spacing the shells historically used (mb-6, wrap on mobile). All
 * directional classes use logical properties so Arabic RTL mirrors
 * correctly.
 */
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white dark:bg-white dark:text-neutral-950">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            "text-3xl font-extrabold tracking-tighter text-neutral-950 dark:text-white",
            eyebrow ? "mt-3" : null,
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">{actions}</div> : null}
    </div>
  );
}
