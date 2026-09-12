// ═══════════════════════════════════════════════════════
// FinMatrix Web — My account: access and subscription
// ═══════════════════════════════════════════════════════
// What the account page says about the person reading it. Pure functions, so
// the wording is tested rather than eyeballed.

import { formatShortDate } from '@/models/reportPeriod';
import type { BillingStatus } from '@/networks/billing/billingNetwork';
import type { FeatureKey, Features } from '@/types';
import { capabilityFor, type Capability } from '@/utils/capabilities';

export interface AccessItem {
  capability: Capability;
  /** What the person can do, in their words rather than the permission's. */
  label: string;
  /** Left out when the company's plan does not include this feature. */
  feature?: FeatureKey;
}

/**
 * One plain-language line per capability. The grouping is NOT stored here: it
 * is read from the capability map, so this card can never claim staff do
 * something directly that the buttons send for approval.
 */
export const STAFF_ACCESS_ITEMS: readonly AccessItem[] = [
  { capability: 'customer.manage', label: 'Add and edit customers' },
  { capability: 'vendor.manage', label: 'Add and edit vendors' },
  { capability: 'estimate.create', label: 'Create estimates', feature: 'estimates' },
  { capability: 'salesOrder.create', label: 'Create sales orders', feature: 'salesOrders' },
  { capability: 'inventory.manageItems', label: 'Add and edit inventory items', feature: 'inventory' },
  { capability: 'stock.receive', label: 'Receive stock', feature: 'inventory' },
  { capability: 'purchaseOrder.updateStatus', label: 'Send and close purchase orders', feature: 'purchaseOrders' },
  { capability: 'delivery.create', label: 'Create deliveries', feature: 'delivery' },
  { capability: 'delivery.assign', label: 'Assign deliveries to riders', feature: 'delivery' },
  { capability: 'delivery.rejectCompletion', label: 'Return failed deliveries to stock', feature: 'delivery' },
  { capability: 'personnel.manage', label: 'Manage riders', feature: 'delivery' },

  { capability: 'invoice.create', label: 'Raise invoices' },
  { capability: 'payment.receive', label: 'Record customer payments' },
  { capability: 'bill.pay', label: 'Pay bills' },
  { capability: 'purchaseOrder.create', label: 'Raise purchase orders', feature: 'purchaseOrders' },
  { capability: 'journal.post', label: 'Post journal entries', feature: 'journalEntries' },
  { capability: 'creditMemo.manage', label: 'Issue credit memos', feature: 'creditMemos' },
  { capability: 'vendorCredit.manage', label: 'Record vendor credits', feature: 'creditMemos' },
  { capability: 'inventory.adjust', label: 'Adjust stock levels', feature: 'inventory' },
  { capability: 'transaction.void', label: 'Void transactions' },
  { capability: 'delivery.undo', label: 'Undo completed deliveries', feature: 'delivery' },

  { capability: 'delivery.approveCompletion', label: 'Sign off completed deliveries', feature: 'delivery' },
  { capability: 'purchaseOrder.edit', label: 'Edit approved purchase orders', feature: 'purchaseOrders' },
  { capability: 'approvals.decide', label: 'Approve requests' },
  { capability: 'users.manage', label: 'Manage the team', feature: 'multiUser' },
  { capability: 'settings.manage', label: 'Change company settings' },
  { capability: 'chartOfAccounts.manage', label: 'Change the chart of accounts' },
  { capability: 'period.close', label: 'Close accounting periods', feature: 'periodClose' },
];

export interface StaffAccessSummary {
  direct: string[];
  request: string[];
  ownerOnly: string[];
}

/**
 * A team member's access, grouped the way it plays out: done straight away,
 * sent to the owner, or the owner's alone.
 *
 * Unknown features count as included, as `useFeature` treats them — the server
 * is still the gate, and a list that flickers empty on load is worse.
 */
export function staffAccessSummary(features: Features | null | undefined): StaffAccessSummary {
  const summary: StaffAccessSummary = { direct: [], request: [], ownerOnly: [] };
  for (const item of STAFF_ACCESS_ITEMS) {
    if (item.feature && features?.[item.feature] === false) continue;
    const outcome = capabilityFor('staff', item.capability);
    if (outcome === 'direct') summary.direct.push(item.label);
    else if (outcome === 'request') summary.request.push(item.label);
    else summary.ownerOnly.push(item.label);
  }
  return summary;
}

export type SubscriptionTone = 'normal' | 'warning' | 'danger';

export interface SubscriptionSummary {
  planLabel: string;
  /** "Active until Jan 1, 2027", "Expired Aug 1, 2026", "No expiry"… */
  renewalLine: string;
  /** "45 days left", or empty when a count would say nothing. */
  daysLeftLabel: string;
  tone: SubscriptionTone;
  /** Offer the renewal flow. */
  shouldRenew: boolean;
  /** A payment proof is with an administrator; paying again would pay twice. */
  pendingReview: boolean;
}

/** Days at or under which the renewal button appears. */
export const RENEW_WINDOW_DAYS = 30;
/** Days at or under which the expiry reads as a warning. */
export const WARNING_DAYS = 14;

const titleCase = (s: string): string =>
  s ? s.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '';

/**
 * The owner's plan in one glance. Plans are paid by bank transfer for a fixed
 * term and never renew on their own, so the line says "active until", not
 * "renews on".
 */
export function subscriptionSummary(status: BillingStatus): SubscriptionSummary {
  const planLabel = status.planLabel || titleCase(status.plan) || 'No plan';
  const pendingReview = status.lastSubmission?.status === 'submitted';
  const rejected = status.lastSubmission?.status === 'rejected';

  if (status.neverExpires) {
    return { planLabel, renewalLine: 'No expiry', daysLeftLabel: '', tone: 'normal', shouldRenew: false, pendingReview };
  }

  const days = status.daysRemaining;
  const expired =
    status.subscriptionStatus === 'expired' || (days !== null && days < 0);

  if (!status.expiryDate) {
    return {
      planLabel,
      renewalLine: 'No active subscription',
      daysLeftLabel: '',
      tone: 'danger',
      shouldRenew: !pendingReview,
      pendingReview,
    };
  }

  // The server sends a full timestamp ("2026-12-11T00:44:17.227Z");
  // formatShortDate takes a calendar date, and given the timestamp it printed
  // the raw string. The date part is the day the term ends.
  const date = formatShortDate(status.expiryDate.slice(0, 10));

  if (expired) {
    return { planLabel, renewalLine: `Expired ${date}`, daysLeftLabel: '', tone: 'danger', shouldRenew: !pendingReview, pendingReview };
  }

  if (days === 0) {
    return { planLabel, renewalLine: `Expires today, ${date}`, daysLeftLabel: '', tone: 'danger', shouldRenew: !pendingReview, pendingReview };
  }

  const tone: SubscriptionTone = days !== null && days <= WARNING_DAYS ? 'warning' : 'normal';
  const inWindow = days !== null && days <= RENEW_WINDOW_DAYS;
  return {
    planLabel,
    renewalLine: `Active until ${date}`,
    daysLeftLabel: days === null ? '' : `${days} ${days === 1 ? 'day' : 'days'} left`,
    tone,
    shouldRenew: !pendingReview && (inWindow || rejected),
    pendingReview,
  };
}
