// ═══════════════════════════════════════════════════════
// FinMatrix Web — Onboarding step 3: payment
// ═══════════════════════════════════════════════════════
// Bank details in, receipt out, then the company is submitted for approval.
//
// ORDER: the payment proof goes first, THEN POST /companies/:id/submit. A company
// submitted before its proof lands in the approval queue with nothing to approve,
// and an administrator has to guess whether to wait or reject it.

import { AlertCircle, ArrowLeft, Clock } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { BankTransferPanel } from '@/features/billing/BankTransferPanel';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { authMe } from '@/networks/auth/authNetwork';
import {
  getBankDetails,
  submitPaymentProof,
} from '@/networks/billing/billingNetwork';
import { submitCompanyForApproval } from '@/networks/companies/companiesNetwork';
import { getStoredCompanyId } from '@/networks/network/apiHelpers';
import { setIdentity } from '@/store/authSlice';
import { useAppDispatch } from '@/store/store';

export default function PaySubscriptionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const planKey = searchParams.get('plan') ?? '';
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const {
    data: details,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['billing', 'bank-details', planKey],
    queryFn: () => getBankDetails(planKey),
    enabled: planKey.length > 0,
  });

  const onSubmit = async (file: File) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitPaymentProof(planKey, file);

      // Now the queue has something to look at.
      const companyId = getStoredCompanyId();
      if (companyId) {
        try {
          await submitCompanyForApproval(companyId);
        } catch {
          /* may already be submitted — not worth blocking the buyer over */
        }
      }

      // Re-read identity so /account-status shows the real status rather than a
      // stale one. Non-fatal: that screen re-checks on its own.
      try {
        dispatch(setIdentity(await authMe()));
      } catch {
        /* ignore */
      }

      navigate('/account-status', { replace: true });
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'The upload failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!planKey) {
    return (
      <OnboardingShell step={3} title="Payment">
        <div className="flex max-w-[520px] flex-col items-start gap-md rounded-lg border border-border-light bg-surface p-xxl shadow-card">
          <AlertCircle className="size-6 text-warning" aria-hidden="true" />
          <p className="text-h4 text-text-primary">No plan chosen yet</p>
          <p className="text-body-sm text-text-secondary">
            Pick a plan first and we will show you the amount due.
          </p>
          <Button asChild>
            <Link to="/onboarding/plan">Choose a plan</Link>
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={3}
      title="Pay by bank transfer"
      subtitle="Transfer the amount below and upload the receipt. We activate your account once it is verified."
    >
      {isPending && (
        <div className="grid gap-xl lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-80 animate-pulse rounded-lg border border-border-light bg-surface shadow-card"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="flex max-w-[520px] flex-col items-start gap-md rounded-lg border border-border-light bg-surface p-xxl shadow-card">
          <AlertCircle className="size-6 text-danger" aria-hidden="true" />
          <p className="text-h4 text-text-primary">
            Could not load the bank details
          </p>
          <p className="text-body-sm text-text-secondary">{error.message}</p>
          <div className="flex gap-sm">
            <Button type="button" onClick={() => void refetch()}>
              Try again
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/onboarding/plan">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to plans
              </Link>
            </Button>
          </div>
        </div>
      )}

      {details && (
        <>
          <BankTransferPanel
            details={details}
            onSubmit={(file) => void onSubmit(file)}
            submitting={submitting}
            error={submitError || null}
          />

          <div className="mt-xxl flex items-start gap-sm rounded-md bg-surface-2 p-md">
            <Clock
              className="mt-xxs size-5 shrink-0 text-text-secondary"
              aria-hidden="true"
            />
            <p className="text-body-sm text-text-secondary">
              After you submit, your company goes to our team for verification.
              You can close this page — we will activate the account and you can
              sign in as normal.
            </p>
          </div>

          <div className="mt-lg">
            <Button variant="text" asChild>
              <Link to="/onboarding/plan">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Choose a different plan
              </Link>
            </Button>
          </div>
        </>
      )}
    </OnboardingShell>
  );
}
