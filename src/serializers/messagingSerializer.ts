// FinMatrix Connect — raw API payloads → web models (tolerant of missing fields).
import {
  DEFAULT_EVENT_RULES,
  MESSAGE_EVENTS,
  type ContactHealth,
  type ContactHealthRow,
  type EnqueueResult,
  type EventRule,
  type LastMessageStatus,
  type MessageEvent,
  type MessageStatus,
  type MessagingSettings,
  type MessagingStats,
  type TimelineMessage,
} from '@/models/messaging';

const STATUSES: MessageStatus[] = ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped', 'cancelled'];
const asStatus = (v: unknown): MessageStatus =>
  STATUSES.includes(v as MessageStatus) ? (v as MessageStatus) : 'queued';
const str = (v: unknown, fallback = ''): string => (v === null || v === undefined ? fallback : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `{ success, data }` or the bare payload. */
export const unwrap = (payload: any): any => (payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload);

export function lastMessageStatusSerializer(raw: any): LastMessageStatus | null {
  if (!raw || typeof raw !== 'object' || !raw.status) return null;
  return {
    messageId: str(raw.messageId),
    status: asStatus(raw.status),
    eventType: str(raw.eventType),
    channel: str(raw.channel, 'whatsapp_api'),
    updatedAt: str(raw.updatedAt),
    lastError: strOrNull(raw.lastError),
  };
}

export function messagingSettingsSerializer(payload: any): MessagingSettings {
  const raw = unwrap(payload) ?? {};
  const rules = { ...DEFAULT_EVENT_RULES };
  for (const e of MESSAGE_EVENTS) {
    const r = raw.eventRules?.[e];
    if (r === 'auto' || r === 'manual' || r === 'off') rules[e as MessageEvent] = r as EventRule;
  }
  const q = raw.quietHours;
  return {
    enabled: raw.enabled === true,
    enabledAt: strOrNull(raw.enabledAt),
    senderMode: raw.senderMode === 'own' ? 'own' : 'shared',
    phoneNumberId: strOrNull(raw.phoneNumberId),
    wabaId: strOrNull(raw.wabaId),
    accessTokenSet: raw.accessTokenSet === true,
    accessTokenMasked: strOrNull(raw.accessTokenMasked),
    defaultLanguage: raw.defaultLanguage === 'ur' ? 'ur' : 'en',
    eventRules: rules,
    quietHours: q && q.start && q.end ? { start: str(q.start), end: str(q.end) } : null,
    reminderSchedule: {
      beforeDue: Array.isArray(raw.reminderSchedule?.beforeDue) ? raw.reminderSchedule.beforeDue.map(num) : [3],
      afterDue: Array.isArray(raw.reminderSchedule?.afterDue) ? raw.reminderSchedule.afterDue.map(num) : [0, 7, 15, 30],
    },
    monthlyCap: numOrNull(raw.monthlyCap),
    contactsOptInConfirmedAt: strOrNull(raw.contactsOptInConfirmedAt),
    timezone: str(raw.timezone, 'Asia/Karachi'),
    providerMode: raw.providerMode === 'live' ? 'live' : 'simulated',
  };
}

export function timelineSerializer(payload: any): TimelineMessage[] {
  const raw = unwrap(payload);
  const list: any[] = Array.isArray(raw?.messages) ? raw.messages : Array.isArray(raw) ? raw : [];
  return list.map(m => ({
    id: str(m.id),
    eventType: str(m.eventType),
    eventLabel: str(m.eventLabel, 'WhatsApp message'),
    docType: str(m.docType),
    docId: str(m.docId),
    channel: m.channel === 'wa_link' ? 'wa_link' : 'whatsapp_api',
    recipientName: strOrNull(m.recipientName),
    toPhoneMasked: strOrNull(m.toPhoneMasked),
    status: asStatus(m.status),
    reasonCode: strOrNull(m.reasonCode),
    reason: strOrNull(m.reason),
    attempts: num(m.attempts),
    scheduledFor: strOrNull(m.scheduledFor),
    createdAt: str(m.createdAt),
    updatedAt: str(m.updatedAt),
    hasMedia: m.hasMedia === true,
    preview: strOrNull(m.preview),
    canResend: m.canResend === true,
    events: Array.isArray(m.events)
      ? m.events.map((e: any) => ({ status: str(e.status), occurredAt: str(e.occurredAt), errorCode: strOrNull(e.errorCode) }))
      : [],
  }));
}

export function enqueueResultSerializer(payload: any): EnqueueResult {
  const raw = unwrap(payload) ?? {};
  return {
    id: str(raw.id),
    status: asStatus(raw.status),
    skipReason: strOrNull(raw.skipReason),
    duplicate: raw.duplicate === true,
  };
}

export function messagingStatsSerializer(payload: any): MessagingStats {
  const raw = unwrap(payload) ?? {};
  return {
    from: str(raw.from),
    to: str(raw.to),
    sent: num(raw.sent),
    delivered: num(raw.delivered),
    read: num(raw.read),
    failed: num(raw.failed),
    skipped: num(raw.skipped),
    queued: num(raw.queued),
    remindersSent: num(raw.remindersSent),
    invoicesPaidWithin7DaysOfReminder: num(raw.invoicesPaidWithin7DaysOfReminder),
    dso: {
      period: numOrNull(raw.dso?.period),
      beforeConnect: numOrNull(raw.dso?.beforeConnect),
      enabledAt: strOrNull(raw.dso?.enabledAt),
    },
    usage: { period: str(raw.usage?.period), count: num(raw.usage?.count), cap: numOrNull(raw.usage?.cap) },
    recentReminders: Array.isArray(raw.recentReminders)
      ? raw.recentReminders.map((r: any) => ({
          messageId: str(r.messageId),
          invoiceId: str(r.invoiceId),
          invoiceNumber: str(r.invoiceNumber),
          customerName: str(r.customerName),
          eventType: str(r.eventType),
          status: asStatus(r.status),
          reason: strOrNull(r.reason),
          sentAt: str(r.sentAt),
          balance: str(r.balance),
          outcome: r.outcome === 'paid' || r.outcome === 'void' ? r.outcome : 'open',
        }))
      : [],
  };
}

const CONTACT_STATUSES: ContactHealthRow['status'][] = [
  'ready',
  'unverified',
  'no_consent',
  'missing',
  'invalid',
  'not_on_whatsapp',
  'opted_out',
];

export function contactHealthSerializer(payload: any): ContactHealth {
  const raw = unwrap(payload) ?? {};
  const s = raw.summary ?? {};
  return {
    summary: {
      total: num(s.total),
      ready: num(s.ready),
      unverified: num(s.unverified),
      noConsent: num(s.noConsent),
      missing: num(s.missing),
      invalid: num(s.invalid),
      notOnWhatsapp: num(s.notOnWhatsapp),
      optedOut: num(s.optedOut),
    },
    contacts: Array.isArray(raw.contacts)
      ? raw.contacts.map((c: any) => ({
          partyType: c.partyType === 'vendor' ? 'vendor' : 'customer',
          id: str(c.id),
          code: strOrNull(c.code),
          name: str(c.name),
          phone: strOrNull(c.phone),
          whatsappE164: strOrNull(c.whatsappE164),
          status: CONTACT_STATUSES.includes(c.status) ? c.status : 'missing',
          optInAt: strOrNull(c.optInAt),
          verifiedAt: strOrNull(c.verifiedAt),
        }))
      : [],
  };
}
