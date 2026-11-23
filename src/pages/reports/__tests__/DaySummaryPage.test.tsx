// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import DaySummaryPage from '@/pages/reports/DaySummaryPage';
import { requestLog } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import {
  busyDayBook,
  dayEntriesPage,
  dayItemSheetOwner,
  dayItemSheetStaff,
  daySummaryOwner,
  daySummaryStaff,
} from '@/test/msw/daySummaryFixtures';
import { renderReport, startMsw } from '@/test/renderReport';

startMsw();

const serve = (
  summary: unknown,
  entries: (url: URL) => unknown = () => dayEntriesPage,
  items: unknown = dayItemSheetOwner,
) =>
  server.use(
    http.get('*/reports/day-summary/items', ({ request }) => {
      const url = new URL(request.url);
      requestLog.push(url);
      return HttpResponse.json({ success: true, data: items });
    }),
    http.get('*/reports/day-summary/entries', ({ request }) => {
      const url = new URL(request.url);
      requestLog.push(url);
      return HttpResponse.json({ success: true, data: entries(url) });
    }),
    http.get('*/reports/day-summary/schedule', () =>
      HttpResponse.json({
        success: true,
        data: { enabled: false, hour: 21, email: true, timezone: 'Asia/Karachi', lastSent: null },
      }),
    ),
    http.get('*/reports/day-summary', ({ request }) => {
      requestLog.push(new URL(request.url));
      return HttpResponse.json({ success: true, data: summary });
    }),
  );

// The first render of a page this size can run past the default 1s under a
// full parallel run; the figures are not slow, the test machine is busy.
const LOAD = { timeout: 5000 };

const summaryRequests = () => requestLog.filter((u) => u.pathname.endsWith('/reports/day-summary'));
const entryRequests = () => requestLog.filter((u) => u.pathname.endsWith('/reports/day-summary/entries'));
const itemRequests = () => requestLog.filter((u) => u.pathname.endsWith('/reports/day-summary/items'));

