// ═══════════════════════════════════════════════════════
// FinMatrix Web — Settings Network
// ═══════════════════════════════════════════════════════
// Owner only in this console.
//
// Company profile → the COMPANY record (GET/PATCH /companies/:id). The alias
// PATCH /settings/company-profile catches its own failures and answers with
// the body you sent, so a save that never happened looks like one that did.
//
// Team → /settings/users, every route @Roles('admin') + @RequiresFeature
// ('multiUser'). Accounts are deactivated, never deleted: the ledger names
// who posted what.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { CompanyProfile, TeamRole, TeamUser } from '@/models/settings';
import { listRows } from '@/serializers/inventorySerializer';

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export interface IssuedCredentials {
  username: string;
  password: string;
}

// ─── Company profile ────────────────────────────────────

export const mapCompanyProfile = (raw: unknown): CompanyProfile => {
  const r = asRaw(raw);
  const a = asRaw(r.address);
  const month = Number(r.fiscalYearStartMonth);
  return {
    id: str(r.id),
    name: str(r.name),
    industry: str(r.industry),
    taxId: str(r.taxId),
    phone: str(r.phone),
    email: str(r.email),
    website: str(r.website),
    address: {
      street: str(a.street),
      city: str(a.city),
      state: str(a.state),
      postalCode: str(a.postalCode ?? a.zipCode),
      country: str(a.country),
    },
    fiscalYearStartMonth: month >= 1 && month <= 12 ? month : null,
    homeCurrency: str(r.homeCurrency).toUpperCase(),
  };
};

export const getCompanyProfile = async (companyId: string): Promise<CompanyProfile> => {
  try {
    const response = await api.get(`/companies/${companyId}`);
    return mapCompanyProfile(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateCompanyProfile = async (
  companyId: string,
  body: Record<string, unknown>,
): Promise<CompanyProfile> => {
  try {
    const response = await api.patch(`/companies/${companyId}`, body);
    return mapCompanyProfile(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

// ─── Team ───────────────────────────────────────────────

export const mapTeamUser = (raw: unknown): TeamUser => {
  const r = asRaw(raw);
  return {
    id: str(r.id ?? r.userId),
    name: str(r.name),
    username: str(r.username),
    email: str(r.email),
    role: r.role === 'admin' ? 'admin' : 'staff',
    status: r.status === 'inactive' ? 'inactive' : 'active',
    hasStoredCredential: r.hasStoredCredential === true,
  };
};

const readCredentials = (raw: unknown): IssuedCredentials | null => {
  const r = asRaw(raw);
  const c = asRaw(r.credentials ?? r);
  return c.username && c.password ? { username: str(c.username), password: str(c.password) } : null;
};

export const getTeamUsers = async (): Promise<TeamUser[]> => {
  try {
    const response = await api.get('/settings/users');
    return listRows(unwrapEnvelope(response.data)).map(mapTeamUser);
  } catch (e) {
    throw toApiError(e);
  }
};

/** Username and password chosen here; returned once to hand over. */
export const createTeamUser = async (
  body: Record<string, string>,
): Promise<{ user: TeamUser; credentials: IssuedCredentials | null }> => {
  try {
    const response = await api.post('/settings/users', body);
    const data = unwrapEnvelope(response.data);
    return { user: mapTeamUser(data), credentials: readCredentials(data) };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Add someone from their email: the server takes the username from the
 * address and generates the password, and returns both once.
 */
export const inviteTeamUser = async (body: {
  email: string;
  role: TeamRole;
  displayName?: string;
}): Promise<{ user: TeamUser; credentials: IssuedCredentials | null }> => {
  try {
    const response = await api.post('/settings/users/invite', body);
    const data = unwrapEnvelope(response.data);
    return { user: mapTeamUser(data), credentials: readCredentials(data) };
  } catch (e) {
    throw toApiError(e);
  }
};

/** Refused with LAST_ADMIN when it would leave the company without an owner. */
export const changeTeamUserRole = async (userId: string, role: TeamRole): Promise<TeamUser> => {
  try {
    const response = await api.patch(`/settings/users/${userId}/role`, { role });
    return mapTeamUser(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Deactivated accounts cannot sign in; their history stays attributed. */
export const setTeamUserActive = async (userId: string, active: boolean): Promise<TeamUser> => {
  try {
    const response = await api.patch(`/settings/users/${userId}/${active ? 'activate' : 'deactivate'}`);
    return mapTeamUser(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** A new generated password, returned once. The old one stops working immediately. */
export const resetTeamUserPassword = async (userId: string): Promise<IssuedCredentials | null> => {
  try {
    const response = await api.post(`/settings/users/${userId}/reset-password`, {});
    return readCredentials(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The stored credential. Audited server-side on every call — fetch only on request. */
export const revealTeamUserCredential = async (
  userId: string,
): Promise<{ username: string; password: string | null }> => {
  try {
    const response = await api.get(`/settings/users/${userId}/credential`);
    const d = asRaw(unwrapEnvelope(response.data));
    return { username: str(d.username), password: d.password ? str(d.password) : null };
  } catch (e) {
    throw toApiError(e);
  }
};
