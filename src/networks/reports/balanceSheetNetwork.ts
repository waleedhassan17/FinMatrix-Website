// ═══════════════════════════════════════════════════════
// FinMatrix Web — Balance Sheet
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  balanceSheetSerializer,
  type BalanceSheetReport,
} from '@/serializers/reportSerializers';

/**
 * The balance sheet as at a date. Point-in-time, so `asOfDate` — not a range.
 *
 * The server sums the ledger from 1970 through `asOfDate`, so the figures are
 * cumulative closing balances rather than period movements. It also rolls the
 * current period's earnings into equity as a `3100 Net Income (current period)`
 * line, deriving that figure exactly as the P&L derives its `netIncome` so the
 * two statements agree to the paisa.
 *
 * `assets`, `liabilities` and `equity` come back FLAT — no sub-grouping at all.
 * `bucketStatementLines` is what turns them into a statement.
 */
export const getBalanceSheet = async (
  asOfDate: string,
): Promise<BalanceSheetReport> => {
  try {
    const response = await api.get('/reports/balance-sheet', {
      params: { asOfDate },
    });
    return balanceSheetSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
