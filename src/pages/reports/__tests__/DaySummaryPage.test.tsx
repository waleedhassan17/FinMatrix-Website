// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import DaySummaryPage from '@/pages/reports/DaySummaryPage';
import { requestLog } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { dayEntriesPage, daySummaryOwner, daySummaryStaff } from '@/test/msw/daySummaryFixtures';
import { renderReport, startMsw } from '@/test/renderReport';

startMsw();

const serve = (summary: unknown) =>
  server.use(
    http.get('*/reports/day-summary/entries', ({ request }) => {
      requestLog.push(new URL(request.url));
      return HttpResponse.json({ success: true, data: dayEntriesPage });
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
    serve(daySummaryStaff);
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
});
