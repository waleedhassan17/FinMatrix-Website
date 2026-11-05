import { describe, expect, it } from 'vitest';
import {
  contactHealthSerializer,
  lastMessageStatusSerializer,
  messagingSettingsSerializer,
  messagingStatsSerializer,
  timelineSerializer,
} from '@/serializers/messagingSerializer';
import { tickSpec } from '@/models/messaging';
import { formatWhatsappPreview, maskWhatsapp } from '@/features/messaging/whatsappPreview';
import { emptyWhatsappFields, whatsappFieldError, whatsappPayload } from '@/features/messaging/whatsappFields';

describe('messaging serializers', () => {
  it('settings: missing fields fall back to the defaults, quiet hours null stays null', () => {
    const s = messagingSettingsSerializer({ data: { enabled: true, quietHours: null } });
    expect(s.enabled).toBe(true);
    expect(s.quietHours).toBeNull();
    expect(s.eventRules.statement).toBe('off');
    expect(s.reminderSchedule).toEqual({ beforeDue: [3], afterDue: [0, 7, 15, 30] });
    expect(messagingSettingsSerializer({}).enabled).toBe(false);
  });

  it('settings: an unknown rule value is ignored', () => {
    const s = messagingSettingsSerializer({ eventRules: { remittance: 'sometimes' } });
    expect(s.eventRules.remittance).toBe('auto');
  });

  it('timeline: maps every message and its events', () => {
    const [m] = timelineSerializer({
      data: {
        messages: [
          {
            id: 'm1',
            eventLabel: 'Invoice',
            status: 'read',
            toPhoneMasked: '+92312***0176',
            hasMedia: true,
            canResend: false,
            events: [{ status: 'sent', occurredAt: '2026-11-05T10:00:00Z', errorCode: null }],
          },
        ],
      },
    });
    expect(m).toMatchObject({ id: 'm1', status: 'read', hasMedia: true, toPhoneMasked: '+92312***0176' });
    expect(m.events).toHaveLength(1);
  });

  it('lastMessageStatus: null when absent', () => {
    expect(lastMessageStatusSerializer(null)).toBeNull();
    expect(lastMessageStatusSerializer({ status: 'delivered', messageId: 'm' })).toMatchObject({ status: 'delivered' });
  });

  it('stats and contact health tolerate a sparse payload', () => {
    const st = messagingStatsSerializer({ data: { sent: '4', dso: { period: '31.5' } } });
    expect(st.sent).toBe(4);
    expect(st.dso.period).toBe(31.5);
    expect(st.dso.beforeConnect).toBeNull();
    const h = contactHealthSerializer({ data: { contacts: [{ id: 'v', partyType: 'vendor', status: 'weird' }] } });
    expect(h.contacts[0]).toMatchObject({ partyType: 'vendor', status: 'missing' });
  });
});

describe('the plan allowance on the settings', () => {
  it('reads the limit, the use and the month', () => {
    const s = messagingSettingsSerializer({
      data: { enabled: true, allowance: { limit: 200, used: '37', period: '2026-11' } },
    });
    expect(s.allowance).toEqual({ limit: 200, used: 37, period: '2026-11' });
  });

  it('is null from a server that does not send it', () => {
    expect(messagingSettingsSerializer({ data: { enabled: true } }).allowance).toBeNull();
    expect(messagingSettingsSerializer({ data: { allowance: { limit: 'x' } } }).allowance).toBeNull();
  });
});

describe('ticks', () => {
  it('one check sent, two delivered, two in the accent read, alert failed', () => {
    expect(tickSpec('sent')).toMatchObject({ icon: 'check', double: false });
    expect(tickSpec('delivered')).toMatchObject({ icon: 'check', double: true, tone: 'neutral' });
    expect(tickSpec('read')).toMatchObject({ double: true, tone: 'accent' });
    expect(tickSpec('failed')).toMatchObject({ icon: 'alert-circle', tone: 'danger' });
    expect(tickSpec('queued').icon).toBe('clock');
    expect(tickSpec('skipped').tone).toBe('muted');
  });
});

describe('WhatsApp phone preview', () => {
  it.each([
    ['0312-4890176', '+92 312 4890176'],
    ['03441052857', '+92 344 1052857'],
    ['+92 300 1234567', '+92 300 1234567'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('%s reads as %s', (input, expected) => {
    expect(formatWhatsappPreview(input)).toBe(expected);
  });
  it('is null for what cannot be messaged', () => {
    expect(formatWhatsappPreview('12345')).toBeNull();
    expect(formatWhatsappPreview('')).toBeNull();
  });
  it('masks like the server', () => {
    expect(maskWhatsapp('03124890176')).toBe('+92312***0176');
  });
});

describe('WhatsApp form fields', () => {
  it('sends the number only when edited, consent always', () => {
    expect(whatsappPayload(emptyWhatsappFields())).toEqual({ whatsappOptIn: false });
    expect(whatsappPayload({ value: ' 0300 1234567 ', touched: true, optIn: true, language: 'ur' })).toEqual({
      whatsappPhone: '0300 1234567',
      whatsappOptIn: true,
      preferredLanguage: 'ur',
    });
  });
  it('flags an edited number that is not a WhatsApp number, never an untouched one', () => {
    expect(whatsappFieldError({ value: '12345', touched: true, optIn: false, language: '' }, '')).toMatch(/Not a WhatsApp number/);
    expect(whatsappFieldError({ value: '', touched: false, optIn: false, language: '' }, '12345')).toBeNull();
    expect(whatsappFieldError({ value: '03124890176', touched: true, optIn: false, language: '' }, '')).toBeNull();
  });
});

