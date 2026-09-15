// ═══════════════════════════════════════════════════════
// FinMatrix Web — Onboarding step 2: the plan
// ═══════════════════════════════════════════════════════
// The SAME <PlanGrid> the landing page renders, in its selectable variant. Same
// prices, same tiers, same card — which is the entire reason it is one component.
//
// POST /companies/subscribe is best-effort. What actually starts a subscription is
// an approved payment proof, and the live flow in the mobile app reaches the pay
// step whether or not subscribe succeeded. Blocking here on an advisory call would
// strand a buyer who is trying to give us money.
//
// THE FREE TRIAL IS THE OPPOSITE, AND MUST STAY SO. POST /companies/start-trial is
// not advisory: it IS the request. It is awaited, and every failure — the email or
// phone has already had a trial, the email is not verified, the phone is missing —
// is shown to the owner as the server words it. Do not "tidy" it into the
// fire-and-forget pattern selfSubscribe uses above; a swallowed trial error leaves
// the owner believing a request was filed when nothing was.
//
// The trial is one panel above the grid, not a second button on every card: every
// trial is the same fixed plan (all features, one delivery rider), so tying it to a
// card would imply a choice that does not exist.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Gift } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { PlanGrid } from '@/features/billing/PlanGrid';
import { authMe } from '@/networks/auth/authNetwork';
import {
  getBankDetails,
  getBillingStatus,
  getPlansForCompany,
  selfSubscribe,
  startTrial,
} from '@/networks/billing/billingNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import { updateCompanyProfile } from '@/networks/settings/settingsNetwork';
import type { Plan } from '@/models/plan';
import { selectCompanyId, selectCompanyType, setIdentity } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { getStoredCompanyId } from '@/utils/storage';

export default function PlanSelectPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const companyType = useAppSelector(selectCompanyType);
  const identityCompanyId = useAppSelector(selectCompanyId);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const [trialBusy, setTrialBusy] = useState(false);
  const [trialError, setTrialError] = useState('');
  // Shown only when the server says the company has no usable phone.
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState('');

  const {
    data: plans,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['plans', 'company', companyType],
    queryFn: () => getPlansForCompany(companyType),
  });

  // Only to decide what to say about a previous trial decision. The server
  // re-checks everything when a trial is requested.
  const { data: billing } = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: getBillingStatus,
    retry: false,
  });

  const choose = async (plan: Plan) => {
    setBusyPlanId(plan.id);
    try {
      // Advisory: attach the plan to the company if the server will take it.
      await selfSubscribe(plan.id).catch(() => {
        /* the payment proof is what counts */
      });

      // Warm the bank details so the pay step paints without a spinner. Also
      // best-effort — the pay step fetches them itself.
      void queryClient.prefetchQuery({
        queryKey: ['billing', 'bank-details', plan.id],
        queryFn: () => getBankDetails(plan.id),
      });

      navigate(`/onboarding/pay?plan=${encodeURIComponent(plan.id)}`);
    } finally {
      setBusyPlanId(null);
    }
  };

  const requestTrial = async () => {
    if (trialBusy) return;
    const companyId = identityCompanyId ?? getStoredCompanyId();
    if (!companyId) {
      navigate('/onboarding/company', { replace: true });
      return;
    }
    setTrialBusy(true);
    setTrialError('');
    try {
      // The phone is part of the one-trial-per-person check, so it has to be
      // on the company before the request can be filed.
      if (needsPhone) {
        if (!phone.trim()) {
          setTrialError('Enter your business phone number.');
          return;
        }
        await updateCompanyProfile(companyId, { phone: phone.trim() });
      }

      // Awaited — see the header. This is the request itself.
      await startTrial(companyId);

      // Re-read identity: the server now reports `pending`, which is what the
      // status page and the route guards branch on.
      try {
        dispatch(setIdentity(await authMe()));
      } catch {
        /* /account-status re-checks on its own */
      }
      void queryClient.invalidateQueries({ queryKey: ['billing', 'status'] });
      toast.success('Free trial requested — we will email you as soon as it is active.');
      navigate('/account-status', { replace: true });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'The trial request could not be sent. Please try again.';
      if (e instanceof ApiError && e.code === 'TRIAL_PHONE_REQUIRED') {
        setNeedsPhone(true);
      }
      setTrialError(message);
      toast.error(message);
    } finally {
      setTrialBusy(false);
    }
  };

  const trialRejected =
    billing?.lastSubmission?.kind === 'TRIAL' && billing.lastSubmission.status === 'rejected';
  // A company that has had a trial cannot have another; the panel would only
  // produce a refusal.
  const trialAvailable = !billing?.isTrial;

  return (
    <OnboardingShell
      step={2}
      title="Choose a plan"
      subtitle="Every plan includes the whole system. The tiers differ by how many delivery riders you run, and a longer term costs less per month."
    >
      {trialRejected && (
        <div
          role="status"
          className="mb-lg flex items-start gap-xs rounded-md border border-warning-light bg-warning-lighter p-md"
        >
          <AlertCircle className="mt-[2px] size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-body-sm text-text-primary">
            We couldn’t activate a free trial
            {billing?.lastSubmission?.rejectionReason
              ? `: ${billing.lastSubmission.rejectionReason}`
              : '.'}{' '}
            You can still choose a plan below.
          </p>
        </div>
      )}

      {trialAvailable && (
        <section
          aria-labelledby="trial-heading"
          className="mb-xxl flex flex-col gap-md rounded-xl border-2 border-primary bg-surface p-xl shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-xxl"
        >
          <div className="flex items-start gap-md">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50">
              <Gift className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-xxs">
              <h2 id="trial-heading" className="text-h3 text-text-primary">
                Try FinMatrix free for 30 days
              </h2>
              <p className="text-body-sm text-text-secondary">
                Every accounting and warehouse feature, with one delivery rider. Choose a plan
                whenever you are ready.
              </p>
              <p className="text-caption text-text-tertiary">
                No credit card required. Your trial is activated after a quick review — usually
                within 24 hours.
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-xs sm:w-[280px]">
            {needsPhone && (
              <Input
                label="Business phone"
                type="tel"
                inputMode="tel"
                placeholder="0300 1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
            <Button full onClick={() => void requestTrial()} disabled={trialBusy}>
              {trialBusy ? 'Sending request…' : 'Start 30-day free trial'}
            </Button>
            {trialError && (
              <p role="alert" className="text-body-sm text-danger">
                {trialError}
              </p>
            )}
          </div>
        </section>
      )}

      <PlanGrid
        plans={plans ?? []}
        variant="select"
        isLoading={isPending}
        error={error ? error.message : null}
        onRetry={() => void refetch()}
        onSelect={(plan) => void choose(plan)}
        busyPlanId={busyPlanId}
        ctaLabel="Choose plan"
      />

      <p className="mt-xxl text-center text-body-sm text-text-secondary">
        Choosing a plan shows our bank details and the exact amount due. Nothing is
        charged automatically and no card is stored.
      </p>
    </OnboardingShell>
  );
}
