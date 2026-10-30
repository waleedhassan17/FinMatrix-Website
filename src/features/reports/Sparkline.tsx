import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

export interface SparklineProps {
  /** Oldest first. A null is a month with no figure: the line breaks there. */
  values: readonly (number | null)[];
  /** What it shows, for a screen reader: "Revenue by month". */
  label: string;
  className?: string;
  color?: string;
  /**
   * Inside something that already names the figure — a tab, a button — the
   * line is decoration, and its label would only lengthen what is read out.
   */
  decorative?: boolean;
}

/** The drawing's own units; the SVG stretches to its box, the stroke does not. */
const W = 100;
const H = 32;
const PAD = 3;

/**
 * A figure's shape over the period: a 2px line over a faint wash, no axes,
 * the latest point marked. It shows the direction, not the values — the card
 * holds those, and the chart further down holds the rest.
 *
 * It fills the width it is given. The line keeps its 2px however far it is
 * stretched, and the end dot is HTML laid over the drawing, so it stays round.
 */
export function Sparkline({ values, label, className, color = colors.primary, decorative = false }: SparklineProps) {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length < 2) return null;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const x = (i: number) => (i * W) / Math.max(1, values.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  // One path per unbroken run, lifted at every gap.
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push({ x: x(i), y: y(v) });
  });
  if (run.length) runs.push(run);
  // Readings that never sit side by side draw no line, only stray dots.
  if (!runs.some((r) => r.length > 1)) return null;

  const line = (r: { x: number; y: number }[]) => r.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
  const lastIndex = values.findLastIndex((v) => v !== null && Number.isFinite(v));
  const last = { x: x(lastIndex), y: y(values[lastIndex] as number) };

  return (
    <div
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      className={cn('relative h-8 w-full', className)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {min < 0 && max > 0 && (
          <line
            x1={0}
            x2={W}
            y1={y(0)}
            y2={y(0)}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {runs.map((r, i) =>
          r.length > 1 ? (
            <path key={`a${i}`} d={`${line(r)}L${r[r.length - 1].x},${H}L${r[0].x},${H}Z`} fill={color} opacity={0.08} />
          ) : null,
        )}
        {runs.map((r, i) => (
          <path
            key={`l${i}`}
            d={line(r)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <span
        aria-hidden="true"
        className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
        style={{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default Sparkline;
