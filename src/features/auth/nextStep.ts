import type { AccountStatus } from '@/types';

/**
 * Where a signed-in owner belongs, from what the server says about them.
 *
 * No company yet → onboarding. A company that serves business requests → the
 * dashboard. Anything else (submitted, deactivated, rejected) → the status
 * page that explains it. The route guards reach the same answer through a
 * chain of redirects; screens that move an owner on by themselves use this to
 * go straight there instead of flashing through the chain.
 */
export const nextStepFor = (i: {
  companyId: string | null;
  companyStatus: AccountStatus | null;
}): string =>
  !i.companyId
    ? '/onboarding/company'
    : i.companyStatus === 'active'
      ? '/dashboard'
      : '/account-status';
