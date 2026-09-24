import { useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import { MonthlySeriesChart } from '@/features/reports/MonthlySeriesChart';
import { cn } from '@/lib/cn';
import {
  REVENUE_WINDOW_MONTHS,
  buildMonthWindow,
  summariseRevenue,
} from '@/models/dashboard';
import type { TrendPoint } from '@/serializers/reportSerializers';
import { colors } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

function FooterStat({
  label,
  value,
  caption,
}: {
  label: string;
  value: number | null;
  caption: string;
}) {
  return (
    <div className="min-w-0 px-lg py-sm">
      <p className="truncate text-caption text-text-secondary">{label}</p>
      <p
        className="mt-[2px] text-h5 tabular text-text-primary"
        title={value === null ? undefined : formatMoney(value)}
      >
        {value === null ? '—' : compactMoney(value)}
      </p>
      <p className="truncate text-caption text-text-tertiary">{caption}</p>
    </div>
  );
}

/**
 * Monthly invoiced revenue over a fixed calendar window.
 *
 * Bars, not the filled area chart this replaces. A month's revenue is a total
 * for a period, not a reading along a continuous line — an area implies values
 * between the months that do not exist — and the soft gradient fill was the
 * most template-looking thing on the page.
 *
 * The current month is picked out and the rest recede. It is still accruing, so
 * it is the bar most likely to be misread as a bad month; singling it out, with
 * a legend saying why, keeps that from happening.
 */
export function RevenueCard({
  points,
  loading,
  failed,
  onRetry,
}: {
  points: TrendPoint[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const slots = useMemo(() => buildMonthWindow(points ?? []), [points]);
  const summary = useMemo(() => summariseRevenue(slots), [slots]);
  const current = slots[slots.length - 1];
  const hasAny = slots.some((s) => s.hasData);

  let body;
  if (loading) {
    body = <Skeleton className="h-56 w-full" />;
  } else if (failed) {
    body = (
      <div className="flex h-56 flex-col items-center justify-center gap-xs text-center">
        <p className="text-body-sm text-text-secondary">
          Revenue history is unavailable right now.
        </p>
        <Button variant="text" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  } else if (!hasAny) {
    body = (
      <div className="flex h-56 items-center justify-center text-center">
        {/* An explicit width: `max-w-xs` resolves to the 8px spacing token here. */}
        <p className="max-w-[20rem] text-body-sm text-text-tertiary">
          {(points?.length ?? 0) > 0
            ? `No invoiced revenue in the last ${REVENUE_WINDOW_MONTHS} months.`
            : 'No revenue yet. Monthly totals appear here once you raise your first invoice.'}
        </p>
      </div>
    );
  } else {
    body = (
      <>
        <div className="mb-sm flex items-center gap-md text-caption text-text-secondary">
          <span className="inline-flex items-center gap-xxs">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-primary" />
            Month to date
          </span>
          <span className="inline-flex items-center gap-xxs">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-primary-200" />
            Previous months
          </span>
        </div>
        <MonthlySeriesChart
          points={slots.map((s) => ({
            period: s.period,
            label: s.label,
            value: s.value,
          }))}
          format={(v) => formatMoney(v)}
          compact={(v) => compactMoney(v)}
          color={colors.primary}
          highlight={current?.period}
        />
      </>
    );
  }

  const showFooter = !loading && !failed && hasAny;
  const completed = summary.completedMonthsWithData;

  return (
    <Card className="flex flex-col overflow-hidden">
      <PanelHeader
        title="Revenue"
        description={`Invoiced, last ${REVENUE_WINDOW_MONTHS} months`}
        action={<PanelLink to="/reports/analytics">Analytics</PanelLink>}
      />
      <div className="flex-1 px-lg py-md">{body}</div>
      {showFooter && (
        <div
          className={cn(
            'grid grid-cols-1 divide-y divide-border-light border-t border-border-light bg-surface-2',
            'sm:grid-cols-3 sm:divide-x sm:divide-y-0',
          )}
        >
          <FooterStat
            label="Last month"
            value={summary.lastMonth?.value ?? null}
            caption={summary.lastMonth?.fullLabel ?? ''}
          />
          <FooterStat
            label="Monthly average"
            value={summary.average}
            caption={
              completed > 0
                ? `${completed} completed month${completed === 1 ? '' : 's'}`
                : 'No completed month yet'
            }
          />
          <FooterStat
            label={`${REVENUE_WINDOW_MONTHS}-month total`}
            value={summary.total}
            caption="Including month to date"
          />
        </div>
      )}
    </Card>
  );
}

export default RevenueCard;
