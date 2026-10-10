/**
 * AsyncButton — commerce action button with honest loading/success states.
 *
 * Wraps the shadcn `Button` with an async state machine:
 * idle → loading (spinner, disabled, `aria-busy`) → success (check +
 * success-pop, auto-reverts) → idle. On failure it returns to idle and
 * reports via `onError` — the failure is never swallowed silently.
 *
 * - Double-submits are impossible: clicks are ignored while pending.
 * - Optional micro-feedback replay (`wishlist` → wish-pop, `cart` →
 *   cart-nudge) on success, using the shared `replayAnimation` helper.
 * - All labels are props (caller supplies translated strings) — this
 *   component hardcodes zero user-facing copy.
 * - Under reduced motion the state still changes (icon + label); only the
 *   decorative pop is collapsed by the global guard.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { microAnimationClass, replayAnimation } from "@/lib/motion";
import { cn } from "@/lib/utils";

type AsyncState = "idle" | "loading" | "success";

export interface AsyncButtonProps extends Omit<ButtonProps, "onClick" | "disabled"> {
  /** The async commerce action. Must resolve/reject; never hangs the UI. */
  onAction: () => Promise<void>;
  /** Idle-state label (translated by caller). */
  children: React.ReactNode;
  /** Loading-state label; defaults to the idle label with a spinner. */
  loadingLabel?: React.ReactNode;
  /** Success-state label; defaults to a check icon only. */
  successLabel?: React.ReactNode;
  /** Micro-feedback animation replayed on success. */
  feedback?: "wishlist" | "cart" | "none";
  /** How long the success state shows before reverting (ms). */
  successDurationMs?: number;
  /** Called with the rejection reason when the action fails. */
  onError?: (error: unknown) => void;
  /** Screen-reader label announced on success (translated by caller). */
  successSrLabel?: string | undefined;
  /** External disabled (e.g. form invalid) — combined with loading state. */
  disabled?: boolean;
}

export function AsyncButton({
  onAction,
  children,
  loadingLabel,
  successLabel,
  feedback = "none",
  successDurationMs = 1400,
  onError,
  successSrLabel,
  disabled = false,
  className = "",
  ...rest
}: AsyncButtonProps) {
  const [state, setState] = useState<AsyncState>("idle");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleClick = useCallback(async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      await onAction();
      setState("success");
      if (feedback !== "none") {
        replayAnimation(
          buttonRef.current,
          feedback === "wishlist"
            ? microAnimationClass.wishlistPop
            : microAnimationClass.cartNudge,
        );
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => setState("idle"),
        successDurationMs,
      );
    } catch (error) {
      setState("idle");
      onError?.(error);
    }
  }, [state, onAction, feedback, successDurationMs, onError]);

  const busy = state === "loading";

  return (
    <Button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-live="polite"
      className={cn("pressable", className)}
      {...rest}
    >
      {state === "loading" && (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      )}
      {state === "success" && (
        <span className="success-pop inline-flex" aria-hidden>
          <Check className="h-4 w-4" />
        </span>
      )}
      {state === "loading" && (loadingLabel ?? children)}
      {state === "success" && (successLabel ?? null)}
      {state === "idle" && children}
      {state === "success" && successLabel == null && successSrLabel != null && (
        <span className="sr-only">{successSrLabel}</span>
      )}
    </Button>
  );
}
