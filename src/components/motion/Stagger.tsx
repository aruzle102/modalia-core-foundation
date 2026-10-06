/**
 * Stagger — staggered scroll entrance for groups (grids, rails, lists).
 *
 * Wraps each child in the shared `Reveal` with an incremental delay from
 * `staggerStyle`, so entrances cascade calmly instead of firing all at
 * once. Delays are capped (see `staggerStyle`) so long grids never feel
 * sluggish; under reduced motion every child appears instantly.
 */
import { Children, isValidElement, type ReactNode } from "react";
import { Reveal, staggerStyle } from "@/lib/motion";

export interface StaggerProps {
  children: ReactNode;
  /** Delay step between items in ms. */
  stepMs?: number;
  /** Cap for the accumulated delay in ms. */
  maxMs?: number;
  className?: string;
}

export function Stagger({
  children,
  stepMs = 60,
  maxMs = 480,
  className = "",
}: StaggerProps) {
  const items = Children.toArray(children);
  return (
    <>
      {items.map((child, index) => (
        <Reveal
          key={isValidElement(child) && child.key != null ? child.key : index}
          className={className}
          style={staggerStyle(index, stepMs, maxMs)}
        >
          {child}
        </Reveal>
      ))}
    </>
  );
}
