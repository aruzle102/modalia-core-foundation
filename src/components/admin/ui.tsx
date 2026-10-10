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
    <Card className={cn("rounded-md shadow-none", className)}>
      {title || actions ? (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title ? <CardTitle className="text-sm font-semibold">{title}</CardTitle> : null}
            {subtitle ? <CardDescription className="mt-1 text-caption">{subtitle}</CardDescription> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("px-4 pb-4 sm:px-5 sm:pb-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

/* ---------------------------------- Stat --------------------------------- */

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <Card className={cn("rounded-md shadow-none", className)}>
      <CardContent className="p-4">
        <p className="text-eyebrow text-muted-foreground">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-caption text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------- Stat rows (dense lists) ------------------------ */

export function StatRows({ children, className }: { children: React.ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-md border border-border bg-card", className)}>
      {children}
    </div>
  );
}

export function StatRow({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <p className="text-small font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p> : null}
      </div>
      <p className="shrink-0 text-lg font-semibold tabular-nums">{value}</p>
    </div>
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
  if (GREEN.has(s)) return "bg-verified/10 text-verified ring-verified/25";
  if (AMBER.has(s)) return "bg-brand/10 text-brand ring-brand/25";
  if (BLUE.has(s)) return "bg-info/10 text-info ring-info/25";
  if (RED.has(s)) return "bg-destructive/10 text-destructive ring-destructive/25";
  return "bg-muted text-muted-foreground ring-border";
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const label = status.toLowerCase().replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        statusTone(status),
        className,
      )}
    >
      {label}
    </span>
  );
}

/* ------------------------------- EmptyState ------------------------------ */

export function EmptyState({
  title,
  text,
  action,
  icon,
}: {
  title: string;
  text?: string | undefined;
  action?: React.ReactNode;
  icon?: React.ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        {icon ?? <Inbox className="h-5 w-5 text-muted-foreground" />}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {text ? <p className="max-w-sm text-sm text-muted-foreground">{text}</p> : null}
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  onConfirm: () => void;
  danger?: boolean | undefined;
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
            className={danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmText}
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

/* --------------------------------- Field --------------------------------- */

export function Field({
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
