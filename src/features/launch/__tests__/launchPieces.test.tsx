// @vitest-environment jsdom

// The smaller launch pieces: the demo link's sign-up prefill, the dashboard's
// migration card, the owner's plan card, the trial strip, and the bilingual
// migration / trial error messages.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/launch/launchNetwork', async (orig) => ({
  ...(await orig<typeof import('@/networks/launch/launchNetwork')>()),
  dismissMigrationPrompt: vi.fn(async () => undefined),
  getOfferedPlans: vi.fn(async () => []),
  requestActivation: vi.fn(),
}));
vi.mock('@/networks/auth/authNetwork', () => ({
  authMe: vi.fn(() => new Promise(() => undefined)),
}));

import { migrationErrorMessage, MIGRATION_ERROR_CODES, MIGRATION_ERRORS_UR } from '@/config/migrationErrors';
import { MigrationSetupCard } from '@/features/dashboard/MigrationSetupCard';
import { PlanActivationCard } from '@/features/launch/PlanActivationCard';
import { captureSignupPrefill, readSignupPrefill } from '@/features/launch/signupPrefill';
import { TrialStrip, TRIAL_URGENT_DAYS } from '@/features/shell/TrialStrip';
import { setLang } from '@/i18n/lang';
import { planCardState } from '@/models/trial';
import * as launch from '@/networks/launch/launchNetwork';
import { renderScreen, signedInAuth, trialSubscription } from '@/test/launchHarness';

const DEMO_REF = 'demo_0b6f4c1e-7a2d-4c11-9d7e-3f5a2b8c9d10';

beforeEach(() => {
  vi.clearAllMocks();
  setLang('en');
  window.sessionStorage.clear();
});

describe('sign-up prefill from a demo invite', () => {
  it('keeps a well-formed demo ref and the details, and remembers them for company setup', () => {
    const p = captureSignupPrefill(
      `?ref=${DEMO_REF}&name=Ayesha%20Khan&email=ayesha%40example.com&business=Khan%20Traders&phone=03001234567`,
    );
    expect(p).toEqual({
      ref: DEMO_REF,
      name: 'Ayesha Khan',
      email: 'ayesha@example.com',
      business: 'Khan Traders',
      phone: '03001234567',
    });
    expect(readSignupPrefill().business).toBe('Khan Traders');
  });

  it('drops a ref that is not a demo id, and stores nothing for a bare link', () => {
    expect(captureSignupPrefill('?ref=admin&name=X').ref).toBeUndefined();
    window.sessionStorage.clear();
    captureSignupPrefill('');
    expect(readSignupPrefill()).toEqual({});
  });

  it('trims and caps what it keeps', () => {
    const p = captureSignupPrefill(`?business=${'A'.repeat(300)}&name=%20%20`);
    expect(p.business).toHaveLength(120);
    expect(p.name).toBeUndefined();
  });
});

describe('MigrationSetupCard', () => {
  it('hidden when the server says so, and for staff', () => {
    renderScreen(<MigrationSetupCard visible={false} />, { auth: signedInAuth() });
    expect(screen.queryByTestId('migration-card')).not.toBeInTheDocument();
  });

  it('hidden for staff even when visible', () => {
    const auth = signedInAuth();
    renderScreen(<MigrationSetupCard visible />, { auth: { ...auth, user: { ...auth.user!, role: 'staff' } } });
    expect(screen.queryByTestId('migration-card')).not.toBeInTheDocument();
  });

  it('shown to the owner, links to the Migration Center and its guide; dismiss is remembered', async () => {
    renderScreen(<MigrationSetupCard visible />, { auth: signedInAuth() });
    expect(screen.getByTestId('migration-card')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /move your data in/i })).toHaveAttribute('href', '/settings/migration');
    expect(screen.getByRole('link', { name: /read the guide/i })).toHaveAttribute('href', '/settings/migration/guide');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('migration-card')).not.toBeInTheDocument();
    await waitFor(() => expect(launch.dismissMigrationPrompt).toHaveBeenCalledWith('c1'));
  });

  it('comes back if the dismissal could not be saved', async () => {
    vi.mocked(launch.dismissMigrationPrompt).mockRejectedValueOnce(new Error('offline'));
    renderScreen(<MigrationSetupCard visible />, { auth: signedInAuth() });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByTestId('migration-card')).toBeInTheDocument();
  });
});

