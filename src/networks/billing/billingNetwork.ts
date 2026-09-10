// ═══════════════════════════════════════════════════════
// FinMatrix Web — Billing & subscription
// ═══════════════════════════════════════════════════════
// Payment here is MANUAL: the buyer transfers to a bank account and uploads a
// screenshot, and a platform administrator approves it. There are no card
// fields anywhere in this flow because there is no card processor behind it.
//
// Two plan endpoints, and which one a screen may call is decided by whether it
// has a token, not by preference:
//
//   GET /super-admin/plans/public  — 200 unauthenticated. The LANDING PAGE's
//     only option. Confusingly named, but it is the public price list.
//   GET /billing/plans             — 401 unauthenticated, and scoped to the
//     signed-in company's type. Preferred once there is a session, because it
//     answers "what may THIS company buy" rather than "what exists".
//
// Both fold into `Plan` in src/models/plan.ts — see the note there on why the
// server's money labels are printed rather than re-formatted.

import {
  planListSerializer,
  type Plan,
} from '@/models/plan';
import {
  api,
  postMultipart,
  toApiError,
  unwrapEnvelope,
} from '@/networks/network/apiHelpers';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

// ─── Plans ──────────────────────────────────────────

/**
 * The public price list. No token required — this is what the landing page
 * renders, and it must keep working for a visitor who has never signed in.
 */
export const getPublicPlans = async (): Promise<Plan[]> => {
  try {
    const res = await api.get('/super-admin/plans/public');
    return planListSerializer(unwrapEnvelope(res));
  } catch (error) {
    throw toApiError(error);
  }
};

/**
 * The plans this company may buy.
 *
 * Falls back to the public list on ANY failure. A company whose type the
 * catalogue has no plans for would otherwise see an empty renewal screen and no
 * way to pay — showing the public price list is strictly better than a dead end.
 */
export const getPlansForCompany = async (
  companyType?: string | null,
): Promise<Plan[]> => {
  try {
    const res = await api.get('/billing/plans', {
      params: companyType ? { companyType } : undefined,
    });
    const plans = planListSerializer(unwrapEnvelope(res));
    if (plans.length > 0) return plans;
  } catch {
    /* fall through to the public list */
  }
  return getPublicPlans();
};

// ─── Status ─────────────────────────────────────────

export type SubmissionStatus = 'submitted' | 'approved' | 'rejected';

export interface BillingStatus {
  plan: string;
  planLabel: string;
  accountStatus: string;
  subscriptionStatus: string;
  paymentStatus: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  neverExpires: boolean;
  priceLabel: string;
  deliveryPersonnelLimit: number | null;
  /**
   * The last proof this company uploaded. While this reads 'submitted' an
   * administrator is still looking at it, and the renew screen must NOT offer to
   * pay again — a second transfer for the same period is real money lost.
   */
  lastSubmission: {
    id: string;
    plan: string;
    status: SubmissionStatus;
    rejectionReason: string | null;
    createdAt: string;
  } | null;
}

const billingStatusSerializer = (raw: unknown): BillingStatus => {
  const r = asRaw(raw);
  const last = r.lastSubmission ? asRaw(r.lastSubmission) : null;

  return {
    plan: str(r.plan),
    planLabel: str(r.planLabel),
    accountStatus: str(r.accountStatus),
    subscriptionStatus: str(r.subscriptionStatus),
    paymentStatus: str(r.paymentStatus),
    expiryDate: str(r.expiryDate) || null,
    daysRemaining: numOrNull(r.daysRemaining),
    neverExpires: r.neverExpires === true,
    priceLabel: str(r.priceLabel),
    deliveryPersonnelLimit: numOrNull(r.deliveryPersonnelLimit),
    lastSubmission: last
      ? {
          id: str(last.id),
          plan: str(last.plan),
          status: (str(last.status) || 'submitted') as SubmissionStatus,
          rejectionReason: str(last.rejectionReason) || null,
          createdAt: str(last.createdAt),
        }
      : null,
  };
};

export const getBillingStatus = async (): Promise<BillingStatus> => {
  try {
    const res = await api.get('/billing/status');
    return billingStatusSerializer(unwrapEnvelope(res));
  } catch (error) {
    throw toApiError(error);
  }
};

// ─── Bank transfer ──────────────────────────────────

export interface BankDetails {
  plan: string;
  planLabel: string;
  durationMonths: number | null;
  monthlyLabel: string;
  amountDueLabel: string;
  currency: string;
  bankAccount: {
    accountTitle: string;
    bankName: string;
    accountNumber: string;
    instructions: string;
  };
}

const bankDetailsSerializer = (raw: unknown): BankDetails => {
  const r = asRaw(raw);
  const bank = asRaw(r.bankAccount);

  return {
    plan: str(r.plan),
    planLabel: str(r.planLabel),
    durationMonths: numOrNull(r.durationMonths),
    monthlyLabel: str(r.monthlyLabel),
    amountDueLabel: str(r.amountDueLabel),
    currency: str(r.currency) || 'PKR',
    bankAccount: {
      accountTitle: str(bank.accountTitle),
      bankName: str(bank.bankName),
      accountNumber: str(bank.accountNumber),
      instructions: str(bank.instructions),
    },
  };
};

/**
 * Cache, so the pay step paints instantly.
 *
 * `planKey` is opaque — the app's PlanKey union is already stale against the
 * live catalogue's Starter/Growth/Scale rungs, so nothing here switches on it.
 */
const bankDetailsCache = new Map<string, BankDetails>();

export const getCachedBankDetails = (planKey: string): BankDetails | null =>
  bankDetailsCache.get(planKey) ?? null;

export const getBankDetails = async (planKey: string): Promise<BankDetails> => {
  try {
    const res = await api.get('/billing/bank-details', {
      params: { plan: planKey },
    });
    const details = bankDetailsSerializer(unwrapEnvelope(res));
    bankDetailsCache.set(planKey, details);
    return details;
  } catch (error) {
    throw toApiError(error);
  }
};

/** Warm the cache while the buyer is still reading the plan cards. */
export const prefetchBankDetails = (planKey: string | null | undefined): void => {
  if (!planKey || bankDetailsCache.has(planKey)) return;
  void getBankDetails(planKey).catch(() => {
    /* a cold pay step is the only cost */
  });
};

/**
 * Upload the transfer receipt.
 *
 * The plan is sent TWICE — query string and form field — because that is what
 * the server accepts; the app does the same. The file field must be named
 * `screenshot`. postMultipart deliberately omits Content-Type so the browser
 * sets the multipart boundary itself.
 */
export const submitPaymentProof = async (
  planKey: string,
  file: File,
): Promise<void> => {
  const form = new FormData();
  form.append('plan', planKey);
  form.append('screenshot', file, file.name);

  await postMultipart(
    `/billing/submit?plan=${encodeURIComponent(planKey)}`,
    form,
  );
};

// ─── Subscribe ──────────────────────────────────────

/**
 * Attach a plan to the signed-in company.
 *
 * Scoped by the `x-company-id` header the axios interceptor attaches — this is
 * the one route in the API that honours it. The live tier flow treats this as
 * advisory: what actually starts a subscription is an approved payment proof.
 */
export const selfSubscribe = async (planId: string): Promise<void> => {
  try {
    await api.post('/companies/subscribe', { planId });
  } catch (error) {
    throw toApiError(error);
  }
};
