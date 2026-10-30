// ═══════════════════════════════════════════════════════
// FinMatrix Web — Balance Sheet
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  retainedEarningsSerializer,
  type RetainedEarningsRollforward,
} from '@/serializers/reportInvestigateSerializers';
import {
  balanceSheetSerializer,
  type BalanceSheetReport,
} from '@/serializers/reportSerializers';

export interface BalanceSheetOptions {
  /**
   * A second, earlier date to compare against (reports v2). The server fills
   * every line's `priorAmount`, `change` and `changePct`, and lists accounts
   * that only had a balance at that date. Must be before `asOfDate`.
   */
  compareTo?: string;
  /** Include accounts with no balance on either date (contract gap G6). */
  includeZero?: boolean;
}

/**
 * The balance sheet as at a date. Point-in-time, so `asOfDate` — not a range.
 *
 * The server sums the ledger from 1970 through `asOfDate`, so the figures are
 * cumulative closing balances rather than period movements. It also rolls the
 * current period's earnings into equity as a `3100 Net Income (current period)`
 * line, deriving that figure exactly as the P&L derives its `netIncome` so the
 * two statements agree to the paisa.
 *
 * `assets`, `liabilities` and `equity` still come back flat for shipped
 * clients; reports v2 adds `sections`, grouped on the server by account
 * subtype, which is what the page draws. No grouping happens on this side.
 */
export const getBalanceSheet = async (
  asOfDate: string,
  options: BalanceSheetOptions = {},
): Promise<BalanceSheetReport> => {
  try {
    const params: Record<string, string> = { asOfDate };
    if (options.compareTo) params.compareTo = options.compareTo;
    if (options.includeZero) params.includeZero = 'true';
    const response = await api.get('/reports/balance-sheet', { params });
    return balanceSheetSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * What the balance sheet's Retained Earnings line is made of: what has been
 * posted to 3100, plus each closed fiscal year's net income. `total` equals
 * the line.
 */
export const getRetainedEarnings = async (
  asOfDate: string,
): Promise<RetainedEarningsRollforward> => {
  try {
    const response = await api.get('/reports/balance-sheet/retained-earnings', {
      params: { asOfDate },
    });
    return retainedEarningsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
