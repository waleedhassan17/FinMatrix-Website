// ═══════════════════════════════════════════════════════
// FinMatrix Web — Hero product picture
// ═══════════════════════════════════════════════════════
// A picture of the real console, assembled from the real atoms: StatusBadge for
// document states, formatAmount + `tabular` for figures, the product's own card
// surface and navy. Built this way it doubles as a standing check that those
// atoms still look right — a mockup drawn in a design tool could drift from the
// app without anyone noticing.
//
// FIGURES CARRY NO CURRENCY SYMBOL. They used formatMoney, whose default prefix
// is 'Rs ' — so the one part of the page a visitor reads as evidence of what the
// product does was also quietly telling them which country it was for. The
// product itself already has the convention for this: formatAmount is what it
// uses wherever the column, not the cell, names the currency. Reaching for a
// different symbol would only have swapped one market for another.
//
// It is exposed to assistive technology as ONE image with a description, not as
// forty fragments of fake invoice data read out one by one.
//
// WHY THE CHART IS HAND-DRAWN SVG AND NOT RECHARTS
// ResponsiveContainer measures its parent on mount, so it paints nothing on the
// first frame and then reflows — a layout shift on the largest element of the
// page whose load time matters most. Twelve points and one <path> have neither
// problem. Colours are token expressions (CHART_SERIES, colors.*), never hex.

import { TrendingUp, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useInView } from '@/components/motion/useInView';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CHART_SERIES, colors } from '@/theme/tokens';
import { formatAmount } from '@/utils/money';

/** Illustrative shape only — a product picture, not a customer's books. */
const SERIES = [28, 34, 31, 42, 39, 48, 52, 47, 58, 63, 61, 72];

const W = 320;
const H = 96;

/** The series as points, so the path string and its LENGTH share one source. */
const points = (values: number[]): [number, number][] => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  return values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - ((v - min) / span) * (H - 8) - 4,
  ]);
};

const POINTS = points(SERIES);

