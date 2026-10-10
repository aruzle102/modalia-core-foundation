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
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className={cn("text-xl font-semibold tracking-tight", eyebrow ? "mt-1" : null)}>{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
