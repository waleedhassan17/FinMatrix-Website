// ═══════════════════════════════════════════════════════
// FinMatrix Web — Dashboard Network
// ═══════════════════════════════════════════════════════
// /reports/dashboard is one of the four report routes that IS enveloped
// (dashboard, analytics-dashboard, delivery-daily, delivery-performance). The
// nine statement reports are not — they write res.json() directly. unwrapEnvelope
// handles both, which is why every call here goes through it.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  dashboardSerializer,
  revenueTrendSerializer,
  type DashboardData,
  type TrendPoint,
} from '@/serializers/dashboardSerializer';

export const getDashboardSummary = async (): Promise<DashboardData> => {
  try {
    const response = await api.get('/reports/dashboard');
    return dashboardSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * The revenue/expense trend, from the analytics report.
 *
 * Returns null when the call fails, and an empty array when the company simply
 * has no history yet. The app keeps those two states distinct on purpose —
 * "unavailable" and "nothing here yet" read very differently to a user — and
 * the card below renders them differently.
 */
export const getRevenueTrend = async (
  months = 6,
): Promise<TrendPoint[] | null> => {
  try {
    const response = await api.get('/reports/analytics-dashboard');
    return revenueTrendSerializer(unwrapEnvelope(response.data), months);
  } catch {
    return null;
  }
};
