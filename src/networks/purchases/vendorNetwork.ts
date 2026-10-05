// ═══════════════════════════════════════════════════════
// FinMatrix Web — Vendor Network
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  mapVendor,
  vendorBillsSerializer,
  vendorListSerializer,
  vendorPaymentsSerializer,
  vendorSingleSerializer,
  vendorStatementSerializer,
  type PagedRows,
  type SerializedVendorList,
  type VendorBillRow,
  type VendorPaymentRow,
  type VendorStatement,
  type VendorWritePayload,
} from '@/serializers/vendorSerializer';
import type { Vendor } from '@/models/vendor';
import type { PartyHistory } from '@/models/partyHistory';
import { partyHistorySerializer } from '@/serializers/partyHistorySerializer';
import type { PartyListSort } from '@/networks/sales/customerNetwork';

/** Filtered, searched (ID, company, contact, email, phone) and sorted by the server. */
export interface VendorQueryParams {
  search?: string;
  isActive?: boolean;
  /** Server order; `code` is natural (V-2 before V-10). Default newest first. */
  sort?: PartyListSort;
  page?: number;
  limit?: number;
}

export const getVendors = async (
  params: VendorQueryParams = {},
): Promise<SerializedVendorList> => {
  try {
    const response = await api.get('/vendors', { params });
    return vendorListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The ID the next new vendor would get — for the form's placeholder, not a reservation. */
export const getNextVendorCode = async (): Promise<string> => {
  try {
    const response = await api.get('/vendors/next-code');
    return String((unwrapEnvelope(response.data) as { code?: string })?.code ?? '');
  } catch (e) {
    throw toApiError(e);
  }
};

export const getVendorById = async (id: string): Promise<Vendor | null> => {
  try {
    const response = await api.get(`/vendors/${id}`);
    return vendorSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createVendor = async (
  data: VendorWritePayload,
): Promise<Vendor> => {
  try {
    const response = await api.post('/vendors', data);
    return mapVendor(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateVendor = async (
  id: string,
  data: Partial<VendorWritePayload>,
): Promise<Vendor> => {
  try {
    const response = await api.patch(`/vendors/${id}`, data);
    return mapVendor(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** `@Roles('admin')` — gate with useAdminOnly or staff collect a 403. */
export const toggleVendorActive = async (id: string): Promise<Vendor> => {
  try {
    const response = await api.patch(`/vendors/${id}/toggle-active`);
    return mapVendor(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getVendorBills = async (
  vendorId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PagedRows<VendorBillRow>> => {
  try {
    const response = await api.get(`/vendors/${vendorId}/bills`, { params });
    return vendorBillsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getVendorPayments = async (
  vendorId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PagedRows<VendorPaymentRow>> => {
  try {
    const response = await api.get(`/vendors/${vendorId}/payments`, { params });
    return vendorPaymentsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * The statement, read from the books — the same postings as the vendor's view
 * in the General Ledger. Both dates are required `@IsDateString()` — omitting
 * either is a 400.
 */
export const getVendorStatement = async (
  vendorId: string,
  params: { startDate: string; endDate: string },
): Promise<VendorStatement> => {
  try {
    const response = await api.get(`/vendors/${vendorId}/ledger-statement`, { params });
    return vendorStatementSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Admin only, and refused once the vendor has any history at all — bills,
 * payments or a non-zero balance return `VENDOR_HAS_ACTIVITY` telling you to
 * deactivate instead. The UI leads with deactivate for that reason.
 */
export const deleteVendor = async (id: string): Promise<void> => {
  try {
    await api.delete(`/vendors/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};

/** The vendor's History — see getCustomerHistory. */
export const getVendorHistory = async (vendorId: string, year?: number): Promise<PartyHistory> => {
  try {
    const response = await api.get(`/vendors/${vendorId}/history`, { params: year ? { year } : {} });
    return partyHistorySerializer(unwrapEnvelope(response.data), 'vendor');
  } catch (e) {
    throw toApiError(e);
  }
};
