// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import InventoryItemReportPage from '@/pages/reports/InventoryItemReportPage';
import { server } from '@/test/msw/server';
import { locationRef, renderReport, startMsw } from '@/test/renderReport';

startMsw();

const ID = 'item-oil';
const URL_BASE = `/reports/inventory-valuation/${ID}?from=2026-01-01&to=2026-10-28`;

const months = (values: Record<string, Partial<{ unitsSold: number; revenue: number; cogs: number }>>) =>
  ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((m) => {
    const v = values[m] ?? {};
    const revenue = v.revenue ?? 0;
    const cogs = v.cogs ?? 0;
    return {
      period: `2026-${m}`,
      label: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'][Number(m) - 1]} 26`,
      unitsSold: v.unitsSold ?? 0,
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      marginPct: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : null,
      costKnown: true,
    };
  });

const FACTS = {
  category: 'FMCG',
  unitOfMeasure: 'unit',
  sellingPrice: 2350,
  unitCost: 1800,
  qtyOnHand: 45,
  stockValue: 81000,
  reorderPoint: 20,
  isActive: true,
  lastSoldDate: '2026-07-24',
  imageUrl: 'https://api.test/media/item-images/img1/display.jpg?sig=x',
  thumbnailUrl: 'https://api.test/media/item-images/img1/thumb.jpg?sig=x',
  location: null,
  stockStatus: 'ok',
  suggestedOrderQty: null,
  daysOfCover: 387,
  cover: {
    level: 'risk',
    guide: 'Two weeks to two months of stock at the current selling rate is healthy; under a week risks running out, and over four months ties up cash.',
  },
  deadStock: false,
  lastOutboundDate: '2026-07-24',
};

const performance = (over: Record<string, unknown> = {}) => ({
  itemId: ID,
  itemName: 'Cooking Oil 5L',
  sku: 'WC-OIL-5L',
  range: { startDate: '2026-01-01', endDate: '2026-10-28' },
  points: months({ '04': { unitsSold: 16, revenue: 37600, cogs: 28800 }, '07': { unitsSold: 19, revenue: 44650, cogs: 34200 } }),
  totals: { unitsSold: 35, revenue: 82250, cogs: 63000, grossProfit: 19250, marginPct: 23.4 },
  costHistoryFrom: '2026-01-01',
  estimatedCogsShare: 0,
  item: FACTS,
  customers: [
    { customerId: 'k1', customerName: 'Karim Store', unitsSold: 19, revenue: 44650, grossProfit: 10450, sharePct: 54.29 },
    { customerId: 'k2', customerName: 'Bismillah Mart', unitsSold: 8, revenue: 18800, grossProfit: 4400, sharePct: 22.86 },
    { customerId: 'k3', customerName: 'Madina Wholesale', unitsSold: 8, revenue: 18800, grossProfit: 4400, sharePct: 22.86 },
  ],
  otherCustomers: { count: 0, unitsSold: 0, revenue: 0, grossProfit: 0, sharePct: null },
  channels: [
    { key: 'invoice', unitsSold: 33, revenue: 77550, grossProfit: 18150, documents: 4, sharePct: 91.43 },
    { key: 'delivery', unitsSold: 3, revenue: 7050, grossProfit: 1650, documents: 1, sharePct: 8.57 },
  ],
  returns: { unitsSold: -1, revenue: -2350, grossProfit: -550, documents: 1 },
  ...over,
});

/** The window before: some sales, so every figure has a move to show. */
const priorPerformance = () =>
  performance({
    range: { startDate: '2025-03-01', endDate: '2025-12-31' },
    totals: { unitsSold: 20, revenue: 47000, cogs: 36000, grossProfit: 11000, marginPct: 23.4 },
  });

const history = {
  itemId: ID,
  itemName: 'Cooking Oil 5L',
  sku: 'WC-OIL-5L',
  months: 10,
  points: months({}).map((p) => ({
    period: p.period,
    label: p.label,
    asOfDate: `${p.period}-28`,
    closingQty: 45,
    qtyIn: 0,
    qtyOut: 0,
    closingValue: 81000,
    valueKnown: true,
  })),
  coverage: { quantity: 'exact', value: 'exact', costHistoryFrom: '2026-01-01', message: '' },
};

let current = performance();
let prior = priorPerformance();

beforeEach(() => {
  current = performance();
  prior = priorPerformance();
  server.use(
    http.get('*/reports/item-performance/:id', ({ request }) => {
      const start = new URL(request.url).searchParams.get('startDate');
      return HttpResponse.json(start === '2026-01-01' ? current : prior);
    }),
    http.get('*/reports/inventory-valuation/items/:id/history', () => HttpResponse.json(history)),
    http.get('*/reports/inventory-valuation', () =>
      HttpResponse.json({
        rows: [
          { itemId: ID, itemName: 'Cooking Oil 5L', sku: 'WC-OIL-5L', category: 'FMCG', qty: 45, cost: 1800, value: 81000 },
          { itemId: 'item-rice', itemName: 'Rice 5kg', sku: 'RICE-5', category: 'Grocery', qty: 4, cost: 1200, value: 4800 },
        ],
        byCategory: [],
        totalValue: 85800,
      }),
    ),
  );
});

/** The page over Jan–Oct 2026, with any extra search params ("tab=months"). */
const open = (extra = '', role?: 'admin' | 'staff') =>
  renderReport(
    '/reports/inventory-valuation/:itemId',
    extra ? `${URL_BASE}&${extra}` : URL_BASE,
    <InventoryItemReportPage />,
    { role },
  );

