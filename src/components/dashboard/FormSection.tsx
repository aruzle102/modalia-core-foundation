import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface FormSectionProps {
  /** Section title. */
  title: string;
  /** Optional description below the title. */
  description?: ReactNode;
  /** Section content (form fields, etc.). */
  children: ReactNode;
  /** Optional actions rendered at the end of the header row. */
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * FormSection — card wrapper for settings-style pages.
 *
 * Title + description header with consistent padding, then content.
 * Built now for Phase 2 settings pages; not yet used on dashboards.
 */
export function FormSection({ title, description, children, actions, className, contentClassName }: FormSectionProps) {
  return (
    <Card className={cn("rounded-xl border-neutral-200/80 shadow-none dark:border-neutral-800/80", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description ? (
            <CardDescription className="mt-1 text-sm">{description}</CardDescription>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn("px-5 pb-5 sm:px-6 sm:pb-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
