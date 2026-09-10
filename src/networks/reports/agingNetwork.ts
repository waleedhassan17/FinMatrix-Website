// ═══════════════════════════════════════════════════════
// FinMatrix Web — AR and AP Aging
// ═══════════════════════════════════════════════════════
// One file for both: the server builds them with the same `bucketAging` helper, so
// the row and total shapes are identical. The A/P rows keep the A/R field names —
// `customerId` / `customerName` hold a vendor — which the pages relabel.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import { agingSerializer, type AgingReport } from '@/serializers/reportSerializers';

/**
 * Outstanding receivables, bucketed by how overdue each invoice is.
 *
 * **Takes no date, and none can be supplied.** The service ages against
 * `new Date()` server-side. The unified `/reports/aging` endpoint does accept an
 * `asOfDate` and then discards it — it delegates straight to this same method — so
 * offering a date picker here would be a control that changes nothing. The page
 * states "as of today" instead.
 *
 * Counts invoices with a positive balance whose status is not paid, void or draft.
 * Buckets are `current` (not yet due), then 1–30, 31–60, 61–90 and 90+ days past
 * the due date.
 */
export const getArAging = async (): Promise<AgingReport> => {
  try {
    const response = await api.get('/reports/ar-aging');
    return agingSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Outstanding payables, same buckets and same caveat about the date. */
export const getApAging = async (): Promise<AgingReport> => {
  try {
    const response = await api.get('/reports/ap-aging');
    return agingSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
