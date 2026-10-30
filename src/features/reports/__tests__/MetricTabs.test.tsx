// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MetricTabs } from '@/features/reports/MetricTabs';

const items = [
  { key: 'revenue', label: 'Revenue', value: 'Rs 82,250.00', change: { text: '+75%', tone: 'good' as const }, trend: [0, 100, 0, 200] },
  { key: 'margin', label: 'Margin', value: '23.4%', change: { text: '−1.2 pts', tone: 'bad' as const } },
  { key: 'units', label: 'Units sold', value: '35', change: { text: '+15', tone: null } },
  { key: 'cost', label: 'Cost', value: '—', caption: 'No sales in this window' },
];

describe('MetricTabs', () => {
  it('shows each figure with its move, and charts the one chosen', () => {
    const onSelect = vi.fn();
    render(<MetricTabs items={items} selected="revenue" onSelect={onSelect} label="Metric to chart" />);
    const revenue = screen.getByRole('tab', { name: /Revenue/ });
    expect(revenue).toHaveAttribute('aria-selected', 'true');
    expect(within(revenue).getByText('+75%')).toHaveClass('text-success');
    expect(within(screen.getByRole('tab', { name: /Margin/ })).getByText('−1.2 pts')).toHaveClass('text-danger');
    // A move with no direction of good news is stated, not coloured.
    expect(within(screen.getByRole('tab', { name: /Units sold/ })).getByText('+15')).not.toHaveClass('text-success');
    expect(within(screen.getByRole('tab', { name: /Cost/ })).getByText('No sales in this window')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Margin/ }));
    expect(onSelect).toHaveBeenCalledWith('margin');
  });

  it('draws the shape as decoration, so the tab is read as its figure', () => {
    render(<MetricTabs items={items} selected="revenue" onSelect={() => {}} />);
    const revenue = screen.getByRole('tab', { name: /Revenue/ });
    expect(within(revenue).queryByRole('img')).not.toBeInTheDocument();
    expect(revenue.textContent).not.toContain('by month');
  });
});
