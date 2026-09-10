// ═══════════════════════════════════════════════════════
// FinMatrix Web — Hero product picture
// ═══════════════════════════════════════════════════════
// A picture of the real console, assembled from the real atoms: StatusBadge for
// document states, formatMoney + `tabular` for figures, the product's own card
// surface and navy. Built this way it doubles as a standing check that those
// atoms still look right — a mockup drawn in a design tool could drift from the
// app without anyone noticing.
//
// It is exposed to assistive technology as ONE image with a description, not as
// forty fragments of fake invoice data read out one by one.
//
// WHY THE CHART IS HAND-DRAWN SVG AND NOT RECHARTS
// ResponsiveContainer measures its parent on mount, so it paints nothing on the
// first frame and then reflows — a layout shift on the largest element of the
// page whose load time matters most. Twelve points and one <path> have neither
// problem. Colours are token expressions (CHART_SERIES, colors.*), never hex.

import { ClipboardCheck, TrendingUp, Truck } from 'lucide-react';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { CHART_SERIES, colors } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

/** Illustrative shape only — a product picture, not a customer's books. */
const SERIES = [28, 34, 31, 42, 39, 48, 52, 47, 58, 63, 61, 72];

const W = 320;
const H = 96;

const linePath = (values: number[]): string => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / span) * (H - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

const line = linePath(SERIES);
const area = `${line} L${W},${H} L0,${H} Z`;

function KpiTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-surface-2 p-md">
      <p className="text-label-sm text-text-secondary">{label}</p>
      <p className="mt-xxs text-h3 tabular text-text-primary">{value}</p>
      <p className="mt-xxs flex items-center gap-xxs text-caption text-success">
        <TrendingUp className="size-3.5" aria-hidden="true" />
        {delta}
      </p>
    </div>
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
          {formatMoney(amount)}
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
      aria-label="Illustration of the FinMatrix warehouse dashboard: stock value, receivables, a weekly dispatch trend, recent invoices, a purchase order awaiting approval and a dispatched delivery."
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
              value={formatMoney(4820000)}
              delta="4.1% this month"
            />
            <KpiTile
              label="Receivables"
              value={formatMoney(1264500)}
              delta="1.8% this month"
            />
          </div>

          <div className="mt-sm rounded-lg border border-border-light bg-surface-2 p-md">
            <div className="flex items-center justify-between">
              <p className="text-label-sm text-text-secondary">
                Dispatched value · 12 weeks
              </p>
              <p className="text-caption text-success">Trending up</p>
            </div>
            <svg
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
              <path d={area} fill="url(#fm-hero-fill)" />
              <path
                d={line}
                fill="none"
                stroke={CHART_SERIES[0]}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          <div className="mt-lg">
            <p className="text-overline text-neutral-500">Recent invoices</p>
            <div className="mt-xs divide-y divide-border-light">
              <DocRow docRef="INV-1042" party="Karachi Traders" amount={185000} status="paid" />
              <DocRow docRef="INV-1041" party="Ravi Distributors" amount={92400} status="overdue" />
              <DocRow docRef="INV-1040" party="Sialkot Supply Co" amount={56750} status="partial" />
            </div>
          </div>
        </div>
      </div>

      {/* Floating: the maker-checker flow, in miniature. xl only — at narrower
          widths these would collide with the headline column. Its left offset is
          capped at the 40px column gap: any further and it sits on the hero
          paragraph. It rests over the lower chart, clear of both the KPI figures
          above and the "Recent invoices" label below, so it hides decoration,
          not content. */}
      <div className="absolute top-[49%] -left-xl hidden w-[252px] rounded-xl border border-border-light bg-surface p-md shadow-xl motion-safe:animate-float xl:block">
        <div className="flex items-center gap-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-lighter">
            <ClipboardCheck className="size-5 text-warning" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-label-md text-text-primary">Approval requested</p>
            <p className="truncate text-caption text-text-secondary">
              PO-2031 · {formatMoney(212000)}
            </p>
          </div>
        </div>
        <div className="mt-sm flex items-center justify-between">
          <StatusBadge status="pending_approval" label="Awaiting owner" />
          <span className="text-caption text-text-secondary">2m ago</span>
        </div>
      </div>

      {/* Floating: a dispatched load. */}
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
