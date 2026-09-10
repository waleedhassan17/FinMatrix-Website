// ═══════════════════════════════════════════════════════
// FinMatrix Web — Notifications Network
// ═══════════════════════════════════════════════════════
// This controller carries no CompanyGuard, so it keeps working while the
// company is inactive or its subscription has lapsed. Tenancy is the user id
// from the JWT. That makes it safe to poll from the account-status screen.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface RawNotification extends Partial<Notification> {
  message?: string;
  read?: boolean;
}

const serialize = (raw: RawNotification): Notification => ({
  id: String(raw.id ?? ''),
  title: raw.title ?? '',
  body: raw.body ?? raw.message ?? '',
  type: raw.type ?? 'info',
  isRead: raw.isRead ?? raw.read ?? false,
  createdAt: raw.createdAt ?? new Date().toISOString(),
});

export const fetchNotifications = async (params?: {
  isRead?: boolean;
  page?: number;
  limit?: number;
}): Promise<Notification[]> => {
  try {
    const response = await api.get('/notifications', { params });
    const data = unwrapEnvelope<RawNotification[] | { data?: RawNotification[] }>(
      response.data,
    );
    const rows = Array.isArray(data) ? data : (data?.data ?? []);
    return rows.map(serialize);
  } catch (e) {
    throw toApiError(e);
  }
};

export const fetchUnreadCount = async (): Promise<number> => {
  try {
    const response = await api.get('/notifications/unread-count');
    const data = unwrapEnvelope<{ count?: number } | number>(response.data);
    return typeof data === 'number' ? data : (data?.count ?? 0);
  } catch (e) {
    throw toApiError(e);
  }
};

// Both mark endpoints are PATCH. The build document had read-all as POST —
// it is not, and a POST there 404s.
export const markNotificationRead = async (id: string): Promise<void> => {
  try {
    await api.patch(`/notifications/${id}/read`);
  } catch (e) {
    throw toApiError(e);
  }
};

export const markAllNotificationsRead = async (): Promise<void> => {
  try {
    await api.patch('/notifications/read-all');
  } catch (e) {
    throw toApiError(e);
  }
};
