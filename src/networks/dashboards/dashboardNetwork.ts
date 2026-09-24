// ═══════════════════════════════════════════════════════
// FinMatrix Web — Dashboard Network
// ═══════════════════════════════════════════════════════
// /reports/dashboard is one of the four report routes that IS enveloped
// (dashboard, analytics-dashboard, delivery-daily, delivery-performance). The
// nine statement reports are not — they write res.json() directly. unwrapEnvelope
// handles both, which is why every call here goes through it.
//
// The dashboard's revenue chart and receivables snapshot come from the
// analytics report, read through `getAnalytics` in reports/analyticsNetwork —
// one call feeds both, so there is no second wrapper for it here.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  dashboardSerializer,
  type DashboardData,
} from '@/serializers/dashboardSerializer';

export const getDashboardSummary = async (): Promise<DashboardData> => {
  try {
    const response = await api.get('/reports/dashboard');
    return dashboardSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
