import { RailSection } from '@/components/layout/DetailLayout';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { AssessmentPill } from '@/features/reports/AssessmentPill';
import { InfoPopover } from '@/features/reports/InfoPopover';
import { cn } from '@/lib/cn';
import { coverText, stockMeter, unitsText } from '@/models/itemExplorer';
import { formatShortDate } from '@/models/reportPeriod';
import type { KpiAssessment } from '@/serializers/kpiSerializer';
import type { ItemFacts } from '@/serializers/reportSerializers';
import { formatMoney } from '@/utils/money';

export interface ItemStockPositionProps {
  /** Null from a server before the explorer's facts: on hand only. */
  facts: ItemFacts | null;
  /** On hand today — the facts', or the last month end the history has. */
  onHand: number | null;
  cover: { days: number | null; assessment: KpiAssessment | null } | null;
  /** Days since the last sale, for "96 days ago". */
  sinceSold: number | null;
}

/**
 * Where the item's stock stands today, in the rail.
 *
 * The quantity and what it is carried at; a bar of on hand against the
 * reorder point, with what the reorder list would order when it is due; and
 * how long the stock lasts at the window's selling rate, with the server's
 * verdict on it — a week from running out and a year on the shelf are both
 * problems, and the pill says which this is.
 *
 * The bar is drawn in the brand colour whatever the state: the state is the
 * badge's and the pill's to say, in words.
 */
export function ItemStockPosition({ facts, onHand, cover, sinceSold }: ItemStockPositionProps) {
  const uom = facts?.unitOfMeasure ?? 'unit';
  const meter = facts && onHand !== null ? stockMeter(onHand, facts.reorderPoint) : null;
  const point = facts?.reorderPoint ?? 0;
  // Ordering more of something that has not moved in six months is the wrong advice.
  const suggestion = facts && !facts.deadStock ? facts.suggestedOrderQty : null;

  return (
    <RailSection title="Stock position" action={<AssessmentPill assessment={cover?.assessment ?? null} />}>
      <p className="text-h3 tabular text-text-primary">{onHand === null ? '—' : unitsText(onHand, uom)}</p>
      {facts && (
        <p className="mt-[2px] text-caption text-text-secondary tabular">
          {formatMoney(facts.stockValue)} at average cost
        </p>
      )}

      {meter && onHand !== null && (
        <div className="mt-md">
          <div
            role="img"
            aria-label={`${unitsText(onHand, uom)} on hand; the reorder point is ${unitsText(point, uom)}`}
            className="relative h-2 rounded-full bg-neutral-100"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${meter.fillPct}%` }} />
            <span
              aria-hidden="true"
              className="absolute -top-[3px] h-[14px] w-[2px] -translate-x-1/2 rounded-full bg-text-primary"
              style={{ left: `${meter.tickPct}%` }}
            />
          </div>
          <div className="relative mt-xxs h-4" aria-hidden="true">
            <span
              className="absolute -translate-x-1/2 text-caption whitespace-nowrap text-text-tertiary"
              style={{ left: `${Math.min(80, Math.max(20, meter.tickPct))}%` }}
            >
              Reorder at {unitsText(point, uom)}
            </span>
          </div>
          <p className={cn('mt-xs text-caption', meter.headroom < 0 ? 'text-text-primary' : 'text-text-secondary')}>
            {meter.headroom > 0
              ? `${unitsText(meter.headroom, uom)} above the reorder point`
              : meter.headroom === 0
                ? 'At the reorder point'
                : `${unitsText(-meter.headroom, uom)} below the reorder point`}
            {suggestion !== null && suggestion > 0 && (
              <span className="text-label-sm"> · Suggested order {unitsText(suggestion, uom)}</span>
            )}
          </p>
        </div>
      )}

      {facts && (
        <KeyValueList
          className="mt-md border-t border-border-light pt-sm"
          items={[
            {
              label: (
                <span className="inline-flex items-center gap-xxs">
                  Days of cover
                  {cover?.assessment?.guide && (
                    <InfoPopover label="How days of cover is read">
                      <p className="text-label-md text-text-primary">Days of cover</p>
                      <p className="mt-xxs text-body-sm text-text-secondary">{cover.assessment.guide}</p>
                      <p className="mt-sm text-caption text-text-tertiary">
                        Stock on hand ÷ the units sold a day in this window, counting only the days that
                        have passed.
                      </p>
                    </InfoPopover>
                  )}
                </span>
              ),
              value: (
                <span className={cn('tabular', cover?.days === null && 'text-text-tertiary')}>
                  {coverText(cover?.days ?? null)}
                </span>
              ),
            },
            { label: 'Location', value: facts.location ?? '', hidden: !facts.location },
            {
              label: 'Last sold',
              value: facts.lastSoldDate ? (
                <>
                  {formatShortDate(facts.lastSoldDate)}
                  {sinceSold !== null && (
                    <span className="block text-caption text-text-tertiary">
                      {sinceSold === 0 ? 'Today' : `${sinceSold} day${sinceSold === 1 ? '' : 's'} ago`}
                    </span>
                  )}
                </>
              ) : (
                'Never'
              ),
            },
          ]}
        />
      )}
    </RailSection>
  );
}

export default ItemStockPosition;
