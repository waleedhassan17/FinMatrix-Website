// ═══════════════════════════════════════════════════════
// FinMatrix Web — Pricing
// ═══════════════════════════════════════════════════════
// On the dark navy ground. White plan cards on navy is the highest-contrast
// pairing on the page, where they used to be white cards on a white section held
// apart by a hairline.
//
// Renders the SAME <PlanGrid> the onboarding wizard and /account/renew use, fed by
// the live price list — `tone="dark"` changes only the highlight and the
// surroundings, never the card body, so the three surfaces still show one card.
//
// Uses the PUBLIC endpoint, the only one that answers without a token.

import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';
import { PlanGrid } from '@/features/billing/PlanGrid';
import { SectionIntro } from '@/features/landing/SectionIntro';
import { getPublicPlans } from '@/networks/billing/billingNetwork';

export function PricingSection() {
  const {
    data: plans,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['plans', 'public'],
    queryFn: getPublicPlans,
    // The price list changes rarely and a visitor may scroll past it twice.
    staleTime: 10 * 60_000,
  });

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="relative isolate scroll-mt-20 overflow-hidden surface-mesh-navy py-section text-text-inverse lg:py-section-lg"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 texture-grain opacity-[0.06]"
      />

      <div className="mx-auto max-w-[1280px] px-xl">
        <SectionIntro
          id="pricing-heading"
          tone="dark"
          align="center"
          overline="Pricing"
          title="Priced by the size of your delivery team"
          body="Every plan includes the whole system — accounting, inventory, purchasing and deliveries. The tiers differ by how many riders you run. Billed once per term, in rupees."
        />

        <div className="mt-xxxxl">
          <PlanGrid
            tone="dark"
            plans={plans ?? []}
            variant="marketing"
            isLoading={isPending}
            error={error ? error.message : null}
            onRetry={() => void refetch()}
          />
        </div>

        {/* Said here rather than discovered at checkout. */}
        <Reveal>
          <div className="mx-auto mt-xxxl flex max-w-[760px] items-start gap-sm rounded-xl border border-white/10 bg-white/5 p-lg">
            <Landmark className="mt-[2px] size-5 shrink-0 text-primary-200" aria-hidden="true" />
            <p className="text-body-sm text-white/75">
              Paid plans are paid by bank transfer. After you choose a plan we show
              the account details and the amount due — upload the receipt and we
              activate your account, usually within one business day. Not ready to
              pay? Start with a 30-day free trial instead: no credit card, activated
              after a quick review, usually within 24 hours.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default PricingSection;
