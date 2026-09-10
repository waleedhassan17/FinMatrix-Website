// ═══════════════════════════════════════════════════════
// FinMatrix Web — FAQ
// ═══════════════════════════════════════════════════════
// Two columns on wide screens: the heading and a contact card stay in view while
// the questions scroll beside them.
//
// Native <details>/<summary>: keyboard support, screen-reader semantics and the
// open/close state for free, with no JavaScript and no ARIA to get wrong.
//
// The trial question is answered honestly. Someone asking it has already decided
// they want the product; a dodge costs more trust than a plain "no" does.

import { Mail, Plus } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';
import { CONTACT_EMAIL } from '@/features/landing/constants';
import { SectionIntro } from '@/features/landing/SectionIntro';

const FAQS = [
  {
    q: 'Is there a free trial?',
    a: 'No. Plans are paid by bank transfer for a fixed term, and your account is activated once we verify the receipt. There is no card on file and nothing renews automatically — when a term ends you choose whether to pay for another.',
  },
  {
    q: 'How do my staff get accounts?',
    a: 'You create them. In Settings → Users you add a team member, and FinMatrix issues a username and password for you to hand over. Staff sign in with that username — they never need an email address, and if someone forgets their password you reset it yourself.',
  },
  {
    q: 'Can I use this with my accountant?',
    a: 'Yes. The ledger is standard double-entry with a full chart of accounts, and profit & loss, balance sheet, trial balance and general ledger all export. Your accountant works from the same entries you do.',
  },
  {
    q: 'Does it work on a phone?',
    a: 'This console runs in any modern browser, including a phone browser. Delivery riders use the separate FinMatrix Android app, which is built for working in a vehicle rather than at a desk.',
  },
  {
    q: 'What happens when a plan expires?',
    a: 'Your data stays exactly where it is. The account moves to a read-limited state and you are shown a renewal screen — pay for a new term and everything switches back on.',
  },
  {
    q: 'What if I run more riders than my plan allows?',
    a: 'The limit is enforced when you add delivery staff, and the app tells you how many of your allowance you have used. Moving up a tier is the same bank-transfer flow as the first purchase.',
  },
];

export function FaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 bg-background py-section lg:py-section-lg"
    >
      <div className="mx-auto grid max-w-[1200px] gap-xxxl px-lg lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-xxxxl">
        <div className="lg:sticky lg:top-[112px] lg:self-start">
          <SectionIntro
            id="faq-heading"
            overline="Questions"
            title="Before you sign up"
            body="The things people ask us first. Anything else — write to us."
          />

          <Reveal delay={80}>
            <div className="mt-xl flex items-center gap-md rounded-xl border border-border-light bg-surface p-lg shadow-card">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-50">
                <Mail className="size-5 text-primary" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-label-md text-text-primary">Talk to us</p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="block truncate text-body-sm text-primary hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="flex flex-col gap-sm">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.q} delay={i * 50}>
              <details className="group rounded-xl border border-border-light bg-surface shadow-card transition-[border-color,box-shadow] duration-200 open:border-primary-200 open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-md px-lg py-lg text-h4 text-text-primary marker:content-none [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 transition-[transform,background-color] duration-200 group-open:rotate-45 group-open:bg-primary motion-reduce:transition-none">
                    <Plus
                      className="size-4 text-primary transition-colors group-open:text-text-inverse"
                      aria-hidden="true"
                    />
                  </span>
                </summary>
                <p className="border-t border-border-light px-lg pt-md pb-lg text-body-md text-text-secondary">
                  {faq.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FaqSection;
