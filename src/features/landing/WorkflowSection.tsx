// ═══════════════════════════════════════════════════════
// FinMatrix Web — How it works
// ═══════════════════════════════════════════════════════
// On a tinted navy ground so it reads as its own band between two white ones.
//
// Step 3 names the manual review, because that is genuinely what happens: you
// transfer to a bank account, upload the receipt, and a person activates the
// account. Leaving it out here and springing it on the buyer at checkout reads as
// a bait-and-switch even when it was an oversight.

import { Building2, Landmark, PackageCheck, UserPlus } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';
import { SectionIntro } from '@/features/landing/SectionIntro';

const STEPS = [
  {
    n: '01',
    icon: UserPlus,
    title: 'Create your account',
    body: 'Sign up with your email and confirm it. You are the owner of the company you create, with full access.',
  },
  {
    n: '02',
    icon: Building2,
    title: 'Set up your company and plan',
    body: 'Add your business details, then pick a plan sized to your delivery team. You will see the bank details and the exact amount due.',
  },
  {
    n: '03',
    icon: Landmark,
    title: 'Transfer and upload the receipt',
    body: 'Pay by bank transfer and upload a screenshot. We verify it and switch the account on — usually within one business day.',
  },
  {
    n: '04',
    icon: PackageCheck,
    title: 'Load your items and start invoicing',
    body: 'Import or add items, customers and suppliers, then add your team. Staff get their own sign-in with only what they need.',
  },
];

export function WorkflowSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="relative isolate scroll-mt-20 overflow-hidden bg-primary-50 py-section lg:py-section-lg"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 pattern-grid fade-mask-radial"
      />

      <div className="mx-auto max-w-[1200px] px-lg">
        <SectionIntro
          id="how-heading"
          overline="Getting started"
          title="From sign-up to your first invoice"
          body="Four steps. The only wait is ours: we verify your payment, and then the whole system is yours."
        />

        <div className="relative mt-xxxxl">
          {/* The rail shows only in the gaps between cards — each card's white
              surface covers the part behind it. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[48px] right-[12.5%] left-[12.5%] hidden h-[2px] rounded-full bg-linear-to-r from-primary-200 via-primary to-primary-200 lg:block"
          />

          <ol className="relative grid gap-lg md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal as="li" key={step.n} delay={i * 90}>
                  <div className="relative flex h-full flex-col rounded-xl border border-primary-100 bg-surface p-xl shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                    <div className="flex items-center justify-between">
                      <span className="flex size-12 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary-800 text-text-inverse shadow-md ring-4 ring-primary-50">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-display-md tabular text-primary-100"
                      >
                        {step.n}
                      </span>
                    </div>
                    <h3 className="mt-lg text-h3 text-text-primary">{step.title}</h3>
                    <p className="mt-sm text-body-md text-text-secondary">{step.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default WorkflowSection;
