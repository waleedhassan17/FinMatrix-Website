// ═══════════════════════════════════════════════════════
// FinMatrix Web — AR and AP Aging
// ═══════════════════════════════════════════════════════
// One file for both: the server builds them with the same `bucketAging` helper, so
// the row and total shapes are identical. The A/P rows keep the A/R field names —
// `customerId` / `customerName` hold a vendor — which the pages relabel.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  agingPartyDocumentsSerializer,
  agingSerializer,
  type AgingPartyDocuments,
  type AgingPresetKey,
  type AgingReport,
} from '@/serializers/reportSerializers';

/**
 * How the columns are cut. Sending nothing asks for the company's saved
 * default, which is why the first load passes `{}` — the server resolves the
 * preference and echoes back the preset it used.
 */
export interface AgingParams {
  preset?: AgingPresetKey;
  /** Ascending days overdue, e.g. '3,6,9,12'. Required when preset is custom. */
  buckets?: string;
}

const agingQuery = (params: AgingParams): Record<string, string> => {
  const q: Record<string, string> = {};
  if (params.preset) q.preset = params.preset;
  if (params.buckets) q.buckets = params.buckets;
  return q;
};

/**
 * Outstanding receivables, bucketed by how overdue each invoice is.
 *
 * **Takes no date, and none can be supplied.** Aging closes as of now, in the
 * business time zone, and the server decides what "now" is. `asOfDate` used to
 * be accepted on the unified `/reports/aging` route and silently discarded; it
 * has been removed rather than implemented, because a true as-of report needs
 * each document's balance rebuilt from payment history and `invoices.balance`
 * only ever holds the current one.
 *
 * **The BUCKETS are configurable**, which is the part of the report's shape a
 * user genuinely chooses. Counts invoices with a positive balance whose status
 * is not paid, void or draft.
 */
export const getArAging = async (params: AgingParams = {}): Promise<AgingReport> => {
  try {
    const response = await api.get('/reports/ar-aging', { params: agingQuery(params) });
    return agingSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Outstanding payables, same buckets and same caveat about the date. */
export const getApAging = async (params: AgingParams = {}): Promise<AgingReport> => {
  try {
    const response = await api.get('/reports/ap-aging', { params: agingQuery(params) });
    return agingSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** A drill-down asks for one bucket, and must name the spec it is reading. */
export interface AgingDetailParams extends AgingParams {
  /** A bucket key from the report payload. Omit for every open document. */
  bucket?: string;
  limit?: number;
}

const agingDetailQuery = (params: AgingDetailParams): Record<string, string> => {
  const q = agingQuery(params);
  if (params.bucket) q.bucket = params.bucket;
  if (params.limit) q.limit = String(params.limit);
  return q;
};

/**
 * The open invoices behind one customer's aging row.
 *
 * **The bucket spec goes with every call.** The server resolves the company
 * default when a request names no preset, so omitting it here would bucket the
 * documents differently from the columns they were opened from — and both sets
 * of labels would be individually correct, which is what makes it hard to spot.
 *
 * `outstandingTotal` covers every matching document, not just the returned page,
 * so it reconciles against the row even when the list is truncated.
 */
export const getArAgingPartyDocuments = async (
  customerId: string,
  params: AgingDetailParams = {},
): Promise<AgingPartyDocuments> => {
  try {
    const response = await api.get(
      `/reports/ar-aging/customers/${encodeURIComponent(customerId)}/documents`,
      { params: agingDetailQuery(params) },
    );
    return agingPartyDocumentsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The open bills behind one vendor's aging row. */
export const getApAgingPartyDocuments = async (
  vendorId: string,
  params: AgingDetailParams = {},
): Promise<AgingPartyDocuments> => {
  try {
    const response = await api.get(
      `/reports/ap-aging/vendors/${encodeURIComponent(vendorId)}/documents`,
      { params: agingDetailQuery(params) },
    );
    return agingPartyDocumentsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Remember the bucket choice as this company's default.
 *
 * Fails soft on purpose: PATCH /settings is admin-only, so a staff user gets a
 * 403. Their report is still bucketed the way they asked — only the
 * remembering is refused — and raising an error for that would be noise about
 * something they did not ask for.
 */
export const saveAgingPreference = async (params: AgingParams): Promise<void> => {
  try {
    await api.patch('/settings', {
      reportPreferences: {
        aging: params.preset === 'custom'
          ? { preset: 'custom', buckets: params.buckets }
          : { preset: params.preset },
      },
    });
  } catch {
    /* admin-only; a staff user keeps the view, just not the default. */
  }
};
