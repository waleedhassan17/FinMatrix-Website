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
// they want the product, so the answer says exactly what they get and — just as
// plainly — what they do not: one trial per business, a few checked by a person.

import { Link } from 'react-router-dom';
import { Mail, Plus } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';
import { CONTACT_EMAILS } from '@/features/landing/constants';
import { SectionIntro } from '@/features/landing/SectionIntro';

// Each answer says only what the product does. The free trial is real and
// normally instant; a few requests are checked by a person; nothing is sold
// online; and data is never deleted when a trial ends.
const FAQS = [
  {
    q: 'Is there a free trial?',
    a: 'Yes — 30 days with the full Warehouse system and one delivery rider, no credit card. Most trials start the moment you set up your company; a few are checked by our team first, usually within 24 hours. There is one free trial per business.',
  },
  {
    q: 'What happens when the trial ends?',
    a: 'Your account pauses and your data is kept — nothing is deleted. You can still sign in, download a full backup of your company, and press "Request activation": our team agrees a plan with you and switches it on. There is no online payment.',
  },
  {
    q: 'Can I bring my data from my current software?',
    a: 'Yes. The Migration Center reads the exports of the common accounting packages used in Pakistan, and plain spreadsheets. It checks your opening balances, customers, suppliers and stock to the rupee against your old system before anything is posted, and you can undo the import.',
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
    a: 'Yes — two ways. FinMatrix has an Android app, and this website works in the browser on any phone, tablet, laptop or desktop, with nothing to install. Both use the same account and the same live data, so an invoice raised on your phone is on your desktop straight away. Delivery riders work from the Android app, which is built for use on the road.',
  },
  // BILLING-DISABLED BUILD: no plan, so no expiry and no rider allowance.
  // {
  //   q: 'What happens when a plan expires?',
  //   a: 'Your data stays exactly where it is. The account moves to a read-limited state and you are shown a renewal screen — pay for a new term and everything switches back on.',
  // },
  // {
  //   q: 'What if I run more riders than my plan allows?',
  //   a: 'The limit is enforced when you add or reactivate delivery staff, and the app tells you how many of your allowance you have used. If you move to a plan with fewer riders, the extra riders are paused — their accounts and history are kept. Riders with deliveries in progress and your longest-serving riders keep their seats first, and you can swap who is active at any time. Moving up a tier is the same bank-transfer flow as the first purchase.',
  // },
];

export function FaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 bg-background py-section lg:py-section-lg"
    >
      <div className="mx-auto grid max-w-[1280px] gap-xxxl px-xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-xxxxl">
        <div className="lg:sticky lg:top-[112px] lg:self-start">
          <SectionIntro
            id="faq-heading"
            overline="Questions"
            title="Before you sign up"
            body="The things people ask us first. Anything else — write to us."
          />

          {/* Two addresses, listed plainly, with nothing said about who is
              behind them. An earlier draft framed these as the founders'
              addresses; that is the kind of detail a company knows about itself
              and does not announce. A buyer wants to know where to write, not
              how many people will read it. */}
          <Reveal delay={80}>
            <div className="mt-xl flex items-start gap-md rounded-xl border border-border-light bg-surface p-lg shadow-card">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-50">
                <Mail className="size-5 text-primary" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-label-md text-text-primary">Talk to us</p>
                <ul className="mt-sm flex flex-col gap-xxs">
                  {CONTACT_EMAILS.map((email) => (
                    <li key={email}>
                      <a
                        href={`mailto:${email}`}
                        className="block truncate text-body-sm text-primary transition-colors hover:underline"
                      >
                        {email}
                      </a>
                    </li>
                  ))}
                </ul>
                <Link to="/book-demo" className="mt-sm inline-block text-label-md text-primary hover:underline">
                  Book a demo →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="flex flex-col gap-sm">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.q} delay={i * 50}>
              {/* data-animated is read by a ::details-content rule in
                  src/index.css, behind an @supports guard. Where the browser
                  does not support it the accordion snaps open exactly as it
                  always has. */}
              <details
                data-animated
                className="group rounded-xl border border-border-light bg-surface shadow-card transition-[border-color,box-shadow] duration-200 open:border-primary-200 open:shadow-md"
              >
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
