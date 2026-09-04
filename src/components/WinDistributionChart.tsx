const W = 640;
const H = 208;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 16;
const PAD_B = 24;
const PLOT_H = H - PAD_T - PAD_B;
const N = 18;
const SLOT = (W - PAD_L - PAD_R) / N;
const BAR_W = SLOT * 0.64;

/** The 0-17 win-count bar chart on the results/breakdown screen — drawn as
 *  real SVG elements against the theme's CSS custom properties. */
export function WinDistributionChart({ dist, meanWins }: { dist: number[]; meanWins: number }) {
  const max = Math.max(...dist) || 1;
  let modeW = 0;
  for (let k = 1; k < N; k++) if (dist[k] > dist[modeW]) modeW = k;

  const mx = PAD_L + (meanWins + 0.5) * SLOT;
  const rightSide = mx > W * 0.72;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Regular-season win distribution">
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={W - PAD_R} y2={PAD_T + PLOT_H} stroke="var(--line)" strokeWidth={1} />
      {Array.from({ length: N }, (_, x) => {
        const cx = PAD_L + x * SLOT + SLOT / 2;
        const h = (dist[x] / max) * PLOT_H;
        return (
          <g key={x}>
            <rect
              x={(cx - BAR_W / 2).toFixed(1)}
              y={(PAD_T + PLOT_H - h).toFixed(1)}
              width={BAR_W.toFixed(1)}
              height={Math.max(0.5, h).toFixed(1)}
              rx={1}
              fill={x === modeW ? "var(--accent)" : "var(--muted)"}
            />
            <text
              x={cx.toFixed(1)}
              y={H - 8}
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={9}
              fill={x === 17 ? "var(--accent-strong)" : "var(--muted)"}
            >
              {x}
            </text>
          </g>
        );
      })}
      <line
        x1={mx.toFixed(1)}
        y1={PAD_T}
        x2={mx.toFixed(1)}
        y2={PAD_T + PLOT_H}
        stroke="var(--ink)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text
        x={(rightSide ? mx - 4 : mx + 4).toFixed(1)}
        y={PAD_T + 8}
        textAnchor={rightSide ? "end" : "start"}
        fontFamily="IBM Plex Mono, monospace"
        fontSize={9}
        fill="var(--ink)"
      >
        avg {meanWins.toFixed(1)}
      </text>
    </svg>
  );
}
