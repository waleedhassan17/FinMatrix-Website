import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { FigureStrip } from '@/features/reports/FigureStrip';
import { KpiCard } from '@/features/reports/KpiCard';
import { RankedBars } from '@/features/reports/RankedBars';
import { formatQty } from '@/models/inventory';
import { plainKpi } from '@/models/kpi';
import { formatShortDate } from '@/models/reportPeriod';
import { getInventoryHealth } from '@/networks/reports/inventoryValuationNetwork';
import { formatAmount, formatMoney } from '@/utils/money';

export type HealthView = 'reorder' | 'age' | 'dead' | 'locations';

export interface InventoryHealthTabProps {
  asOfDate: string;
  view: HealthView;
  onView: (view: HealthView) => void;
  /** The item explorer for an item, on the report's period. */
  hrefFor: (itemId: string) => string;
}

const th = 'px-md py-sm text-overline text-text-secondary';
const td = 'px-md py-sm text-body-sm';

/**
 * Stock health: what to reorder, how old the stock is, what has stopped
 * selling, how fast it turns and where it sits. Four figures, then one view at
 * a time — the lists are long, and a page stacking all four reads as clutter.
 *
 * Every list and figure is the server's (GET /reports/inventory-health); this
 * arranges them.
 */
export function InventoryHealthTab({ asOfDate, view, onView, hrefFor }: InventoryHealthTabProps) {
  const [ageBy, setAgeBy] = useState<'inbound' | 'outbound'>('inbound');
  const query = useQuery({
    queryKey: ['reports', 'inventory-health', asOfDate],
    queryFn: () => getInventoryHealth(asOfDate),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-sm" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Stock health could not be loaded</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {(query.error as Error | null)?.message ?? 'Try again in a moment.'}
        </p>
        <Button variant="secondary" className="mt-lg" onClick={() => query.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  const h = query.data;
  const itemLink = (itemId: string, name: string) => (
    <Link to={hrefFor(itemId)} className="text-label-md text-text-link hover:underline">
      {name}
    </Link>
  );

  return (
    <div className="flex flex-col gap-lg">
      <FigureStrip>
        {h.turnover ? (
          <KpiCard kpi={h.turnover} caption="Trailing 12 months" />
        ) : (
          <KpiCard kpi={plainKpi('turnover', 'Inventory turnover', null, 'ratio')} />
        )}
        {h.dio ? (
          // The server's label names its window — "(12 months)" — which the
          // caption says instead, so the card's name fits on one line.
          <KpiCard kpi={{ ...h.dio, label: 'Days inventory outstanding' }} caption="Trailing 12 months" />
        ) : (
          <KpiCard kpi={plainKpi('dio', 'Days inventory outstanding', null, 'days')} />
        )}
        <KpiCard
          kpi={plainKpi('deadStock', 'Dead stock', h.deadStock.totalValue, 'money')}
          caption={`${h.deadStock.items.length} item${h.deadStock.items.length === 1 ? '' : 's'} not sold in 180 days`}
        />
        <KpiCard
          kpi={plainKpi('belowReorder', 'Below reorder point', h.belowReorder.length, 'count')}
          caption={h.belowReorder.length ? 'Items to reorder' : 'Nothing to reorder'}
        />
      </FigureStrip>

      <Card className="p-lg">
        <SegmentedControl<HealthView>
          label="Stock health view"
          size="sm"
          value={view}
          onChange={onView}
          options={[
            { value: 'reorder', label: 'Reorder' },
            { value: 'age', label: 'Stock age' },
            { value: 'dead', label: 'Dead stock' },
            { value: 'locations', label: 'Locations' },
          ]}
        />

        <div className="mt-md">
          {view === 'reorder' &&
            (h.belowReorder.length === 0 ? (
              <p className="py-lg text-center text-body-sm text-text-tertiary">
                Every item is above its reorder point.
              </p>
            ) : (
              <div className="max-lg:overflow-x-auto">
                <table className="w-full border-collapse">
                  <caption className="sr-only">Items below their reorder point</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className={`${th} text-left`}>Item</th>
                      <th scope="col" className={`${th} text-right`}>On hand</th>
                      <th scope="col" className={`${th} text-right`}>Reorder point</th>
                      <th scope="col" className={`${th} text-right`}>Suggested order</th>
                      <th scope="col" className={`${th} text-right`}>Stock value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.belowReorder.map((i) => (
                      <tr key={i.itemId} className="border-b border-border-light">
                        <td className={td}>
                          {itemLink(i.itemId, i.name)}
                          {i.sku && <span className="block text-caption text-text-tertiary">{i.sku}</span>}
                        </td>
                        <td className={`${td} text-right tabular`}>{formatQty(i.qtyOnHand)}</td>
                        <td className={`${td} text-right tabular text-text-secondary`}>{formatQty(i.reorderPoint)}</td>
                        <td className={`${td} text-right tabular text-label-md`}>{formatQty(i.suggestedOrderQty)}</td>
                        <td className={`${td} text-right tabular`}>
                          {i.stockValue === null ? <span className="text-text-tertiary">—</span> : formatAmount(i.stockValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {view === 'age' && (
            <div>
              {h.agingOutbound.length > 0 && (
                <SegmentedControl<'inbound' | 'outbound'>
                  label="Age stock by"
                  size="sm"
                  className="mb-sm"
                  value={ageBy}
                  onChange={setAgeBy}
                  options={[
                    { value: 'inbound', label: 'Since last received' },
                    { value: 'outbound', label: 'Since last sold' },
                  ]}
                />
              )}
              <p className="mb-sm text-caption text-text-tertiary">
                Stock value by days since each item was last {ageBy === 'outbound' ? 'sold or issued' : 'received'}, as
                of {formatShortDate(asOfDate)}.
              </p>
              <RankedBars
                points={(ageBy === 'outbound' && h.agingOutbound.length ? h.agingOutbound : h.aging).map((b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.value,
                  hint: `${b.count} item${b.count === 1 ? '' : 's'}`,
                }))}
                limit={Math.max(h.aging.length, h.agingOutbound.length)}
                format={formatMoney}
                emptyLabel="No stock on hand."
              />
            </div>
          )}

          {view === 'dead' &&
            (h.deadStock.items.length === 0 ? (
              <p className="py-lg text-center text-body-sm text-text-tertiary">
                Everything in stock has sold in the last 180 days.
              </p>
            ) : (
              <div className="max-lg:overflow-x-auto">
                <table className="w-full border-collapse">
                  <caption className="sr-only">Stock with no outbound movement in 180 days</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className={`${th} text-left`}>Item</th>
                      <th scope="col" className={`${th} text-right`}>On hand</th>
                      <th scope="col" className={`${th} text-right`}>Last out</th>
                      <th scope="col" className={`${th} text-right`}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.deadStock.items.map((i) => (
                      <tr key={i.itemId} className="border-b border-border-light">
                        <td className={td}>
                          {itemLink(i.itemId, i.name)}
                          {i.sku && <span className="block text-caption text-text-tertiary">{i.sku}</span>}
                        </td>
                        <td className={`${td} text-right tabular`}>{formatQty(i.qty)}</td>
                        <td className={`${td} text-right tabular text-text-secondary`}>
                          {i.lastOutboundDate ? formatShortDate(i.lastOutboundDate) : 'Never'}
                        </td>
                        <td className={`${td} text-right tabular`}>
                          {i.value === null ? <span className="text-text-tertiary">—</span> : formatAmount(i.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-text-primary bg-surface-2">
                      <td className="px-md py-sm text-label-lg" colSpan={3}>
                        Dead stock
                      </td>
                      <td className="px-md py-sm text-right tabular text-label-lg">
                        {formatAmount(h.deadStock.totalValue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}

          {view === 'locations' && (
            <RankedBars
              points={h.byLocation.map((l) => ({
                key: l.location,
                label: l.location,
                value: l.value,
                hint: l.count ? `${l.count} item${l.count === 1 ? '' : 's'}` : undefined,
              }))}
              limit={12}
              format={formatMoney}
              emptyLabel="No stock is held at any location."
            />
          )}
        </div>
      </Card>
    </div>
  );
}

export default InventoryHealthTab;
