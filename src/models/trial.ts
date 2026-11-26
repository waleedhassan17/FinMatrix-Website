// ═══════════════════════════════════════════════════════
// FinMatrix Web — Free trial helpers
// ═══════════════════════════════════════════════════════
// Pure, so the shell strip and the pages answer "is this company trialing, and
// for how long?" identically — and identically to the server, which counts
// calendar days in Asia/Karachi. Mirrors the app's utils/trial.ts.

import type { SubscriptionSummary } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Pakistan Standard Time is UTC+5 all year (no daylight saving). */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Midnight (UTC ms) of the Asia/Karachi calendar day `t` falls on. */
const pktDay = (t: number): number => Math.floor((t + PKT_OFFSET_MS) / DAY_MS) * DAY_MS;

/**
 * Calendar days, in Asia/Karachi, from today to the day `expiryDate` falls on
 * — the count the server's reminders use. A trial ending at 3 pm today has 0
 * days left (its last day); null if unknown; 0 once the moment has passed.
 */
export const daysUntil = (
  expiryDate: string | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!expiryDate) return null;
  const t = new Date(expiryDate).getTime();
  if (!Number.isFinite(t)) return null;
  if (t <= now.getTime()) return 0;
  return Math.round((pktDay(t) - pktDay(now.getTime())) / DAY_MS);
};

/**
 * Days left in a RUNNING trial — granted, never converted, not yet over.
 * 0 means today is its last day. null in every other state (a request in
 * review, a paid plan, an ended trial), which is when no countdown shows.
 */
export const trialDaysLeft = (
  subscription: SubscriptionSummary | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!subscription?.isTrial || subscription.trialConvertedAt) return null;
  if (!subscription.expiryDate) return null;
  if (new Date(subscription.expiryDate).getTime() <= now.getTime()) return null;
  return daysUntil(subscription.expiryDate, now);
};

export const pluralDays = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;

/** What the owner's plan card offers, from the session's subscription. */
export function planCardState(
  s: SubscriptionSummary | null | undefined,
  now: Date = new Date(),
): 'trial' | 'ended' | 'active' | 'pending' | 'none' {
  if (!s) return 'none';
  if (s.paymentStatus === 'submitted') return 'pending';
  if (trialDaysLeft(s, now) !== null) return 'trial';
  const expired =
    s.trialEnded === true ||
    s.subscriptionStatus === 'expired' ||
    (!!s.expiryDate && new Date(s.expiryDate).getTime() <= now.getTime());
  if (expired) return 'ended';
  return 'active';
}
