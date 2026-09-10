// ═══════════════════════════════════════════════════════
// FinMatrix Web — Cash Flow
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { ReportRange } from '@/models/reportPeriod';
import {
  cashFlowSerializer,
  type CashFlowReport,
} from '@/serializers/reportSerializers';

/**
 * The cash flow statement for a period, direct method.
 *
 * Derived from real posted movements on the Cash and Bank accounts, by the date
 * the cash actually moved — so a customer payment lands on its payment date
 * rather than the invoice date. That is what makes `endingCash` tie exactly to the
 * balance sheet's cash figure for the same date, and it is the cross-check worth
 * running after any change here.
 *
 * `operatingIndirect` carries the indirect reconciliation alongside it — net
 * income adjusted for non-cash items — whose `total` always equals
 * `operating.total`. Anything the named adjustments cannot explain is carried by
 * an explicit "Other operating adjustments" line rather than quietly absorbed.
 */
export const getCashFlow = async (range: ReportRange): Promise<CashFlowReport> => {
  try {
    const response = await api.get('/reports/cash-flow', {
      params: { startDate: range.startDate, endDate: range.endDate },
    });
    return cashFlowSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
