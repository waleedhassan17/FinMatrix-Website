// ═══════════════════════════════════════════════════════
// FinMatrix Web — Settings model
// ═══════════════════════════════════════════════════════
// Pure: the company profile and team-member forms, and what the owner may do
// to each team member.
//
// The profile is written to the COMPANY record (PATCH /companies/:id) — the
// identity printed on invoices, statements and payslips. The alias route
// PATCH /settings/company-profile swallows failures and reports success, so
// it is never used.

import { meetsPasswordPolicy } from '@/utils/password';

// ─── Company profile ────────────────────────────────────

export interface CompanyAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  industry: string;
  taxId: string;
  phone: string;
  email: string;
  website: string;
  address: CompanyAddress;
  /** 1 = January. Null until set. */
  fiscalYearStartMonth: number | null;
  /** ISO 4217, e.g. PKR. Stored; figures still display in Rs, like the app. */
  homeCurrency: string;
  /** A URL or data URI. Printed on documents when it is a PNG or JPEG. */
  logo: string;
}

export interface CompanyProfileForm {
  name: string;
  industry: string;
  taxId: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  fiscalYearStartMonth: string;
  homeCurrency: string;
}

export const FISCAL_MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((label, i) => ({ value: String(i + 1), label }));

export const CURRENCY_OPTIONS = [
  { value: 'PKR', label: 'PKR — Pakistani rupee' },
  { value: 'USD', label: 'USD — US dollar' },
  { value: 'AED', label: 'AED — UAE dirham' },
  { value: 'SAR', label: 'SAR — Saudi riyal' },
  { value: 'GBP', label: 'GBP — Pound sterling' },
  { value: 'EUR', label: 'EUR — Euro' },
];

export const profileToForm = (p: CompanyProfile): CompanyProfileForm => ({
  name: p.name,
  industry: p.industry,
  taxId: p.taxId,
  phone: p.phone,
  email: p.email,
  website: p.website,
  street: p.address.street,
  city: p.address.city,
  state: p.address.state,
  postalCode: p.address.postalCode,
  country: p.address.country,
  fiscalYearStartMonth: p.fiscalYearStartMonth ? String(p.fiscalYearStartMonth) : '',
  homeCurrency: p.homeCurrency,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateProfile = (
  form: CompanyProfileForm,
): Partial<Record<keyof CompanyProfileForm, string>> => {
  const e: Partial<Record<keyof CompanyProfileForm, string>> = {};
  if (!form.name.trim()) e.name = 'The company name is required.';
  else if (form.name.trim().length > 200) e.name = '200 characters or fewer.';
  if (form.email.trim() && !EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.';
  if (form.website.trim() && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(form.website.trim())) {
    e.website = 'Enter a web address like example.com.';
  }
  if (form.homeCurrency && !/^[A-Z]{3}$/.test(form.homeCurrency)) e.homeCurrency = 'A 3-letter code.';
  return e;
};

/**
 * UpdateCompanyDto, filled fields only — the same rule the app follows, since
 * an empty string fails the server's @IsEmail and friends. Never sends
 * `companyType`, features or anything subscription-shaped: those are not the
 * owner's to edit from a profile form.
 */
export const profilePayload = (form: CompanyProfileForm) => {
  const clean = (v: string) => (v.trim() === '' ? undefined : v.trim());
  const body: Record<string, unknown> = {
    name: clean(form.name),
    industry: clean(form.industry),
    taxId: clean(form.taxId),
    phone: clean(form.phone),
    email: clean(form.email),
    website: clean(form.website),
    homeCurrency: clean(form.homeCurrency),
    fiscalYearStartMonth: form.fiscalYearStartMonth ? Number(form.fiscalYearStartMonth) : undefined,
  };
  const address = {
    street: clean(form.street),
    city: clean(form.city),
    state: clean(form.state),
    postalCode: clean(form.postalCode),
    country: clean(form.country),
  };
  if (Object.values(address).some((v) => v !== undefined)) body.address = address;
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
};

// ─── Team ───────────────────────────────────────────────

export type TeamRole = 'admin' | 'staff';

export interface TeamUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: TeamRole;
  status: 'active' | 'inactive';
  /** A shareable password is on file, so it can be shown again. */
  hasStoredCredential: boolean;
}

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = { admin: 'Owner', staff: 'Staff' };

export interface TeamMemberForm {
  name: string;
  username: string;
  password: string;
  role: TeamRole;
  email: string;
  phone: string;
}

/** Same rule as the server's USERNAME_REGEX: no '@', so it never passes for an email. */
export const TEAM_USERNAME = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export const validateTeamMember = (
  form: TeamMemberForm,
): Partial<Record<keyof TeamMemberForm, string>> => {
  const e: Partial<Record<keyof TeamMemberForm, string>> = {};
  if (!form.name.trim()) e.name = 'Name is required.';
  else if (form.name.trim().length > 120) e.name = '120 characters or fewer.';
  if (!TEAM_USERNAME.test(form.username.trim().toLowerCase())) {
    e.username = '3–64 characters: lowercase letters, digits, dot, underscore or hyphen.';
  }
  if (!meetsPasswordPolicy(form.password)) {
    e.password = 'At least 8 characters, with an upper-case letter, a lower-case letter and a digit.';
  }
  if (form.email.trim() && !EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.';
  if (form.phone.trim().length > 32) e.phone = '32 characters or fewer.';
  return e;
};

/** CreateCompanyUserDto. */
export const teamMemberPayload = (form: TeamMemberForm) => {
  const body: Record<string, string> = {
    name: form.name.trim(),
    username: form.username.trim().toLowerCase(),
    password: form.password,
    role: form.role,
  };
  if (form.email.trim()) body.email = form.email.trim();
  if (form.phone.trim()) body.phone = form.phone.trim();
  return body;
};

export interface TeamUserActions {
  changeRole: boolean;
  deactivate: boolean;
  activate: boolean;
  resetPassword: boolean;
  showCredential: boolean;
  /** Why role change is unavailable, when it is. */
  roleLockedReason: string | null;
}

/**
 * What the owner may do to a team member, from where they are looking.
 *
 * Mirrors the server's refusals so they are not reached by clicking:
 * CANNOT_DEACTIVATE_SELF, and LAST_ADMIN (the company must keep an owner).
 * Changing one's OWN role is withheld too — the server allows it while another
 * owner exists, but it would lock this person out of the very screen they are on.
 */
export const teamUserActions = (
  user: TeamUser,
  viewerId: string | null | undefined,
  ownerCount: number,
): TeamUserActions => {
  const self = !!viewerId && user.id === viewerId;
  const lastOwner = user.role === 'admin' && ownerCount <= 1;
  const roleLockedReason = self
    ? 'You cannot change your own role.'
    : lastOwner
      ? 'The company needs at least one owner.'
      : null;
  return {
    changeRole: roleLockedReason === null,
    deactivate: user.status === 'active' && !self && !lastOwner,
    activate: user.status === 'inactive',
    resetPassword: !self,
    showCredential: user.hasStoredCredential,
    roleLockedReason,
  };
};
