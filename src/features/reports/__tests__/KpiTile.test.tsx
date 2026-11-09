// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fitFigureFontSize } from '@/features/reports/fitFigure';
import { KpiTile } from '@/features/reports/KpiTile';

describe('fitFigureFontSize', () => {
  it('caps at the headline size and floors at 12px', () => {
    expect(fitFigureFontSize('Rs 1,395,316.45')).toBe(
      'clamp(12px, calc(100cqi / 7.80), var(--text-h3, 19px))',
    );
  });

  it('gives a longer figure a larger divisor, so it shrinks sooner', () => {
    const divisor = (s: string) => Number(fitFigureFontSize(s).match(/100cqi \/ ([\d.]+)/)![1]);
    expect(divisor('Rs 123,545,423,399.52')).toBeGreaterThan(divisor('Rs 1,395,316.45'));
  });

  it('survives an empty string', () => {
    expect(fitFigureFontSize('')).toContain('100cqi / 0.52');
  });
});

describe('KpiTile', () => {
  // A billion-rupee stock value used to be clipped by the tile. It now stays
  // whole, on one line, in a tile that is a size container.
  it('renders a billion-rupee figure whole and on one line', () => {
    const { container } = render(<KpiTile label="Stock value" value={1395316450} />);
    const value = screen.getByText('Rs 1,395,316,450.00');
    expect(value).toHaveClass('whitespace-nowrap', 'text-h3');
    expect(container.firstElementChild).toHaveClass('@container');
  });

  it('keeps the exact figure on hover when it shows the compact form', () => {
    render(<KpiTile label="Revenue" value={1395316450} compact />);
    expect(screen.getByText('Rs 1.4B')).toHaveAttribute('title', 'Rs 1,395,316,450.00');
  });
});
