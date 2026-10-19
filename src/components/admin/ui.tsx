import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { platformConfig, type SupportedLocale } from "@/config/platform";
import { getTranslations } from "@/lib/i18n";
import { localeTag } from "@/lib/i18n/format";
import { useAdminLocale } from "./useAdminLocale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

/* ---------------------------------- Card --------------------------------- */

export function AdminCard({
  title,
  subtitle,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  subtitle?: string | undefined;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string | undefined;
}) {
  return (
    <Card className={cn("rounded-xl border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.06)]", className)}>
      {title || actions ? (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            {title ? <CardTitle className="text-[15px] font-semibold tracking-tight">{title}</CardTitle> : null}
            {subtitle ? <CardDescription className="mt-1 text-[13px]">{subtitle}</CardDescription> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("px-4 pb-5 sm:px-6 sm:pb-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

/* ------------------------------- StatusPill ------------------------------ */

const GREEN = new Set(["delivered", "approved", "active", "paid", "verified"]);
const AMBER = new Set(["pending", "preparing", "processing", "under_review"]);
const BLUE = new Set(["confirmed", "shipped", "in_transit", "converted"]);
const RED = new Set(["cancelled", "rejected", "failed_delivery", "suspended", "disabled"]);
const SLATE = new Set(["returned", "refunded", "archived", "hidden"]);

/**
 * Status tones use design-system tokens only (no raw green/amber/blue/red/slate).
 * `info` is the blue informational tone; per badge law it shares the official
 * blue hue.
 */
function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (GREEN.has(s))
    return "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20";
  if (AMBER.has(s))
    return "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20";
  if (BLUE.has(s))
    return "bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20";
  if (RED.has(s))
    return "bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20";
  return "bg-neutral-500/10 text-neutral-600 ring-neutral-500/20 dark:bg-neutral-400/10 dark:text-neutral-300 dark:ring-neutral-400/20";
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status: string;
  /** Optional display label. Defaults to the raw status (lowercased, underscores to spaces). Pass a localized label when one exists. */
  label?: string;
  className?: string;
}) {
  const text = label ?? status.toLowerCase().replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        statusTone(status),
        className,
      )}
    >
      {text}
    </span>
  );
}

/* ------------------------------- EmptyState ------------------------------ */

export function EmptyState({
  title,
  text,
  description,
  action,
  icon,
}: {
  title: string;
  text?: string | undefined;
  /** Alias for `text` — preferred for new code (matches dashboard/EmptyState). */
  description?: React.ReactNode | undefined;
  action?: React.ReactNode;
  icon?: React.ReactNode | undefined;
}) {
  const body = description ?? text;
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        {icon ?? <Inbox className="h-5 w-5 text-muted-foreground" />}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------ TableSkeleton ---------------------------- */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1.5" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-1/6" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- AdminTable ------------------------------ */

/**
 * Responsive table wrapper for admin list pages.
 * - Rounded card container with border (matches AdminCard radius)
 * - Horizontal scroll on small screens with subtle edge fade hint
 * - Sticky header row with muted background
 * - Row hover for scanability
 * Use: <AdminTable><table className="w-full text-sm">…</table></AdminTable>
 */
export function AdminTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "relative overflow-x-auto rounded-xl border border-border/60 bg-card",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_thead]:sticky [&_thead]:top-0",
        "[&_thead_th]:whitespace-nowrap [&_thead_th]:bg-muted/60 [&_thead_th]:px-4 [&_thead_th]:py-3",
        "[&_thead_th]:text-start [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:uppercase",
        "[&_thead_th]:tracking-wide [&_thead_th]:text-muted-foreground",
        "[&_tbody_td]:border-t [&_tbody_td]:border-border/50 [&_tbody_td]:px-4 [&_tbody_td]:py-3 [&_tbody_td]:align-middle",
        "[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------ ConfirmDialog ---------------------------- */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  danger = false,
  isPending = false,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  onConfirm: () => void;
  danger?: boolean | undefined;
  isPending?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  // The dialog resolves the active locale itself so call sites that rely on
  // the default button labels get them translated for free.
  const locale = useAdminLocale();
  const common = getTranslations(locale).common;
  const confirmText = confirmLabel ?? common.confirm;
  const cancelText = cancelLabel ?? common.cancel;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending || disabled}
            className={danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {isPending ? "..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------------------- SegmentedControl --------------------------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string | undefined;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex gap-0.5 rounded-md border border-border bg-card p-0.5", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={cn(
              "rounded-[5px] px-3 py-1 text-small font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- FilterBar ------------------------------- */

/**
 * Consistent filter bar for admin list pages.
 * Wraps on mobile (no horizontal overflow), aligns to a tidy grid on desktop.
 * Pair with AdminTable below it.
 */
export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4",
        "sm:flex-row sm:flex-wrap sm:items-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* --------------------------------- Field --------------------------------- */export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string | undefined;
  error?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------- Helpers ------------------------------- */

/**
 * Locale-aware formatters. `locale` is the UI locale (ar/fr/en); when omitted
 * it falls back to the platform default language.
 */
export function fmtMoney(
  n: number | string,
  currency = "DZD",
  locale: SupportedLocale = platformConfig.market.defaultLanguage,
): string {
  const value = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function fmtDate(
  value: string | Date | null | undefined,
  locale: SupportedLocale = platformConfig.market.defaultLanguage,
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium" }).format(d);
}

export function fmtDateTime(
  value: string | Date | null | undefined,
  locale: SupportedLocale = platformConfig.market.defaultLanguage,
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function timeAgo(
  value: string | Date | null | undefined,
  locale: SupportedLocale = platformConfig.market.defaultLanguage,
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    const amount = Math.round(diffMs / ms);
    if (Math.abs(amount) >= 1) return rtf.format(amount, unit);
  }
  return rtf.format(0, "second");
}
