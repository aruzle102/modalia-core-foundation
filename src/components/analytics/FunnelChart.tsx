/**
 * Hand-drawn SVG conversion funnel. No charting dependencies.
 * Static SVG (no animation) so it is safe under prefers-reduced-motion.
 *
 * Renders only real counts passed in -- when every count is zero the caller
 * is expected to render an honest empty state instead of this chart.
 */
import type { FunnelStage } from "@/lib/analytics.functions";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const W = 720;
  const ROW_H = 64;
  const LABEL_W = 190;
  const BAR_MAX_W = 400;
  const H = stages.length * ROW_H + 8;

  const first = Math.max(1, stages[0]?.count ?? 1);

  return (
    <figure dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Conversion funnel: ${stages.map((s) => `${s.label} ${compact(s.count)}`).join(", ")}. All figures from real recorded events.`}
      >
        {stages.map((stage, i) => {
          const y = i * ROW_H + 8;
          const width = Math.max(6, (stage.count / first) * BAR_MAX_W);
          const prev = i === 0 ? null : stages[i - 1];
          const stepRate = prev && prev.count > 0 ? (stage.count / prev.count) * 100 : null;
          return (
            <g key={stage.stage}>
              <text
                x={LABEL_W - 12}
                y={y + 26}
                textAnchor="end"
                fontSize={13}
                fontWeight={600}
                fill="currentColor"
                className="text-foreground"
              >
                {stage.label}
              </text>
              <text
                x={LABEL_W - 12}
                y={y + 44}
                textAnchor="end"
                fontSize={11}
                fill="currentColor"
                className="text-muted-foreground"
              >
                {i === 0 ? "entry" : stepRate === null ? "—" : `${stepRate.toFixed(1)}% continue`}
              </text>
              <rect
                x={LABEL_W}
                y={y + 8}
                width={width}
                height={34}
                rx={8}
                fill={PALETTE[i % PALETTE.length]}
                opacity={0.85}
              />
              <text
                x={LABEL_W + width + 10}
                y={y + 31}
                fontSize={13}
                fontWeight={600}
                fill="currentColor"
                className="text-foreground"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {compact(stage.count)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-caption text-muted-foreground">
        Step conversion is measured against the previous step. Each stage counts unique visitors — real recorded events, not estimates.
      </figcaption>
    </figure>
  );
}
