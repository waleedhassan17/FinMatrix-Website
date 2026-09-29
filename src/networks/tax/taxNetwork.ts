// ═══════════════════════════════════════════════════════
// FinMatrix Web — Tax network
// ═══════════════════════════════════════════════════════
// Reads are `@Roles('admin','staff')`: liability, rates and payments. Every
// write — recording or reversing a payment, and any change to a rate — is
// `@Roles('admin')`. Staff therefore see the liability figures and nothing that
// changes them.
//
// Both list endpoints are paged; each is walked to its last page (they are
// small — a handful of rates, a few remittances a year) and paged on the
// client, where the total is exact.

import type {
  TaxLiability,
  TaxPayment,
  TaxPaymentPayload,
  TaxRate,
  TaxRatePayload,
} from '@/models/tax';
import type { ReportRange } from '@/models/reportPeriod';
import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  mapTaxPayment,
  mapTaxRate,
  taxLiabilitySerializer,
} from '@/serializers/taxSerializer';
import { getAllRows } from '@/networks/network/allPages';

export const getTaxLiability = async (range: ReportRange): Promise<TaxLiability> => {
  try {
    const response = await api.get('/taxes/liability', {
      params: { startDate: range.startDate, endDate: range.endDate },
    });
    return taxLiabilitySerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Every rate. The endpoint's default page is 20 and the app asks once without
 * paging, so it never sees a twenty-first rate.
 */
export const getTaxRates = async (params: { activeOnly?: boolean } = {}): Promise<TaxRate[]> =>
  // Every page: a rate past the first 500 could not be picked on a document.
  getAllRows('/taxes/rates', params.activeOnly ? { isActive: 'true' } : {}, mapTaxRate);

/** Setting `isDefault` clears the previous default server-side. */
export const createTaxRate = async (payload: TaxRatePayload): Promise<TaxRate> => {
  try {
    const response = await api.post('/taxes/rates', payload);
    return mapTaxRate(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateTaxRate = async (
  id: string,
  payload: Partial<TaxRatePayload>,
): Promise<TaxRate> => {
  try {
    const response = await api.patch(`/taxes/rates/${id}`, payload);
    return mapTaxRate(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Hard delete. Refused once a rate has recorded payments — the server says to
 * deactivate it instead, and that message is surfaced as-is.
 */
export const deleteTaxRate = async (id: string): Promise<void> => {
  try {
    await api.delete(`/taxes/rates/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Every tax payment, newest first, walked page by page. `truncated` is always
 * false now; it stays for callers written against the capped fetch.
 */
export const getTaxPayments = async (
  params: { taxRateId?: string } = {},
): Promise<{ rows: TaxPayment[]; truncated: boolean }> => ({
  rows: await getAllRows(
    '/taxes/payments',
    params.taxRateId ? { taxRateId: params.taxRateId } : {},
    mapTaxPayment,
  ),
  truncated: false,
});

/**
 * Record a remittance. Posts Dr Sales Tax Payable (2300) / Cr Cash (1000) —
 * always Cash 1000; the API has no way to choose the paying account.
 *
 * Idempotency-keyed because it moves money: a retried request replays the
 * stored response instead of paying twice.
 */
export const createTaxPayment = async (
  payload: TaxPaymentPayload,
  idempotencyKey?: string,
): Promise<TaxPayment> => {
  try {
    const response = await api.post('/taxes/payments', payload, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    return mapTaxPayment(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Reverse a remittance: books Dr Cash / Cr Sales Tax Payable, restoring the
 * liability, and keeps the original entry on file. Refused if the payment has
 * been reconciled against a bank statement.
 */
export const deleteTaxPayment = async (id: string): Promise<void> => {
  try {
    await api.delete(`/taxes/payments/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
