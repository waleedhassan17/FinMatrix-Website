// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The item explorer's table: the keyboard route through the chart
// ═══════════════════════════════════════════════════════
// Clicking a bar in an SVG chart is mouse-only. This table is how a keyboard
// or a screen reader chooses a metric and a month, so its row and month
// headings must stay buttons that say whether they are pressed.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MetricTable } from '@/features/reports/MetricTable';
import { buildExplorerMonths } from '@/models/itemExplorer';
import type { ItemPerformance } from '@/serializers/reportSerializers';

const PERF = {
  itemId: 'i1',
  itemName: 'Oil',
  sku: 'O',
  range: { startDate: '2026-08-01', endDate: '2026-09-26' },
  points: [
    { period: '2026-08', label: 'Aug 26', unitsSold: 2, revenue: 200, cogs: 260, grossProfit: -60, marginPct: -30, costKnown: true },
    { period: '2026-09', label: 'Sep 26', unitsSold: 3, revenue: 300, cogs: 180, grossProfit: 120, marginPct: 40, costKnown: true },
  ],
  totals: { unitsSold: 5, revenue: 500, cogs: 440, grossProfit: 60, marginPct: 12 },
  costHistoryFrom: null,
  estimatedCogsShare: 0,
  item: null,
  customers: [],
  otherCustomers: { count: 0, unitsSold: 0, revenue: 0, grossProfit: 0 },
} satisfies ItemPerformance;

const MONTHS = buildExplorerMonths(PERF, undefined);
const STOCK = ['closingQty', 'closingValue', 'qtyIn', 'qtyOut'] as const;

describe('MetricTable', () => {
  it('charts a metric from its row', async () => {
    const onMetric = vi.fn();
    render(<MetricTable months={MONTHS} metric="revenue" onMetric={onMetric} hidden={STOCK} />);

    const revenue = screen.getByRole('button', { name: 'Revenue' });
    expect(revenue).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Gross profit' }));
    expect(onMetric).toHaveBeenCalledWith('grossProfit');
  });

  it('opens a month from its heading, and closes it again', async () => {
    const onPeriod = vi.fn();
    const { rerender } = render(
      <MetricTable months={MONTHS} metric="revenue" onMetric={() => {}} onPeriod={onPeriod} hidden={STOCK} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sep 26' }));
    expect(onPeriod).toHaveBeenLastCalledWith('2026-09');

    rerender(
      <MetricTable
        months={MONTHS}
        metric="revenue"
        onMetric={() => {}}
        onPeriod={onPeriod}
        selectedPeriod="2026-09"
        hidden={STOCK}
      />,
    );
    const sep = screen.getByRole('button', { name: 'Sep 26' });
    expect(sep).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(sep);
    expect(onPeriod).toHaveBeenLastCalledWith(null);
  });

  it('ends each row on the period figure — a margin recomputed, not averaged', () => {
    render(<MetricTable months={MONTHS} metric="revenue" onMetric={() => {}} hidden={STOCK} />);
    const margin = screen.getByRole('button', { name: /Margin/ }).closest('tr') as HTMLElement;
    const cells = within(margin).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(['−30.0%', '40.0%', '12.0%']);
  });

  it('leaves out a series the server did not send', () => {
    render(<MetricTable months={MONTHS} metric="revenue" onMetric={() => {}} hidden={STOCK} />);
    expect(screen.queryByRole('button', { name: 'Stock on hand' })).toBeNull();
    expect(screen.queryByText('Stock')).toBeNull();
  });
});
