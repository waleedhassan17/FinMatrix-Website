// ═══════════════════════════════════════════════════════
// FinMatrix Web — Auth Serializer
// ═══════════════════════════════════════════════════════
// Defensive backend→client mapping for the session. Every auth response
// (signin and /auth/me) funnels through this, so a shape change on the server
// is felt in one place.

import type {
  AccountStatus,
  AuthUser,
  CompanyRef,
  CompanyType,
  Features,
  UserRole,
} from '@/types';
import type { Identity } from '@/store/authSlice';

/** The raw signin / /auth/me payload, before we trust any of it. */
interface RawUser {
  id?: string;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  role?: string;
  phone?: string | null;
  companyId?: string | null;
  defaultCompanyId?: string | null;
  isEmailVerified?: boolean;
}

export interface RawAuthPayload {
  user?: RawUser;
  companyId?: string | null;
  company?: { id?: string; name?: string; status?: string } | null;
  companyStatus?: string | null;
  companyType?: string | null;
  features?: Record<string, boolean> | null;
}

const ACCOUNT_STATUSES: AccountStatus[] = [
  'draft',
  'pending',
  'active',
  'inactive',
  'rejected',
];

const COMPANY_TYPES: CompanyType[] = ['small_business', 'large_org', 'warehouse'];

export const userSerializer = (raw: RawUser | undefined): AuthUser => ({
  id: raw?.id ?? '',
  email: raw?.email ?? null,
  username: raw?.username ?? null,
  displayName: raw?.displayName || raw?.email || raw?.username || 'User',
  role: (raw?.role as UserRole) ?? 'staff',
  phone: raw?.phone ?? null,
  companyId: raw?.companyId ?? raw?.defaultCompanyId ?? null,
  defaultCompanyId: raw?.defaultCompanyId ?? null,
  // Absent means verified: only the admin email-signup path ever sets this
  // false, and defaulting the other way would gate every username account out
  // of the product.
  isEmailVerified: raw?.isEmailVerified ?? true,
});

const companySerializer = (
  raw: RawAuthPayload['company'],
): CompanyRef | null =>
  raw?.id ? { id: raw.id, name: raw.name ?? '', status: raw.status ?? '' } : null;

/**
 * Map a signin or /auth/me payload to Identity.
 *
 * Note which status wins. The payload carries TWO: `company.status` is the raw
 * database value ('approved'), while `companyStatus` is normalised through the
 * server's effectiveCompanyStatus — which additionally applies subscription
 * expiry live, ahead of the nightly billing cron. Branching on the raw one
 * would keep a lapsed company looking active until that cron ran, so only the
 * normalised field reaches the store's companyStatus.
 */
export const identitySerializer = (raw: RawAuthPayload): Identity => {
  const user = userSerializer(raw.user);
  const status = raw.companyStatus as AccountStatus | null | undefined;
  const type = raw.companyType as CompanyType | null | undefined;

  return {
    user,
    companyId: raw.companyId ?? user.companyId,
    company: companySerializer(raw.company),
    companyStatus:
      status && ACCOUNT_STATUSES.includes(status) ? status : (status ?? null),
    companyType: type && COMPANY_TYPES.includes(type) ? type : null,
    features: (raw.features as Features | null) ?? null,
  };
};

/** One company membership, as listed by /auth/me and /settings/companies. */
export interface CompanyMembership {
  id: string;
  name: string;
  role: UserRole;
  inviteCode: string | null;
  status: string;
}

export const companiesSerializer = (raw: unknown): CompanyMembership[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
    id: String(c.id ?? ''),
    name: String(c.name ?? ''),
    role: (c.role as UserRole) ?? 'staff',
    inviteCode: (c.inviteCode as string) ?? null,
    status: String(c.status ?? ''),
  }));
};
