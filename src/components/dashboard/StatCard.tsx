import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface StatTrend {
  /** "up" renders an emerald chip, "down" a rose chip. Only pass when the figure is real. */
  direction: "up" | "down";
  /** Already-formatted delta, e.g. "+12%" or "-3.1%". */
  value: string;
  /** Optional accessible label, e.g. "vs last 30 days". */
  label?: string;
}

export interface StatCardProps {
  /** Card title, rendered as an uppercase eyebrow (e.g. "Net earnings"). */
  title: string;
  /** Main value — already formatted string or node (e.g. <CountUp …/>).
   *  Optional when `loading` is true (skeleton is shown instead). */
  value?: ReactNode;
  /** Optional leading icon, rendered in a subtle tile. */
  icon?: ReactNode;
  /** Optional description/hint below the value. */
  description?: ReactNode;
  /** Optional trend chip. Omit entirely when there is no real delta. */
  trend?: StatTrend;
  /** Show skeleton instead of the value. */
  loading?: boolean;
  /**
   * Featured card: spans 2 columns on lg and renders the value larger.
   * Use for the single most important KPI on a page.
   */
  featured?: boolean;
  className?: string;
}

/**
 * StatCard — KPI card for dashboard metric grids.
 *
 * Black/white/neutral identity, tabular numerals, logical properties for
 * RTL. The value slot accepts any node so callers can pass <CountUp/>
 * for animated real figures.
 */
export function StatCard({ title, value, icon, description, trend, loading, featured, className }: StatCardProps) {
  return (
    <Card
      className={cn(
        "h-full rounded-xl border-neutral-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        "transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
        "dark:border-neutral-800/80 dark:bg-neutral-950",
        featured && "lg:col-span-2",
        className,
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
            {title}
          </p>
          {icon ? (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
        </div>
        {loading ? (
          <div className="mt-3 space-y-2" role="status" aria-label="Loading">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p
                className={cn(
                  "font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white",
                  featured ? "text-4xl" : "text-3xl",
                )}
              >
                {value}
              </p>
              {trend ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    trend.direction === "up"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400",
                  )}
                  title={trend.label}
                >
                  {trend.direction === "up" ? (
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-3 w-3" aria-hidden="true" />
                  )}
                  {trend.value}
                </span>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
