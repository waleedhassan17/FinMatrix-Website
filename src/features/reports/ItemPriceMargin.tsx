import { RailSection } from '@/components/layout/DetailLayout';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { cn } from '@/lib/cn';
import { priceAndMargin, vsListText } from '@/models/itemExplorer';
import type { ItemFacts } from '@/serializers/reportSerializers';
import { CATEGORY_PALETTE } from '@/theme/tokens';
import { formatMoney, parenNegative } from '@/utils/money';

const COST_COLOR = CATEGORY_PALETTE[0];
const MARGIN_COLOR = CATEGORY_PALETTE[1];

/**
 * What a unit sells for against what it costs, in the rail: the list price,
 * the average cost, the margin between them, and — from the window's own
 * sales — what a unit actually went for after discounts.
 *
 * One bar splits the price into cost and margin, navy and teal like the
 * analytics charts, named beside it so colour is never the only key. An item
 * priced below its cost has no margin to draw: the bar is all cost, and the
 * shortfall is said in words.
 */
export function ItemPriceMargin({
  facts,
  totals,
}: {
  facts: ItemFacts;
  totals: { revenue: number; unitsSold: number } | null | undefined;
}) {
  const p = priceAndMargin(facts, totals);
  if (p.price <= 0) return null;
  const below = p.margin < 0;
  const vsList = vsListText(p.vsListPct);

  return (
    <RailSection title="Price and margin">
      {p.costShare !== null && (
        <div className="mb-md">
          <div
            role="img"
            aria-label={
              below
                ? `Sells ${formatMoney(-p.margin)} below its cost`
                : `Of the price, ${p.costShare.toFixed(1)}% is cost and ${(100 - p.costShare).toFixed(1)}% margin`
            }
            className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-neutral-100"
          >
            <span className="h-full" style={{ width: `${p.costShare}%`, backgroundColor: COST_COLOR }} />
            {!below && p.costShare < 100 && (
              <span className="h-full flex-1" style={{ backgroundColor: MARGIN_COLOR }} />
            )}
          </div>
          <p className="mt-xs flex flex-wrap items-center gap-x-md gap-y-xxs text-caption text-text-secondary" aria-hidden="true">
            <span className="inline-flex items-center gap-xxs">
              <span className="size-2 rounded-[2px]" style={{ backgroundColor: COST_COLOR }} />
              Cost {p.costShare.toFixed(1)}%
            </span>
            {!below && (
              <span className="inline-flex items-center gap-xxs">
                <span className="size-2 rounded-[2px]" style={{ backgroundColor: MARGIN_COLOR }} />
                Margin {(100 - p.costShare).toFixed(1)}%
              </span>
            )}
          </p>
        </div>
      )}
      <KeyValueList
        items={[
          { label: 'Selling price', value: <span className="tabular">{formatMoney(p.price)}</span> },
          { label: 'Average cost', value: <span className="tabular">{formatMoney(p.cost)}</span> },
          {
            label: 'Margin per unit',
            value: (
              <span className={cn('tabular', below && 'text-danger')}>
                {parenNegative(p.margin)}
                {p.marginPct !== null && (
                  <span className={cn('block text-caption', below ? 'text-danger' : 'text-text-tertiary')}>
                    {below ? 'Below cost' : `${p.marginPct.toFixed(1)}% of the price`}
                  </span>
                )}
              </span>
            ),
            emphasis: true,
          },
          {
            label: 'Sold for',
            value: (
              <span className="tabular">
                {formatMoney(p.realised ?? 0)}
                {vsList && <span className="block text-caption text-text-tertiary">{vsList}</span>}
              </span>
            ),
            hidden: p.realised === null,
          },
        ]}
      />
    </RailSection>
  );
}

export default ItemPriceMargin;
