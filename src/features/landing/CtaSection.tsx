// ═══════════════════════════════════════════════════════
// FinMatrix Web — Closing CTA
// ═══════════════════════════════════════════════════════
// An inset panel floating on the light ground, not a full-bleed band. The old
// full-bleed navy (#1f4e79) butted straight into the near-black footer (#111d28)
// — two different dark navies with nothing between them, which read as a seam.
// A rounded panel with light around it removes the seam entirely.
//
// The reassurance line states facts, and only facts the product delivers.
//
// The free trial normally starts the moment it is asked for; a few requests are
// checked by a person first. The copy says exactly that — "most trials start
// instantly; a few are checked within 24 hours" — never a flat "instant access".
// "No credit card required" is true: there is no card anywhere in the flow.
// "Cancel anytime" stays out: nothing renews, so there is nothing to cancel.
// landingHonesty.test.tsx enforces all of this.

import { ArrowRight, CalendarClock, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/motion/Reveal';
const FACTS = [
  'No credit card required',
  'Most trials start instantly; a few are checked within 24 hours',
  'Every feature included',
];
// const FACTS = [
//   'No credit card required',
//   'Free trial activated after review, usually within 24 hours',
//   'Nothing renews automatically',
// ];

export function CtaSection() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="bg-background pb-section lg:pb-section-lg"
    >
      <div className="mx-auto max-w-[1280px] px-xl">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-2xl surface-mesh-navy px-xl py-xxxxl text-center text-text-inverse shadow-xl sm:px-xxxxl lg:py-section">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 texture-grain opacity-[0.07]"
            />

            <h2
              id="cta-heading"
              className="mx-auto max-w-[760px] text-display-sm text-text-inverse sm:text-display-md lg:text-hero-lg"
            >
              Put your stock and your ledger on the same page
            </h2>

            <p className="mx-auto mt-lg max-w-[560px] text-body-lg text-white/75">
              Set up your company in minutes and try every feature free for 30 days.
              Bring your data in from your old system, and add your team when you are ready.
            </p>

            <div className="mt-xxl flex flex-wrap justify-center gap-sm">
              {/* BILLING-DISABLED BUILD: was "Start your free trial". The
                  secondary "Create your account" button went with it — once
                  the primary says the same thing, two buttons to /register
                  side by side is just a duplicate. */}
              <Button
                size="lg"
                asChild
                className="bg-surface px-xl text-primary-900 shadow-lg hover:bg-primary-50"
              >
                <Link to="/register">
                  Start your 30-day free trial
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              {/* <Button
                size="lg"
                variant="text"
                asChild
                className="border border-white/20 bg-white/5 px-xl text-text-inverse hover:bg-white/10"
              >
                <Link to="/register">Create your account</Link>
              </Button> */}
              <Button
                size="lg"
                variant="text"
                asChild
                className="border border-white/20 bg-white/5 px-xl text-text-inverse hover:bg-white/10"
              >
                <Link to="/book-demo">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  Book a demo
                </Link>
              </Button>
            </div>

            {/* Sign-in stays reachable but stops competing with the two things
                a first-time visitor is actually here to do. */}
            <p className="mt-lg text-body-sm text-white/60">
              Already have an account?{' '}
              <Link
                to="/get-started"
                className="text-text-inverse underline underline-offset-4 hover:text-white/80"
              >
                Sign in
              </Link>
            </p>

            <ul className="mt-xl flex flex-wrap justify-center gap-x-xl gap-y-xs">
              {FACTS.map((fact) => (
                <li
                  key={fact}
                  className="flex items-center gap-xs text-body-sm text-white/70"
                >
                  <Check className="size-4 text-success-bright" aria-hidden="true" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default CtaSection;
