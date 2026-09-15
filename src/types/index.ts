/** The server's role enum (src/types/index.ts in the backend). */
export type UserRole = 'admin' | 'staff' | 'delivery' | 'super_admin';

/**
 * Company tiers. This console targets `warehouse`, where every feature flag is
 * true; the others are here because /auth/me returns them and the nav is driven
 * off the feature map rather than off an assumption about tier.
 */
export type CompanyType = 'small_business' | 'large_org' | 'warehouse';

/**
 * Normalised company status, as produced by the server's effectiveCompanyStatus
 * helper. Distinct from the raw `company.status` DB value ('approved') that the
 * signin response also carries — branch on THIS one, which additionally applies
 * subscription expiry live, ahead of the nightly billing cron.
 */
export type AccountStatus =
  | 'draft'
  | 'pending'
  | 'active'
  | 'inactive'
  | 'rejected';

/** Feature flags returned by signin and /auth/me. */
export type FeatureKey =
  | 'estimates'
  | 'journalEntries'
  | 'creditMemos'
  | 'bankReconciliation'
  | 'multiUser'
  | 'auditLog'
  | 'periodClose'
  | 'payroll'
  | 'budgets'
  | 'inventory'
  | 'purchaseOrders'
  | 'salesOrders'
  | 'agencies'
  | 'delivery';

export type Features = Partial<Record<FeatureKey, boolean>>;

/** The public user object, identical in the signin and /auth/me payloads. */
export interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string;
  role: UserRole;
  phone: string | null;
  companyId: string | null;
  defaultCompanyId: string | null;
  isEmailVerified: boolean;
}

/**
 * Plan + free-trial summary carried by signin and /auth/me. The trial countdown
 * reads it, so the app shell needs no billing request of its own.
 */
export interface SubscriptionSummary {
  plan: string;
  planLabel: string;
  /** ISO timestamp; null for a plan that never expires. */
  expiryDate: string | null;
  /** none | submitted | paid | rejected */
  paymentStatus: string;
  /** Permanent history — true once a trial was approved, even after paying. */
  isTrial: boolean;
  trialStartedAt: string | null;
  /** Set when a real payment was approved after the trial. */
  trialConvertedAt: string | null;
}

export interface CompanyRef {
  id: string;
  name: string;
  /** RAW database value — 'approved', not 'active'. See AccountStatus. */
  status: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, e.g. 900. */
  expiresIn: number;
}
