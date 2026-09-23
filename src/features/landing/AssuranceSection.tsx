// ═══════════════════════════════════════════════════════
// FinMatrix Web — "How it holds up"
// ═══════════════════════════════════════════════════════
// This is the section that does the work a logo wall normally does, and it
// exists because the page is not allowed to fake one.
//
// landingHonesty.test.tsx bans customer counts, "trusted by", uptime figures and
// "bank-grade" — every shortcut to looking established. Those bans are right:
// there is no public customer list and no audited figure to cite. But the
// absence left a real hole. A buyer comparing vendors asks "why should I believe
// this will not lose my numbers", and the page answered with nothing.
//
// So it answers with the things that ARE true and ARE checkable, which is a
// better answer than a logo wall anyway:
//
//   • The reports agree with each other, and a test proves it rather than a
//     sentence promising it. VERIFY.md records the reconciliation suite and the
//     SQL invariants that keep AR aging tied to balance-sheet 1100 and AP to 2000.
//   • Double-entry underneath, so stock and books cannot drift apart by hand.
//   • Four roles, separated on the server — already asserted in the footer's
//     legal line, where nobody reads it.
//   • Approvals and an audit log (the `auditLog` module, src/types/index.ts).
//
// WHAT MAY NOT GO IN HERE: uptime, certification, encryption strength, or
// anything about tax authorities. None of it is substantiated, and several are
// banned outright. If a claim cannot be pointed at something in the repo or in
// VERIFY.md, it does not belong on this page.
//
// It is a DARK band on purpose. Disabling the pricing section removed the page's
// only dark surface between the hero and the footer, leaving five light sections
// in a row and no rhythm. This puts the anchor back where pricing used to sit.

import { GitCompareArrows, Scale, ScrollText, UsersRound } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';
import { SectionIntro } from '@/features/landing/SectionIntro';

const ASSURANCES = [
  {
    icon: GitCompareArrows,
    title: 'The reports agree with each other',
    body:
      'What customers owe you, aged into buckets, adds up to what the balance sheet says they owe you. The same holds for suppliers. A reconciliation suite checks it against a live database before a release ships, so it is a tested property rather than an intention.',
  },
  {
    icon: Scale,
    title: 'Double-entry underneath, not totals in a table',
    body:
      'Receive a purchase order and the stock movement, the supplier bill and the journal entry are posted together, balanced. There is no path through the product where the store room and the ledger quietly stop agreeing.',
  },
  {
    icon: UsersRound,
    title: 'Roles are separated on the server',
    body:
      'An owner, a team member, a delivery rider and an administrator see different systems. The boundary is enforced where the data is, not by hiding buttons in the browser — a rider who types a finance URL is refused by the API, not by the page.',
  },
  {
    icon: ScrollText,
    title: 'Approvals, and a record of what happened',
    body:
      'Documents that move money can be made to wait for a second person before they count. What was approved, by whom and when stays on the record afterwards.',
  },
];

export function AssuranceSection() {
  return (
    <section
      id="how-it-holds-up"
      aria-labelledby="assurance-heading"
      className="relative isolate overflow-hidden surface-mesh-navy py-section lg:py-section-lg"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial"
      />

      <div className="mx-auto max-w-[1280px] px-xl">
        <SectionIntro
          id="assurance-heading"
          tone="dark"
          overline="How it holds up"
          title="Numbers you can defend in a meeting"
          body="Accounting software is only worth anything if its figures survive being questioned. These are the things FinMatrix does so that yours do."
        />

        <div className="mt-xxxl grid gap-lg md:grid-cols-2">
          {ASSURANCES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 70}>
              {/* The lift matches ModulesSection's, retuned for a dark ground:
                  there is no shadow to deepen against navy, so the border and
                  the panel fill carry it instead. The transition lives HERE and
                  not on the Reveal wrapper, which owns its own. */}
              <div className="group h-full rounded-xl border border-white/10 bg-white/[0.04] p-xl transition-[transform,background-color,border-color] duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.07] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <span className="flex size-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15 transition-colors duration-300 group-hover:bg-success-bright/15 group-hover:ring-success-bright/30">
                  <Icon className="size-5 text-success-bright" aria-hidden="true" />
                </span>
                <h3 className="mt-lg text-h3 text-text-inverse">{title}</h3>
                <p className="mt-sm text-body-md text-white/70">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default AssuranceSection;