describe('DaySummaryPage', () => {
  it('asks for the day in the URL, and the Day Book for the same day', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary?date=2026-11-18', <DaySummaryPage />, {
      role: 'admin',
    });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    expect(summaryRequests()[0]?.searchParams.get('date')).toBe('2026-11-18');
    expect(entryRequests()[0]?.searchParams.get('date')).toBe('2026-11-18');
  });

  it('shows an owner the whole business: team, profit and what needs a look', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    expect(await screen.findByRole('list', { name: 'Team activity' }, LOAD)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Day Summary' })).toBeInTheDocument();
    expect(screen.getByText('Gross profit')).toBeInTheDocument();
    expect(screen.getByText('2 back-dated entries')).toBeInTheDocument();
    expect(screen.getAllByText('Rs 245,000.00').length).toBeGreaterThan(0);
  });

  it('gives staff their own day, without the team or the profit', async () => {
    serve(daySummaryStaff, undefined, dayItemSheetStaff);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'staff' });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    expect(screen.getByRole('heading', { name: 'My day' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Team activity' })).toBeNull();
    expect(screen.queryByText('Gross profit')).toBeNull();
    expect(screen.queryByRole('button', { name: /Daily summary/ })).toBeNull();
  });

  it('narrows the Day Book to a document type when its tile is chosen', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    fireEvent.click(screen.getByRole('button', { name: /^Receipts/ }));
    await waitFor(() =>
      expect(entryRequests().some((u) => u.searchParams.get('type') === 'receipt')).toBe(true),
    );
    expect(screen.getByRole('button', { name: /^Receipts/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('flags a back-dated row with the day it is dated', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    const table = await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    expect(within(table).getByText(/dated Nov 16, 2026/)).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'INV-2026-0417' })).toHaveAttribute('href', '/invoices/inv-1');
    // The phone's card list carries the same rows.
    const cards = screen.getByRole('list', { name: 'Day Book entries' });
    expect(within(cards).getByRole('link', { name: 'INV-2026-0417' })).toHaveAttribute('href', '/invoices/inv-1');
  });

  it('filters the Day Book from its tabs, and the tabs leave out empty types', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    const tabs = screen.getByRole('tablist', { name: 'Day Book filter' });
    expect(within(tabs).queryByRole('tab', { name: /Quotations/ })).toBeNull();
    fireEvent.click(within(tabs).getByRole('tab', { name: /Back-dated/ }));
    await waitFor(() =>
      expect(entryRequests().some((u) => u.searchParams.get('type') === 'backdated')).toBe(true),
    );
  });

  it('picks a day from the calendar', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    fireEvent.click(screen.getByRole('button', { name: 'Pick a day' }));
    fireEvent.click(await screen.findByRole('gridcell', { name: 'Thursday 12 November 2026' }));
    await waitFor(() =>
      expect(summaryRequests().some((u) => u.searchParams.get('date') === '2026-11-12')).toBe(true),
    );
  });

  it('offers yesterday in one click, and no day after today', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    fireEvent.click(screen.getByRole('button', { name: 'Pick a day' }));
    expect(await screen.findByRole('gridcell', { name: 'Friday 20 November 2026' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    await waitFor(() =>
      expect(summaryRequests().some((u) => u.searchParams.get('date') === '2026-11-18')).toBe(true),
    );
  });

  it('steps back a day', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() =>
      expect(summaryRequests().some((u) => u.searchParams.get('date') === '2026-11-18')).toBe(true),
    );
  });

  // Each test here chains several waits of up to LOAD (5s) each — load, type,
  // answer — so the test as a whole needs more than one wait's worth of time.
  describe('a busy day', { timeout: 20_000 }, () => {
    it('pages the Day Book: 25 a page, where the reader is, and the next page on request', async () => {
      serve(daySummaryOwner, busyDayBook(60));
      renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
      const table = await screen.findByRole('table', { name: 'Day Book' }, LOAD);
      expect(within(table).getAllByRole('row')).toHaveLength(26); // a header and 25 rows
      expect(screen.getByText('Showing 1–25 of 60 entries')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
      await waitFor(() => expect(entryRequests().some((u) => u.searchParams.get('page') === '2')).toBe(true), LOAD);
      expect(await screen.findByText('Showing 26–50 of 60 entries', {}, LOAD)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    });

    it('takes 50 or 100 a page, starting again from the first', async () => {
      serve(daySummaryOwner, busyDayBook(160));
      renderReport('/reports/day-summary', '/reports/day-summary?page=3', <DaySummaryPage />, { role: 'admin' });
      await screen.findByRole('table', { name: 'Day Book' }, LOAD);
      fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '100' } });
      await waitFor(() =>
        expect(
          entryRequests().some((u) => u.searchParams.get('limit') === '100' && u.searchParams.get('page') === '1'),
        ).toBe(true),
        LOAD,
      );
      expect(await screen.findByText('Showing 1–100 of 160 entries', {}, LOAD)).toBeInTheDocument();
    });

    it('searches once typing pauses, and says when nothing matches', async () => {
      serve(daySummaryOwner, busyDayBook(60));
      renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
      await screen.findByRole('table', { name: 'Day Book' }, LOAD);
      fireEvent.change(screen.getByRole('searchbox', { name: /Search the Day Book/ }), {
        target: { value: 'INV-2026-0042' },
      });
      await waitFor(() =>
        expect(entryRequests().some((u) => u.searchParams.get('q') === 'INV-2026-0042')).toBe(true),
        LOAD,
      );
      expect(await screen.findByText('Showing 1–1 of 1 entry', {}, LOAD)).toBeInTheDocument();
      fireEvent.change(screen.getByRole('searchbox', { name: /Search the Day Book/ }), {
        target: { value: 'nothing-like-this' },
      });
      expect(await screen.findByText(/No entries match “nothing-like-this”/, {}, LOAD)).toBeInTheDocument();
    });

    it('sorts by amount from the column heading, largest first and then smallest', async () => {
      serve(daySummaryOwner, busyDayBook(60));
      renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
      await screen.findByRole('table', { name: 'Day Book' }, LOAD);
      fireEvent.click(screen.getByRole('button', { name: /Amount/ }));
      await waitFor(() =>
        expect(entryRequests().some((u) => u.searchParams.get('sort') === 'amount_desc')).toBe(true),
        LOAD,
      );
      expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'descending');
      fireEvent.click(screen.getByRole('button', { name: /Amount/ }));
      await waitFor(() =>
        expect(entryRequests().some((u) => u.searchParams.get('sort') === 'amount_asc')).toBe(true),
        LOAD,
      );
    });

    it('counts the whole view in the footer, not just the page', async () => {
      serve(daySummaryOwner, busyDayBook(60));
      renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
      await screen.findByRole('table', { name: 'Day Book' }, LOAD);
      // 100 + 200 + … + 6,000 = 183,000 across all three pages.
      expect(screen.getByText('Rs 183,000.00')).toBeInTheDocument();
    });
  });
});

