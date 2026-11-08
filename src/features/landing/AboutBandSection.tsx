// ═══════════════════════════════════════════════════════
// FinMatrix Web — About FinMatrix (homepage band)
// ═══════════════════════════════════════════════════════
// The business facts, in the same words as /about and the metadata
// (siteMeta.ts), plus the one line a reader of a product called "Fin…" most
// needs: this is business software, not a financial service.
//
// Short on purpose. The full story is on /about; this band exists so the facts
// are on the homepage itself, where a reviewer looks first.

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Reveal } from '@/components/motion/Reveal';
import { SectionIntro } from '@/features/landing/SectionIntro';
import { BUSINESS } from '@/features/site/siteMeta';

const FACTS: [string, string][] = [
  ['What it is', BUSINESS.type],
  ['Industry', BUSINESS.industry],
  ['Business model', BUSINESS.model],
  ['Based in', BUSINESS.country],
  ['Runs on', 'Web console and Android app'],
];

const LINKS = [
  { to: '/about', label: 'About FinMatrix' },
  { to: '/contact', label: 'Contact us' },
  { to: '/acceptable-use-policy#whatsapp', label: 'WhatsApp messaging policy' },
];

export function AboutBandSection() {
  return (
    <section
      id="about-finmatrix"
      aria-labelledby="about-band-heading"
      className="bg-primary-50 py-section lg:py-section-lg"
    >
      <div className="mx-auto grid max-w-[1280px] gap-xxxl px-xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <SectionIntro
            id="about-band-heading"
            overline="About FinMatrix"
            title="Business management software, built in Pakistan"
            body={BUSINESS.notAFinancialService}
          />
          <Reveal>
            <ul className="mt-xl flex flex-wrap gap-x-xl gap-y-sm">
              {LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="inline-flex items-center gap-xs text-label-md text-primary underline-offset-4 hover:underline"
                  >
                    {link.label}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal>
          <dl className="divide-y divide-border-light overflow-hidden rounded-xl border border-primary-100 bg-surface shadow-card">
            {FACTS.map(([label, value]) => (
              <div key={label} className="grid gap-xxs px-lg py-md sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-lg">
                <dt className="text-label-md text-text-tertiary">{label}</dt>
                <dd className="text-body-md text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

export default AboutBandSection;
