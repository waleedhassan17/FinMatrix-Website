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
  it('rounds a partial day up, like the server', () => {
    expect(daysUntil(plus(0.1), NOW)).toBe(1);
    expect(daysUntil(plus(30), NOW)).toBe(30);
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
  it('is null once converted, when never trialed, or once over', () => {
    expect(trialDaysLeft(sub({ trialConvertedAt: NOW.toISOString() }), NOW)).toBeNull();
    expect(trialDaysLeft(sub({ isTrial: false }), NOW)).toBeNull();
    expect(trialDaysLeft(sub({ expiryDate: plus(-0.01) }), NOW)).toBeNull();
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
});
