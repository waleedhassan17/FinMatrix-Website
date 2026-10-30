// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import InventoryValuationPage from '@/pages/reports/InventoryValuationPage';
import { requestLog } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { AS_OF } from '@/test/msw/reportsV2Fixtures';
import { locationRef, renderReport, startMsw } from '@/test/renderReport';

startMsw();

const valuation = (asOfDate?: string) => ({
  rows: [
    { itemId: 'item-1', itemName: 'Rice 5kg', sku: 'RICE-5', category: 'Grocery', qty: asOfDate ? 2 : 4, cost: 1200, value: asOfDate ? 2400 : 4800 },
  ],
  byCategory: [{ category: 'Grocery', totalValue: asOfDate ? 2400 : 4800 }],
  totalValue: asOfDate ? 2400 : 4800,
  ...(asOfDate ? { asOfDate, ledgerTie: { gl1200: 2400, valuation: 2400, gap: 0 }, coverage: { pct: 92.5, message: 'two items have no cost history' } } : {}),
});

beforeEach(() => {
  server.use(
    http.get('*/reports/inventory-valuation/trend', () => HttpResponse.json({ months: 12, points: [] })),
    http.get('*/reports/inventory-valuation', ({ request }) => {
      const url = new URL(request.url);
      requestLog.push(url);
      return HttpResponse.json(valuation(url.searchParams.get('asOfDate') ?? undefined));
    }),
    http.get('*/reports/inventory-performance', () => HttpResponse.json({ rows: [], totals: {} })),
  );
});

const open = (search: string) =>
  renderReport('/reports/inventory-valuation', `/reports/inventory-valuation${search}`, <InventoryValuationPage />);

describe('InventoryValuationPage — Health tab and as-of stock (reports v2)', () => {
  it('adds a Health tab with turnover, DIO, dead stock and reorder figures', async () => {
    open('?tab=health');
    expect(await screen.findByText('Inventory turnover')).toBeInTheDocument();
    expect(screen.getByText('4.20×')).toBeInTheDocument();
    expect(screen.getByText('87 days')).toBeInTheDocument();
    // Reorder is the default view: the suggested quantity is the server's.
    const reorder = screen.getByRole('table', { name: 'Items below their reorder point' });
    const rice = within(reorder).getByText('Rice 5kg').closest('tr') as HTMLElement;
    expect(within(rice).getByText('20')).toBeInTheDocument();
  });

  it('switches health views through the URL', async () => {
    open('?tab=health');
    fireEvent.click(await screen.findByRole('button', { name: 'Dead stock' }));
    await waitFor(() => expect(locationRef.current?.search).toContain('health=dead'));
    const dead = screen.getByRole('table', { name: 'Stock with no outbound movement in 180 days' });
    expect(within(dead).getByText('Never')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Locations' }));
    expect(await screen.findByText('Main warehouse')).toBeInTheDocument();
  });

  it('values stock as of a date, with the server’s ledger tie and its coverage', async () => {
    open(`?asOf=${AS_OF}`);
    expect(await screen.findByLabelText(/Stock value = Inventory \(1200\) in the ledger: ties/)).toBeInTheDocument();
    expect(requestLog.some((u) => u.pathname.endsWith('/inventory-valuation') && u.searchParams.get('asOfDate') === AS_OF)).toBe(true);
    expect(screen.getByText(/covers 92\.5% of the history/)).toBeInTheDocument();
  });

  it('keeps today’s snapshot request unchanged when no date is chosen', async () => {
    open('');
    await screen.findByText('Rice 5kg');
    const req = requestLog.find((u) => u.pathname.endsWith('/inventory-valuation'));
    expect(req?.searchParams.has('asOfDate')).toBe(false);
  });
});

describe('InventoryValuationPage — stock composition', () => {
  it('leads with a ring of stock value by category, and a slice lists its items', async () => {
    open('');
    const table = await screen.findByRole('table', { name: 'Stock value by category' });
    expect(within(table).getByText('Grocery')).toBeInTheDocument();
    expect(within(table).getByText('1 item')).toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: 'List the items in Grocery' }));
    await waitFor(() => expect(locationRef.current?.search).toContain('category=Grocery'));
  });

  it('says a category filter is on, where it was picked and over the list, and undoes it', async () => {
    open('');
    const table = await screen.findByRole('table', { name: 'Stock value by category' });
    fireEvent.click(within(table).getByRole('button', { name: 'List the items in Grocery' }));
    expect(await screen.findByText(/The items below are filtered to/)).toHaveTextContent(
      'The items below are filtered to Grocery · 1 item',
    );
    // The list names the filter as a chip, with its own way out.
    expect(screen.getByText('Category: Grocery')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1 items')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all categories' }));
    await waitFor(() => expect(locationRef.current?.search ?? '').not.toContain('category='));
    expect(screen.queryByText(/The items below are filtered to/)).toBeNull();
  });

  it('removes a filter from its chip', async () => {
    open('?category=Grocery');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the filter Category: Grocery' }));
    await waitFor(() => expect(locationRef.current?.search ?? '').not.toContain('category='));
  });

  it('cuts the stock by location from inventory health, asked for only then', async () => {
    open('');
    await screen.findByRole('table', { name: 'Stock value by category' });
    expect(requestLog.some((u) => u.pathname.endsWith('/inventory-health'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Location' }));
    const table = await screen.findByRole('table', { name: 'Stock value by location' });
    expect(within(table).getByText('Main warehouse')).toBeInTheDocument();
    expect(locationRef.current?.search).toContain('by=location');
  });

  it('switches to bars and to the month-end line, keeping the choice in the URL', async () => {
    open('');
    await screen.findByRole('table', { name: 'Stock value by category' });
    fireEvent.click(screen.getByRole('button', { name: 'Bar chart' }));
    await waitFor(() => expect(locationRef.current?.search).toContain('chart=bar'));
    fireEvent.click(screen.getByRole('button', { name: 'Line chart' }));
    await waitFor(() => expect(locationRef.current?.search).toContain('chart=line'));
    // The trend handler sends no points: the card says so rather than drawing nothing.
    expect(await screen.findByText('The month-end history is not available.')).toBeInTheDocument();
  });

  it('lands an old link to the Insights tab on Top sellers', async () => {
    open('?tab=insights');
    expect(await screen.findByRole('tab', { name: 'Top sellers', selected: true })).toBeInTheDocument();
  });
});

