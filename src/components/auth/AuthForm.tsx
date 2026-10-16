import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ModaliLogo } from "@/components/brand/ModaliaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared auth presentation primitives (Phase C, Area 4).
 *
 * PRESENTATION ONLY: no auth logic, no session handling, no redirects, no
 * validation rules live here. Used exclusively by the customer/seller auth
 * routes and the seller onboarding wizard.
 *
 * Every color carries a `dark:` variant; spacing uses logical flow (no
 * physical left/right), so Arabic RTL works via the `dir` attribute.
 */

/** Full-page wrapper: background + locale direction only. */
export function AuthPage({
  dir,
  lang,
  children,
}: {
  dir: string;
  lang: string;
  children: ReactNode;
}) {
  return (
    <div dir={dir} lang={lang} className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}

/** Vertically-centered container for the auth card. */
export function AuthCenter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "mx-auto flex w-full max-w-sm items-center px-4 py-10 sm:py-14",
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * Centered auth card with a brand-neutral header.
 * `eyebrow` carries the wordmark line (e.g. "MODALIA" / "MODALIA · SELLER OS").
 */
export function AuthCard({
  eyebrow,
  title,
  subtitle,
  icon,
  className,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-neutral-200/80 bg-card p-6 shadow-none dark:border-neutral-800/80 sm:p-8",
        className,
      )}
    >
      <div className="mb-4 flex justify-center">
        <ModaliLogo className="h-10 w-auto" />
      </div>
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-1 text-display">{title}</h1>
        </div>
      </div>
      {subtitle ? <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-7">{children}</div>
    </div>
  );
}

/** Label-above-input field with optional inline error / hint. */
export function AuthField({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Input with the uniform auth height (h-11, thumb-friendly on mobile). */
export function AuthInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={cn("h-11", props.className)} />;
}

/** Tone-aware status banner (info / error). */
export function AuthMessage({
  tone = "info",
  role,
  className,
  children,
}: {
  tone?: "info" | "error";
  role?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  const error = tone === "error";
  return (
    <p
      role={role ?? (error ? "alert" : "status")}
      className={cn(
        "rounded-xl p-3 text-sm",
        error
          ? "border border-destructive/20 bg-destructive/10 text-destructive dark:border-destructive/30"
          : "bg-muted text-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Solid primary submit button with loading-state label swap. */
export function AuthSubmit({
  loading,
  loadingLabel,
  className,
  children,
  ...rest
}: {
  loading: boolean;
  loadingLabel: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "disabled">) {
  return (
    <Button
      type="submit"
      className={cn("h-12 w-full rounded-full text-[15px]", className)}
      disabled={loading}
      {...rest}
    >
      {loading ? loadingLabel : children}
    </Button>
  );
}

/** Underlined mode-switch link button (login ↔ signup ↔ reset). */
export function AuthTextButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mt-5 w-full text-center text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
