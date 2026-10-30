import { describe, expect, it } from 'vitest';

import { inventoryHealthSerializer } from '@/serializers/reportInsightSerializers';
import { inventoryValuationSerializer } from '@/serializers/reportSerializers';

/**
 * A figure the server could not establish is unknown, not zero. Reading it as
 * 0 would state on a stock report that goods are worth nothing.
 */
describe('unknown stock values stay unknown', () => {
  it('keeps an unvalued reorder or dead-stock item at null', () => {
    const h = inventoryHealthSerializer({
      asOfDate: '2026-06-30',
      belowReorder: [
        { itemId: 'a', name: 'Alpha', sku: 'A', qtyOnHand: 2, reorderPoint: 5, reorderQuantity: 10, suggestedOrderQty: 10, stockValue: null },
        { itemId: 'b', name: 'Beta', sku: 'B', qtyOnHand: 1, reorderPoint: 5, reorderQuantity: 10, suggestedOrderQty: 10, stockValue: 120.5 },
      ],
      deadStock: {
        thresholdDays: 180,
        items: [
          { itemId: 'c', name: 'Gamma', sku: 'C', qtyOnHand: 4, stockValue: null, lastOutboundDate: null, daysSinceOutbound: null },
          { itemId: 'd', name: 'Delta', sku: 'D', qtyOnHand: 4, stockValue: 80, lastOutboundDate: '2025-10-01', daysSinceOutbound: 272 },
        ],
        totalValue: 80,
      },
      aging: { byLastInbound: [], byLastOutbound: [] },
      byLocation: [{ location: 'Main', value: 200.5, count: 3 }],
    });
    expect(h.belowReorder.map((i) => i.stockValue)).toEqual([null, 120.5]);
    expect(h.deadStock.items.map((i) => i.value)).toEqual([null, 80]);
    expect(h.byLocation).toEqual([{ location: 'Main', value: 200.5, count: 3 }]);
  });

  it('keeps an as-of item whose cost is not known at null', () => {
    const v = inventoryValuationSerializer({
      asOfDate: '2026-06-30',
      rows: [
        { itemId: 'a', itemName: 'Alpha', sku: 'A', category: 'General', qty: 3, cost: null, value: null, valueKnown: false },
        { itemId: 'b', itemName: 'Beta', sku: 'B', category: 'General', qty: 2, cost: 15, value: 30, valueKnown: true },
      ],
      byCategory: [{ category: 'General', totalValue: 30 }],
      totalValue: 30,
      coverage: { movements: 4, valued: 3, pct: 75, unvaluedItems: 1 },
      ledgerTie: { gl1200: 30, valuation: 30, gap: 0, includesGoodsInTransit: false },
    });
    expect(v.rows.map((r) => r.cost)).toEqual([null, 15]);
    expect(v.rows[0].valueKnown).toBe(false);
  });
});
