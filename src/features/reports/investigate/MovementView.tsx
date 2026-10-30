import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { RankedBars } from '@/features/reports/RankedBars';
import { rangeLabel, type ReportRange } from '@/models/reportPeriod';
import { getAccountMovement } from '@/networks/reports/accountRegisterNetwork';
import type { MovementSlice } from '@/serializers/reportInvestigateSerializers';
import { formatMoney, parenNegative } from '@/utils/money';

export interface MovementViewProps {
  accountCode: string;
  /** The window whose movement explains the change. */
  range: ReportRange;
  /** The window it is compared with; null for an as-of comparison. */
  compare: ReportRange | null;
  /** "Between Dec 31, 2025 and Mar 31, 2026" — what the change is. */
  caption: string;
}

type By = 'counterparty' | 'document';

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatMoney(Math.abs(v))}`;

/**
 * One breakdown as two lists — what pushed the account up, what pulled it down.
 *
 * `measure` picks the figure: between two periods it is the change; for a
 * balance compared across two dates it is the window's own movement, which IS
 * the change in the balance.
 */
function Diverging({ slices, measure }: { slices: MovementSlice[]; measure: 'change' | 'current' }) {
  const toPoint = (s: MovementSlice, i: number) => ({
    key: `${s.label}-${i}`,
    label: s.label,
    value: s[measure],
    hint: measure === 'change' ? `${parenNegative(s.prior)} → ${parenNegative(s.current)}` : undefined,
  });
  const up = slices.filter((s) => s[measure] > 0).map(toPoint);
  const down = slices.filter((s) => s[measure] < 0).map(toPoint);
  // Both lists on one scale, so a bar's length means the same thing in each.
  const max = Math.max(0, ...slices.map((s) => Math.abs(s[measure])));
  return (
    <div className="grid gap-lg sm:grid-cols-2">
      <section aria-label="Increases">
        <h4 className="mb-xs text-overline text-text-secondary">Increases</h4>
        <RankedBars points={up} max={max} format={signed} emptyLabel="Nothing increased." />
      </section>
      <section aria-label="Decreases">
        <h4 className="mb-xs text-overline text-text-secondary">Decreases</h4>
        <RankedBars points={down} max={max} format={signed} emptyLabel="Nothing decreased." />
      </section>
    </div>
  );
}

/**
 * What moved an account between two periods — by counterparty and by the kind
 * of document — sorted by the size of the change, with an "Unattributed"
 * bucket for postings that name nobody. The server's change sums to the
 * account's change; the bars only arrange it.
 */
export function MovementView({ accountCode, range, compare, caption }: MovementViewProps) {
  const [by, setBy] = useState<By>('counterparty');
  const query = useQuery({
    queryKey: ['reports', 'movement', accountCode, range, compare],
    queryFn: () => getAccountMovement(accountCode, range, compare, 10),
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-xs p-lg" aria-busy="true">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="p-lg">
        <p className="text-body-sm text-text-secondary">
          {(query.error as Error | null)?.message ?? 'The change could not be broken down.'}
        </p>
        <Button variant="secondary" size="sm" className="mt-sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const m = query.data;
  // An as-of comparison (no compare window) explains the balance's change by
  // the movement inside the window; the server's `change` would instead set it
  // against the period before, which is not the question.
  const measure = compare ? 'change' : 'current';
  return (
    <div className="flex flex-col gap-md p-lg">
      <div>
        <p className="text-caption text-text-tertiary">{caption}</p>
        <p className="text-h4 tabular text-text-primary">{signed(m[measure])}</p>
        {compare && (
          <p className="text-caption text-text-tertiary">
            {rangeLabel(compare.startDate, compare.endDate)}: {parenNegative(m.prior)} ·{' '}
            {rangeLabel(range.startDate, range.endDate)}: {parenNegative(m.current)}
          </p>
        )}
      </div>
      <SegmentedControl<By>
        label="Break the change down by"
        size="sm"
        value={by}
        onChange={setBy}
        options={[
          { value: 'counterparty', label: 'By counterparty' },
          { value: 'document', label: 'By document type' },
        ]}
      />
      <Diverging slices={by === 'counterparty' ? m.byCounterparty : m.bySourceType} measure={measure} />
    </div>
  );
}

export default MovementView;
