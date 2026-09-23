// ═══════════════════════════════════════════════════════
// FinMatrix Web — Hero
// ═══════════════════════════════════════════════════════
// The one <h1> on the page, on the dark navy ground the rest of the page's rhythm
// is measured against.
//
// LAYOUT: `items-start`, not `items-center`. The product picture on the right is
// taller than the copy on the left, and centring them pushed the headline ~55px
// down under a large empty void. The picture takes a little top padding instead,
// so its top edge lines up with the headline rather than the eyebrow.
//
// THE CTA PROMISES ONLY WHAT HAPPENS. There is a 30-day free trial now, so it may
// be offered — but it is not instant: a person reviews each request and activates
// it within 24 hours, and the line under the buttons says so. Paid plans still run
// through a bank transfer and a human review; there is no card processor.
//
// THE EYEBROW NO LONGER NAMES A COUNTRY. It read "Built in Pakistan for warehouse
// & distribution", under a map pin, as the first line a visitor met — which fixed
// both the market and the industry before the product had been described at all.
// It names the category instead. The origin is not hidden; it moved to the footer,
// where diligence looks for it and where it does not narrow the pitch.

import { ArrowRight, CalendarClock, Check, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/motion/Reveal';
import {
  usePrefersReducedMotion,
  useScrollY,
} from '@/components/motion/useScrollY';
import { HeroPreview } from '@/features/landing/HeroPreview';
import { CONTACT_EMAILS_MAILTO } from '@/features/landing/constants';

const PROOF = [
  'Double-entry ledger',
  'Maker-checker approvals',
  'Web console + Android app',
];

/**
 * A demo request, as a mail rather than a form.
 *
 * A contact form needs somewhere to POST, and there is no endpoint for one. The
 * honest options were a mailto or a form that silently drops what a buyer types
 * into it; the second is worse than having no demo path at all.
 */
const DEMO_HREF = `mailto:${CONTACT_EMAILS_MAILTO}?subject=${encodeURIComponent(
  'FinMatrix demo request',
)}&body=${encodeURIComponent(
  'Company:\nWhat you move / sell:\nTeam size:\nWhere you are based:\n\nAnything you want us to cover:',
)}`;

export function HeroSection() {
  const scrollY = useScrollY();
  const reduced = usePrefersReducedMotion();

  // Parallax is the decorative half of the scroll position, so it is the half
  // that gets switched off. Capped so a long scroll cannot drift it off-screen.
  const offset = reduced ? 0 : Math.min(scrollY * 0.08, 40);

  return (
    <section className="relative isolate overflow-hidden surface-mesh-navy text-text-inverse">
      {/* Texture. Every layer is inert decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 texture-grain opacity-[0.07]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent"
      />

      <div className="mx-auto grid max-w-[1280px] items-start gap-xxxxl px-xl pt-[128px] pb-section lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-xxxl lg:pt-[160px] lg:pb-section-lg">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-xs rounded-full border glass-dark py-xxs pr-md pl-xxs text-label-sm text-white/85">
              <span className="flex size-6 items-center justify-center rounded-full bg-white/10">
                <Layers className="size-3.5 text-success-bright" aria-hidden="true" />
              </span>
              ERP for businesses that move stock
            </p>
          </Reveal>

          <Reveal delay={60}>
            {/* hero-* roles, not display-*: these carry the marketing face and
                sit at weight 600 rather than 800.

                The copy is shorter than it was, and the size is 62px rather
                than the 68px first tried. It read "Your stock and your books,
                the same number." — which at 68px in this column is three lines
                however it is balanced, and the browser hung "the" alone on the
                end of the second, the one break that splits a word from the
                phrase it belongs to. Sizing down far enough to fix it alone
                would have meant ~51px, BELOW the 56px this replaced. So the
                copy gave a word and the type gave 6px, and it sets as two even
                lines. "finally" went too: it argued with an objection the
                reader had not raised yet. */}
            <h1 className="mt-xl max-w-[720px] text-balance text-hero-md text-text-inverse sm:text-hero-lg lg:text-hero-xl">
              Your stock and books,{' '}
              <span className="gradient-text-light">the same number.</span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-lg max-w-[600px] text-pretty text-body-lg text-white/75">
              FinMatrix runs inventory, purchasing, deliveries and accounting on
              one ledger. Receive a purchase order and the stock, the supplier
              bill and the journal entry all move together — so month-end is a
              report you open, not a reconciliation you dread.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-xxl flex flex-wrap items-center gap-sm">
              <Button
                size="lg"
                asChild
                className="bg-surface px-xl text-primary-900 shadow-lg hover:bg-primary-50"
              >
                {/* BILLING-DISABLED BUILD: was "Start your free trial". */}
                <Link to="/register">
                  Create an account
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              {/* The enterprise door. Self-serve signup was the only way in, and
                  a company evaluating software for a team does not start by
                  creating itself an account.
                  BILLING-DISABLED BUILD: this slot held "See pricing" → #pricing
                  before the section was disabled. Restoring pricing means
                  deciding which of the two lives here. */}
              <Button
                size="lg"
                variant="text"
                asChild
                className="border border-white/20 bg-white/5 px-xl text-text-inverse hover:bg-white/10"
              >
                <a href={DEMO_HREF}>
                  <CalendarClock className="size-4" aria-hidden="true" />
                  Book a demo
                </a>
              </Button>
            </div>
            {/* BILLING-DISABLED BUILD: promised a 30-day trial. What is
                actually true now is the review step, so that is all it says. */}
            <p className="mt-sm text-body-sm text-white/65">
              Every feature, no credit card. Your account is activated after a quick review —
              usually within one business day.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <ul className="mt-xxl flex flex-wrap gap-x-xl gap-y-sm border-t border-white/10 pt-xl">
              {PROOF.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-xs text-body-sm text-white/80"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-success-bright/15">
                    <Check className="size-3 text-success-bright" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Shown on phones now. It was `hidden md:block`, so the visitors most
            likely to be meeting the product for the first time saw no picture of
            it at all. The floating cards inside stay xl-only, and the chart is a
            viewBox SVG at w-full, so the card body reflows rather than overflows. */}
        <Reveal delay={160} className="lg:pt-xxl">
          <div
            style={{ transform: `translateY(-${offset}px)` }}
            className="will-change-transform"
          >
            <HeroPreview />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default HeroSection;
