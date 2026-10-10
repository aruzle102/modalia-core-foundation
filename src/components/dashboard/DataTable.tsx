import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataTableProps {
  /** The <table> element. Header/row classes stay the caller's responsibility. */
  children: ReactNode;
  className?: string;
}

/**
 * DataTable — consistent container for dashboard tables.
 *
 * Gives every table the same rounded border, horizontal scroll on small
 * screens, and surface treatment. It does not reimplement table logic:
 * pass a plain <table> with your thead/tbody.
 */
export function DataTable({ children, className }: DataTableProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-neutral-200 bg-white",
        "dark:border-neutral-800 dark:bg-neutral-950",
        className,
      )}
    >
      {children}
    </div>
  );
}
