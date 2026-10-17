/**
 * Hand-drawn SVG charts for the admin dashboard. No charting dependencies.
 * Static SVG (no animation) so they are safe under prefers-reduced-motion.
 */

type SeriesPoint = { date: string; orders: number; sales: number };

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function SalesChart({ data }: { data: SeriesPoint[] }) {
  const W = 720;
  const H = 300;
  const PAD_L = 52;
  const PAD_R = 44;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const hasAny = data.some((d) => d.orders > 0 || d.sales > 0);
  const maxSales = Math.max(1, ...data.map((d) => d.sales));
  const maxOrders = Math.max(1, ...data.map((d) => d.orders));

  const x = (i: number) => PAD_L + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const ySales = (v: number) => PAD_T + innerH - (v / maxSales) * innerH;
  const yOrders = (v: number) => PAD_T + innerH - (v / maxOrders) * innerH;

  const salesLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${ySales(d.sales).toFixed(1)}`).join(" ");
  const salesArea = data.length
    ? `${salesLine} L${x(data.length - 1).toFixed(1)},${(PAD_T + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`
    : "";
  const ordersLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yOrders(d.orders).toFixed(1)}`).join(" ");

  const salesTicks = [0, 0.5, 1].map((f) => Math.round(maxSales * f));
  const ordersTicks = [0, 0.5, 1].map((f) => Math.round(maxOrders * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          hasAny
            ? `Daily orders and delivered sales over the last ${data.length} days. Peak daily sales ${compact(maxSales)}.`
            : `No orders or sales in the last ${data.length} days.`
        }
      >
        {salesTicks.map((t) => (
          <g key={`s-${t}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={ySales(t)} y2={ySales(t)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={PAD_L - 8} y={ySales(t) + 4} textAnchor="end" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {compact(t)}
            </text>
          </g>
        ))}
        {ordersTicks.map((t) => (
          <text key={`o-${t}`} x={W - PAD_R + 8} y={yOrders(t) + 4} fontSize={11} fill="currentColor" className="text-muted-foreground">
            {compact(t)}
          </text>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {d.date.slice(8, 10)}
            </text>
          ) : null,
        )}
        {hasAny ? (
          <>
            <path d={salesArea} fill="var(--chart-1)" opacity={0.18} />
            <path d={salesLine} fill="none" stroke="var(--chart-1)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            <path d={ordersLine} fill="none" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : (
          <text x={W / 2} y={PAD_T + innerH / 2} textAnchor="middle" fontSize={14} fill="currentColor" className="text-muted-foreground">
            No order or sales data for the last {data.length} days.
          </text>
        )}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center gap-5 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-full" style={{ background: "var(--chart-1)" }} aria-hidden="true" />
          Delivered sales
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 border-t-2 border-dashed" style={{ borderColor: "var(--chart-2)" }} aria-hidden="true" />
          Orders (right axis)
        </span>
      </figcaption>
    </figure>
  );
}
