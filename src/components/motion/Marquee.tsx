/**
 * Marquee — infinite horizontal scroll loop (21st.dev-style ticker).
 *
 * Use for brand-value strips and category tickers. Pure CSS keyframes;
 * no layout thrash, no JS timers. The content is duplicated once so a
 * -50% track translation loops seamlessly.
 *
 * Rules for a seamless loop: each item inside must carry its own
 * horizontal spacing (e.g. `mx-6`) — never put `gap` on the Marquee
 * itself, or the -50% translation will misalign by one gap.
 *
 * Direction is RTL-safe: `forward` means the natural reading direction
 * (content flows left in LTR, right in RTL), flipped automatically via
 * the `[dir="rtl"]` selectors in styles.css.
 *
 * Pauses on hover. Under `prefers-reduced-motion` the strip is static.
 */
import type { CSSProperties, ReactNode } from "react";

export interface MarqueeProps {
  children: ReactNode;
  /** "slow" = 70s loop, "normal" = 42s loop. */
  speed?: "slow" | "normal";
  /** Scroll direction in LTR; mirrored automatically in RTL. */
  direction?: "forward" | "reverse";
  className?: string;
}

const durations = { slow: "70s", normal: "42s" } as const;

export function Marquee({
  children,
  speed = "normal",
  direction = "forward",
  className = "",
}: MarqueeProps) {
  const style = { "--marquee-duration": durations[speed] } as CSSProperties;
  return (
    <div className={`marquee ${className}`.trim()} style={style}>
      <div className="marquee-track" data-direction={direction}>
        <div className="marquee-segment">{children}</div>
        <div className="marquee-segment" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
