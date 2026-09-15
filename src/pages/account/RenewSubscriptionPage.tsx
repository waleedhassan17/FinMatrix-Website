// ═══════════════════════════════════════════════════════
// FinMatrix Web — Renew a subscription (/account/renew)
// ═══════════════════════════════════════════════════════
// Ported from the app's RenewSubscriptionScreen. Same <PlanGrid> and the same
// <BankTransferPanel> the onboarding wizard uses, in the same dark-header frame —
// a renewal is the same purchase made by someone who already has a company.
//
// THE DOUBLE-PAYMENT GUARD IS THE POINT OF THIS SCREEN.
// While the last submission reads 'submitted' an administrator is still looking at
// it, and a buyer who cannot see that will transfer a second time. Real money,
// unrecoverable from the client. So the pay button is disabled in that state and
// the screen polls until the answer changes.
//
// Owner-only, and enforced here as well as by RequireOwner: this page sits outside
// RequireActiveCompany — an expired company fails that guard, which is exactly
// when this page is needed — and therefore outside RequireRouteAccess too.

import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OwnerOnly } from '@/components/auth/Can';
import { BankTransferPanel } from '@/features/billing/BankTransferPanel';
import { PlanGrid } from '@/features/billing/PlanGrid';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import type { Plan } from '@/models/plan';
import { authMe } from '@/networks/auth/authNetwork';
import {
  getBankDetails,
  getBillingStatus,
  getPlansForCompany,
  submitPaymentProof,
} from '@/networks/billing/billingNetwork';
import { selectCompanyStatus, selectCompanyType, setIdentity } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';