const line = POINTS.map(
  ([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`,
).join(' ');

const area = `${line} L${W},${H} L0,${H} Z`;

/**
 * The path's length in user units, summed here rather than measured.
 *
 * The obvious way to get this is `path.getTotalLength()`. jsdom implements
 * NEITHER that method NOR SVGPathElement — the property is undefined, calling it
 * is a TypeError, and `instanceof` cannot be used to guard it. Since this path is
 * straight segments through known points, Pythagoras gives the exact same number
 * with no DOM read, nothing to guard, and no way for the test suite to trip on it.
 *
 * Rounded up so the dash is never a hair shorter than the line, which would leave
 * a gap at the end of the draw.
 */
const LINE_LENGTH = Math.ceil(
  POINTS.reduce(
    (sum, [x, y], i) =>
      i === 0 ? 0 : sum + Math.hypot(x - POINTS[i - 1][0], y - POINTS[i - 1][1]),
    0,
  ),
);

/**
 * Intermediate frames only. formatAmount is Decimal-backed and allocates one per
 * call, which is wasteful sixty times a second — but for a positive number it is
 * exactly this call with an empty prefix, so the two cannot disagree. The last
 * frame snaps to the real `value` string regardless, so they never have to.
 */
const TICK = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT_MS = 900;

function KpiTile({
  label,
  value,
  amount,
  delta,
  delay = 0,
}: {
  label: string;
  /** The real, final string. Rendered on the first paint. */
  value: string;
  /** The same figure as a number, for the count. */
  amount: number;
  delta: string;
  delay?: number;
}) {
  // Seeded to the FINAL value, which is what makes every fallback path correct
  // at once: first paint, reduced motion, and the jsdom suite all read the real
  // number with no special casing. The count only ever replaces it temporarily.
  const [display, setDisplay] = useState(value);
  const { ref, armed, inView } = useInView<HTMLDivElement>({ playOnMount: true });

  useEffect(() => {
    if (!armed || !inView) return;
    if (typeof requestAnimationFrame !== 'function') return;

    let frame = 0;
    let start = 0;

    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start - delay) / COUNT_MS, 1);

      if (t < 0) {
        frame = requestAnimationFrame(step);
        return;
      }

      // Ease-out cubic: fast enough at the start to feel responsive, and it
      // settles rather than stopping dead.
      const eased = 1 - (1 - t) ** 3;

      // The last frame is the real string, never a re-derived one.
      setDisplay(t >= 1 ? value : TICK.format(amount * eased));

      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [armed, inView, amount, value, delay]);

  return (
    <div
      ref={ref}
      className="rounded-lg border border-border-light bg-surface-2 p-md"
    >
      <p className="text-label-sm text-text-secondary">{label}</p>
      {/* `tabular` is load-bearing here, not decoration: fixed-width digits are
          what stop the tile reflowing on every frame of the count. */}
      <p className="mt-xxs text-h3 tabular text-text-primary">{display}</p>
      <p className="mt-xxs flex items-center gap-xxs text-caption text-success">
        <TrendingUp className="size-3.5" aria-hidden="true" />
        {delta}
      </p>
    </div>
  );
}

/**
 * The twelve-week trend, drawing itself once.
 *
 * This is the page's one piece of moving data, and it is doing a job rather than
 * decorating: the product's whole claim is that the figures move together, and a
 * line that draws says "live" in a way no sentence on the page does.
 *
 * The dash is set with an inline style, not a class. Two reasons: Tailwind cannot
 * JIT a value computed at runtime, and going through cn() would risk the
 * transition-class collision documented in Reveal. When `armed` is false no style
 * object is attached at all, so the chart renders exactly as it did before any of
 * this existed — which is what jsdom and a reduced-motion visitor both get.
 *
 * Pacing caveat: `preserveAspectRatio="none"` stretches the viewBox horizontally,
 * so the browser measures the dash in scaled screen space and the sweep is not
 * perfectly linear. The END state is unaffected — an offset of zero against a
 * dasharray at least as long as the path is always fully solid. Do not try to fix
 * the pacing by measuring the DOM; that is exactly what LINE_LENGTH avoids.
 */
function TrendChart() {
  const { ref, armed, inView } = useInView<SVGSVGElement>({ playOnMount: true });

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="mt-sm h-24 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="fm-hero-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CHART_SERIES[0]} stopOpacity="0.3" />
          <stop offset="100%" stopColor={CHART_SERIES[0]} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={H * f}
          y2={H * f}
          stroke={colors.borderLight}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* The fill cannot be drawn — a dasharray does nothing to a filled shape —
          so it fades in under the line, a beat behind it. */}
      <path
        d={area}
        fill="url(#fm-hero-fill)"
        style={
          armed
            ? {
                opacity: inView ? 1 : 0,
                transition: 'opacity 700ms ease-out 260ms',
              }
            : undefined
        }
      />
      <path
        d={line}
        fill="none"
        stroke={CHART_SERIES[0]}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={
          armed
            ? {
                strokeDasharray: LINE_LENGTH,
                strokeDashoffset: inView ? 0 : LINE_LENGTH,
                transition: 'stroke-dashoffset 1100ms ease-out',
              }
            : undefined
        }
      />
    </svg>
  );
}

function DocRow({
  docRef,
  party,
  amount,
  status,
}: {
  docRef: string;
  party: string;
  amount: number;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-sm py-sm">
      <div className="flex min-w-0 items-center gap-sm">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-label-sm text-primary">
          {party.charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-label-md text-text-primary">{docRef}</p>
          <p className="truncate text-caption text-text-secondary">{party}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-sm">
        <span className="text-label-md tabular text-text-primary">
          {formatAmount(amount)}
        </span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

export function HeroPreview() {
  return (
    <div
      role="img"
      aria-label="Illustration of the FinMatrix dashboard: stock value, receivables, a weekly dispatch trend, recent invoices and a dispatched delivery."
      className="relative"
    >
      {/* Light pooled behind the window, so it reads as lifted off the ground. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-xxxxl -z-10 glow-primary"
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-xl">
        {/* Window chrome — it reads as the product, not as a card. */}
        <div className="flex items-center gap-xs border-b border-border-light bg-surface-2 px-md py-sm">
          <span className="size-2.5 rounded-full bg-danger/50" />
          <span className="size-2.5 rounded-full bg-warning/50" />
          <span className="size-2.5 rounded-full bg-success/50" />
          <span className="ml-sm flex-1 truncate rounded-sm border border-border-light bg-surface px-sm py-xxs text-caption text-text-secondary">
            FinMatrix · Warehouse overview
          </span>
        </div>

        <div className="p-lg">
          <div className="flex items-start justify-between gap-sm">
            <div>
              <p className="text-overline text-neutral-500">Warehouse overview</p>
              <p className="mt-xxs text-h4 text-text-primary">Stock &amp; receivables</p>
            </div>
            <StatusBadge status="active" label="Live" />
          </div>

          <div className="mt-lg grid grid-cols-2 gap-sm">
            <KpiTile
              label="Stock on hand"
              value={formatAmount(4820000)}
              amount={4820000}
              delta="4.1% this month"
            />
            <KpiTile
              label="Receivables"
              value={formatAmount(1264500)}
              amount={1264500}
              delta="1.8% this month"
              delay={90}
            />
          </div>

          <div className="mt-sm rounded-lg border border-border-light bg-surface-2 p-md">
            <div className="flex items-center justify-between">
              <p className="text-label-sm text-text-secondary">
                Dispatched value · 12 weeks
              </p>
              <p className="text-caption text-success">Trending up</p>
            </div>
            <TrendChart />
          </div>

          <div className="mt-lg">
            <p className="text-overline text-neutral-500">Recent invoices</p>
            <div className="mt-xs divide-y divide-border-light">
              {/* Party names carry no country. They were Karachi Traders, Ravi
                  Distributors and Sialkot Supply Co — which placed the product
                  in one market more concretely than any line of copy did, in
                  the one part of the page a visitor reads as evidence. */}
              <DocRow docRef="INV-1042" party="Meridian Trading" amount={185000} status="paid" />
              <DocRow docRef="INV-1041" party="Halden Distribution" amount={92400} status="overdue" />
              <DocRow docRef="INV-1040" party="Aster Supply Co" amount={56750} status="partial" />
            </div>
          </div>
        </div>
      </div>

      {/* THE SECOND FLOATING CARD IS GONE.
          It was an "Approval requested" panel pinned at top-[49%] -left-xl. Two
          things were wrong with it. It sat *on* the chart rather than beside it,
          so the picture's one piece of moving data was permanently half-hidden;
          and two cards drifting on separate loops over a third card is the kind
          of decoration that reads as a template, which is the opposite of what
          this page needs. Maker-checker is still claimed — in the hero's proof
          list, in the modules grid and in the assurance section, all of which
          say it without covering anything up.

          Floating: a dispatched load. Kept because it overlaps the corner, not
          the content. */}
      <div className="absolute -right-md -bottom-xl hidden w-[236px] rounded-xl border border-border-light bg-surface p-md shadow-xl motion-safe:animate-float-late xl:block">
        <div className="flex items-center gap-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
            <Truck className="size-5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-label-md text-text-primary">Load dispatched</p>
            <p className="text-caption text-text-secondary">Route 3 · 14 stops</p>
          </div>
        </div>
        <div className="mt-sm h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full w-[62%] rounded-full bg-linear-to-r from-primary to-primary-600" />
        </div>
      </div>
    </div>
  );
}

export default HeroPreview;
