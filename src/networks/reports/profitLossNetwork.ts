// ═══════════════════════════════════════════════════════
// FinMatrix Web — Profit & Loss
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { ReportRange } from '@/models/reportPeriod';
import {
  profitLossSerializer,
  statementLineEntriesSerializer,
  type ProfitLossReport,
  type StatementLineEntries,
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

/**
 * The posted transactions behind one statement line.
 *
 * `accountCode` is the account NUMBER off the line ('4000'), not its id — the
 * P&L aggregates by account number and that is the only handle a line carries.
 *
 * Paginated, unlike `/ledger`: a year of Sales Revenue is every invoice the
 * company has ever issued, and this is rendered inside a table row.
 */
export const getStatementLineEntries = async (
  accountCode: string,
  range: ReportRange,
  limit = 50,
): Promise<StatementLineEntries> => {
  try {
    const response = await api.get(
      `/reports/profit-loss/lines/${encodeURIComponent(accountCode)}/entries`,
      {
        params: {
          startDate: range.startDate,
          endDate: range.endDate,
          limit,
        },
      },
    );
    return statementLineEntriesSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
