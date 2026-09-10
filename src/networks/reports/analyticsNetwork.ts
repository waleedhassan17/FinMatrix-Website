// ═══════════════════════════════════════════════════════
// FinMatrix Web — Analytics
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  analyticsSerializer,
  type AnalyticsReport,
} from '@/serializers/reportSerializers';

/**
 * Trends and rankings for the analytics page.
 *
 * Takes no parameters; the server decides the windows. Unlike the statement
 * reports this one IS enveloped, which `unwrapEnvelope` handles either way.
 *
 * Two things it returns are not quite what their names say, and the page labels
 * them honestly rather than repeating the API's wording:
 *   - `expenseCategories` groups bills by VENDOR, not by expense account.
 *   - `arAgingTrend` is a single point ("Current"), not a trend over time.
 *
 * The trends are built from invoice and bill dates across all history, trimmed to
 * the last twelve months that have data — so the months present depend on the
 * company's own activity and can be sparse.
 */
export const getAnalytics = async (): Promise<AnalyticsReport> => {
  try {
    const response = await api.get('/reports/analytics-dashboard');
    return analyticsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
