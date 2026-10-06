/**
 * TextReveal — word-by-word reveal on scroll into view.
 *
 * Editorial headline animation: each word fades and rises with a stagger
 * via the `--word-delay` custom property, triggered the first time the
 * element enters the viewport (same IntersectionObserver pattern as
 * `useReveal`). Vertical-only motion, safe in LTR and RTL.
 *
 * Under `prefers-reduced-motion` the global guard collapses the
 * transitions, so words appear immediately.
 */
import {
  createElement,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";import { useReveal } from "@/hooks/use-reveal";
import { motionStagger } from "@/lib/motion-tokens";

export interface TextRevealProps extends HTMLAttributes<HTMLElement> {
  text: string;
  /** Rendered element. Defaults to `p`. */
  as?: ElementType;
  /** Base delay before the first word, in ms. */
  delay?: number;
  /** Stagger between words, in ms. */
  step?: number;
}

export function TextReveal({
  text,
  as: Tag = "p",
  delay = 0,
  step = motionStagger.word.step,
  className = "",
  ...rest
}: TextRevealProps) {
  const ref = useReveal<HTMLElement>();
  const words = text.split(/\s+/).filter(Boolean);

  const nodes: ReactNode[] = [];
  words.forEach((word, index) => {
    nodes.push(
      <span
        key={`word-${index}`}
        className="text-reveal-word"
        style={{ "--word-delay": `${delay + index * step}ms` } as CSSProperties}
      >
        {word}
      </span>,
    );
    if (index < words.length - 1) nodes.push(" ");
  });

  return createElement(
    Tag,
    { ...rest, ref, className: `text-reveal ${className}`.trim() },
    nodes,
  );
}