describe('planCardState', () => {
  const now = new Date('2026-11-26T07:00:00.000Z');
  const sub = (over = {}) => trialSubscription({ expiryDate: '2026-12-20T07:00:00.000Z', ...over });
  it('running trial, ended trial, paid plan, paid plan expired, request in review', () => {
    expect(planCardState(sub(), now)).toBe('trial');
    expect(planCardState(sub({ expiryDate: '2026-11-20T07:00:00.000Z', trialEnded: true }), now)).toBe('ended');
    expect(planCardState(sub({ isTrial: false, plan: 'warehouse_scale_1yr' }), now)).toBe('active');
    expect(planCardState(sub({ trialConvertedAt: '2026-11-01T00:00:00.000Z' }), now)).toBe('active');
    expect(
      planCardState(sub({ isTrial: false, expiryDate: '2026-11-01T00:00:00.000Z', subscriptionStatus: 'expired' }), now),
    ).toBe('ended');
    expect(planCardState(sub({ paymentStatus: 'submitted' }), now)).toBe('pending');
    expect(planCardState(null, now)).toBe('none');
  });
});

describe('PlanActivationCard', () => {
  it('on a trial: the end date, days left, and Request activation', () => {
    renderScreen(<PlanActivationCard />, { auth: signedInAuth({ subscription: trialSubscription() }) });
    expect(screen.getByTestId('plan-card')).toHaveTextContent('Free trial');
    expect(screen.getByTestId('plan-card')).toHaveTextContent(/days left/i);
    expect(screen.getByTestId('plan-request-activation')).toBeInTheDocument();
  });

  it('a paid plan shows its terms, with nothing to request', () => {
    renderScreen(<PlanActivationCard />, {
      auth: signedInAuth({
        subscription: trialSubscription({ isTrial: false, plan: 'warehouse_scale_1yr', planLabel: 'Warehouse Scale — 1 year' }),
      }),
    });
    expect(screen.getByTestId('plan-card')).toHaveTextContent('Warehouse Scale — 1 year');
    expect(screen.queryByTestId('plan-request-activation')).not.toBeInTheDocument();
  });

  it('a request in review says so instead of offering another', () => {
    renderScreen(<PlanActivationCard />, {
      auth: signedInAuth({ subscription: trialSubscription({ paymentStatus: 'submitted' }) }),
    });
    expect(screen.getByRole('status')).toHaveTextContent(/with our team/i);
    expect(screen.queryByTestId('plan-request-activation')).not.toBeInTheDocument();
  });
});

describe('TrialStrip', () => {
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000 + 60_000).toISOString();
  it('calm with time left, urgent in the last days, owner only', () => {
    const { unmount } = renderScreen(<TrialStrip />, {
      auth: signedInAuth({ subscription: trialSubscription({ expiryDate: inDays(10) }) }),
    });
    expect(screen.getByRole('status')).toHaveAttribute('data-urgent', 'false');
    unmount();

    const { unmount: u2 } = renderScreen(<TrialStrip />, {
      auth: signedInAuth({ subscription: trialSubscription({ expiryDate: inDays(TRIAL_URGENT_DAYS - 1) }) }),
    });
    expect(screen.getByRole('status')).toHaveAttribute('data-urgent', 'true');
    expect(screen.getByRole('button', { name: 'Request activation' })).toBeInTheDocument();
    u2();

    const auth = signedInAuth({ subscription: trialSubscription({ expiryDate: inDays(2) }) });
    renderScreen(<TrialStrip />, { auth: { ...auth, user: { ...auth.user!, role: 'staff' } } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('gone once the trial is over or converted', () => {
    renderScreen(<TrialStrip />, {
      auth: signedInAuth({ subscription: trialSubscription({ trialConvertedAt: new Date().toISOString() }) }),
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('migration and trial error messages', () => {
  it('every migration code has its own Urdu sentence', () => {
    for (const c of MIGRATION_ERROR_CODES) {
      expect(MIGRATION_ERRORS_UR[c], c).toMatch(/[؀-ۿ]/);
      expect(MIGRATION_ERRORS_UR[c]).not.toMatch(/TODO/);
    }
  });

  it('answers in the reader\'s chosen language by default', () => {
    expect(migrationErrorMessage('EXPORT_EXPIRED')).toBe('This backup has expired. Create a new one.');
    setLang('ur');
    expect(migrationErrorMessage('EXPORT_EXPIRED')).toMatch(/[؀-ۿ]/);
    expect(migrationErrorMessage('EXPORT_EXPIRED', null, 'en')).toBe('This backup has expired. Create a new one.');
  });

  it('a trial that ended blocks the commit with the launch message, not a raw code', () => {
    expect(migrationErrorMessage('TRIAL_ENDED', 'raw')).toMatch(/trial has ended/i);
    expect(migrationErrorMessage('ACCOUNT_NOT_FOUND', 'raw')).toMatch(/chart of accounts/i);
    expect(migrationErrorMessage('UNHEARD_OF', 'The server said this.')).toBe('The server said this.');
    expect(migrationErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});
