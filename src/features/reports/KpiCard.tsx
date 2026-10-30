import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { AssessmentPill } from '@/features/reports/AssessmentPill';
import { InfoPopover } from '@/features/reports/InfoPopover';
import { Sparkline } from '@/features/reports/Sparkline';
import {
  assessmentLabel,
  formatKpiChange,
  formatKpiValue,
  kpiAccessibleLabel,
  kpiContext,
  kpiStatusText,
  kpiTone,
} from '@/models/kpi';
import { formatReportDate } from '@/models/reportPeriod';
import type { Kpi, KpiAssessment } from '@/serializers/kpiSerializer';

export interface KpiCardProps {
  kpi: Kpi;
  /**
   * A comparison value fetched separately (the balance sheet's compare date).
   * Used only when the KPI does not carry its own `prior`/`change` — the
   * difference of two server figures, never a recomputed KPI.
   */
  priorValue?: number | null;
  /** What the comparison is, for the caption: "vs Dec 31, 2025". */
  priorLabel?: string;
  /** The source report, pre-filtered to the same period. */
  href?: string;
  /** Extra qualifying line under the figure. */
  caption?: string;
  /**
   * The line of figures under the value. Defaults to the KPI's own inputs
   * ("Rs 1.5M current assets · Rs 774K current liabilities"); null hides it.
   */
  context?: string | null;
  /** A pill other than the KPI's own — the cash card wears the runway's. */
  assessment?: KpiAssessment | null;
  /** The figure month by month, oldest first, for a sparkline under it. */
  trend?: readonly (number | null)[];
  /** A small picture of the figure's make-up, in the sparkline's place — the aging's age bar. */
  footer?: ReactNode;
  /** The headline size, for a row of four hero cards. */
  size?: 'md' | 'lg';
  className?: string;
}

const TONE = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-text-secondary',
} as const;

/**
 * One KPI: its label and ⓘ, the value, the figures it was worked out from, how
 * it reads (Healthy / Watch / At risk, from the server), and its move against
 * the comparison period.
 *
 * The ⓘ quotes the server's rule of thumb, its formula, the inputs it used
 * and the as-of date — so no card on any report is a bare number. A KPI with
 * no value says why ("Cash-positive — no burn") instead of printing a zero.
 */
export function KpiCard({
  kpi,
  priorValue,
  priorLabel,
  href,
  caption,
  context,
  assessment,
  trend,
  footer,
  size = 'md',
  className,
}: KpiCardProps) {
  // The server's change first; a separately fetched prior only fills in.
  const change =
    kpi.change ??
    (kpi.value !== null && priorValue !== undefined && priorValue !== null
      ? Math.round((kpi.value - priorValue) * 100) / 100
      : null);
  const shown = { ...kpi, change };
  const changeText = formatKpiChange(shown);
  const tone = kpiTone(kpi.key, change);
  // A KPI with no value says why in the value's place ("Cash-positive — no
  // burn"), and the line under it keeps the figures it was judged on.
  const status = kpi.value === null ? kpiStatusText(kpi.status) : null;
  const up = (change ?? 0) > 0;
  const verdict = assessment === undefined ? kpi.assessment : assessment;
  const figures = context === undefined ? kpiContext(kpi) : context;
  const pill = assessmentLabel(verdict);
  const hasInfo = !!(kpi.formula || kpi.inputs.length > 0 || verdict?.guide);

  return (
    // A container: the card lays itself out by its own width, not the
    // screen's — two to a row on a phone is narrower than four on a desktop.
    <div className={cn('group @container relative flex min-w-0 flex-col bg-surface px-lg py-md', className)}>
      <div className="flex flex-col items-start gap-xxs @[13rem]:flex-row @[13rem]:justify-between @[13rem]:gap-xs">
        {/* The label wraps rather than clipping to "Days sales outst…": the
            name of a figure is the one thing a card must not lose. */}
        <div className="flex min-w-0 items-start gap-xxs">
          <p className="line-clamp-2 text-label-md text-text-secondary">{kpi.label}</p>
          {hasInfo && (
            <InfoPopover className="mt-[1px]" label={`How ${kpi.label.toLowerCase()} is calculated`}>
              <p className="text-label-md text-text-primary">{kpi.label}</p>
              {verdict?.guide && (
                <p className="mt-xxs text-body-sm text-text-secondary">
                  {pill && <span className="text-text-primary">{pill}. </span>}
                  {verdict.guide}
                </p>
              )}
              {kpi.formula && (
                <p className="mt-sm text-caption text-text-tertiary">
                  <span className="text-text-secondary">Formula</span> {kpi.formula}
                </p>
              )}
              {kpi.inputs.length > 0 && (
                <dl className="mt-sm divide-y divide-border-light border-y border-border-light">
                  {kpi.inputs.map((input) => (
                    <div key={input.key} className="flex items-baseline justify-between gap-md py-xxs">
                      <dt className="text-caption text-text-secondary">{input.label}</dt>
                      <dd className="text-caption tabular text-text-primary">
                        {formatKpiValue(input.value, input.unit)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-sm text-caption text-text-tertiary">
                Result {formatKpiValue(kpi.value, kpi.unit)}
                {kpi.asOfDate ? ` · as of ${formatReportDate(kpi.asOfDate)}` : ''}
              </p>
            </InfoPopover>
          )}
        </div>
        <AssessmentPill assessment={verdict} />
      </div>

      {status ? (
        <p
          className={cn('mt-xxs truncate text-text-primary', size === 'lg' ? 'text-h4 @[14rem]:text-h3' : 'text-h4')}
          title={status}
        >
          {status}
        </p>
      ) : (
        <p
          className={cn(
            'mt-xxs truncate tabular text-text-primary',
            size === 'lg' ? 'text-h3 @[14rem]:text-h2' : 'text-h4 @[12rem]:text-h3',
          )}
          aria-label={[kpiAccessibleLabel(shown), pill].filter(Boolean).join(', ')}
          title={formatKpiValue(kpi.value, kpi.unit)}
        >
          {formatKpiValue(kpi.value, kpi.unit)}
        </p>
      )}

      {figures && <p className="mt-xxs line-clamp-2 text-caption text-text-secondary">{figures}</p>}

      {(changeText || caption) && (
        <p className="mt-xxs line-clamp-2 text-caption text-text-tertiary">
          {changeText && change !== 0 ? (
            <span className={cn('inline-flex items-center gap-[2px] tabular', TONE[tone])}>
              {up ? (
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden="true" />
              )}
              {changeText}
            </span>
          ) : change === 0 ? (
            <span>No change</span>
          ) : null}
          {changeText && priorLabel ? <span> {priorLabel}</span> : null}
          {caption ? <span className={cn(changeText && 'block')}>{caption}</span> : null}
        </p>
      )}

      {trend && <Sparkline values={trend} label={`${kpi.label} by month`} className="mt-sm" />}
      {footer && <div className="mt-sm">{footer}</div>}

      {href && (
        <Link
          to={href}
          className="mt-auto inline-flex items-center gap-[2px] self-start pt-xxs text-caption text-text-link hover:underline"
          aria-label={`Open the report behind ${kpi.label.toLowerCase()}`}
        >
          View report
          <ChevronRight className="size-3" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export default KpiCard;
