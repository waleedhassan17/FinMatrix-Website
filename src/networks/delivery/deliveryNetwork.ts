// ═══════════════════════════════════════════════════════
// FinMatrix Web — Delivery Network
// ═══════════════════════════════════════════════════════
// `/deliveries` is `@RequiresFeature('delivery')` end to end — callers gate on
// `useFeature('delivery')`.
//
// Staff and owner share the operational working set: create, assign,
// auto-assign and status changes are all @Roles('admin', 'staff') and direct.
// Only DELETE is owner-only, and only while nothing has been dispatched.
// One exception to "direct": a delivery the customer paid for in advance,
// created by staff, is filed for the owner instead (it records cash in).

import {
  api,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import type {
  Delivery,
  DeliveryHistoryEntry,
  DeliveryIssue,
  DeliveryStatus,
} from '@/models/delivery';
import { listRows } from '@/serializers/inventorySerializer';
import {
  mapDelivery,
  mapHistoryEntry,
  mapIssue,
  mapMonitorData,
  type MonitorData,
} from '@/serializers/deliverySerializer';

/**
 * One fetch, filtered and paged on the client: the response envelope strips
 * the server's paging totals, so a server-paged list could never say how many
 * pages there are.
 */
export const DELIVERY_LIST_LIMIT = 500;

export const getDeliveries = async (params: {
  status?: DeliveryStatus;
  personnelId?: string;
  customerId?: string;
} = {}): Promise<{ rows: Delivery[]; truncated: boolean }> => {
  try {
    const response = await api.get('/deliveries', {
      params: { page: 1, limit: DELIVERY_LIST_LIMIT, ...params },
    });
    const rows = listRows(unwrapEnvelope(response.data)).map(mapDelivery);
    return { rows, truncated: rows.length >= DELIVERY_LIST_LIMIT };
  } catch (e) {
    throw toApiError(e);
  }
};

export const getDelivery = async (id: string): Promise<Delivery> => {
  try {
    const response = await api.get(`/deliveries/${id}`);
    return mapDelivery(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Create a delivery. With a `personnelId` it is dispatched at once: a Sales
 * Order is raised and the stock moves to Goods in Transit, atomically with the
 * delivery. The server refuses before writing anything if stock is short.
 */
/**
 * A 2xx is not always a delivery: a staff member's advance delivery comes back
 * as a pending approval, and nothing — delivery, stock or receipt — exists yet.
 */
export const createDelivery = async (
  body: object,
): Promise<{ pending: false; delivery: Delivery } | { pending: true; approval: PendingApproval }> => {
  try {
    const response = await api.post('/deliveries', body);
    const payload = unwrapEnvelope(response.data);
    return isPendingApproval(payload)
      ? { pending: true, approval: payload }
      : { pending: false, delivery: mapDelivery(payload) };
  } catch (e) {
    throw toApiError(e);
  }
};

/** Assign a batch to one rider — all dispatched, or none (one transaction). */
export const assignDeliveries = async (
  deliveryIds: string[],
  personnelId: string,
  creditOverrideReason?: string,
): Promise<Delivery[]> => {
  try {
    const response = await api.post('/deliveries/assign', {
      deliveryIds,
      personnelId,
      // Dispatch ships on credit: past a customer's limit only the owner may send it.
      ...(creditOverrideReason ? { creditOverride: { reason: creditOverrideReason } } : {}),
    });
    const data = unwrapEnvelope<{ deliveries?: unknown[] }>(response.data);
    return (Array.isArray(data?.deliveries) ? data.deliveries : []).map(mapDelivery);
  } catch (e) {
    throw toApiError(e);
  }
};

/** Give it to the least-loaded rider who is active and available. */
export const autoAssignDelivery = async (id: string): Promise<Delivery> => {
  try {
    const response = await api.post(`/deliveries/${id}/auto-assign`);
    return mapDelivery(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Move a delivery along the server's state machine. From the office this is
 * only ever cancel / failed / returned — each gives the stock back.
 */
export const updateDeliveryStatus = async (
  id: string,
  status: DeliveryStatus,
  notes?: string,
): Promise<Delivery> => {
  try {
    const response = await api.patch(`/deliveries/${id}/status`, {
      status,
      ...(notes ? { notes } : {}),
    });
    return mapDelivery(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Discard an undispatched delivery. Owner only; refused once stock has moved. */
export const deleteDelivery = async (id: string): Promise<void> => {
  try {
    await api.delete(`/deliveries/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getDeliveryHistory = async (id: string): Promise<DeliveryHistoryEntry[]> => {
  try {
    const response = await api.get(`/deliveries/${id}/history`, { params: { limit: 100 } });
    return listRows(unwrapEnvelope(response.data)).map(mapHistoryEntry);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getDeliveryIssues = async (id: string): Promise<DeliveryIssue[]> => {
  try {
    const response = await api.get(`/deliveries/${id}/issues`, { params: { limit: 100 } });
    return listRows(unwrapEnvelope(response.data)).map(mapIssue);
  } catch (e) {
    throw toApiError(e);
  }
};

/** Active deliveries with their destinations and riders' last-known positions. */
export const getDeliveryMonitor = async (): Promise<MonitorData> => {
  try {
    const response = await api.get('/deliveries/map-data');
    return mapMonitorData(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
