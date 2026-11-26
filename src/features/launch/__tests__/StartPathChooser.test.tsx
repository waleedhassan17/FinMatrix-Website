// @vitest-environment jsdom

// The last step of company setup. Path A (free trial) is offered only when
// the server says it will work, with the reason when it will not; path B
// (request approval) is always there; approval-only mode hides path A. An
// instant trial lands on the dashboard, a held one on the status page.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/launch/launchNetwork', async (orig) => ({
  ...(await orig<typeof import('@/networks/launch/launchNetwork')>()),
  getPublicConfig: vi.fn(),
  getTrialEligibility: vi.fn(),
  startFreeTrial: vi.fn(),
  requestApproval: vi.fn(),
  getOfferedPlans: vi.fn(async () => [{ key: 'warehouse_scale_1yr', label: 'Warehouse Scale — 1 year' }]),
}));
vi.mock('@/networks/auth/authNetwork', () => ({
  authRefreshSession: vi.fn(async () => undefined),
  authMe: vi.fn(async () => {
    throw new Error('not needed');
  }),
}));

import { StartPathChooser } from '@/features/launch/StartPathChooser';
import { FALLBACK_PUBLIC_CONFIG } from '@/networks/launch/launchNetwork';
import * as launch from '@/networks/launch/launchNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import { renderScreen, signedInAuth } from '@/test/launchHarness';

const eligible = {
  eligible: true,
  reason: null,
  message: null,
  signupMode: 'trial' as const,
  trialDays: 30,
};

const show = () =>
  renderScreen(<StartPathChooser companyId="c1" />, {
    auth: signedInAuth({ companyStatus: 'draft' }),
    path: '/onboarding/company',
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(launch.getPublicConfig).mockResolvedValue({ ...FALLBACK_PUBLIC_CONFIG, signupMode: 'trial' });
  vi.mocked(launch.getTrialEligibility).mockResolvedValue(eligible);
});

describe('StartPathChooser', () => {
  it('trial mode: both paths, the trial enabled when the server says eligible', async () => {
    show();
    const trial = await screen.findByTestId('path-trial');
    expect(screen.getByTestId('path-approval')).toBeInTheDocument();
    expect(trial).toHaveTextContent('Start my 30-day free trial');
    await waitFor(() => expect(trial).toHaveAttribute('aria-disabled', 'false'));
    expect(screen.getByRole('button', { name: 'Start my free trial' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Not sure yet? Book a demo' })).toHaveAttribute('href', '/book-demo');
  });

  it('approval mode: only path B, and no eligibility request', async () => {
    vi.mocked(launch.getPublicConfig).mockResolvedValue({ ...FALLBACK_PUBLIC_CONFIG, signupMode: 'approval' });
    show();
    await waitFor(() => expect(screen.queryByTestId('path-trial')).not.toBeInTheDocument());
    expect(screen.getByTestId('path-approval')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request approval' })).toBeEnabled();
  });

  it('an ineligible account sees path A disabled, with the reason', async () => {
    vi.mocked(launch.getTrialEligibility).mockResolvedValue({
      ...eligible,
      eligible: false,
      reason: 'TRIAL_EMAIL_USED',
      message: 'This email has already been used for a free trial.',
    });
    show();
    const reason = await screen.findByTestId('trial-reason');
    expect(reason).toHaveTextContent('This email address has already used its free trial.');
    expect(screen.getByTestId('path-trial')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Start my free trial' })).toBeDisabled();
    // Path B and Book a demo stay open.
    expect(screen.getByRole('button', { name: 'Request approval' })).toBeEnabled();
  });

  it('an unknown reason falls back to the server sentence', async () => {
    vi.mocked(launch.getTrialEligibility).mockResolvedValue({
      ...eligible,
      eligible: false,
      reason: 'SOMETHING_NEW',
      message: 'A reason this build does not know.',
    });
    show();
    expect(await screen.findByTestId('trial-reason')).toHaveTextContent('A reason this build does not know.');
  });

  it('auto-approved: off to the dashboard', async () => {
    vi.mocked(launch.startFreeTrial).mockResolvedValue({
      status: 'active',
      autoApproved: true,
      held: false,
      trial: { endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), days: 30 },
    });
    show();
    const btn = await screen.findByRole('button', { name: 'Start my free trial' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(await screen.findByTestId('probe')).toHaveTextContent('/dashboard');
    expect(launch.startFreeTrial).toHaveBeenCalledWith('c1');
  });

  it('held for review: off to the status page', async () => {
    vi.mocked(launch.startFreeTrial).mockResolvedValue({
      status: 'pending_approval',
      autoApproved: false,
      held: true,
      trial: null,
    });
    show();
    const btn = await screen.findByRole('button', { name: 'Start my free trial' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(await screen.findByTestId('probe')).toHaveTextContent('/account-status');
  });

  it('a refusal at start (a race) shows the reason and re-checks eligibility', async () => {
    vi.mocked(launch.startFreeTrial).mockRejectedValue(
      new ApiError('This phone number has already been used for a free trial.', 'TRIAL_NOT_ELIGIBLE', 409, {
        reason: 'TRIAL_PHONE_USED',
      }),
    );
    show();
    const btn = await screen.findByRole('button', { name: 'Start my free trial' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(await screen.findByRole('alert')).toHaveTextContent('This phone number has already used its free trial.');
    await waitFor(() => expect(launch.getTrialEligibility).toHaveBeenCalledTimes(2));
  });

  it('path B sends the chosen plan and note, then shows the status page', async () => {
    vi.mocked(launch.requestApproval).mockResolvedValue({ status: 'pending_approval' });
    show();
    await screen.findByTestId('path-approval');
    fireEvent.change(screen.getByLabelText('Note for our team (optional)'), { target: { value: '  Agreed on the call  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request approval' }));
    expect(await screen.findByTestId('probe')).toHaveTextContent('/account-status');
    expect(launch.requestApproval).toHaveBeenCalledWith('c1', { requestedPlan: 'unsure', note: 'Agreed on the call' });
  });
});
