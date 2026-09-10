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

export interface VendorQueryParams {
  search?: string;
  isActive?: boolean;
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

/** Both dates are required `@IsDateString()` — omitting either is a 400. */
export const getVendorStatement = async (
  vendorId: string,
  params: { startDate: string; endDate: string },
): Promise<VendorStatement> => {
  try {
    const response = await api.get(`/vendors/${vendorId}/statement`, { params });
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
