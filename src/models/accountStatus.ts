// ═══════════════════════════════════════════════════════
// FinMatrix Web — which account-status screen applies
// ═══════════════════════════════════════════════════════
// Pure, so the page and its tests agree: from the session (or, signed out,
// the sign-in gate's refusal) to one of the status page's states.

import type { AccountStatus } from '@/types';

export type AccountScreenState =
  | 'held'
  | 'approval'
  | 'pending'
  | 'draft'
  | 'rejected'
  | 'trialEnded'
  | 'planEnded'
  | 'suspended'
  | 'deactivated'
  | 'active'
  | 'unknown';

/** Sign-in gate codes → the state they stand for. */
const CODE_STATE: Record<string, AccountScreenState> = {
  COMPANY_PENDING: 'pending',
  COMPANY_REJECTED: 'rejected',
  COMPANY_SUSPENDED: 'suspended',
};

/** Pick the state from the session (or, signed out, the sign-in gate). */
export function accountState(input: {
  signedIn: boolean;
  status: AccountStatus | null;
  pendingKind: 'trial' | 'approval' | 'payment' | null;
  trialEnded: boolean;
  suspended: boolean;
  subscriptionStatus?: string;
  gateCode?: string;
  gatePendingKind?: string | null;
}): AccountScreenState {
  if (!input.signedIn) {
    const s = input.gateCode ? CODE_STATE[input.gateCode] : undefined;
    if (s === 'pending') {
      return input.gatePendingKind === 'trial' ? 'held' : 'approval';
    }
    return s ?? 'unknown';
  }
  if (input.suspended) return 'suspended';
  switch (input.status) {
    case 'pending':
      return input.pendingKind === 'trial' ? 'held' : input.pendingKind === 'approval' ? 'approval' : 'pending';
    case 'draft':
      return 'draft';
    case 'rejected':
      return 'rejected';
    case 'inactive':
      if (input.trialEnded) return 'trialEnded';
      return input.subscriptionStatus === 'expired' ? 'planEnded' : 'deactivated';
    case 'active':
      return 'active';
    default:
      return 'unknown';
  }
}