function RenewBody() {
  const dispatch = useAppDispatch();
  const companyType = useAppSelector(selectCompanyType);

  const [chosen, setChosen] = useState<Plan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const status = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: getBillingStatus,
  });

  const plans = useQuery({
    queryKey: ['plans', 'company', companyType],
    queryFn: () => getPlansForCompany(companyType),
  });

  const bank = useQuery({
    queryKey: ['billing', 'bank-details', chosen?.id ?? ''],
    queryFn: () => getBankDetails(chosen?.id ?? ''),
    enabled: Boolean(chosen?.id),
  });

  const awaiting = status.data?.lastSubmission?.status === 'submitted';
  // A rejected free-trial REQUEST is not a rejected payment.
  const rejected =
    status.data?.lastSubmission?.status === 'rejected' &&
    status.data.lastSubmission.kind !== 'TRIAL';
  const trial = isTrialing(status.data);

  // Poll only while something is actually pending. An unconditional interval
  // would hammer the API for every owner who leaves this tab open.
  useEffect(() => {
    if (!awaiting) return;
    const id = window.setInterval(() => void status.refetch(), 20_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting]);

  const onSubmit = async (file: File) => {
    if (!chosen) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitPaymentProof(chosen.id, file);
      await status.refetch();
      try {
        dispatch(setIdentity(await authMe()));
      } catch {
        /* the status query above is the one that matters here */
      }
      setChosen(null);
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'The upload failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-xl">
      {/* Current plan */}
      {status.data && (
        <div className="rounded-xl border border-border-light bg-surface p-xl shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <p className="text-overline text-neutral-500">Current plan</p>
              <p className="mt-xxs text-h3 text-text-primary">
                {status.data.planLabel || '—'}
              </p>
              {status.data.expiryDate && (
                <p className="mt-xxs text-body-sm text-text-secondary">
                  {expiryLine(status.data.expiryDate, status.data.neverExpires, trial)}
                </p>
              )}
            </div>
            {status.data.subscriptionStatus && (
              <StatusBadge status={status.data.subscriptionStatus} />
            )}
          </div>
        </div>
      )}

      {/* A submission is with an administrator — do not let them pay twice. */}
      {awaiting && (
        <div className="flex items-start gap-sm rounded-xl border border-border-light bg-surface p-xl shadow-card">
          <Clock className="mt-xxs size-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="text-h4 text-text-primary">Your payment is being verified</p>
            <p className="mt-xxs text-body-sm text-text-secondary">
              We have your receipt and someone is checking it — usually within one
              business day. There is nothing more to do, and nothing more to pay.
              This page updates itself.
            </p>
          </div>
        </div>
      )}

      {rejected && status.data?.lastSubmission?.rejectionReason && (
        <div className="flex items-start gap-sm rounded-xl bg-danger-lighter p-xl">
          <AlertCircle className="mt-xxs size-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-h4 text-danger">Your last payment was not accepted</p>
            <p className="mt-xxs text-body-sm text-danger">
              {status.data.lastSubmission.rejectionReason}
            </p>
          </div>
        </div>
      )}

      {/* Pick a plan, then pay for it */}
      {chosen && bank.data ? (
        <div>
          <div className="mb-lg flex flex-wrap items-center justify-between gap-sm">
            <p className="flex items-center gap-xs text-label-lg text-text-primary">
              <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
              {chosen.name} · {chosen.monthlyLabel}/month
            </p>
            <Button variant="secondary" onClick={() => setChosen(null)}>
              Change plan
            </Button>
          </div>

          <BankTransferPanel
            details={bank.data}
            onSubmit={(file) => void onSubmit(file)}
            submitting={submitting}
            error={submitError || null}
            disabled={awaiting}
            disabledNote="A payment you already sent is still being verified. Wait for that to be reviewed before sending another."
          />
        </div>
      ) : (
        <div>
          <PlanGrid
            plans={plans.data ?? []}
            variant="select"
            isLoading={plans.isPending}
            error={plans.error ? plans.error.message : null}
            onRetry={() => void plans.refetch()}
            selectedPlanId={chosen?.id ?? null}
            onSelect={(plan) => {
              if (!awaiting) setChosen(plan);
            }}
            ctaLabel={
              awaiting ? 'Payment pending' : trial ? 'Subscribe to this plan' : 'Renew on this plan'
            }
          />
          {chosen && bank.isPending && (
            <p className="mt-lg text-center text-body-sm text-text-secondary">
              Loading the bank details…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A company on a free trial it never converted to a paid plan. */
const isTrialing = (s: { isTrial: boolean; trialConvertedAt: string | null } | undefined): boolean =>
  s?.isTrial === true && !s.trialConvertedAt;

/** "Expired 1/2/2027" only when it has — this page is also opened mid-term. */
function expiryLine(expiryDate: string, neverExpires: boolean, trial: boolean): string {
  if (neverExpires) return 'Does not expire';
  const when = new Date(expiryDate);
  const date = when.toLocaleDateString();
  const past = when.getTime() <= Date.now();
  if (trial) return past ? `Trial ended ${date}` : `Trial ends ${date}`;
  return past ? `Expired ${date}` : `Active until ${date}`;
}

// Copy only. The double-payment guard in RenewBody is untouched: a company on a
// free trial has never paid, so the words are "subscribe", not "renew" — the
// flow, the plans and the proof upload are identical.
export default function RenewSubscriptionPage() {
  const companyStatus = useAppSelector(selectCompanyStatus);
  // Same query key as RenewBody, so this shares its single request.
  const status = useQuery({ queryKey: ['billing', 'status'], queryFn: getBillingStatus });
  const trial = isTrialing(status.data);
  const trialEnded = trial && status.data?.accountStatus === 'inactive';

  return (
    <OnboardingShell
      // A running company opened this from its app (the trial banner, My
      // Account); a lapsed one came from the status page.
      back={
        companyStatus === 'active'
          ? { to: '/dashboard', label: 'Back' }
          : { to: '/account-status', label: 'Back' }
      }
      title={
        trialEnded
          ? 'Your trial has ended'
          : trial
            ? 'Subscribe to a plan'
            : 'Renew your subscription'
      }
      subtitle={
        trialEnded
          ? 'Subscribe to keep your data active. Everything you set up during the trial is exactly where you left it.'
          : trial
            ? 'Choose a plan to keep going after your trial and add more delivery riders. It starts as soon as your payment is verified.'
            : 'Your data is exactly where you left it. Pay for a new term and everything switches back on.'
      }
    >
      <OwnerOnly
        fallback={
          <div className="flex max-w-[520px] flex-col items-start gap-md rounded-xl border border-border-light bg-surface p-xxl shadow-lg">
            <AlertCircle className="size-6 text-warning" aria-hidden="true" />
            <p className="text-h4 text-text-primary">Ask your business owner</p>
            <p className="text-body-sm text-text-secondary">
              Only the owner of this company can buy or renew a subscription.
            </p>
          </div>
        }
      >
        <RenewBody />
      </OwnerOnly>
    </OnboardingShell>
  );
}
