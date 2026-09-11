// ═══════════════════════════════════════════════════════
// FinMatrix Web — Delivery Personnel Network
// ═══════════════════════════════════════════════════════
// Riders. Onboarding one is a staff operation (personnel.manage = direct): the
// owner should not be the bottleneck for putting someone on a route.
//
// Riders sign in with a username and password the office issues — they have
// no inbox, so there is no self-service reset. Both the create and the reset
// return the credentials ONCE; the server also keeps an encrypted copy that
// can be revealed again, and every reveal is audited.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { Rider, RiderStatus } from '@/models/delivery';
import { listRows } from '@/serializers/inventorySerializer';
import { mapRider } from '@/serializers/deliverySerializer';

export interface RiderCredentials {
  username: string;
  password: string;
}

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

const readCredentials = (data: unknown): RiderCredentials | null => {
  const c = asRaw(asRaw(data).credentials);
  return c.username && c.password
    ? { username: String(c.username), password: String(c.password) }
    : null;
};

export const getRiders = async (params: { status?: RiderStatus } = {}): Promise<Rider[]> => {
  try {
    const response = await api.get('/delivery-personnel', {
      params: { page: 1, limit: 200, ...params },
    });
    return listRows(unwrapEnvelope(response.data)).map(mapRider);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getRider = async (userId: string): Promise<Rider> => {
  try {
    const response = await api.get(`/delivery-personnel/${userId}`);
    return mapRider(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createRider = async (
  body: Record<string, unknown>,
): Promise<{ userId: string; credentials: RiderCredentials | null }> => {
  try {
    const response = await api.post('/delivery-personnel', body);
    const data = unwrapEnvelope(response.data);
    return { userId: String(asRaw(data).userId ?? ''), credentials: readCredentials(data) };
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateRider = async (
  userId: string,
  body: {
    vehicleType?: string;
    vehicleNumber?: string;
    zones?: string[];
    maxLoad?: string;
    status?: RiderStatus;
  },
): Promise<void> => {
  try {
    await api.patch(`/delivery-personnel/${userId}`, body);
  } catch (e) {
    throw toApiError(e);
  }
};

export const toggleRiderAvailability = async (userId: string): Promise<void> => {
  try {
    await api.patch(`/delivery-personnel/${userId}/availability`);
  } catch (e) {
    throw toApiError(e);
  }
};

/** Issue a new password. Returned once — the old one stops working at once. */
export const resetRiderPassword = async (userId: string): Promise<RiderCredentials | null> => {
  try {
    const response = await api.post(`/delivery-personnel/${userId}/reset-password`);
    return readCredentials(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Show the stored credentials again. The server writes an audit row on every
 * call, so this is fetched only when someone asks — never on page load.
 * `password` is null when nothing was stored or the key has rotated.
 */
export const revealRiderCredential = async (
  userId: string,
): Promise<{ username: string; password: string | null }> => {
  try {
    const response = await api.get(`/delivery-personnel/${userId}/credential`);
    const d = asRaw(unwrapEnvelope(response.data));
    return {
      username: String(d.username ?? ''),
      password: d.password ? String(d.password) : null,
    };
  } catch (e) {
    throw toApiError(e);
  }
};
