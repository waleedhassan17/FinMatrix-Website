// ═══════════════════════════════════════════════════════
// FinMatrix Web — Capability hooks
// ═══════════════════════════════════════════════════════
// Ported from the app's src/hooks/useCapability.ts. Reads the role from
// identity and answers what happens if this user performs this action.

import { useMemo } from 'react';

import { useAppSelector } from '@/store/store';
import { selectFeatures, selectRole } from '@/store/authSlice';
import {
  capabilityFor,
  isAdminOnly,
  submitLabelFor,
  type AdminOnlyAction,
  type Capability,
  type CapabilityOutcome,
} from '@/utils/capabilities';
import type { FeatureKey, UserRole } from '@/types';

export interface CapabilityResult {
  outcome: CapabilityOutcome;
  /** Available at all, however it completes. Render nothing when false. */
  allowed: boolean;
  /** Completes immediately. */
  direct: boolean;
  /** Files a request the owner approves before anything posts. */
  needsApproval: boolean;
  /**
   * What the submit button should say. Staff filing a request are told before
   * they click, not after: `submitLabel('Save & Send')` → 'Send for approval'.
   */
  submitLabel: (directLabel: string) => string;
}

/**
 * `capability` is optional so a caller with a possibly-ungated thing — a nav
 * row, a quick action — can call the hook unconditionally, which is the only
 * way React allows. Undefined means "no capability gates this", and the result
 * is permissive.
 */
export function useCapability(capability?: Capability): CapabilityResult {
  const role = useAppSelector(selectRole);

  return useMemo(() => {
    if (!capability) {
      return {
        outcome: 'direct' as const,
        allowed: true,
        direct: true,
        needsApproval: false,
        submitLabel: (directLabel: string) => directLabel,
      };
    }
    const outcome = capabilityFor(role, capability);
    return {
      outcome,
      allowed: outcome !== false,
      direct: outcome === 'direct',
      needsApproval: outcome === 'request',
      submitLabel: (directLabel: string) =>
        submitLabelFor(role, capability, directLabel),
    };
  }, [role, capability]);
}

/** The signed-in user's role, or null before boot settles. */
export function useRole(): UserRole | null {
  return useAppSelector(selectRole);
}

/** True for the company owner (`admin`). */
export function useIsOwner(): boolean {
  return useAppSelector(selectRole) === 'admin';
}

/**
 * Gate for the handful of actions the server restricts more tightly than the
 * capability they belong to — deactivating a customer, deleting a document,
 * bank reconciliation. See AdminOnlyAction for why the capability map alone
 * is not enough.
 */
export function useAdminOnly(action: AdminOnlyAction): boolean {
  const role = useAppSelector(selectRole);
  return isAdminOnly(role, action);
}

/**
 * Is a tier feature switched on for this company?
 *
 * This console targets the warehouse tier, where everything is true — but the
 * nav reads the server's feature map rather than assuming that, because a
 * company on `large_org` gets a hard 403 on every /inventory, /purchase-orders,
 * /sales-orders and /deliveries route, and a nav item that 403s is worse than
 * one that is absent.
 */
export function useFeature(feature?: FeatureKey): boolean {
  const features = useAppSelector(selectFeatures);
  // Undefined means "no feature gates this" — see useCapability above.
  if (!feature) return true;
  // Null features means we have not loaded identity yet, or the server sent
  // none. Treat as enabled: the alternative is a nav that flickers empty on
  // every reload, and the server is still the real gate.
  return features?.[feature] ?? true;
}
