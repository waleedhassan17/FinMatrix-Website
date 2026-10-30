import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { assessmentLabel } from '@/models/kpi';
import type { KpiAssessment } from '@/serializers/kpiSerializer';

const STYLE = {
  healthy: { Icon: CheckCircle2, className: 'bg-success-lighter text-success-hover' },
  watch: { Icon: AlertTriangle, className: 'bg-warning-lighter text-warning-hover' },
  risk: { Icon: AlertOctagon, className: 'bg-danger-lighter text-danger-hover' },
} as const;

/**
 * Healthy / Watch / At risk — the server's reading of a figure against its
 * rule of thumb (kpi-benchmarks.ts). Always an icon and a word, never colour
 * alone; nothing at all for a figure with no rule.
 */
export function AssessmentPill({
  assessment,
  className,
}: {
  assessment: KpiAssessment | null | undefined;
  className?: string;
}) {
  const label = assessmentLabel(assessment);
  if (!assessment || !label || assessment.level === 'neutral') return null;
  const { Icon, className: tone } = STYLE[assessment.level];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-[3px] rounded-full px-xs py-[2px] text-label-sm whitespace-nowrap',
        tone,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export default AssessmentPill;
