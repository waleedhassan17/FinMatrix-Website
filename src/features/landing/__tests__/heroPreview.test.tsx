// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The product picture shows real figures on the first paint
// ═══════════════════════════════════════════════════════
// The two KPI tiles count up. A count-up written the obvious way — seed the
// display at zero, animate toward the target — is correct in a browser and
// wrong everywhere else: the figures would read 0.00 on the first paint, for
// the whole duration under a reduced-motion preference, and permanently in any
// environment without requestAnimationFrame.
//
// So the state seeds to the FINAL string and the animation only ever replaces
// it temporarily. That inversion is the entire design, it is invisible in
// review, and this is what pins it.
//
// The figures themselves are illustrative, not a customer's books, which is why
// asserting on them here is safe: they are fixed copy in the component.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeroPreview } from '@/features/landing/HeroPreview';
import { formatAmount } from '@/utils/money';

describe('HeroPreview', () => {
  it('renders both KPI figures in full on the first paint, never mid-count', () => {
    render(<HeroPreview />);

    // The exact strings the product's own formatter produces, so this fails if
    // the count-up's intermediate formatting ever becomes the rendered value.
    expect(screen.getByText(formatAmount(4820000))).toBeInTheDocument();
    expect(screen.getByText(formatAmount(1264500))).toBeInTheDocument();
  });

  it('shows no currency symbol, so the picture names no market', () => {
    const { container } = render(<HeroPreview />);
    const text = container.textContent ?? '';

    // formatMoney's default prefix is 'Rs ' — the picture is the part of the
    // page a visitor reads as evidence, and it must not quietly pick a country.
    expect(text).not.toMatch(/\bRs\b/);
    expect(text).not.toMatch(/[$€£₨]/);
  });

  it('exposes the whole picture as one labelled image', () => {
    render(<HeroPreview />);

    // Forty fragments of illustrative invoice data read out one by one is not
    // information; it is noise that sounds like a customer's books.
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label');
    expect(img.getAttribute('aria-label')).toMatch(/illustration/i);
  });
});
