// ═══════════════════════════════════════════════════════
// FinMatrix Web — Customer Network
// ═══════════════════════════════════════════════════════
// Ported from the app's src/networks/sales/customerNetwork.ts.
//
// The list is filtered, searched (ID, name, company, email, phone) and sorted
// by the server, so a sort or a status chip covers every customer, not just
// the page on screen.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  customerDetailSerializer,
  customerInvoicesSerializer,
  customerListSerializer,
  customerPaymentsSerializer,
  customerStatementSerializer,
  mapCustomer,
  type CustomerInvoiceRow,
  type CustomerPaymentRow,
  type CustomerStatement,
  type CustomerWritePayload,
  type PagedRows,
  type SerializedCustomerDetail,
  type SerializedCustomerList,
} from '@/serializers/customerSerializer';
import type { Customer } from '@/models/customer';
import type { PartyHistory } from '@/models/partyHistory';
import { partyHistorySerializer } from '@/serializers/partyHistorySerializer';

export type PartyListSort = 'recent' | 'code' | 'name' | 'balance';

export interface CustomerQueryParams {
  search?: string;
  isActive?: boolean;
  /** Server order; `code` is natural (C-2 before C-10). Default newest first. */
  sort?: PartyListSort;
  page?: number;
  /** Server default 50, hard cap 200. */
  limit?: number;
}

export const getCustomers = async (
  params: CustomerQueryParams = {},
): Promise<SerializedCustomerList> => {
  try {
    const response = await api.get('/customers', { params });
    return customerListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The ID the next new customer would get — for the form's placeholder, not a reservation. */
export const getNextCustomerCode = async (): Promise<string> => {
  try {
    const response = await api.get('/customers/next-code');
    return String((unwrapEnvelope(response.data) as { code?: string })?.code ?? '');
  } catch (e) {
    throw toApiError(e);
  }
};

export const getCustomerById = async (
  id: string,
): Promise<SerializedCustomerDetail | null> => {
  try {
    const response = await api.get(`/customers/${id}`);
    return customerDetailSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createCustomer = async (
  data: CustomerWritePayload,
): Promise<Customer> => {
  try {
    const response = await api.post('/customers', data);
    return mapCustomer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateCustomer = async (
  id: string,
  data: Partial<CustomerWritePayload>,
): Promise<Customer> => {
  try {
    const response = await api.patch(`/customers/${id}`, data);
    return mapCustomer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Flip active/inactive. `@Roles('admin')` on the server — gate the control with
 * useAdminOnly('customer.toggleActive') or staff collect a 403 (which is what
 * happens in the app today).
 */
export const toggleCustomerActive = async (id: string): Promise<Customer> => {
  try {
    const response = await api.patch(`/customers/${id}/toggle-active`);
    return mapCustomer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getCustomerInvoices = async (
  customerId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PagedRows<CustomerInvoiceRow>> => {
  try {
    const response = await api.get(`/customers/${customerId}/invoices`, { params });
    return customerInvoicesSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getCustomerPayments = async (
  customerId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PagedRows<CustomerPaymentRow>> => {
  try {
    const response = await api.get(`/customers/${customerId}/payments`, { params });
    return customerPaymentsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * The statement, read from the books: the same postings as the customer's
 * view in the General Ledger, so the two always agree.
 *
 * Both dates are REQUIRED (`@IsDateString()`), in `YYYY-MM-DD`. Omitting
 * either is a 400 VALIDATION_FAILED, not an unbounded statement — which is why
 * the caller always supplies a range rather than treating them as optional.
 */
export const getCustomerStatement = async (
  customerId: string,
  params: { startDate: string; endDate: string },
): Promise<CustomerStatement> => {
  try {
    const response = await api.get(`/customers/${customerId}/ledger-statement`, { params });
    return customerStatementSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * The customer's History: since when, the last invoice and receipt, days to
 * pay, the fiscal year month by month and — for the owner — every change to
 * the record. `year` is the year the fiscal year starts in; omitted, the
 * current one.
 */
export const getCustomerHistory = async (customerId: string, year?: number): Promise<PartyHistory> => {
  try {
    const response = await api.get(`/customers/${customerId}/history`, { params: year ? { year } : {} });
    return partyHistorySerializer(unwrapEnvelope(response.data), 'customer');
  } catch (e) {
    throw toApiError(e);
  }
};
