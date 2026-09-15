// ═══════════════════════════════════════════════════════
// FinMatrix Web — Free trial helpers
// ═══════════════════════════════════════════════════════
// Pure, so the shell strip and the pages answer "is this company trialing, and
// for how long?" identically — and identically to the server, whose day count
// rounds UP (the last partial day reads as 1). Mirrors the app's utils/trial.ts.

import type { SubscriptionSummary } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until `expiryDate`, rounded up; 0 once passed; null if unknown. */
export const daysUntil = (
  expiryDate: string | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!expiryDate) return null;
  const t = new Date(expiryDate).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - now.getTime()) / DAY_MS));
};

/**
 * Days left in a RUNNING trial — approved, never converted, not yet over.
 * null in every other state (a pending request, a paid plan, a lapsed trial),
 * which is exactly when no countdown should show.
 */
export const trialDaysLeft = (
  subscription: SubscriptionSummary | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!subscription?.isTrial || subscription.trialConvertedAt) return null;
  const days = daysUntil(subscription.expiryDate, now);
  return days !== null && days > 0 ? days : null;
};

export const pluralDays = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;
