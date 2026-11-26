// ═══════════════════════════════════════════════════════
// FinMatrix Web — launch endpoints
// ═══════════════════════════════════════════════════════
//   GET  /public/config                         sign-up mode, trial length, contacts
//   GET  /companies/:id/trial-eligibility       can path A work for this company?
//   POST /companies/start-trial                 path A — instant when eligible
//   POST /companies/:id/submit                  path B — request approval
//   POST /companies/:id/activation-request      "Request activation"
//   PATCH /companies/:id                        dismiss the migration card
//   GET  /public/demo-slots, POST /public/demo-requests   Book a Demo

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';

export interface PublicConfig {
  signupMode: 'trial' | 'approval';
  trialAutoApprove: boolean;
  trialDays: number;
  demoBookingEnabled: boolean;
  supportEmail: string;
  supportWhatsapp: string;
  turnstileSiteKey: string;
}

/** What the app assumes when /public/config cannot be reached. */
export const FALLBACK_PUBLIC_CONFIG: PublicConfig = {
  signupMode: 'trial',
  trialAutoApprove: true,
  trialDays: 30,
  demoBookingEnabled: true,
  supportEmail: '',
  supportWhatsapp: '',
  turnstileSiteKey: '',
};

export const getPublicConfig = async (): Promise<PublicConfig> => {
  try {
    const res = await api.get('/public/config');
    return { ...FALLBACK_PUBLIC_CONFIG, ...(unwrapEnvelope<Partial<PublicConfig>>(res) ?? {}) };
  } catch (e) {
    throw toApiError(e);
  }
};

export interface TrialEligibility {
  eligible: boolean;
  reason: string | null;
  message: string | null;
  signupMode: 'trial' | 'approval';
  trialDays: number;
}

export const getTrialEligibility = async (companyId: string): Promise<TrialEligibility> => {
  try {
    const res = await api.get(`/companies/${companyId}/trial-eligibility`);
    return unwrapEnvelope<TrialEligibility>(res);
  } catch (e) {
    throw toApiError(e);
  }
};

export interface StartTrialResult {
  status: 'active' | 'pending_approval';
  autoApproved: boolean;
  held: boolean;
  trial: { endsAt: string; days: number } | null;
}

export const startFreeTrial = async (companyId: string): Promise<StartTrialResult> => {
  try {
    const res = await api.post('/companies/start-trial', { companyId });
    return unwrapEnvelope<StartTrialResult>(res);
  } catch (e) {
    throw toApiError(e);
  }
};

export const requestApproval = async (
  companyId: string,
  body: { requestedPlan?: string; note?: string },
): Promise<{ status: string }> => {
  try {
    const res = await api.post(`/companies/${companyId}/submit`, body);
    return unwrapEnvelope<{ status: string }>(res);
  } catch (e) {
    throw toApiError(e);
  }
};

export const requestActivation = async (
  companyId: string,
  body: { requestedPlan?: string; note?: string },
): Promise<{ submissionId: string; requestedPlanLabel: string }> => {
  try {
    const res = await api.post(`/companies/${companyId}/activation-request`, body);
    return unwrapEnvelope(res);
  } catch (e) {
    throw toApiError(e);
  }
};

export const dismissMigrationPrompt = async (companyId: string): Promise<void> => {
  try {
    await api.patch(`/companies/${companyId}`, { migrationPromptDismissed: true });
  } catch (e) {
    throw toApiError(e);
  }
};

// ── Book a Demo ──

export interface DemoSlot {
  /** UTC instant, ISO. */
  at: string;
  /** PKT calendar date, YYYY-MM-DD. */
  date: string;
  /** PKT time, HH:MM. */
  time: string;
}

export interface DemoSlots {
  timezone: string;
  minutes: number;
  formToken: string;
  slots: DemoSlot[];
}

export const getDemoSlots = async (): Promise<DemoSlots> => {
  try {
    const res = await api.get('/public/demo-slots');
    return unwrapEnvelope<DemoSlots>(res);
  } catch (e) {
    throw toApiError(e);
  }
};

export interface DemoBooking {
  fullName: string;
  businessName: string;
  phone: string;
  email: string;
  city: string;
  businessType: string;
  teamSize?: string;
  currentSystem?: string;
  slot: string;
  message?: string;
  consent: boolean;
  website: string;
  formToken: string;
  turnstileToken?: string;
  utm?: Record<string, string>;
  referrer?: string;
  landingPath?: string;
}

export const bookDemo = async (booking: DemoBooking): Promise<{ received: boolean }> => {
  try {
    const res = await api.post('/public/demo-requests', booking);
    return unwrapEnvelope<{ received: boolean }>(res);
  } catch (e) {
    throw toApiError(e);
  }
};

/** The plans the server sells, for the plan pickers. */
export interface OfferedPlan {
  key: string;
  label: string;
}

export const getOfferedPlans = async (): Promise<OfferedPlan[]> => {
  try {
    const res = await api.get('/super-admin/plans/public');
    const raw = unwrapEnvelope<unknown>(res);
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { plans?: unknown[] })?.plans)
        ? (raw as { plans: unknown[] }).plans
        : [];
    return list
      .map((p) => p as { key?: string; id?: string; label?: string; name?: string })
      .map((p) => ({ key: p.key ?? p.id ?? '', label: p.label ?? p.name ?? '' }))
      .filter((p) => p.key && p.label);
  } catch {
    return [];
  }
};
