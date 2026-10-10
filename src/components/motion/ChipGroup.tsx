/**
 * ChipGroup — animated filter chips (shop filters, category pills, sort
 * options). The active chip animates its filled state via CSS transition;
 * inactive chips get hover depth. Roving tabindex + arrow-key navigation
 * (direction-aware: ArrowLeft/Right follow visual order in RTL too).
 *
 * All labels come from the caller (translated) — zero hardcoded copy here.
 */
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { motionTw } from "@/lib/motion-tokens";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible label for the group (translated by caller). */
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
  size = "md",
}: ChipGroupProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const focusChip = useCallback(
    (index: number) => {
      const next = (index + options.length) % options.length;
      const option = options[next];
      if (!option) return;
      buttons.current[next]?.focus();
      onChange(option.value);
    },
    [options, onChange],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      // In RTL the visual order is mirrored; ArrowLeft/Right move visually,
      // which is what shoppers expect.
      const rtl =
        typeof document !== "undefined" &&
        document.documentElement.dir === "rtl";
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusChip(index + (rtl ? -1 : 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusChip(index + (rtl ? 1 : -1));
      } else if (event.key === "Home") {
        event.preventDefault();
        focusChip(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusChip(options.length - 1);
      }
    },
    [focusChip, options.length],
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              `pressable rounded-md border text-small font-medium ${motionTw.transition.interactive} ${motionTw.duration.base}`,
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              size === "sm" ? "px-2.5 py-1" : "px-3.5 py-1.5",
              active
                ? "border-ink bg-ink text-background shadow-sm"
                : "border-border bg-background text-foreground hover:-translate-y-px hover:border-muted-foreground/40 hover:shadow-sm",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
