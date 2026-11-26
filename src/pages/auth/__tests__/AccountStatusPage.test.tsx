// @vitest-environment jsdom

// Every state the account-status page can be in, and what each offers: a held
// trial and an approval wait; a rejection with its reason; an ended trial with
// the owner's way out (download, request activation, book a call) and the
// staff member's "contact the owner"; a suspension; the signed-out gate.

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/launch/launchNetwork', async (orig) => ({
  ...(await orig<typeof import('@/networks/launch/launchNetwork')>()),
  getPublicConfig: vi.fn(async () => ({
    signupMode: 'trial',
    trialAutoApprove: true,
    trialDays: 30,
    demoBookingEnabled: true,
    supportEmail: 'help@example.com',
    supportWhatsapp: '+92 300 1234567',
    turnstileSiteKey: '',
  })),
  getOfferedPlans: vi.fn(async () => []),
  requestActivation: vi.fn(),
}));
vi.mock('@/networks/auth/authNetwork', () => ({
  authRefreshSession: vi.fn(async () => undefined),
  authMe: vi.fn(() => new Promise(() => undefined)),
  authLogout: vi.fn(async () => undefined),
}));
vi.mock('@/networks/settings/dataPortabilityNetwork', () => ({
  listExports: vi.fn(async () => []),
  createExport: vi.fn(),
  downloadExport: vi.fn(),
}));

import { accountState } from '@/models/accountStatus';
import AccountStatusPage from '@/pages/auth/AccountStatusPage';
import { renderScreen, signedInAuth, trialSubscription } from '@/test/launchHarness';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('accountState', () => {
  const base = { signedIn: true, status: null, pendingKind: null, trialEnded: false, suspended: false } as const;
  it.each([
    [{ status: 'pending', pendingKind: 'trial' }, 'held'],
    [{ status: 'pending', pendingKind: 'approval' }, 'approval'],
    [{ status: 'pending', pendingKind: 'payment' }, 'pending'],
    [{ status: 'draft' }, 'draft'],
    [{ status: 'rejected' }, 'rejected'],
    [{ status: 'inactive', trialEnded: true }, 'trialEnded'],
    [{ status: 'inactive', subscriptionStatus: 'expired' }, 'planEnded'],
    [{ status: 'inactive' }, 'deactivated'],
    [{ status: 'active', suspended: true }, 'suspended'],
    [{ status: 'inactive', suspended: true, trialEnded: true }, 'suspended'],
    [{ status: 'active' }, 'active'],
    [{}, 'unknown'],
  ] as const)('%o → %s', (over, expected) => {
    expect(accountState({ ...base, ...over } as Parameters<typeof accountState>[0])).toBe(expected);
  });

  it('signed out, from the sign-in gate', () => {
    const out = { ...base, signedIn: false };
    expect(accountState({ ...out, gateCode: 'COMPANY_PENDING', gatePendingKind: 'trial' })).toBe('held');
    expect(accountState({ ...out, gateCode: 'COMPANY_PENDING', gatePendingKind: 'approval' })).toBe('approval');
    expect(accountState({ ...out, gateCode: 'COMPANY_REJECTED' })).toBe('rejected');
    expect(accountState({ ...out, gateCode: 'COMPANY_SUSPENDED' })).toBe('suspended');
    expect(accountState({ ...out, gateCode: 'SOMETHING_ELSE' })).toBe('unknown');
  });
});

const show = (auth = signedInAuth(), state?: unknown) =>
  renderScreen(<AccountStatusPage />, { auth, path: '/account-status', state });

const ended = trialSubscription({
  expiryDate: new Date(Date.now() - 86_400_000).toISOString(),
  subscriptionStatus: 'expired',
  trialEnded: true,
});

describe('AccountStatusPage', () => {
  it('held trial: "we are reviewing", never the reason', async () => {
    show(signedInAuth({ companyStatus: 'pending', pendingKind: 'trial' }));
    expect(await screen.findByTestId('status-body')).toHaveTextContent(/review/i);
    expect(screen.queryByRole('button', { name: 'Request activation' })).not.toBeInTheDocument();
  });

  it('approval request: waiting, shows the email it will write to', async () => {
    show(signedInAuth({ companyStatus: 'pending', pendingKind: 'approval' }));
    expect(await screen.findByText('owner@example.com')).toBeInTheDocument();
  });

  it('rejected at sign-in: the reason and support contacts', async () => {
    show(
      { ...signedInAuth(), status: 'anonymous', isAuthenticated: false, user: null },
      { code: 'COMPANY_REJECTED', rejectionReason: 'NTN does not match the business name.' },
    );
    expect(await screen.findByText('NTN does not match the business name.')).toBeInTheDocument();
    expect(await screen.findByText('help@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute('href', 'https://wa.me/923001234567');
  });

  it('trial ended, owner: download my data, request activation, book a call', async () => {
    show(signedInAuth({ companyStatus: 'inactive', subscription: ended }));
    expect(await screen.findByRole('button', { name: 'Download my data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request activation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /book a call/i })).toHaveAttribute('href', '/book-demo');
    screen.getByRole('button', { name: 'Download my data' }).click();
    expect(await screen.findByTestId('backup-panel')).toBeInTheDocument();
  });

  it('trial ended with a request in review: says so, offers no second request', async () => {
    show(signedInAuth({ companyStatus: 'inactive', subscription: { ...ended, paymentStatus: 'submitted' } }));
    expect(await screen.findByText(/activation request is with our team/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request activation' })).not.toBeInTheDocument();
  });

  it('trial ended, staff: contact the owner, no owner actions', async () => {
    const auth = signedInAuth({ companyStatus: 'inactive', subscription: ended });
    show({ ...auth, user: { ...auth.user!, role: 'staff', email: null, username: 'ali' } });
    expect(await screen.findByTestId('status-body')).toHaveTextContent(/owner/i);
    expect(screen.queryByRole('button', { name: 'Download my data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request activation' })).not.toBeInTheDocument();
  });

  it('plan ended (paid plan expired) reads differently from a trial', async () => {
    show(
      signedInAuth({
        companyStatus: 'inactive',
        subscription: { ...ended, isTrial: false, trialEnded: false, plan: 'warehouse_scale_1yr' },
      }),
    );
    expect(await screen.findByRole('heading', { name: /plan has ended/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /trial has ended/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request activation' })).toBeInTheDocument();
  });

  it('suspended: support contacts, nothing else to do', async () => {
    show(signedInAuth({ companyStatus: 'inactive', subscription: trialSubscription({ suspended: true }) }));
    expect(await screen.findByTestId('status-body')).toHaveTextContent(/suspended/i);
    expect(await screen.findByText('help@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request activation' })).not.toBeInTheDocument();
  });

  it('draft owner: back to choosing how to start', async () => {
    show(signedInAuth({ companyStatus: 'draft' }));
    expect(await screen.findByRole('link', { name: 'How would you like to start?' })).toHaveAttribute(
      'href',
      '/onboarding/company',
    );
  });
});
