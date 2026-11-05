// ═══════════════════════════════════════════════════════
// FinMatrix Connect — WhatsApp delivery (server-sent).
// Shapes and vocabulary from CONNECT_API_CONTRACT.md.
// ═══════════════════════════════════════════════════════

export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export const MESSAGE_EVENTS = [
  'invoice_issued',
  'invoice_revised',
  'invoice_cancelled',
  'payment_received',
  'po_issued',
  'po_cancelled',
  'remittance',
  'approval_pending',
  'reminder_upcoming',
  'reminder_overdue',
  'statement',
  'delivery_update',
] as const;
export type MessageEvent = (typeof MESSAGE_EVENTS)[number];

export type EventRule = 'auto' | 'manual' | 'off';
export type MessageDocType =
  | 'invoice'
  | 'payment'
  | 'purchase_order'
  | 'bill_payment'
  | 'bill_settlement'
  | 'customer_statement'
  | 'approval_request'
  | 'delivery';
export type SendableDocType = 'invoice' | 'payment' | 'purchase_order' | 'bill_payment' | 'customer_statement';

export interface LastMessageStatus {
  messageId: string;
  status: MessageStatus;
  eventType: string;
  channel: string;
  updatedAt: string;
  lastError: string | null;
}

export interface QuietHours {
  start: string;
  end: string;
}

export interface MessagingSettings {
  enabled: boolean;
  enabledAt: string | null;
  senderMode: 'shared' | 'own';
  phoneNumberId: string | null;
  wabaId: string | null;
  accessTokenSet: boolean;
  accessTokenMasked: string | null;
  defaultLanguage: 'en' | 'ur';
  eventRules: Record<MessageEvent, EventRule>;
  quietHours: QuietHours | null;
  reminderSchedule: { beforeDue: number[]; afterDue: number[] };
  monthlyCap: number | null;
  contactsOptInConfirmedAt: string | null;
  timezone: string;
  providerMode: 'simulated' | 'live';
}

export interface MessageStatusEventEntry {
  status: string;
  occurredAt: string;
  errorCode: string | null;
}

export interface TimelineMessage {
  id: string;
  eventType: string;
  eventLabel: string;
  docType: string;
  docId: string;
  channel: 'whatsapp_api' | 'wa_link';
  recipientName: string | null;
  toPhoneMasked: string | null;
  status: MessageStatus;
  reasonCode: string | null;
  reason: string | null;
  attempts: number;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  hasMedia: boolean;
  preview: string | null;
  canResend: boolean;
  events: MessageStatusEventEntry[];
}

export interface EnqueueResult {
  id: string;
  status: MessageStatus;
  skipReason: string | null;
  duplicate: boolean;
}

export interface RecentReminder {
  messageId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  eventType: string;
  status: MessageStatus;
  reason: string | null;
  sentAt: string;
  balance: string;
  outcome: 'paid' | 'open' | 'void';
}

export interface MessagingStats {
  from: string;
  to: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  queued: number;
  remindersSent: number;
  invoicesPaidWithin7DaysOfReminder: number;
  dso: { period: number | null; beforeConnect: number | null; enabledAt: string | null };
  usage: { period: string; count: number; cap: number | null };
  recentReminders: RecentReminder[];
}

export type ContactStatus =
  | 'ready'
  | 'unverified'
  | 'no_consent'
  | 'missing'
  | 'invalid'
  | 'not_on_whatsapp'
  | 'opted_out';

export interface ContactHealthRow {
  partyType: 'customer' | 'vendor';
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  whatsappE164: string | null;
  status: ContactStatus;
  optInAt: string | null;
  verifiedAt: string | null;
}

export interface ContactHealth {
  summary: {
    total: number;
    ready: number;
    unverified: number;
    noConsent: number;
    missing: number;
    invalid: number;
    notOnWhatsapp: number;
    optedOut: number;
  };
  contacts: ContactHealthRow[];
}

// ─── Words ──────────────────────────────────────────────

export const EVENT_LABELS: Record<MessageEvent, string> = {
  invoice_issued: 'Invoice sent',
  invoice_revised: 'Invoice revised',
  invoice_cancelled: 'Invoice cancelled',
  payment_received: 'Payment receipt',
  po_issued: 'Purchase order sent',
  po_cancelled: 'Purchase order withdrawn',
  remittance: 'Remittance advice',
  approval_pending: 'Approval alert to owners',
  reminder_upcoming: 'Reminder before the due date',
  reminder_overdue: 'Overdue reminder',
  statement: 'Monthly statement',
  delivery_update: 'Delivery updates',
};

export const RULE_LABELS: Record<EventRule, string> = {
  auto: 'Automatic',
  manual: 'Ask each time',
  off: 'Off',
};

/** Ticks as words, for screen readers and the timeline. */
export const STATUS_WORDS: Record<MessageStatus, string> = {
  queued: 'Waiting to send',
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not delivered',
  skipped: 'Not sent',
  cancelled: 'Cancelled',
};

export const CONTACT_STATUS_WORDS: Record<ContactStatus, string> = {
  ready: 'Ready',
  unverified: 'Ready',
  no_consent: 'No consent',
  missing: 'No number',
  invalid: 'No number',
  not_on_whatsapp: 'Not on WhatsApp',
  opted_out: 'Opted out',
};

/** What the tick shows: icon, one or two checks, and its tone. */
export function tickSpec(status: MessageStatus): {
  icon: 'clock' | 'check' | 'alert-circle' | 'minus-circle' | 'x-circle';
  double: boolean;
  tone: 'muted' | 'neutral' | 'accent' | 'danger';
} {
  switch (status) {
    case 'queued':
    case 'sending':
      return { icon: 'clock', double: false, tone: 'neutral' };
    case 'sent':
      return { icon: 'check', double: false, tone: 'neutral' };
    case 'delivered':
      return { icon: 'check', double: true, tone: 'neutral' };
    case 'read':
      return { icon: 'check', double: true, tone: 'accent' };
    case 'failed':
      return { icon: 'alert-circle', double: false, tone: 'danger' };
    case 'cancelled':
      return { icon: 'x-circle', double: false, tone: 'muted' };
    case 'skipped':
    default:
      return { icon: 'minus-circle', double: false, tone: 'muted' };
  }
}

/** Still moving: worth polling the timeline for. */
export const isInFlight = (s: MessageStatus) => s === 'queued' || s === 'sending' || s === 'sent';

export const DEFAULT_EVENT_RULES: Record<MessageEvent, EventRule> = {
  invoice_issued: 'auto',
  invoice_revised: 'auto',
  invoice_cancelled: 'auto',
  payment_received: 'auto',
  po_issued: 'auto',
  po_cancelled: 'auto',
  remittance: 'auto',
  approval_pending: 'auto',
  reminder_upcoming: 'auto',
  reminder_overdue: 'auto',
  statement: 'off',
  delivery_update: 'off',
};
