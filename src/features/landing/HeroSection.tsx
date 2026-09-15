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

import { ArrowRight, Check, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/motion/Reveal';
import {
  usePrefersReducedMotion,
  useScrollY,
} from '@/components/motion/useScrollY';
import { HeroPreview } from '@/features/landing/HeroPreview';

const PROOF = [
  'Double-entry ledger',
  'Maker-checker approvals',
  'Web console + Android app',
];

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

      <div className="mx-auto grid max-w-[1200px] items-start gap-xxxxl px-lg pt-[128px] pb-section lg:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)] lg:gap-xxxl lg:pt-[160px] lg:pb-section-lg">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-xs rounded-full border glass-dark py-xxs pr-md pl-xxs text-label-sm text-white/85">
              <span className="flex size-6 items-center justify-center rounded-full bg-white/10">
                <MapPin className="size-3.5 text-success-bright" aria-hidden="true" />
              </span>
              Built in Pakistan for warehouse &amp; distribution
            </p>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-xl max-w-[620px] text-display-md text-text-inverse sm:text-display-lg lg:text-display-xl">
              Your stock and your books,{' '}
              <span className="gradient-text-light">finally the same number.</span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-lg max-w-[560px] text-body-lg text-white/75">
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
                <Link to="/register">
                  Start your free trial
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="text"
                asChild
                className="border border-white/20 bg-white/5 px-xl text-text-inverse hover:bg-white/10"
              >
                <a href="#pricing">See pricing</a>
              </Button>
            </div>
            <p className="mt-sm text-body-sm text-white/65">
              30 days, every feature, no credit card. Activated after a quick review — usually
              within 24 hours.
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

        <Reveal delay={160} className="hidden md:block lg:pt-xxl">
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
