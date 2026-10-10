import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { motionTw } from "@/lib/motion-tokens";

/**
 * Modalia premium button system — V10.
 *
 * Design principles:
 * - Refined corner radius: 10-12px (rounded-[10px] / rounded-xl)
 * - Subtle depth: slight shadow on primary, none on ghost
 * - Smooth hover: background transition + 1px lift on primary
 * - Press feedback: scale(0.97) on active
 * - Icon movement: icons shift 2px on hover (via .btn-icon class)
 * - Clear hierarchy: primary > secondary > tertiary
 * - Reduced motion: all animations disabled via motion-reduce
 * - No pills, no gradients, no neon, no glow
 */
const buttonVariants = cva(
  `group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium tracking-tight cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 motion-reduce:[&_svg]:transition-none`,
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-primary/90 hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:-translate-y-px motion-reduce:hover:translate-y-0",
        secondary:
          "border border-border bg-background hover:bg-muted hover:border-foreground/20",
        tertiary: "hover:bg-muted text-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        commerce:
          "bg-primary text-primary-foreground font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-primary/90 hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-[13px] rounded-lg",
        lg: "h-12 px-8 text-[15px] rounded-xl",
        icon: "h-10 w-10 rounded-full",
        "icon-sm": "h-8 w-8 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
