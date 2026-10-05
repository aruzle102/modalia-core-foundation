import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
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
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {title || actions ? (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            {title ? <CardTitle className="text-sm font-semibold">{title}</CardTitle> : null}
            {subtitle ? <CardDescription className="mt-0.5">{subtitle}</CardDescription> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ---------------------------------- Stat --------------------------------- */

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------- StatusPill ------------------------------ */

const GREEN = new Set(["delivered", "approved", "active", "paid", "verified"]);
const AMBER = new Set(["pending", "preparing", "processing"]);
const BLUE = new Set(["confirmed", "shipped", "in_transit"]);
const RED = new Set(["cancelled", "rejected", "failed_delivery", "suspended", "disabled"]);
const SLATE = new Set(["returned", "refunded", "archived", "hidden"]);

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (GREEN.has(s))
    return "bg-green-100 text-green-800 ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-400/20";
  if (AMBER.has(s))
    return "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20";
  if (BLUE.has(s))
    return "bg-blue-100 text-blue-800 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-400/20";
  if (RED.has(s)) return "bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20";
  return "bg-slate-100 text-slate-700 ring-slate-600/20 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-400/20";
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

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground" />
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
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border p-3">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-6 w-16 rounded-full" />
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
  confirmLabel = "Confirm",
  onConfirm,
  danger = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

export function fmtMoney(n: number | string, currency = "DZD"): string {
  const value = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    const amount = Math.round(diffMs / ms);
    if (Math.abs(amount) >= 1) return rtf.format(amount, unit);
  }
  return rtf.format(0, "second");
}
