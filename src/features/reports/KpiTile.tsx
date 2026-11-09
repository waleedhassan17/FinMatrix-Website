import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { compactMoney, formatMoney, type MoneyInput } from '@/utils/money';

export interface KpiTileProps {
  label: string;
  value: MoneyInput;
  icon?: ReactNode;
  hint?: string;
  /**
   * Use the compact form (`Rs 1.2M`). For figures that will not fit — a
   * company-wide revenue total, say. The full figure stays in the title attribute
   * so it can still be read.
   */
  compact?: boolean;
  loading?: boolean;
}

/** A headline figure. No coloured rail down its edge: that read as decoration. */
export function KpiTile({
  label,
  value,
  icon,
  hint,
  compact = false,
  loading = false,
}: KpiTileProps) {
  const full = formatMoney(value);

  return (
    <Card className="p-lg">

      <div className="flex items-start justify-between gap-sm">
        <p className="text-caption text-text-secondary">{label}</p>
        {icon && <span className="shrink-0 text-text-tertiary">{icon}</span>}
      </div>

      {loading ? (
        <div className="mt-xs h-7 w-24 animate-pulse rounded-sm bg-neutral-100" />
      ) : (
        <p
          className={cn('mt-xxs text-h3 tabular text-text-primary')}
          // The compact form rounds; the exact figure stays available on hover
          // rather than being lost to the abbreviation.
          title={compact ? full : undefined}
        >
          {compact ? compactMoney(value) : full}
        </p>
      )}

      {hint && <p className="mt-xxs text-caption text-text-tertiary">{hint}</p>}
    </Card>
  );
}

/** A count rather than an amount — entries, items, accounts. */
export function CountTile({
  label,
  value,
  hint,
  loading = false,
}: {
  label: string;
  value: number;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-lg">
      <p className="text-caption text-text-secondary">{label}</p>
      {loading ? (
        <div className="mt-xs h-7 w-16 animate-pulse rounded-sm bg-neutral-100" />
      ) : (
        <p className="mt-xxs text-h3 tabular text-text-primary">
          {value.toLocaleString('en-US')}
        </p>
      )}
      {hint && <p className="mt-xxs text-caption text-text-tertiary">{hint}</p>}
    </Card>
  );
}

export default KpiTile;
