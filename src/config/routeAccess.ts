// ═══════════════════════════════════════════════════════
// FinMatrix Web — Route access
// ═══════════════════════════════════════════════════════
// The router half of the allow-list. The sidebar not rendering a link is not
// enough on its own: a staff member can still type /accounts into the address
// bar, and the app's navigation maps make an unlisted route a genuine no-op
// rather than a hidden one. This is that guarantee for the browser.
//
// The server is still the real boundary — every one of these paths 403s for
// staff anyway. What this buys is that they see their own dashboard instead of
// a screen full of failed requests.

import { STAFF_NAV, type StaffNavPath } from '@/config/nav';
import type { UserRole } from '@/types';

/**
 * Paths staff may reach that are not themselves nav destinations — detail
 * routes, `/new` forms, and the like. Nav gives us `/invoices`; a staff member
 * also needs `/invoices/new` and `/invoices/:id`.
 */
const STAFF_EXTRA_PREFIXES: string[] = ['/dev/'];

const collectStaffPrefixes = (): string[] => {
  const paths: string[] = [];
  for (const group of STAFF_NAV) {
    if (group.path) paths.push(group.path);
    for (const item of group.items ?? []) paths.push(item.path);
  }
  return [...paths, ...STAFF_EXTRA_PREFIXES];
};

const STAFF_PREFIXES = collectStaffPrefixes();

/**
 * Paths no staff member may reach even though a prefix above appears to allow
 * them. Checked BEFORE the allow-list.
 *
 * A prefix allow-list needs an escape hatch: `/account` is a staff nav path, so
 * `/account/renew` — buying or renewing the company's subscription — would
 * inherit it and open to staff. That page is the owner's alone.
 */
const STAFF_DENY_PREFIXES: string[] = ['/account/renew', '/onboarding'];

/**
 * May this role open this path?
 *
 * Prefix matching, so `/invoices/abc-123` inherits `/invoices`. The root `/` is
 * never a prefix — as one it would allow everything, which is the bug this
 * function exists to prevent.
 */
export const isPathAllowedForRole = (
  path: string,
  role: UserRole | null | undefined,
): boolean => {
  if (role === 'admin') return true;
  if (role !== 'staff') return false;

  const denied = STAFF_DENY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (denied) return false;

  // The root is allowed as an EXACT path but never as a prefix. It is where
  // the browser lands on the bare origin and it renders the staff member's own
  // dashboard; treating it as a prefix instead would allow every path there is,
  // which is the bug this function exists to prevent.
  if (path === '/') return true;

  return STAFF_PREFIXES.some(
    (prefix) =>
      prefix !== '/' && (path === prefix || path.startsWith(`${prefix}/`)),
  );
};

/** Exported for the tests and for anyone auditing the staff surface. */
export const staffAllowedPrefixes = (): readonly (StaffNavPath | string)[] =>
  STAFF_PREFIXES;
