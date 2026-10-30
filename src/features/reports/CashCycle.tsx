import { AssessmentPill } from '@/features/reports/AssessmentPill';
import { cn } from '@/lib/cn';
import { formatKpiValue, kpiStatusText } from '@/models/kpi';
import type { Kpi } from '@/serializers/kpiSerializer';
import { CATEGORY_PALETTE, colors } from '@/theme/tokens';

const ROWS = [
  { key: 'dso', sentence: 'Days to collect from customers', color: CATEGORY_PALETTE[0] },
  { key: 'dio', sentence: 'Days stock waits to be sold', color: CATEGORY_PALETTE[1] },
  { key: 'dpo', sentence: 'Days taken to pay suppliers', color: CATEGORY_PALETTE[2] },
] as const;

/**
 * How long cash is tied up: days to collect plus days stock sits, less the
 * days the business takes to pay. Drawn as two bars on one scale — what ties
 * cash up (DSO + DIO) above, and what offsets it (DPO) with the cycle that is
 * left — so the sum reads off the lengths. Every figure is the server's.
 */
export function CashCycle({ kpis, className }: { kpis: Record<string, Kpi | undefined>; className?: string }) {
  const [dso, dio, dpo, ccc] = [kpis.dso, kpis.dio, kpis.dpo, kpis.ccc];
  const v = (k: Kpi | undefined) => (k?.value ?? null);
  const drawable =
    v(dso) !== null && v(dio) !== null && v(dpo) !== null && v(ccc) !== null && (v(ccc) as number) >= 0 &&
    (v(dso) as number) >= 0 && (v(dio) as number) >= 0 && (v(dpo) as number) >= 0;
  const scale = drawable ? Math.max((v(dso) as number) + (v(dio) as number), 1) : 1;
  const pct = (n: number) => `${Math.max(0, (n / scale) * 100)}%`;

  return (
    <div className={cn('flex flex-col gap-md', className)}>
      <div className="flex items-baseline justify-between gap-sm">
        <div>
          <p className="text-h3 tabular text-text-primary">{formatKpiValue(v(ccc), 'days')}</p>
          <p className="flex items-center gap-xs text-caption text-text-tertiary">
            {drawable && (
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: colors.neutral500 }} />
            )}
            {v(ccc) === null ? (kpiStatusText(ccc?.status ?? null) ?? 'Not enough to measure yet') : 'Cash conversion cycle · CCC'}
          </p>
        </div>
        <AssessmentPill assessment={ccc?.assessment} />
      </div>

      {drawable && (
        <div className="flex flex-col gap-[6px]" aria-hidden="true">
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
            <span style={{ width: pct(v(dso) as number), backgroundColor: ROWS[0].color }} />
            <span className="border-l-2 border-surface" style={{ width: pct(v(dio) as number), backgroundColor: ROWS[1].color }} />
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
            <span style={{ width: pct(v(dpo) as number), backgroundColor: ROWS[2].color }} />
            <span
              className="border-l-2 border-surface"
              style={{ width: pct(v(ccc) as number), backgroundColor: colors.neutral500 }}
            />
          </div>
        </div>
      )}

      <dl className="flex flex-col divide-y divide-border-light text-body-sm">
        {ROWS.map((row) => {
          const k = kpis[row.key];
          return (
            <div key={row.key} className="py-xs">
              <dt className="flex items-center gap-xs text-caption text-text-tertiary">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: row.color }} />
                {row.sentence} · {row.key.toUpperCase()}
              </dt>
              <dd className="mt-[2px] flex items-center justify-between gap-sm pl-[18px]">
                <span className="tabular text-label-lg text-text-primary">{formatKpiValue(v(k), 'days')}</span>
                <AssessmentPill assessment={k?.assessment} />
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default CashCycle;
