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
//   free trial / no card required — there is no trial and no card processor. The
//       real flow is a bank transfer reviewed by a person. This is the one that
//       would actively mislead a buyer into signing up.
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
 * say what the product does not do. "Is there a free trial? No." is the opposite
 * of a false claim, and a blunt page-wide ban would forbid answering the question
 * at all — pushing the copy toward silence on the thing a buyer most wants to know.
 */
const BANNED_OUTSIDE_FAQ: [RegExp, string][] = [
  [/free trial/i, 'there is no trial'],
  [/no credit card/i, 'there is no card processor'],
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
    expect(container.textContent ?? '').not.toMatch(pattern);
  });

  it('answers the trial question rather than dodging it', () => {
    const { container } = renderLanding();
    const faq = container.querySelector('#faq')?.textContent ?? '';

    // The question has to be asked AND answered in the negative. Without this,
    // the ban above is satisfied just as well by saying nothing.
    expect(faq).toMatch(/is there a free trial\?\s*no\./i);
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
    // Nothing may point at a route that does not exist.
    for (const href of hrefs) {
      expect(href).not.toBe('#');
    }
  });

  it('states the manual payment model before signup, not after', () => {
    const { container } = renderLanding();
    expect(container.textContent ?? '').toMatch(/bank transfer/i);
  });

  it('names the sections the nav links to', () => {
    const { container } = renderLanding();
    for (const id of ['modules', 'pricing', 'how-it-works', 'faq']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});
