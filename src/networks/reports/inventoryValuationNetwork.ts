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
  itemSalesEntriesSerializer,
  type ItemSalesEntries,
  type InventoryValuationTrend,
  inventoryPerformanceSerializer,
  type InventoryPerformance,
  type InventoryPerformanceSort,
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
 * One item's stock level and value month by month, from its movement history.
 *
 * Both walk back from today's quantity and value through the dated movements,
 * so the latest month is what the valuation table shows. Value is only
 * claimed from the company's cost-history date; `coverage` says where it
 * stops and why, rather than returning a zero.
 *
 * Given a range, the months match the ones item-performance returns for it —
 * the explorer puts the two side by side. Without one, the last `months`.
 */
export const getInventoryItemHistory = async (
  itemId: string,
  months = 12,
  range?: { startDate: string; endDate: string },
): Promise<InventoryItemHistory> => {
  try {
    const response = await api.get(
      `/reports/inventory-valuation/items/${encodeURIComponent(itemId)}/history`,
      { params: range ? { months, startDate: range.startDate, endDate: range.endDate } : { months } },
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

/**
 * The document lines behind one item's figures — invoices, deliveries and
 * returns — newest first, a page at a time. A month's lines add up to that
 * month on `getItemPerformance`, because the server reads the same rows.
 */
export const getItemSalesEntries = async (
  itemId: string,
  range: { startDate: string; endDate: string },
  page = 1,
  limit = 25,
): Promise<ItemSalesEntries> => {
  try {
    const response = await api.get(
      `/reports/item-performance/${encodeURIComponent(itemId)}/entries`,
      { params: { startDate: range.startDate, endDate: range.endDate, page, limit } },
    );
    return itemSalesEntriesSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Every item's sales, cost and margin for a period, beside its stock value.
 *
 * Sorted server-side: the questions worth asking — what earns, what is dead
 * stock — are orderings rather than filters, and sorting a page the client was
 * handed would only reorder that page.
 */
export const getInventoryPerformance = async (
  range: { startDate: string; endDate: string },
  sort: InventoryPerformanceSort = 'grossProfit',
): Promise<InventoryPerformance> => {
  try {
    const response = await api.get('/reports/inventory-performance', {
      params: { startDate: range.startDate, endDate: range.endDate, sort },
    });
    return inventoryPerformanceSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
