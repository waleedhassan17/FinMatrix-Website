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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { PlanGrid } from '@/features/billing/PlanGrid';
import {
  getBankDetails,
  getPlansForCompany,
  selfSubscribe,
} from '@/networks/billing/billingNetwork';
import type { Plan } from '@/models/plan';
import { selectCompanyType } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

export default function PlanSelectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyType = useAppSelector(selectCompanyType);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const {
    data: plans,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['plans', 'company', companyType],
    queryFn: () => getPlansForCompany(companyType),
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

  return (
    <OnboardingShell
      step={2}
      title="Choose a plan"
      subtitle="Every plan includes the whole system. The tiers differ by how many delivery riders you run, and a longer term costs less per month."
    >
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
        Next you will see our bank details and the exact amount due. Nothing is
        charged automatically and no card is stored.
      </p>
    </OnboardingShell>
  );
}
