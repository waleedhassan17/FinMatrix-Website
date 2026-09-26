// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The report's controls: what a first-time reader relies on
// ═══════════════════════════════════════════════════════
// Three contracts worth pinning, because each fails silently:
//   • every item row leads to its explorer, carrying the period — a link that
//     drops the period opens the item on different figures than were clicked;
//   • the table pages rather than printing every item, and says where it is;
//   • the figure tabs say which one the chart draws (aria-selected), since the
//     highlight alone is invisible to a screen reader;
//   • the period menu applies a preset, and refuses a custom range that ends
//     before it starts.

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { InventoryItemsTable, type ItemsQuery } from '@/features/reports/InventoryItemsTable';
import { MetricTabs } from '@/features/reports/MetricTabs';
import { PeriodMenu } from '@/features/reports/PeriodMenu';
import { itemExplorerHref, type ValuationRow } from '@/models/inventoryValuation';
import { PERIOD_PRESETS, presetRange } from '@/models/reportPeriod';

beforeAll(() => {
  // Radix positions popovers with a ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const row = (i: number): ValuationRow => ({
  itemId: `item-${i}`,
  itemName: `Item ${String(i).padStart(3, '0')}`,
  sku: `SKU-${i}`,
  category: 'General',
  qty: 10,
  unitCost: 5,
  value: 1000 - i,
  unitsSold: 2,
  revenue: 100,
  cogs: 60,
  grossProfit: 40,
  marginPct: 40,
  lastSoldDate: '2026-09-01',
});

const QUERY: ItemsQuery = { search: '', category: '', filter: 'all', sort: 'value', dir: 'desc', page: 1 };
const RANGE = { startDate: '2026-01-01', endDate: '2026-09-26' };

describe('InventoryItemsTable', () => {
  const renderTable = (query = QUERY, onQuery = vi.fn()) =>
    render(
      <MemoryRouter>
        <InventoryItemsTable
          rows={Array.from({ length: 30 }, (_, i) => row(i + 1))}
          showSales
          query={query}
          onQuery={onQuery}
          hrefFor={(id) => itemExplorerHref(id, RANGE)}
        />
      </MemoryRouter>,
    );

  it('tells a new reader what to do, and every item leads to its explorer with the period', () => {
    renderTable();
    expect(screen.getByText(/Select any item to explore/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Item 001' });
    expect(link).toHaveAttribute('href', '/reports/inventory-valuation/item-1?from=2026-01-01&to=2026-09-26');
  });

  it('shows a page of rows and says where it is', async () => {
    const onQuery = vi.fn();
    renderTable(QUERY, onQuery);
    expect(screen.getAllByRole('link', { name: /^Item \d+$/ })).toHaveLength(25);
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onQuery).toHaveBeenCalledWith({ page: 2 });
  });

  it('sorts from a column heading', async () => {
    const onQuery = vi.fn();
    renderTable(QUERY, onQuery);
    const table = screen.getByRole('table');
    await userEvent.click(within(table).getByRole('button', { name: 'Gross profit' }));
    expect(onQuery).toHaveBeenCalledWith({ sort: 'grossProfit', dir: 'desc' });
  });
});

describe('MetricTabs', () => {
  it('marks the figure the chart draws, and chooses another', async () => {
    const onSelect = vi.fn();
    render(
      <MetricTabs
        items={[
          { key: 'revenue', label: 'Revenue', value: 'Rs 100.00' },
          { key: 'grossProfit', label: 'Gross profit', value: 'Rs 40.00' },
        ]}
        selected="revenue"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('tab', { name: /Revenue/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Gross profit/ })).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(screen.getByRole('tab', { name: /Gross profit/ }));
    expect(onSelect).toHaveBeenCalledWith('grossProfit');
  });
});

describe('PeriodMenu', () => {
  it('names the period and applies a preset', async () => {
    const onChange = vi.fn();
    render(<PeriodMenu label="Sales period" presets={PERIOD_PRESETS} value={presetRange('ytd')} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Sales period: Year to date/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Last month' }));
    expect(onChange).toHaveBeenCalledWith(presetRange('lastMonth'));
  });

  it('refuses a custom range that ends before it starts', async () => {
    const onChange = vi.fn();
    // A range that matches no preset, whatever today is.
    const custom = { startDate: '2025-02-03', endDate: '2025-05-20' };
    render(<PeriodMenu label="Sales period" presets={PERIOD_PRESETS} value={custom} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Sales period: Custom/ }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-06-01' } });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-02-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith({ startDate: '2025-02-01', endDate: '2025-05-20' });
  });
});
