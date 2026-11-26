import { describe, expect, it } from 'vitest';

import { daysUntil, trialDaysLeft } from '@/models/trial';
import type { SubscriptionSummary } from '@/types';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const plus = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();
const sub = (over: Partial<SubscriptionSummary> = {}): SubscriptionSummary => ({
  plan: 'warehouse_trial',
  planLabel: 'Free trial — 30 days',
  expiryDate: plus(30),
  paymentStatus: 'none',
  isTrial: true,
  trialStartedAt: NOW.toISOString(),
  trialConvertedAt: null,
  ...over,
});

describe('daysUntil', () => {
  // NOW is 12:00 UTC = 17:00 in Karachi (UTC+5, no daylight saving).
  it('counts Asia/Karachi calendar days, as the server reminders do', () => {
    expect(daysUntil(plus(30), NOW)).toBe(30);
    // Later today in Karachi (23:59 PKT): today is the last day.
    expect(daysUntil('2026-09-15T18:59:00.000Z', NOW)).toBe(0);
    // Still the 15th in UTC, but already the 16th in Karachi (00:30 PKT).
    expect(daysUntil('2026-09-15T19:30:00.000Z', NOW)).toBe(1);
  });
  it('turns over at Karachi midnight, not UTC midnight', () => {
    const ends = '2026-09-16T10:00:00.000Z'; // 15:00 PKT on the 16th
    expect(daysUntil(ends, new Date('2026-09-15T18:59:00.000Z'))).toBe(1); // 23:59 PKT on the 15th
    expect(daysUntil(ends, new Date('2026-09-15T19:01:00.000Z'))).toBe(0); // 00:01 PKT on the 16th
    // A UTC-midnight crossing changes nothing in Karachi (05:00 PKT both sides).
    expect(daysUntil(ends, new Date('2026-09-15T23:59:00.000Z'))).toBe(0);
    expect(daysUntil(ends, new Date('2026-09-16T00:01:00.000Z'))).toBe(0);
  });
  it('is 0 once passed and null when unknown', () => {
    expect(daysUntil(plus(-2), NOW)).toBe(0);
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('garbage', NOW)).toBeNull();
  });
});

describe('trialDaysLeft', () => {
  it('counts down a running trial', () => {
    expect(trialDaysLeft(sub(), NOW)).toBe(30);
  });
  it('is 0 (not null) on the last day, while the trial still runs', () => {
    expect(trialDaysLeft(sub({ expiryDate: '2026-09-15T18:00:00.000Z' }), NOW)).toBe(0);
  });
  it('is null once converted, when never trialed, or once over', () => {
    expect(trialDaysLeft(sub({ trialConvertedAt: NOW.toISOString() }), NOW)).toBeNull();
    expect(trialDaysLeft(sub({ isTrial: false }), NOW)).toBeNull();
    expect(trialDaysLeft(sub({ expiryDate: plus(-0.01) }), NOW)).toBeNull();
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
});
