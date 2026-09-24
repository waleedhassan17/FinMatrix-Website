import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/money';

export type FigureTone = 'default' | 'success' | 'warning' | 'danger';

const TONE: Record<FigureTone, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * One headline figure: what it is, the amount, and a line qualifying it.
 *
 * Colour goes on the amount only where it states a fact — overdue, a loss —
 * never as decoration. A stripe or tint per tile that means nothing is most of
 * what makes a row of KPI cards look generated.
 */
export function Figure({
  label,
  value,
  caption,
  tone = 'default',
}: {
  label: string;
  /** A number prints as money in full; anything else prints as given. */
  value: number | ReactNode;
  caption?: ReactNode;
  tone?: FigureTone;
}) {
  return (
    <div className="min-w-0 bg-surface px-lg py-md">
      <p className="truncate text-label-md text-text-secondary">{label}</p>
      <p className={cn('mt-xxs truncate text-h3 tabular', TONE[tone])}>
        {typeof value === 'number' ? formatMoney(value) : value}
      </p>
      {caption !== undefined && (
        // Two lines before it clips: on a phone the strip is two across, and a
        // caption cut to "12 months · Rs 803K a…" loses the part that matters.
        <p className="mt-xxs line-clamp-2 text-caption text-text-tertiary">{caption}</p>
      )}
    </div>
  );
}

/**
 * Headline figures in one card, divided by hairlines rather than floated as
 * separate tiles — they are one reading of one report, and a single surface
 * says so. Two across on a phone, four on a wide screen.
 */
export function FigureStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border-light lg:grid-cols-4">
        {children}
      </div>
    </Card>
  );
}

export default FigureStrip;
