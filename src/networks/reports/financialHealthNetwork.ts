// ═══════════════════════════════════════════════════════
// FinMatrix Web — Financial health (reports v2)
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  financialHealthSerializer,
  type FinancialHealth,
} from '@/serializers/reportInsightSerializers';

/**
 * Working capital, current and quick ratios, debt-to-equity, DSO/DPO/DIO/CCC
 * and runway as of a date — each a KPI object with its formula and the inputs
 * it was computed from. The formulas live on the server
 * (reports-kpi.service.ts) and nowhere else.
 */
export const getFinancialHealth = async (asOfDate: string): Promise<FinancialHealth> => {
  try {
    const response = await api.get('/reports/financial-health', { params: { asOfDate } });
    return financialHealthSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
