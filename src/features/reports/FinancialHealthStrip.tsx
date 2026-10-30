import { FigureStrip } from '@/features/reports/FigureStrip';
import { KpiCard } from '@/features/reports/KpiCard';
import { HEALTH_KPI_KEYS } from '@/models/kpi';
import type { FinancialHealth } from '@/serializers/reportInsightSerializers';

export interface FinancialHealthStripProps {
  health: FinancialHealth | undefined;
  /** Financial health at the comparison date, for each card's move. */
  prior?: FinancialHealth;
  priorLabel?: string;
  keys?: readonly string[];
  hrefFor?: (key: string) => string | undefined;
  className?: string;
}

/**
 * Working capital, current ratio, quick ratio and debt-to-equity in one strip —
 * the four questions a lender asks of a balance sheet. Each card's ⓘ shows the
 * server's formula and the figures it used. A KPI the server did not send is
 * left out rather than shown as zero.
 */
export function FinancialHealthStrip({
  health,
  prior,
  priorLabel,
  keys = HEALTH_KPI_KEYS,
  hrefFor,
  className,
}: FinancialHealthStripProps) {
  const kpis = keys.map((k) => health?.kpis[k]).filter((k) => k !== undefined);
  if (kpis.length === 0) return null;
  const columns = (Math.min(4, Math.max(2, kpis.length)) as 2 | 3 | 4);
  return (
    <FigureStrip columns={columns} className={className}>
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.key}
          kpi={kpi}
          priorValue={prior?.kpis[kpi.key]?.value ?? null}
          priorLabel={priorLabel}
          href={hrefFor?.(kpi.key)}
        />
      ))}
    </FigureStrip>
  );
}

export default FinancialHealthStrip;
