import { describe, expect, it } from 'vitest';

import {
  STAFF_ACCESS_ITEMS,
  staffAccessSummary,
  subscriptionSummary,
} from '@/models/accountAccess';
import { formatShortDate } from '@/models/reportPeriod';
import type { BillingStatus } from '@/networks/billing/billingNetwork';
import { ALL_CAPABILITIES, capabilityFor } from '@/utils/capabilities';

describe('STAFF_ACCESS_ITEMS', () => {
  it('describes every capability exactly once', () => {
    const covered = STAFF_ACCESS_ITEMS.map((i) => i.capability);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...ALL_CAPABILITIES].sort());
  });
});

describe('staffAccessSummary', () => {
  it('groups by what the capability map says happens for staff', () => {
    const summary = staffAccessSummary(null);
    const labelOf = (outcome: 'direct' | 'request' | false) =>
      STAFF_ACCESS_ITEMS.filter((i) => capabilityFor('staff', i.capability) === outcome).map((i) => i.label);
    expect(summary.direct).toEqual(labelOf('direct'));
    expect(summary.request).toEqual(labelOf('request'));
    expect(summary.ownerOnly).toEqual(labelOf(false));
    expect(summary.request).toContain('Raise invoices');
    expect(summary.direct).toContain('Add and edit customers');
    expect(summary.ownerOnly).toContain('Approve requests');
  });

  it('leaves out what the plan does not include', () => {
    const summary = staffAccessSummary({ delivery: false, purchaseOrders: false, inventory: true });
    const all = [...summary.direct, ...summary.request, ...summary.ownerOnly];
    expect(all).not.toContain('Create deliveries');
    expect(all).not.toContain('Sign off completed deliveries');
    expect(all).not.toContain('Raise purchase orders');
    expect(all).toContain('Receive stock');
  });
});

const base: BillingStatus = {
  plan: 'warehouse',
  planLabel: 'Warehouse',
  accountStatus: 'active',
  subscriptionStatus: 'active',
  paymentStatus: 'approved',
  expiryDate: '2027-01-01',
  daysRemaining: 45,
  neverExpires: false,
  priceLabel: '',
  deliveryPersonnelLimit: 10,
  lastSubmission: null,
  isTrial: false,
  trialRequestedAt: null,
  trialStartedAt: null,
  trialConvertedAt: null,
  trialDaysRemaining: null,
  trialPending: false,
};

describe('subscriptionSummary', () => {
  const trial: BillingStatus = {
    ...base,
    plan: 'warehouse_trial',
    planLabel: 'Free trial — 30 days',
    paymentStatus: 'none',
    daysRemaining: 30,
    isTrial: true,
    trialStartedAt: '2026-12-02T00:00:00.000Z',
    trialDaysRemaining: 30,
  };

  it('reads a running trial as a trial and offers to subscribe at once', () => {
    expect(subscriptionSummary(trial)).toMatchObject({
      renewalLine: `Free trial until ${formatShortDate('2027-01-01')}`,
      trialing: true,
      shouldRenew: true,
    });
  });

  it('does not offer to pay twice while a trialist’s payment is in review', () => {
    const s = subscriptionSummary({
      ...trial,
      lastSubmission: { id: 'p1', plan: 'warehouse_starter_6mo', planLabel: 'Starter', kind: 'NEW', status: 'submitted', rejectionReason: null, createdAt: '' },
    });
    expect(s).toMatchObject({ pendingReview: true, shouldRenew: false, trialing: true });
  });

  it('says the trial ended once it lapses', () => {
    expect(subscriptionSummary({ ...trial, daysRemaining: -2, subscriptionStatus: 'expired' })).toMatchObject({
      renewalLine: `Trial ended ${formatShortDate('2027-01-01')}`,
      tone: 'danger',
      trialing: true,
    });
  });

  it('treats a converted trial as an ordinary paid plan', () => {
    const s = subscriptionSummary({ ...base, isTrial: true, trialConvertedAt: '2026-12-20T00:00:00.000Z' });
    expect(s).toMatchObject({ trialing: false, renewalLine: `Active until ${formatShortDate('2027-01-01')}`, shouldRenew: false });
  });

  it('reads a healthy plan plainly, with no renewal prompt', () => {
    expect(subscriptionSummary(base)).toEqual({
      planLabel: 'Warehouse',
      renewalLine: `Active until ${formatShortDate('2027-01-01')}`,
      daysLeftLabel: '45 days left',
      tone: 'normal',
      shouldRenew: false,
      pendingReview: false,
      trialing: false,
    });
  });

  it('formats the timestamp the server actually sends as a date', () => {
    const s = subscriptionSummary({ ...base, expiryDate: '2026-12-11T00:44:17.227Z', daysRemaining: 90 });
    expect(s.renewalLine).toBe(`Active until ${formatShortDate('2026-12-11')}`);
    expect(s.renewalLine).not.toContain('T00');
  });

  it('offers renewal inside 30 days and warns inside 14', () => {
    expect(subscriptionSummary({ ...base, daysRemaining: 25 })).toMatchObject({ tone: 'normal', shouldRenew: true });
    expect(subscriptionSummary({ ...base, daysRemaining: 10 })).toMatchObject({ tone: 'warning', shouldRenew: true, daysLeftLabel: '10 days left' });
    expect(subscriptionSummary({ ...base, daysRemaining: 1 }).daysLeftLabel).toBe('1 day left');
  });

  it('marks an expired or same-day plan as danger', () => {
    expect(subscriptionSummary({ ...base, daysRemaining: -3, subscriptionStatus: 'expired' })).toMatchObject({
      renewalLine: `Expired ${formatShortDate('2027-01-01')}`,
      tone: 'danger',
      shouldRenew: true,
    });
    expect(subscriptionSummary({ ...base, daysRemaining: 0 })).toMatchObject({ tone: 'danger', shouldRenew: true });
  });

  it('never offers to pay twice while a proof is under review', () => {
    const s = subscriptionSummary({
      ...base,
      daysRemaining: 5,
      lastSubmission: { id: 'p1', plan: 'warehouse', planLabel: 'Warehouse', kind: 'RENEWAL', status: 'submitted', rejectionReason: null, createdAt: '' },
    });
    expect(s).toMatchObject({ pendingReview: true, shouldRenew: false });
  });

  it('offers renewal again after a rejected proof', () => {
    const s = subscriptionSummary({
      ...base,
      lastSubmission: { id: 'p1', plan: 'warehouse', planLabel: 'Warehouse', kind: 'RENEWAL', status: 'rejected', rejectionReason: 'Blurry', createdAt: '' },
    });
    expect(s.shouldRenew).toBe(true);
  });

  it('handles no expiry and no subscription at all', () => {
    expect(subscriptionSummary({ ...base, neverExpires: true, expiryDate: null, daysRemaining: null })).toMatchObject({
      renewalLine: 'No expiry',
      shouldRenew: false,
    });
    expect(subscriptionSummary({ ...base, expiryDate: null, daysRemaining: null, planLabel: '', plan: 'small_business' })).toMatchObject({
      planLabel: 'Small business',
      renewalLine: 'No active subscription',
      tone: 'danger',
      shouldRenew: true,
    });
  });
});
