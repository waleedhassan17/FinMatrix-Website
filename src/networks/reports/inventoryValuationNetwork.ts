// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory Valuation
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  inventoryValuationSerializer,
  type InventoryValuationReport,
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
