import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/money';

/**
 * The first thing in a document's rail: the one figure that matters now — a
 * balance due, available credit, an order total — with how far along it is.
 */
export function AmountSummary({
  label,
  amount,
  tone = 'default',
  note,
  noteTone = 'neutral',
  progress,
  children,
}: {
  label: string;
  amount: number;
  /** `muted` strikes the figure through — a voided or cancelled document. */
  tone?: 'default' | 'success' | 'muted';
  note?: string;
  noteTone?: 'danger' | 'warning' | 'neutral';
  progress?: { value: number; total: number; caption: string; label: string; tone?: 'success' | 'primary' };
  children?: ReactNode;
}) {
  const pct =
    progress && progress.total > 0 ? Math.max(0, Math.min(100, (progress.value / progress.total) * 100)) : 0;

  return (
    <Card className="p-lg">
      <p className="text-overline text-text-tertiary">{label}</p>
      <p
        className={cn(
          'mt-xxs break-words text-display-sm tabular',
          tone === 'success'
            ? 'text-success'
            : tone === 'muted'
              ? 'text-text-tertiary line-through'
              : 'text-text-primary',
        )}
      >
        {formatMoney(amount)}
      </p>
      {note && (
        <p
          className={cn(
            'mt-xxs text-label-md',
            noteTone === 'danger' ? 'text-danger' : noteTone === 'warning' ? 'text-warning' : 'text-text-secondary',
          )}
        >
          {note}
        </p>
      )}
      {progress && (
        <>
          <div
            className="mt-md h-2 overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <div
              className={cn('h-full rounded-full', progress.tone === 'primary' ? 'bg-primary' : 'bg-success')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-xs text-caption text-text-secondary">{progress.caption}</p>
        </>
      )}
      {children}
    </Card>
  );
}

export default AmountSummary;
