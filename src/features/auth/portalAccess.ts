// ═══════════════════════════════════════════════════════
// FinMatrix Web — Which accounts each sign-in door admits
// ═══════════════════════════════════════════════════════
// The owner door admits business owners; the team member door admits staff.
// Nothing else signs in on the web: riders use the Android app, and the
// platform console for super-admins lives there too.
//
// The server enforces this (POST /auth/signin with `portal`, which answers
// WRONG_PORTAL before issuing any token). This file is the client's copy, used
// for the wording and as a second check against a server that predates it.

import type { UserRole } from '@/types';
import type { PortalRole } from '@/utils/storage';

const WEB_PORTAL_ROLES: Record<PortalRole, readonly UserRole[]> = {
  admin: ['admin'],
  staff: ['staff'],
};

export const isRoleAllowedOnWebPortal = (
  portal: PortalRole,
  role: UserRole | null | undefined,
): boolean => !!role && WEB_PORTAL_ROLES[portal].includes(role);

export interface PortalMismatch {
  message: string;
  /** The door this account belongs on, or null when it has none on the web. */
  switchTo: PortalRole | null;
}

/** What to tell someone whose account belongs on a different door. */
export const portalMismatch = (role: UserRole | null | undefined): PortalMismatch => {
  switch (role) {
    case 'admin':
      return {
        message:
          'This is a business owner account. Sign in on the business owner portal with your email.',
        switchTo: 'admin',
      };
    case 'staff':
      return {
        message:
          'This is a team member account. Sign in on the team member portal with your username.',
        switchTo: 'staff',
      };
    case 'delivery':
      return {
        message: 'This is a delivery rider account. Riders sign in on the FinMatrix Android app.',
        switchTo: null,
      };
    case 'super_admin':
      return {
        message: 'This is a platform administrator account. Use the FinMatrix Android app.',
        switchTo: null,
      };
    default:
      return {
        message: 'This account cannot sign in here.',
        switchTo: null,
      };
  }
};

/** The label for the button that takes someone to their own door. */
export const switchLabel = (to: PortalRole): string =>
  to === 'admin' ? 'Sign in as business owner' : 'Sign in as team member';
