import type { HistogramBin } from '../seismology/stats';

/** Vertical bar histogram with an optional vertical marker (e.g. Mc). */
export function BarChart({ bins, marker, markerLabel, color = 'var(--accent)', format }: {
  bins: HistogramBin[];
  marker?: number | null;
  markerLabel?: string;
  color?: string;
  format: (b: HistogramBin) => string;
}) {
  const W = 300;
  const H = 96;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const bw = W / bins.length;
  const lo = bins[0]?.from ?? 0;
  const hi = bins.at(-1)?.to ?? 1;
  const mx = marker != null ? ((marker - lo) / (hi - lo)) * W : null;
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="chart" role="img" aria-label="Histogram">
      {bins.map((b, i) => {
        const h = b.count === 0 ? 0 : Math.max(1.5, (b.count / max) * H);
        return (
          <rect key={i} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={1.5} fill={color}>
            <title>{`${format(b)}: ${b.count}`}</title>
          </rect>
        );
      })}
      <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} className="axis" />
      {bins.map((b, i) =>
        i % Math.ceil(bins.length / 6) === 0 ? (
          <text key={i} x={i * bw + 1} y={H + 12} className="tick">
            {b.from.toFixed(b.from % 1 ? 1 : 0)}
          </text>
        ) : null,
      )}
      {mx !== null && mx >= 0 && mx <= W && (
        <g>
          <line x1={mx} x2={mx} y1={0} y2={H} className="marker" />
          <text x={mx + 4} y={10} className="marker-label">{markerLabel}</text>
        </g>
      )}
    </svg>
  );
}

/** Gutenberg-Richter plot: log10 N(>=M) against M, with the fitted line from Mc upward. */
export function GrChart({ points, mc, b }: { points: { mag: number; n: number }[]; mc: number | null; b: number | null }) {
  const W = 300;
  const H = 120;
  if (points.length < 2) return null;
  const m0 = points[0].mag;
  const m1 = points.at(-1)!.mag;
  const nMax = Math.log10(points[0].n);
  const x = (m: number) => ((m - m0) / Math.max(0.1, m1 - m0)) * (W - 8) + 4;
  const y = (logN: number) => H - (logN / Math.max(0.5, nMax)) * (H - 8) - 2;
  // Fitted line: anchored on the observed count at Mc, slope -b.
  let line: string | null = null;
  if (mc !== null && b !== null) {
    const anchor = points.find((p) => Math.abs(p.mag - mc) < 0.05);
    if (anchor) {
      const a = Math.log10(anchor.n) + b * mc;
      const mEnd = Math.min(m1 + 0.3, a / b);
      line = `M${x(mc)},${y(a - b * mc)} L${x(mEnd)},${y(Math.max(0, a - b * mEnd))}`;
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="chart" role="img" aria-label="Gutenberg-Richter magnitude-frequency plot">
      {[0, 1, 2, 3, 4].filter((k) => k <= nMax + 0.01).map((k) => (
        <g key={k}>
          <line x1={0} x2={W} y1={y(k)} y2={y(k)} className="grid" />
          <text x={W - 2} y={y(k) - 3} className="tick" textAnchor="end">{10 ** k}</text>
        </g>
      ))}
      {mc !== null && <rect x={0} y={0} width={x(mc)} height={H} className="incomplete" />}
      {points.map((p) => (
        <circle key={p.mag} cx={x(p.mag)} cy={y(Math.log10(p.n))} r={2.2} className={mc !== null && p.mag < mc - 0.01 ? 'gr-dot gr-dot-dim' : 'gr-dot'} />
      ))}
      {line && <path d={line} className="gr-line" />}
      <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} className="axis" />
      {Array.from({ length: Math.floor(m1) - Math.ceil(m0) + 1 }, (_, i) => Math.ceil(m0) + i).map((m) => (
        <text key={m} x={x(m)} y={H + 12} className="tick" textAnchor="middle">M{m}</text>
      ))}
    </svg>
  );
}

/** A single stacked horizontal bar with a legend. */
export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="stack">
      <div className="stack-bar">
        {parts.map((p) =>
          p.value > 0 ? <span key={p.label} style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${p.value}`} /> : null,
        )}
      </div>
      <ul className="stack-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            {p.label}
            <b>{Math.round((p.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
