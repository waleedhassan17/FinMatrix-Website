// ═══════════════════════════════════════════════════════
// FinMatrix Web — Tax network
// ═══════════════════════════════════════════════════════
// Reads are `@Roles('admin','staff')`: liability, rates and payments. Every
// write — recording or reversing a payment, and any change to a rate — is
// `@Roles('admin')`. Staff therefore see the liability figures and nothing that
// changes them.
//
// The two list endpoints return `{data, total, page, limit}`, but the backend's
// ResponseEnvelopeInterceptor keeps only `data` and `message` from any payload
// with a `data` key — so `total` never reaches the client, and a table paged on
// the server could never know there is a page two. Both lists are small (a
// handful of rates; a few remittances a year), so each is fetched as one large
// page and paged on the client, where the total is exact.

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
  pagedSerializer,
  taxLiabilitySerializer,
} from '@/serializers/taxSerializer';

/** Large enough that a real company never reaches it. */
const LIST_LIMIT = 500;

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
export const getTaxRates = async (params: { activeOnly?: boolean } = {}): Promise<TaxRate[]> => {
  try {
    const response = await api.get('/taxes/rates', {
      params: {
        page: 1,
        limit: LIST_LIMIT,
        ...(params.activeOnly ? { isActive: 'true' } : {}),
      },
    });
    return pagedSerializer(response.data, mapTaxRate, { page: 1, limit: LIST_LIMIT }).rows;
  } catch (e) {
    throw toApiError(e);
  }
};

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
 * Every tax payment, newest first. `truncated` is true only if the company has
 * reached the fetch limit, so the page can say it is showing the latest ones
 * rather than pretend it has them all.
 */
export const getTaxPayments = async (
  params: { taxRateId?: string } = {},
): Promise<{ rows: TaxPayment[]; truncated: boolean }> => {
  try {
    const response = await api.get('/taxes/payments', {
      params: {
        page: 1,
        limit: LIST_LIMIT,
        ...(params.taxRateId ? { taxRateId: params.taxRateId } : {}),
      },
    });
    const { rows } = pagedSerializer(response.data, mapTaxPayment, {
      page: 1,
      limit: LIST_LIMIT,
    });
    return { rows, truncated: rows.length >= LIST_LIMIT };
  } catch (e) {
    throw toApiError(e);
  }
};

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
