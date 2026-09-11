import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

type Tone = 'default' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * A headline count or quantity.
 *
 * KpiTile formats its value as money; stock counts, unit quantities and
 * delivery tallies are not money, and "Rs 12" on a count of items reads as a
 * bug. The value arrives pre-formatted so the caller owns the unit.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  loading = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <Card className="p-lg">
      <p className="text-caption text-text-secondary">{label}</p>
      {loading ? (
        <div className="mt-xs h-7 w-24 animate-pulse rounded-md bg-neutral-100" />
      ) : (
        <p className={cn('mt-xxs text-h3 tabular', TONE[tone])}>{value}</p>
      )}
      {hint && <p className="mt-xxs text-caption text-text-tertiary">{hint}</p>}
    </Card>
  );
}

export default StatTile;
