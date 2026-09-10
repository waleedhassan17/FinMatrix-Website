// ═══════════════════════════════════════════════════════
// FinMatrix Web — Trial Balance
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { ReportRange } from '@/models/reportPeriod';
import {
  trialBalanceSerializer,
  type TrialBalanceReport,
} from '@/serializers/reportSerializers';

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
 */
export const getTrialBalance = async (
  range: ReportRange,
): Promise<TrialBalanceReport> => {
  try {
    const response = await api.get('/reports/trial-balance', {
      params: { startDate: range.startDate, endDate: range.endDate },
    });
    return trialBalanceSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
