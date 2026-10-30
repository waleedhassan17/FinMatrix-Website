import { BarChart3, PieChart } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PanelHeader } from '@/features/dashboard/PanelHeader';
import { DonutChart } from '@/features/reports/DonutChart';
import { RankedBars } from '@/features/reports/RankedBars';
import { OTHER_KEY, sliceShare } from '@/models/chartSlices';
import {
  hasChannelBreakdown,
  returnsText,
  revenueBreakdown,
  unitsText,
  type BreakdownDimension,
} from '@/models/itemExplorer';
import type { ItemPerformance } from '@/serializers/reportSerializers';
import { CATEGORY_PALETTE } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

export type BreakdownView = 'pie' | 'bar';

const DIMENSION_LABEL: Record<BreakdownDimension, string> = {
  customer: 'Customer',
  channel: 'Channel',
};

export interface ItemRevenueBreakdownProps {
  perf: ItemPerformance;
  dimension: BreakdownDimension;
  view: BreakdownView;
  onDimension: (dimension: BreakdownDimension) => void;
  onView: (view: BreakdownView) => void;
  /** "Jan 1, 2026 – Oct 28, 2026". */
  windowLabel: string;
  unitOfMeasure?: string;
  /** A customer's record, when the reader may open it. */
  customerHref?: (customerId: string) => string | null;
}

/**
 * Where one item's revenue came from — the pie on the item's page, built the
 * way the inventory report's stock composition is: a ring by default, bars
 * on request.
 *
 * By customer, it answers "how much do I depend on one buyer": the server's
 * top five and everyone else as Other, each row opening the customer. By
 * channel — offered only when the item went out both ways — it splits what
 * was invoiced over the counter from what went out on deliveries. Returns
 * are not a slice of what went out; they are stated under the chart.
 *
 * A customer who returned more than they bought has no slice in a ring, so
 * the view falls back to bars, which can hang below zero, and says why.
 */
export function ItemRevenueBreakdown({
  perf,
  dimension: asked,
  view,
  onDimension,
  onView,
  windowLabel,
  unitOfMeasure = 'unit',
  customerHref,
}: ItemRevenueBreakdownProps) {
  const channelOffered = hasChannelBreakdown(perf);
  const dimension: BreakdownDimension = channelOffered ? asked : 'customer';
  const breakdown = revenueBreakdown(perf, dimension);
  const sold =
    perf.totals.revenue !== 0 || perf.totals.unitsSold !== 0 || breakdown.slices.length > 0;
  const ring = view === 'pie' && breakdown.donut;
  const returns = returnsText(perf.returns, unitOfMeasure);
  const units = (n: number) => unitsText(n, unitOfMeasure);
  const subject = dimension === 'customer' ? 'customer' : 'channel';
  const hrefFor =
    dimension === 'customer' && customerHref
      ? (key: string) => (key.startsWith('none-') || key === OTHER_KEY ? null : customerHref(key))
      : undefined;

  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title={`Revenue by ${subject}`}
        description={windowLabel}
        action={
          sold && (
            <div className="flex flex-wrap items-center justify-end gap-xs print:hidden">
              {channelOffered && (
                <SegmentedControl<BreakdownDimension>
                  label="Break the revenue down by"
                  size="sm"
                  value={dimension}
                  onChange={onDimension}
                  options={(['customer', 'channel'] as const).map((d) => ({ value: d, label: DIMENSION_LABEL[d] }))}
                />
              )}
              <SegmentedControl<BreakdownView>
                label="Chart type"
                size="sm"
                value={breakdown.donut ? view : 'bar'}
                onChange={onView}
                options={[
                  {
                    value: 'pie',
                    label: <PieChart className="size-4" aria-hidden="true" />,
                    ariaLabel: 'Pie chart',
                    disabled: !breakdown.donut,
                  },
                  { value: 'bar', label: <BarChart3 className="size-4" aria-hidden="true" />, ariaLabel: 'Bar chart' },
                ]}
              />
            </div>
          )
        }
      />
      <div className="px-lg pt-xs pb-lg">
        {!sold ? (
          <p className="py-xl text-center text-body-sm text-text-tertiary">
            Not sold in this window, so there is no revenue to break down.
          </p>
        ) : ring ? (
          <DonutChart
            title={`Revenue by ${subject}`}
            slices={breakdown.slices}
            palette={CATEGORY_PALETTE}
            total={breakdown.total}
            centerLabel={dimension === 'channel' && returns ? 'Before returns' : 'Revenue'}
            labelHeader={DIMENSION_LABEL[dimension]}
            valueHeader="Revenue"
            countLabel={units}
            hrefFor={hrefFor}
            className="mx-auto max-w-3xl"
          />
        ) : (
          <>
            {view === 'pie' && !breakdown.donut && (
              <p className="mb-sm text-caption text-text-tertiary">
                {dimension === 'customer'
                  ? 'A customer returned more than they bought, so this shows as bars.'
                  : 'Returns outweigh a channel, so this shows as bars.'}
              </p>
            )}
            <RankedBars
              points={[
                ...breakdown.slices.map((s) => {
                  const share = breakdown.donut ? sliceShare(s, breakdown.total) : null;
                  return {
                    key: s.key,
                    label: s.label,
                    value: s.value,
                    hint: [
                      s.count !== undefined ? units(s.count) : null,
                      share !== null ? `${share.toFixed(1)}% of revenue` : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  };
                }),
                // By channel, what came back hangs below the channels it came from.
                ...(dimension === 'channel' && perf.returns && perf.returns.revenue !== 0
                  ? [{ key: 'returns', label: 'Returns', value: perf.returns.revenue, hint: units(Math.abs(perf.returns.unitsSold)) }]
                  : []),
              ]}
              limit={breakdown.slices.length + 1}
              format={(v) => formatMoney(v)}
              hrefFor={hrefFor}
              emptyLabel="Nobody bought it in this window."
            />
          </>
        )}
        {sold && returns && (dimension === 'customer' || ring) && (
          <p className="mt-md border-t border-border-light pt-sm text-caption text-text-secondary">{returns}</p>
        )}
      </div>
    </Card>
  );
}

export default ItemRevenueBreakdown;
