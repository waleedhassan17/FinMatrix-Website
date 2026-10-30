// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ComparisonPicker } from '@/features/reports/ComparisonPicker';

describe('ComparisonPicker', () => {
  it('names the date an as-of comparison resolves to', () => {
    render(
      <ComparisonPicker kind="asOf" value="priorMonthEnd" asOf="2026-03-31" customDate={null} onChange={vi.fn()} />,
    );
    expect(screen.getByText('Feb 28, 2026')).toBeInTheDocument();
  });

  it('offers the custom date field, refusing a date on or after the statement', () => {
    render(
      <ComparisonPicker kind="asOf" value="custom" asOf="2026-03-31" customDate="2026-04-01" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Comparison date')).toHaveAttribute('max', '2026-03-30');
    expect(screen.getByText('Pick a date before the statement date.')).toBeInTheDocument();
  });

  it('names the window a range comparison resolves to', () => {
    render(
      <ComparisonPicker
        kind="range"
        value="lastYear"
        range={{ startDate: '2025-02-01', endDate: '2025-02-28' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Feb 1, 2024 – Feb 29, 2024')).toBeInTheDocument();
  });
});