describe('InventoryItemReportPage — the item at a glance', () => {
  it('heads the page with its photo, one stock badge and the record’s facts', async () => {
    open('', 'admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cooking Oil 5L' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View the photo of Cooking Oil 5L full size' })).toBeInTheDocument();
    expect(screen.getByText('In stock')).toBeInTheDocument();
    expect(screen.getByText('SKU WC-OIL-5L')).toBeInTheDocument();
    expect(screen.getByText('Sold by unit')).toBeInTheDocument();
  });

  it('says dead stock before low stock, and suggests no order for it', async () => {
    current = performance({
      item: { ...FACTS, qtyOnHand: 5, stockStatus: 'low', suggestedOrderQty: 15, deadStock: true, daysOfCover: null, cover: null },
    });
    open();
    expect(await screen.findByText('Dead stock')).toBeInTheDocument();
    expect(screen.queryByText('Low stock')).not.toBeInTheDocument();
    expect(screen.getByText('15 units below the reorder point')).toBeInTheDocument();
    expect(screen.queryByText(/Suggested order/)).not.toBeInTheDocument();
  });

  it('suggests the reorder list’s order when it is low', async () => {
    current = performance({ item: { ...FACTS, qtyOnHand: 12, stockStatus: 'low', suggestedOrderQty: 30 } });
    open();
    expect(await screen.findByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText(/Suggested order 30 units/)).toBeInTheDocument();
  });
});

describe('InventoryItemReportPage — figures and their comparison', () => {
  it('states the comparison once, and shows each figure’s move', async () => {
    open();
    expect(await screen.findByText('Compared with the prior 10 months')).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Metric to chart' });
    const revenue = within(tabs).getByRole('tab', { name: /Revenue/ });
    // 82,250 against 47,000.
    expect(within(revenue).getByText('+75%')).toBeInTheDocument();
  });

  it('says so when the window before sold nothing, instead of a move from zero', async () => {
    prior = performance({ totals: { unitsSold: 0, revenue: 0, cogs: 0, grossProfit: 0, marginPct: null }, customers: [], channels: [], returns: null });
    open();
    expect(await screen.findByText('No sales in the prior 10 months to compare with')).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+%/)).not.toBeInTheDocument();
  });

  it('counts the months it sold in, under the chart', async () => {
    open();
    expect(await screen.findByText('Sold in 2 of 10 months')).toBeInTheDocument();
  });
});

describe('InventoryItemReportPage — revenue breakdown', () => {
  it('leads with a ring of revenue by customer, each row opening the customer', async () => {
    open('', 'admin');
    const table = await screen.findByRole('table', { name: 'Revenue by customer' });
    const karim = within(table).getByRole('link', { name: 'Open Karim Store' });
    expect(karim).toHaveAttribute('href', '/customers/k1');
    expect(within(table).getByText('19 units')).toBeInTheDocument();
    expect(screen.getByText('Returns (Rs 2,350.00) · 1 unit — taken off revenue')).toBeInTheDocument();
  });

  it('opens no customer for someone who may not', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Revenue by customer' });
    expect(within(table).queryByRole('link')).not.toBeInTheDocument();
  });

  it('splits the sales by channel, keeping the choice in the URL', async () => {
    open();
    await screen.findByRole('table', { name: 'Revenue by customer' });
    fireEvent.click(screen.getByRole('button', { name: 'Channel' }));
    await waitFor(() => expect(locationRef.current?.search).toContain('mix=channel'));
    const table = await screen.findByRole('table', { name: 'Revenue by channel' });
    expect(within(table).getByText('Invoices')).toBeInTheDocument();
    expect(within(table).getByText('Deliveries')).toBeInTheDocument();
  });

  it('offers no channel view for an item that only ever went out one way', async () => {
    current = performance({ channels: [{ key: 'invoice', unitsSold: 35, revenue: 82250, grossProfit: 19250, documents: 5, sharePct: 100 }] });
    open('mix=channel');
    expect(await screen.findByRole('table', { name: 'Revenue by customer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Channel' })).not.toBeInTheDocument();
  });

  it('draws bars when a customer returned more than they bought', async () => {
    current = performance({
      customers: [
        { customerId: 'k1', customerName: 'Karim Store', unitsSold: 36, revenue: 84600, grossProfit: 19800, sharePct: 102.86 },
        { customerId: 'k2', customerName: 'Bismillah Mart', unitsSold: -1, revenue: -2350, grossProfit: -550, sharePct: null },
      ],
    });
    open();
    expect(await screen.findByText('A customer returned more than they bought, so this shows as bars.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Revenue by customer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pie chart' })).toBeDisabled();
  });

  it('keeps every figure by month one tab away', async () => {
    open('tab=months');
    expect(await screen.findByText('Every figure, month by month')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Revenue by customer' })).not.toBeInTheDocument();
  });
});

describe('InventoryItemReportPage — stock position and price', () => {
  it('gives days of cover the server’s verdict', async () => {
    open();
    expect(await screen.findByText('Over a year')).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('25 units above the reorder point')).toBeInTheDocument();
  });

  it('sets the price against cost and against what it sold for', async () => {
    open();
    expect(await screen.findByText('Price and margin')).toBeInTheDocument();
    expect(screen.getByText('Rs 550.00')).toBeInTheDocument();
    expect(screen.getByText('At list price')).toBeInTheDocument();
  });

  it('works cover out itself for a server from before, with no verdict', async () => {
    const { daysOfCover: _d, cover: _c, stockStatus: _s, imageUrl: _i, thumbnailUrl: _t, ...older } = FACTS;
    current = performance({ item: older, channels: undefined, returns: undefined });
    open();
    expect(await screen.findByText('Stock position')).toBeInTheDocument();
    expect(screen.queryByText('At risk')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Channel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View the photo/ })).not.toBeInTheDocument();
  });
});
