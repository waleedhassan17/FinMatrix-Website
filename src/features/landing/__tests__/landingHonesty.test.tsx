// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The landing page may not make a claim we cannot stand behind
// ═══════════════════════════════════════════════════════
// Marketing copy drifts. Someone adds a "trusted by 500+ businesses" line because
// the section looks thin, or a "14-day free trial" because every competitor has
// one, and nobody catches it in review because it reads like normal marketing.
//
// Each pattern below is banned for a specific reason:
//
//   FBR / tax compliance — the product has tax RATES and a liability report. It
//       has no compliance certification, and claiming one is a regulatory claim.
//   unqualified instant access — the 30-day free trial normally starts the
//       moment it is asked for, but a few requests are held for a person, who
//       decides within 24 hours. So "instantly" may appear ONLY in the sentence
//       that also says so ("Most trials start instantly; a few are checked by
//       our team within 24 hours"). "Immediately", "right away" and a bare
//       "instant" would promise more than the backend guarantees.
//   competitor names and "N% cheaper" — we are not making comparative price
//       claims about other companies' products.
//   user / business counts, "trusted by" — invented social proof. There is no
//       public customer list and no audited usage figure to cite.
//   "most popular" — a popularity claim about our own plans that we have no
//       figures for. The highlighted plan says "Recommended" instead.
//
// If a line here fails, the fix is the copy, not the pattern.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import LandingPage from '@/pages/LandingPage';

/** Banned everywhere on the page, including the FAQ. */
const BANNED: [RegExp, string][] = [
  [/\bFBR\b/i, 'tax-authority compliance claim'],
  [/tax[- ]ready/i, 'tax-authority compliance claim'],
  [/tax compliance/i, 'tax-authority compliance claim'],
  [/quickbooks/i, 'competitor name'],
  [/xero|sage|zoho|tally/i, 'competitor name'],
  [/\d+%\s*(cheaper|less than)/i, 'comparative price claim'],
  [/trusted by/i, 'invented social proof'],
  [/\d+\s*\+?\s*(active )?(users|businesses|customers|companies)/i, 'invented usage figure'],
  [/most popular/i, 'popularity claim with no figures behind it'],
  [/\b(99\.9|99)%\s*uptime/i, 'uptime claim with no SLA behind it'],
  [/bank[- ]grade/i, 'unsubstantiated security claim'],
];

/**
 * Banned in the SELLING copy but allowed in the FAQ, which exists precisely to
 * say what the product does not do ("It is not instant: …"). A blunt page-wide
 * ban would forbid answering the question at all — pushing the copy toward
 * silence on the thing a buyer most wants to know.
 */
/** The one sentence allowed to say "instantly", because it carries the exception. */
const HONEST_TRIAL_SENTENCE = /most trials start instantly; a few are checked( by our team)? within 24 hours/gi;

const BANNED_OUTSIDE_FAQ: [RegExp, string][] = [
  [/instant(ly)?\b/i, 'a few trials are reviewed by a person, so "instant" needs its exception'],
  [/immediately/i, 'trials are reviewed by a person, not immediate'],
  [/right away|straight away/i, 'trials are reviewed by a person'],
  [/cancel anytime/i, 'nothing auto-renews, so there is nothing to cancel'],
];

const renderLanding = () => {
  const queryClient = new QueryClient({
    // The pricing section fetches; it must not retry or hit the network here.
    defaultOptions: { queries: { retry: false, enabled: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('landing page claims', () => {
  it.each(BANNED)('never says %s (%s)', (pattern) => {
    const { container } = renderLanding();
    expect(container.textContent ?? '').not.toMatch(pattern);
  });

  it.each(BANNED_OUTSIDE_FAQ)('never promises %s (%s)', (pattern) => {
    const { container } = renderLanding();
    const faq = container.querySelector('#faq');
    faq?.remove();
    const text = (container.textContent ?? '').replace(HONEST_TRIAL_SENTENCE, '');
    expect(text).not.toMatch(pattern);
  });

  // The trial is offered, and the exception is disclosed up front: a few
  // trials are checked by a person within 24 hours.
  it('offers the 30-day free trial and discloses the review', () => {
    const { container } = renderLanding();
    const text = container.textContent ?? '';

    expect(text).toMatch(/start your 30-day free trial/i);
    expect(text).toMatch(/a few are checked by our team within 24 hours/i);
  });

  it('answers the trial questions rather than dodging them', () => {
    const { container } = renderLanding();
    const faq = container.querySelector('#faq')?.textContent ?? '';
    expect(faq).toMatch(/is there a free trial\?\s*yes/i);
    expect(faq).toMatch(/24 hours/i);
    // Ending the trial deletes nothing — and there is no online payment.
    expect(faq).toMatch(/nothing is deleted/i);
    expect(faq).toMatch(/no online payment/i);
  });

  it('never offers the trial without saying it is reviewed', () => {
    const { container } = renderLanding();
    const faq = container.querySelector('#faq');
    faq?.remove();
    const text = container.textContent ?? '';

    // Wherever the selling copy mentions the trial, the 24-hour review is on
    // the page too.
    if (/free trial/i.test(text)) {
      expect(text).toMatch(/24 hours/i);
    }
  });
});

describe('landing page structure', () => {
  it('has exactly one h1', () => {
    const { container } = renderLanding();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('sends both primary calls to action somewhere real', () => {
    const { container } = renderLanding();
    const hrefs = [...container.querySelectorAll('a[href^="/"]')].map((a) =>
      a.getAttribute('href'),
    );

    expect(hrefs).toContain('/register');
    expect(hrefs).toContain('/get-started');
    // "Book a demo" is a real page now, never a mailto.
    expect(hrefs).toContain('/book-demo');
    const mailtos = [...container.querySelectorAll('a[href^="mailto:"]')]
      .map((a) => a.textContent ?? '')
      .filter((t) => /demo/i.test(t));
    expect(mailtos).toEqual([]);
    // Nothing may point at a route that does not exist.
    for (const href of hrefs) {
      expect(href).not.toBe('#');
    }
  });

  // What happens after the trial is said before signup, not after: no
  // online payment — the team switches a plan on.
  it('states how a plan is switched on before signup, not after', () => {
    const { container } = renderLanding();
    expect(container.textContent ?? '').toMatch(/request activation/i);
  });

  // it('states the manual payment model before signup, not after', () => {
  //   const { container } = renderLanding();
  //   expect(container.textContent ?? '').toMatch(/bank transfer/i);
  // });

  it('names the sections the nav links to', () => {
    const { container } = renderLanding();
    // BILLING-DISABLED BUILD: 'pricing' removed with the section.
    for (const id of ['modules', 'how-it-works', 'how-it-holds-up', 'faq']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  /**
   * The assurance section is what the page offers INSTEAD of the logo wall and
   * the user count the bans above rule out. If it is ever deleted because it
   * "looks thin", the page goes back to answering "why should I believe these
   * figures" with nothing — so it is pinned here rather than left to judgement.
   *
   * These are the two claims in it that are checkable outside the marketing
   * copy: the ledger is double-entry, and role separation is enforced by the
   * server rather than by the UI.
   */
  it('answers why the figures can be believed, without inventing proof', () => {
    const { container } = renderLanding();
    const section = container.querySelector('#how-it-holds-up');
    const text = section?.textContent ?? '';

    expect(section).not.toBeNull();
    expect(text).toMatch(/double-entry/i);
    expect(text).toMatch(/server/i);
    // Whatever it says, it may not reach for the things the bans exist to stop.
    expect(text).not.toMatch(/certified|guarantee/i);
  });
});
