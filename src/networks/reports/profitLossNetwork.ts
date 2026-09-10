// ═══════════════════════════════════════════════════════
// FinMatrix Web — Profit & Loss
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { ReportRange } from '@/models/reportPeriod';
import {
  profitLossSerializer,
  type ProfitLossReport,
} from '@/serializers/reportSerializers';

/**
 * The income statement for a period.
 *
 * Takes `startDate` and `endDate` only. There is no basis parameter — the ledger
 * is accrual and the server has no cash-basis path — and **no comparison
 * parameter**: the response carries a `comparisonRange` field that the service
 * hard-codes to `null`, and the controller never reads a `comparison` argument.
 * A prior-period column is therefore a second call to this function with the
 * range from `comparisonRange()`.
 *
 * Sending no range is a trap worth knowing about: the server falls back to
 * 1970–2999, which returns a fully-formed statement covering all time with a 200
 * and nothing to say it was not the period you asked for. Callers always send one.
 */
export const getProfitLoss = async (
  range: ReportRange,
): Promise<ProfitLossReport> => {
  try {
    const response = await api.get('/reports/profit-loss', {
      params: { startDate: range.startDate, endDate: range.endDate },
    });
    return profitLossSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
