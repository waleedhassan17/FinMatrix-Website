import { AlertOctagon, AlertTriangle, ChevronRight, Info, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { INSIGHT_REPORT_LABEL, insightHref, type BusinessInsight, type InsightTone } from '@/models/insights';

const TONE: Record<InsightTone, { Icon: typeof Info; className: string; label: string }> = {
  negative: { Icon: AlertOctagon, className: 'bg-danger-lighter text-danger', label: 'Needs attention' },
  warning: { Icon: AlertTriangle, className: 'bg-warning-lighter text-warning-hover', label: 'Worth watching' },
  positive: { Icon: TrendingUp, className: 'bg-success-lighter text-success-hover', label: 'Going well' },
  neutral: { Icon: Info, className: 'bg-surface-2 text-text-secondary', label: 'For information' },
};

/**
 * What stands out in the period — the server's own sentences, most pressing
 * first, each with a way into the report that explains it. The tone is an
 * icon with a spoken name, never colour alone.
 */
export function InsightsList({
  insights,
  className,
}: {
  insights: readonly BusinessInsight[];
  className?: string;
}) {
  if (insights.length === 0) {
    return <p className="text-body-sm text-text-tertiary">Nothing unusual in this period.</p>;
  }
  return (
    <ul className={cn('divide-y divide-border-light', className)}>
      {insights.map((insight) => {
        const { Icon, className: tone, label } = TONE[insight.tone];
        const href = insightHref(insight.report);
        return (
          <li key={insight.key} className="flex items-start gap-sm py-sm first:pt-0 last:pb-0">
            <span
              className={cn('mt-[2px] inline-flex size-7 shrink-0 items-center justify-center rounded-full', tone)}
              role="img"
              aria-label={label}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-label-lg text-text-primary">{insight.title}</p>
              <p className="mt-[2px] text-body-sm text-text-secondary">{insight.detail}</p>
            </div>
            {href && (
              <Link
                to={href}
                className="mt-[2px] inline-flex shrink-0 items-center gap-[2px] text-label-md text-text-link hover:underline"
                aria-label={`${insight.title} — open ${INSIGHT_REPORT_LABEL[insight.report.key] ?? 'the report'}`}
              >
                <span className="hidden sm:inline">{INSIGHT_REPORT_LABEL[insight.report.key] ?? 'Open'}</span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default InsightsList;
