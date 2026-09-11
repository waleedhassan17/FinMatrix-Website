import { describe, expect, it } from 'vitest';

import {
  profilePayload,
  profileToForm,
  teamMemberPayload,
  teamUserActions,
  validateProfile,
  validateTeamMember,
  type CompanyProfile,
  type TeamMemberForm,
  type TeamUser,
} from '@/models/settings';
import { mapCompanyProfile, mapTeamUser } from '@/networks/settings/settingsNetwork';
import { generatePassword, meetsPasswordPolicy, suggestUsername } from '@/utils/password';

const profile = (over: Partial<CompanyProfile> = {}): CompanyProfile => ({
  id: 'c1',
  name: 'Warehouse Co',
  industry: 'Distribution',
  taxId: '',
  phone: '',
  email: 'owner@example.com',
  website: '',
  address: { street: '12 Main Blvd', city: 'Lahore', state: '', postalCode: '', country: 'Pakistan' },
  fiscalYearStartMonth: 7,
  homeCurrency: 'PKR',
  ...over,
});

const member = (over: Partial<TeamMemberForm> = {}): TeamMemberForm => ({
  name: 'Ali Raza',
  username: 'ali.raza',
  password: 'Warehouse1',
  role: 'staff',
  email: '',
  phone: '',
  ...over,
});

const user = (over: Partial<TeamUser> = {}): TeamUser => ({
  id: 'u2',
  name: 'Ali',
  username: 'ali',
  email: '',
  role: 'staff',
  status: 'active',
  hasStoredCredential: true,
  ...over,
});

describe('company profile', () => {
  it('sends filled fields only, the address nested, and never companyType', () => {
    const body = profilePayload(profileToForm(profile()));
    expect(body).toEqual({
      name: 'Warehouse Co',
      industry: 'Distribution',
      email: 'owner@example.com',
      homeCurrency: 'PKR',
      fiscalYearStartMonth: 7,
      address: { street: '12 Main Blvd', city: 'Lahore', country: 'Pakistan' },
    });
    expect(body).not.toHaveProperty('companyType');
  });

  it('omits the address when every part is blank', () => {
    const blank = profile({ address: { street: '', city: '', state: '', postalCode: '', country: '' } });
    expect(profilePayload(profileToForm(blank))).not.toHaveProperty('address');
  });

  it('validates name, email, website and currency', () => {
    const e = validateProfile({ ...profileToForm(profile()), name: '', email: 'nope', website: 'x', homeCurrency: 'pk' });
    expect(Object.keys(e).sort()).toEqual(['email', 'homeCurrency', 'name', 'website']);
    expect(validateProfile(profileToForm(profile({ website: 'finmatrix.pk' })))).toEqual({});
  });

  it('reads the company record, tolerating the older zipCode name', () => {
    const p = mapCompanyProfile({ id: 'c', name: 'X', address: { zipCode: '54000' }, fiscalYearStartMonth: 13, homeCurrency: 'pkr' });
    expect(p.address.postalCode).toBe('54000');
    expect(p.fiscalYearStartMonth).toBeNull();
    expect(p.homeCurrency).toBe('PKR');
  });
});

describe('team member', () => {
  it('enforces the server’s username and password rules', () => {
    expect(validateTeamMember(member())).toEqual({});
    expect(validateTeamMember(member({ username: 'ali@x.com' })).username).toBeTruthy();
    expect(validateTeamMember(member({ password: 'lowercase1' })).password).toBeTruthy();
    expect(validateTeamMember(member({ password: 'Short1' })).password).toBeTruthy();
  });

  it('lowercases the username and drops blank optionals', () => {
    expect(teamMemberPayload(member({ username: ' Ali.Raza ' }))).toEqual({
      name: 'Ali Raza',
      username: 'ali.raza',
      password: 'Warehouse1',
      role: 'staff',
    });
  });

  it('reads a team member from either id field', () => {
    expect(mapTeamUser({ userId: 'u9', role: 'admin', status: 'inactive' })).toMatchObject({ id: 'u9', role: 'admin', status: 'inactive' });
  });
});

describe('what the owner may do to a team member', () => {
  it('everything, for another active staff member', () => {
    expect(teamUserActions(user(), 'owner-1', 1)).toEqual({
      changeRole: true,
      deactivate: true,
      activate: false,
      resetPassword: true,
      showCredential: true,
      roleLockedReason: null,
    });
  });

  it('never deactivates, demotes or resets themselves', () => {
    const a = teamUserActions(user({ id: 'owner-1', role: 'admin' }), 'owner-1', 2);
    expect(a.deactivate).toBe(false);
    expect(a.changeRole).toBe(false);
    expect(a.resetPassword).toBe(false);
    expect(a.roleLockedReason).toMatch(/your own/);
  });

  it('keeps the last owner an owner (LAST_ADMIN)', () => {
    const a = teamUserActions(user({ id: 'o2', role: 'admin' }), 'someone-else', 1);
    expect(a.changeRole).toBe(false);
    expect(a.deactivate).toBe(false);
    expect(a.roleLockedReason).toMatch(/at least one owner/);
  });

  it('offers activate for an inactive member and hides a credential never stored', () => {
    const a = teamUserActions(user({ status: 'inactive', hasStoredCredential: false }), 'o', 1);
    expect(a.activate).toBe(true);
    expect(a.deactivate).toBe(false);
    expect(a.showCredential).toBe(false);
  });
});

describe('password helpers', () => {
  it('generates passwords that meet the policy and avoid look-alikes', () => {
    for (let i = 0; i < 40; i++) {
      const p = generatePassword();
      expect(meetsPasswordPolicy(p)).toBe(true);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it('suggests a username from a name', () => {
    expect(suggestUsername('  Imran Khan ')).toBe('imran.khan');
    expect(suggestUsername('.Ayesha Ö')).toBe('ayesha.');
  });
});
