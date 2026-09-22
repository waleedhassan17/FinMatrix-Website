// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The aging matrix' interaction contract
// ═══════════════════════════════════════════════════════
// This is a DOM test where the chart deliberately has none. AgingTable is plain
// HTML — no Recharts, no ResponsiveContainer, so no ResizeObserver stub and no
// zero-size render problem. What it carries is worth pinning:
//
//   • the column headings are the KEYBOARD route to a bucket filter. Clicking a
//     bar in an SVG chart is not one, so if these stop being buttons the filter
//     becomes mouse-only and nobody notices from a type error.
//   • the footer relabels itself under a filter. It keeps printing the server's
//     totals — correct for the selected column, deliberately not a visible sum
//     for the others — and "Total (all parties)" is the only thing that makes
//     that honest rather than wrong.
//
// The ordering and filtering are tested in models/__tests__/reportAging.test.ts,
// under node, where they belong.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgingTable } from '@/features/reports/AgingTable';
import type { AgingBucketDef, AgingRow, AgingTotals } from '@/serializers/reportSerializers';

const BUCKETS: AgingBucketDef[] = [
  { key: 'current', label: 'Current', minDays: 0, maxDays: 0 },
  { key: 'd1to30', label: '1–30', minDays: 1, maxDays: 30 },
  { key: 'd31plus', label: '31 and over', minDays: 31, maxDays: null },
];

const ROWS: AgingRow[] = [
  {
    customerId: 'c1',
    customerName: 'Allama Traders',
    amounts: { current: 500, d1to30: 300 },
    total: 800,
    current: 0,
    bucket1to30: 0,
    bucket31to60: 0,
    bucket61to90: 0,
    bucket90Plus: 0,
  },
];

const TOTALS: AgingTotals = {
  amounts: { current: 500, d1to30: 300, d31plus: 0 },
  current: 500,
  bucket1to30: 300,
  bucket31to60: 0,
  bucket61to90: 0,
  bucket90Plus: 0,
  total: 800,
};

const setup = (props: Partial<Parameters<typeof AgingTable>[0]> = {}) =>
  render(
    <AgingTable
      buckets={BUCKETS}
      rows={ROWS}
      totals={TOTALS}
      counterpartyHeader="Customer"
      {...props}
    />,
  );

describe('AgingTable', () => {
  it('renders a column per bucket, plus the counterparty and total', () => {
    setup();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    for (const b of BUCKETS) {
      expect(screen.getByText(b.label)).toBeInTheDocument();
    }
    expect(screen.getByText('Allama Traders')).toBeInTheDocument();
  });

  it('makes the column headings buttons when selection is offered', async () => {
    const onSelectBucket = vi.fn();
    setup({ onSelectBucket });

    await userEvent.click(screen.getByRole('button', { name: '1–30' }));
    expect(onSelectBucket).toHaveBeenCalledWith('d1to30');
  });

  it('leaves the headings inert when selection is not offered', () => {
    setup();
    expect(screen.queryByRole('button', { name: '1–30' })).toBeNull();
  });

  it('clicking the selected column clears the filter rather than re-selecting it', async () => {
    const onSelectBucket = vi.fn();
    setup({ onSelectBucket, selectedBucket: 'd1to30' });

    const heading = screen.getByRole('button', { name: '1–30' });
    expect(heading).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(heading);
    expect(onSelectBucket).toHaveBeenCalledWith(null);
  });

  it('marks only the selected heading as pressed', () => {
    const onSelectBucket = vi.fn();
    setup({ onSelectBucket, selectedBucket: 'd1to30' });

    expect(screen.getByRole('button', { name: '1–30' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Current' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  // Scoped to <tfoot>: the row-total COLUMN heading always reads "Total" and
  // should. It is the footer's first cell that has to relabel.
  const footerLabel = (container: HTMLElement) =>
    container.querySelector('tfoot td')?.textContent;

  it('says the footer covers all parties once a filter hides some', () => {
    const { container } = setup({ selectedBucket: 'd1to30' });
    expect(footerLabel(container)).toBe('Total (all parties)');
  });

  it('says plain "Total" when nothing is filtered', () => {
    const { container } = setup();
    expect(footerLabel(container)).toBe('Total');
  });

  it('never renders a blank counterparty name', () => {
    setup({
      rows: [{ ...ROWS[0], customerName: '   ' }],
    });
    expect(screen.getByText('(no name)')).toBeInTheDocument();
  });

  it('renders an empty body without throwing when every party is filtered out', () => {
    const { container } = setup({ rows: [], selectedBucket: 'd31plus' });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
    // The server's totals still print — that is the point of the relabel.
    expect(footerLabel(container)).toBe('Total (all parties)');
  });
});
