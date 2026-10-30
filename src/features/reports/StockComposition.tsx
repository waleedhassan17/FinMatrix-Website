import { BarChart3, LineChart, ListFilter, PieChart, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { PanelHeader } from '@/features/dashboard/PanelHeader';
import { DonutChart } from '@/features/reports/DonutChart';
import { MetricChart, type MetricChartPoint } from '@/features/reports/MetricChart';
import { RankedBars } from '@/features/reports/RankedBars';
import { foldSlices, OTHER_KEY, sliceShare, type SlicePoint } from '@/models/chartSlices';
import type { CategoryShare } from '@/models/inventoryValuation';
import { COMPOSITION_DIMENSIONS, type CompositionDimension, type CompositionView } from '@/models/stockComposition';
import type { InventoryHealth } from '@/serializers/reportInsightSerializers';
import { AGING_RAMP, CATEGORY_PALETTE, rampSteps } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';


const DIMENSION_LABEL: Record<CompositionDimension, string> = {
  category: 'Category',
  location: 'Location',
  age: 'Age',
};

const items = (n: number) => `${n.toLocaleString('en-US')} item${n === 1 ? '' : 's'}`;

export interface StockCompositionProps {
  view: CompositionView;
  dimension: CompositionDimension;
  onView: (view: CompositionView) => void;
  onDimension: (dimension: CompositionDimension) => void;
  /** Stock value by category, from the valuation rows. */
  categories: readonly CategoryShare[];
  /** Location and age come from inventory health, which loads on its own. */
  health: { data: InventoryHealth | undefined; isLoading: boolean; isError: boolean; retry: () => void };
  /** Inventory 1200 at each month end — the Line view. */
  trend: { points: MetricChartPoint[]; isLoading: boolean; isError: boolean };
  /** "As of today" / "As of Sep 30, 2026". */
  asOfLabel: string;
  /** The category the items below are filtered to, if any. */
  selectedCategory?: string | null;
  onCategory: (category: string) => void;
  /** Back to every category — the way out of a drill-in, always in sight. */
  onClearCategory: () => void;
  /** Location and age have their own lists in the Health tab. */
  onHealthView: (view: 'locations' | 'age') => void;
}

/**
 * What the stock is made of — the hero of the inventory report. A ring by
 * default (the share each part holds is the question), bars to compare the
 * parts by length, and a line for how the total has moved.
 *
 * The ring and the bars cut the same stock three ways: by category (from the
 * valuation itself), by location, and by how long it has been on hand (both
 * from inventory health). Ages are ordered, so they take the navy ramp, not
 * the categorical palette; a category or location that does not make the top
 * six folds into a grey Other.
 */
export function StockComposition({
  view,
  dimension,
  onView,
  onDimension,
  categories,
  health,
  trend,
  asOfLabel,
  selectedCategory = null,
  onCategory,
  onClearCategory,
  onHealthView,
}: StockCompositionProps) {
  const fromHealth = dimension !== 'category';
  const healthPending = fromHealth && health.isLoading;
  const healthFailed = fromHealth && !health.isLoading && (health.isError || !health.data);

  let slices: SlicePoint[] = [];
  let palette: readonly string[] = CATEGORY_PALETTE;
  if (dimension === 'category') {
    slices = foldSlices(
      categories.map((c) => ({ key: c.category, label: c.category || 'Uncategorised', value: c.value, count: c.items })),
    );
  } else if (dimension === 'location' && health.data) {
    slices = foldSlices(
      health.data.byLocation.map((l) => ({
        key: l.location,
        label: l.location,
        value: l.value,
        ...(l.count ? { count: l.count } : {}),
      })),
    );
  } else if (dimension === 'age' && health.data) {
    // In age order, never by size; stock with no recorded movement has no age.
    slices = health.data.aging.map((b) => ({
      key: b.key === 'noMovement' ? OTHER_KEY : b.key,
      label: b.label,
      value: b.value,
      count: b.count,
    }));
    palette = rampSteps(slices.filter((s) => s.key !== OTHER_KEY).length, AGING_RAMP);
  }

  const select = (key: string) => {
    if (dimension === 'category') onCategory(key);
    else onHealthView(dimension === 'location' ? 'locations' : 'age');
  };
  const subject =
    dimension === 'category' ? 'category' : dimension === 'location' ? 'location' : 'time since it last came in';
  const whole = slices.reduce((t, s) => t + s.value, 0);

  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title="Stock composition"
        description={
          view === 'line'
            ? 'Inventory account 1200 at each month end, over twelve months'
            : `Stock value by ${subject} · ${asOfLabel}`
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-xs print:hidden">
            {view !== 'line' && (
              <SegmentedControl<CompositionDimension>
                label="Break the stock down by"
                size="sm"
                value={dimension}
                onChange={onDimension}
                options={COMPOSITION_DIMENSIONS.map((d) => ({ value: d, label: DIMENSION_LABEL[d] }))}
              />
            )}
            <SegmentedControl<CompositionView>
              label="Chart type"
              size="sm"
              value={view}
              onChange={onView}
              options={[
                { value: 'pie', label: <PieChart className="size-4" aria-hidden="true" />, ariaLabel: 'Pie chart' },
                { value: 'bar', label: <BarChart3 className="size-4" aria-hidden="true" />, ariaLabel: 'Bar chart' },
                { value: 'line', label: <LineChart className="size-4" aria-hidden="true" />, ariaLabel: 'Line chart' },
              ]}
            />
          </div>
        }
      />
      {selectedCategory && (
        // Says what the ring's choice did, and how to undo it, where it was made.
        <div
          role="status"
          className="mx-lg mt-sm flex flex-wrap items-center justify-between gap-sm rounded-md bg-primary-tint px-md py-xs"
        >
          <p className="flex items-center gap-xs text-body-sm text-text-primary">
            <ListFilter className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              The items below are filtered to <span className="text-label-md">{selectedCategory}</span>
              {(() => {
                const c = categories.find((x) => x.category === selectedCategory);
                return c ? ` · ${items(c.items)}` : '';
              })()}
            </span>
          </p>
          <button
            type="button"
            onClick={onClearCategory}
            className="inline-flex items-center gap-xxs rounded-sm text-label-md text-primary hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <X className="size-3.5" aria-hidden="true" />
            Show all categories
          </button>
        </div>
      )}
      <div className="px-lg pt-xs pb-lg">
        {view === 'line' ? (
          trend.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : trend.isError || trend.points.length === 0 ? (
            <p className="py-lg text-center text-body-sm text-text-tertiary">
              The month-end history is not available.
            </p>
          ) : (
            <MetricChart metric="closingValue" type="line" points={trend.points} className="h-64" />
          )
        ) : healthPending ? (
          <Skeleton className="h-56 w-full" />
        ) : healthFailed ? (
          <div className="py-lg text-center">
            <p className="text-body-sm text-text-secondary">Stock by {DIMENSION_LABEL[dimension].toLowerCase()} could not be loaded.</p>
            <Button variant="secondary" size="sm" className="mt-sm" onClick={health.retry}>
              Try again
            </Button>
          </div>
        ) : view === 'pie' ? (
          <DonutChart
            title={`Stock value by ${subject}`}
            slices={slices}
            palette={palette}
            centerLabel="Stock value"
            labelHeader={DIMENSION_LABEL[dimension]}
            countLabel={items}
            selectedKey={dimension === 'category' ? selectedCategory : null}
            onSelect={select}
            selectVerb={dimension === 'category' ? 'List the items in' : 'Open the stock health list for'}
          />
        ) : (
          <RankedBars
            points={slices.map((s) => {
              const share = sliceShare(s, whole);
              return {
                key: s.key,
                label: s.label,
                value: s.value,
                hint: [s.count !== undefined ? items(s.count) : null, share !== null ? `${share.toFixed(1)}% of stock` : null]
                  .filter(Boolean)
                  .join(' · '),
              };
            })}
            limit={7}
            format={(v) => formatMoney(v)}
            onSelect={(key) => key !== OTHER_KEY && select(key)}
            activeKey={dimension === 'category' ? selectedCategory : null}
            emptyLabel="No stock to break down."
          />
        )}
      </div>
    </Card>
  );
}

export default StockComposition;
