// ═══════════════════════════════════════════════════════
// FinMatrix Web — Trial Balance
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { ReportRange } from '@/models/reportPeriod';
import {
  trialBalanceSerializer,
  type TrialBalanceMode,
  type TrialBalanceReport,
} from '@/serializers/reportSerializers';

export interface TrialBalanceOptions {
  /**
   * Always sent by the page. The server's default stays `movement` for shipped
   * clients, but the web opens on `closing` — the trial balance an accountant
   * means — so leaving it implicit would show the other report.
   */
  mode?: TrialBalanceMode;
  /** Include accounts with nothing in any column (contract gap G6). */
  includeZero?: boolean;
}

/**
 * Every account's net movement, split into its natural debit or credit column.
 *
 * **Range-based, and that makes this PERIOD MOVEMENTS, not closing balances.**
 * Unlike the balance sheet — which always sums from 1970 — the trial balance sums
 * the ledger strictly inside `startDate`–`endDate`. A trial balance for January
 * shows what moved in January, not where the accounts stood on the 31st. The page
 * says so plainly, because the two are easy to confuse and only one of them is
 * what most people mean by "trial balance".
 *
 * It always balances: every posted entry balances, so Σ(debits − credits) across
 * accounts is zero for any window. The server decides `isBalanced` on unrounded
 * figures and then presents equal columns as the single number they are, which is
 * why the two totals can be trusted as sent.
 *
 * Reports v2 adds `mode`: `closing` reads as of `endDate` (balance-sheet
 * accounts cumulative, P&L accounts fiscal-year-to-date), so only the end date
 * is sent; `working` puts opening, movement and closing side by side.
 */
export const getTrialBalance = async (
  range: ReportRange,
  options: TrialBalanceOptions = {},
): Promise<TrialBalanceReport> => {
  try {
    const params: Record<string, string> =
      options.mode === 'closing'
        ? { endDate: range.endDate }
        : { startDate: range.startDate, endDate: range.endDate };
    if (options.mode) params.mode = options.mode;
    if (options.includeZero) params.includeZero = 'true';
    const response = await api.get('/reports/trial-balance', { params });
    return trialBalanceSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
