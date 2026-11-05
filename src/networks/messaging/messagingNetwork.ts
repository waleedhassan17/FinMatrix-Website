// FinMatrix Connect — WhatsApp delivery API (see CONNECT_API_CONTRACT.md).
import { api, authedBlob, toApiError } from '@/networks/network/apiHelpers';
import {
  contactHealthSerializer,
  enqueueResultSerializer,
  messagingSettingsSerializer,
  messagingStatsSerializer,
  timelineSerializer,
} from '@/serializers/messagingSerializer';
import type {
  ContactHealth,
  EnqueueResult,
  EventRule,
  MessageEvent,
  MessagingSettings,
  MessagingStats,
  QuietHours,
  SendableDocType,
  TimelineMessage,
} from '@/models/messaging';

export interface MessagingSettingsPatch {
  enabled?: boolean;
  defaultLanguage?: 'en' | 'ur';
  eventRules?: Partial<Record<MessageEvent, EventRule>>;
  quietHours?: QuietHours | null;
  reminderSchedule?: { beforeDue: number[]; afterDue: number[] };
  monthlyCap?: number | null;
}

async function call<T>(fn: () => Promise<{ data: unknown }>, map: (d: unknown) => T): Promise<T> {
  try {
    const res = await fn();
    return map(res.data);
  } catch (e) {
    throw toApiError(e);
  }
}

export const getMessagingSettings = (): Promise<MessagingSettings> =>
  call(() => api.get('/settings/messaging'), messagingSettingsSerializer);

export const updateMessagingSettings = (patch: MessagingSettingsPatch): Promise<MessagingSettings> =>
  call(() => api.put('/settings/messaging', patch), messagingSettingsSerializer);

export const sendTestMessage = (): Promise<EnqueueResult> =>
  call(() => api.post('/settings/messaging/test', {}), enqueueResultSerializer);

export const confirmContactsConsent = (): Promise<MessagingSettings> =>
  call(() => api.post('/settings/messaging/confirm-contacts-consent', {}), messagingSettingsSerializer);

export const getMessageTimeline = (docType: string, docId: string): Promise<TimelineMessage[]> =>
  call(() => api.get('/messages', { params: { docType, docId } }), timelineSerializer);

export const resendMessage = (messageId: string): Promise<EnqueueResult> =>
  call(() => api.post(`/messages/${messageId}/resend`, {}), enqueueResultSerializer);

export const sendMessage = (body: {
  docType: SendableDocType;
  docId: string;
  event?: string;
  startDate?: string;
  endDate?: string;
}): Promise<EnqueueResult> => call(() => api.post('/messages/send', body), enqueueResultSerializer);

export const logManualShare = (body: {
  docType: SendableDocType;
  docId: string;
  toPhone: string;
  event?: string;
}): Promise<EnqueueResult> => call(() => api.post('/messages/manual-share', body), enqueueResultSerializer);

export const getMessagingStats = (from?: string, to?: string): Promise<MessagingStats> =>
  call(() => api.get('/messages/stats', { params: { from, to } }), messagingStatsSerializer);

export const getContactHealth = (filter?: {
  partyType: 'customer' | 'vendor';
  partyId: string;
}): Promise<ContactHealth> =>
  call(() => api.get('/messages/contact-health', { params: filter ?? {} }), contactHealthSerializer);

/** The PDF exactly as it was sent ("View PDF sent"). */
export const getMessageMedia = (messageId: string): Promise<Blob> => authedBlob(`/messages/${messageId}/media`);
