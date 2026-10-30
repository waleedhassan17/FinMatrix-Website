// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DonutChart } from '@/features/reports/DonutChart';
import { OTHER_KEY } from '@/models/chartSlices';
import { CATEGORY_PALETTE } from '@/theme/tokens';

const slices = [
  { key: 'grocery', label: 'Grocery', value: 7500, count: 12 },
  { key: 'tools', label: 'Tools', value: 2000, count: 3 },
  { key: OTHER_KEY, label: 'Other (4)', value: 500, count: 6 },
];

const draw = (props: Partial<Parameters<typeof DonutChart>[0]> = {}) =>
  render(
    <DonutChart
      title="Stock value by category"
      slices={slices}
      palette={CATEGORY_PALETTE}
      centerLabel="Stock value"
      labelHeader="Category"
      countLabel={(n) => `${n} items`}
      {...props}
    />,
  );

describe('DonutChart', () => {
  it('names every slice in a table — value, share and count — with the whole at the foot', () => {
    draw();
    const table = screen.getByRole('table', { name: 'Stock value by category' });
    const grocery = within(table).getByText('Grocery').closest('tr') as HTMLElement;
    expect(within(grocery).getByText('Rs 7,500.00')).toBeInTheDocument();
    expect(within(grocery).getByText('75%')).toBeInTheDocument();
    expect(within(grocery).getByText('12 items')).toBeInTheDocument();
    // A sliver keeps a decimal rather than rounding to nothing.
    expect(within(table).getByText('5.0%')).toBeInTheDocument();
    const foot = within(table).getByText('Total').closest('tr') as HTMLElement;
    expect(within(foot).getByText('Rs 10,000.00')).toBeInTheDocument();
    // The whole sits in the ring's centre.
    expect(screen.getByText('Rs 10K')).toBeInTheDocument();
  });

  it('makes each named slice a choice, and never Other', () => {
    const onSelect = vi.fn();
    draw({ onSelect, selectVerb: 'List the items in', selectedKey: 'tools' });
    fireEvent.click(screen.getByRole('button', { name: 'List the items in Grocery' }));
    expect(onSelect).toHaveBeenCalledWith('grocery');
    expect(screen.getByRole('button', { name: 'List the items in Tools' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Other/ })).toBeNull();
  });

  it('reads the server’s share when it sent one', () => {
    draw({ slices: [{ key: 'rent', label: 'Rent', value: 30000, sharePct: 66.67 }] });
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('says so when there is nothing to draw', () => {
    draw({ slices: [{ key: 'a', label: 'A', value: 0 }] });
    expect(screen.getByText('Nothing to show for this view.')).toBeInTheDocument();
  });
});

describe('DonutChart — rows that open a record', () => {
  it('links the rows that lead somewhere, never Other, and leaves the ring to highlight', () => {
    render(
      <MemoryRouter>
        <DonutChart
          title="Revenue by customer"
          slices={[
            { key: 'k1', label: 'Karim Store', value: 600, count: 6 },
            { key: 'none-1', label: '(no customer)', value: 300, count: 3 },
            { key: OTHER_KEY, label: 'Other (4)', value: 100, count: 1 },
          ]}
          palette={CATEGORY_PALETTE}
          centerLabel="Revenue"
          labelHeader="Customer"
          valueHeader="Revenue"
          hrefFor={(key) => (key.startsWith('none-') ? null : `/customers/${key}`)}
        />
      </MemoryRouter>,
    );
    const table = screen.getByRole('table', { name: 'Revenue by customer' });
    expect(within(table).getByRole('link', { name: 'Open Karim Store' })).toHaveAttribute('href', '/customers/k1');
    // Nowhere to go for a walk-in sale, and Other is not one customer.
    expect(within(table).getAllByRole('link')).toHaveLength(1);
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });
});