describe('DaySummaryPage — item-wise sales', () => {
  it('shows the owner the sheet by category, with free units, profit, change and a grand total', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary?date=2026-11-19', <DaySummaryPage />, { role: 'admin' });
    const table = await screen.findByRole('table', { name: /Item-wise sales/ }, LOAD);
    const t = within(table);
    expect(t.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Item',
      'Sold',
      'Free',
      'Returned',
      'Net units',
      'Net sales',
      'Gross profit',
    ]);
    // The code sits under the item's name; the margin under its profit.
    expect(t.getByText('001-006 · tin')).toBeInTheDocument();
    expect(t.getByText('19.3%')).toBeInTheDocument();
    expect(t.getByRole('button', { name: /NESTLE POWDER/ })).toBeInTheDocument();
    expect(t.getByText('Total NESTLE POWDER')).toBeInTheDocument();
    expect(t.getByText('Grand total')).toBeInTheDocument();
    expect(t.getByText('23,110.00')).toBeInTheDocument();
    // Lactogen 15,000 against 12,000 the day before.
    expect(t.getByText('+25%')).toBeInTheDocument();
    expect(screen.getByText(/The sheet adds up to exactly that/)).toBeInTheDocument();
    // Compared with the day before, as the page's Compare control says.
    expect(itemRequests()[0]?.searchParams.get('compare')).toBe('previous');
    expect(itemRequests()[0]?.searchParams.get('date')).toBe('2026-11-19');
  });

  it('lists what needs reordering, out of stock first', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    const list = await screen.findByRole('list', { name: 'Items to reorder' }, LOAD);
    const rows = within(list).getAllByRole('link');
    expect(rows[0]).toHaveTextContent('Lactogen 1 400G');
    expect(rows[0]).toHaveTextContent('Out of stock');
    expect(rows[1]).toHaveTextContent('10 left');
  });

  it('a group folds away to its total', async () => {
    serve(daySummaryOwner);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    const table = await screen.findByRole('table', { name: /Item-wise sales/ }, LOAD);
    fireEvent.click(within(table).getByRole('button', { name: /NESTLE POWDER/ }));
    expect(within(table).queryByText('Lactogen 1 400G')).not.toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /NESTLE POWDER/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('gives staff their own lines without cost or profit', async () => {
    serve(daySummaryStaff, undefined, dayItemSheetStaff);
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'staff' });
    const table = await screen.findByRole('table', { name: /Item-wise sales/ }, LOAD);
    expect(within(table).queryByRole('columnheader', { name: 'Gross profit' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Free' })).not.toBeInTheDocument();
    expect(within(table).getByText('Milkpak 1000ML')).toBeInTheDocument();
  });

  it('a date range asks for from and to, and the week-earlier comparison follows the page', async () => {
    serve(daySummaryOwner);
    renderReport(
      '/reports/day-summary',
      '/reports/day-summary?date=2026-11-19&compare=lastWeek&ip=range&ifrom=2026-10-25&ito=2026-10-26',
      <DaySummaryPage />,
      { role: 'admin' },
    );
    await screen.findByRole('table', { name: /Item-wise sales/ }, LOAD);
    await waitFor(() => expect(itemRequests().length).toBeGreaterThan(0));
    const last = itemRequests().at(-1)!;
    expect(last.searchParams.get('from')).toBe('2026-10-25');
    expect(last.searchParams.get('to')).toBe('2026-10-26');
    expect(last.searchParams.get('compare')).toBe('lastWeek');
  });

  it('a server from before the item sheet (404) shows the rest of the day, and no error', async () => {
    serve(daySummaryOwner);
    server.use(
      http.get('*/reports/day-summary/items', ({ request }) => {
        requestLog.push(new URL(request.url));
        return HttpResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Cannot GET' } }, { status: 404 });
      }),
    );
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    await screen.findByRole('table', { name: 'Day Book' }, LOAD);
    await waitFor(() => expect(itemRequests().length).toBe(1));
    expect(screen.queryByRole('heading', { name: 'Item-wise sales' })).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it('the money card nets the day’s returns', async () => {
    serve({ ...daySummaryOwner, sales: { ...daySummaryOwner.sales, returns: 3000, net: 242000 } });
    renderReport('/reports/day-summary', '/reports/day-summary', <DaySummaryPage />, { role: 'admin' });
    const nets = await screen.findByLabelText('Sales after returns', {}, LOAD);
    expect(nets).toHaveTextContent('−Rs 3,000.00');
    expect(nets).toHaveTextContent('Rs 242,000.00');
  });
});
