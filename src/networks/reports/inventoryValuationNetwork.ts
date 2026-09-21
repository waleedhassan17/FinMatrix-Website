// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory Valuation
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  inventoryItemHistorySerializer,
  inventoryValuationSerializer,
  inventoryValuationTrendSerializer,
  type InventoryItemHistory,
  type InventoryValuationReport,
  itemPerformanceSerializer,
  type InventoryValuationTrend,
  type ItemPerformance,
} from '@/serializers/reportSerializers';

/**
 * Stock on hand at what the books carry it at, per item and rolled up by category.
 *
 * Takes no date — it is a snapshot of current quantities, not a historical
 * valuation, because the quantity it multiplies is the item's present stock level.
 * So there is no period control on this report either.
 *
 * `totalValue` should agree with the balance sheet's Inventory (1200) line. Where
 * it does not, the subledger has drifted from the control account, which is worth
 * knowing about rather than papering over.
 */
export const getInventoryValuation = async (): Promise<InventoryValuationReport> => {
  try {
    const response = await api.get('/reports/inventory-valuation');
    return inventoryValuationSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Company-wide stock value, month by month, from GL account 1200.
 *
 * Exact and tied to the balance sheet at every point — this needed no new
 * column, because the ledger has always recorded what inventory was worth.
 * Closing balances, not movements, and a month with no activity carries the
 * previous close forward rather than reading zero.
 */
export const getInventoryValuationTrend = async (
  months = 12,
): Promise<InventoryValuationTrend> => {
  try {
    const response = await api.get('/reports/inventory-valuation/trend', {
      params: { months },
    });
    return inventoryValuationTrendSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * One item's stock level month by month, from its movement history.
 *
 * Quantity is EXACT — every movement carries a server-snapshotted running
 * balance. Month-end VALUE is not returned: there is no cost on a stock
 * movement, and pricing a past quantity at the item's current weighted-average
 * cost would be retroactively wrong in a way that looks entirely plausible on a
 * chart. The response says so in `coverage` rather than returning a zero.
 */
export const getInventoryItemHistory = async (
  itemId: string,
  months = 12,
): Promise<InventoryItemHistory> => {
  try {
    const response = await api.get(
      `/reports/inventory-valuation/items/${encodeURIComponent(itemId)}/history`,
      { params: { months } },
    );
    return inventoryItemHistorySerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * One item's sales and gross margin over a period.
 *
 * Revenue was always answerable; COST is what needed recording per invoice
 * line. Where an invoice carried several different items its total cost is
 * exact but the split between them is apportioned — `estimatedCogsShare` says
 * how much of the answer rests on that.
 */
export const getItemPerformance = async (
  itemId: string,
  range: { startDate: string; endDate: string },
): Promise<ItemPerformance> => {
  try {
    const response = await api.get(
      `/reports/item-performance/${encodeURIComponent(itemId)}`,
      { params: { startDate: range.startDate, endDate: range.endDate } },
    );
    return itemPerformanceSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
