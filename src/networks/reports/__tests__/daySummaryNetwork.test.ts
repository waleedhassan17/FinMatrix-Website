// @vitest-environment jsdom

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { getAllDayEntries, getDayItems } from '@/networks/reports/daySummaryNetwork';
import { requestLog } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { busyDayBook, dayItemSheetOwner } from '@/test/msw/daySummaryFixtures';
import { startMsw } from '@/test/renderReport';

startMsw();

describe('getAllDayEntries — what an export is built from', () => {
  it('reads every page of the view, a thousand at a time, with its filter, search and order', async () => {
    server.use(
      http.get('*/reports/day-summary/entries', ({ request }) => {
        const url = new URL(request.url);
        requestLog.push(url);
        return HttpResponse.json({ success: true, data: busyDayBook(2500)(url) });
      }),
    );
    const all = await getAllDayEntries({ date: '2026-11-19', type: 'invoice', q: 'INV', sort: 'amount_desc' });
    expect(all.items).toHaveLength(2500);
    expect(all.truncated).toBe(false);
    expect(requestLog.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(
      requestLog.every(
        (u) =>
          u.searchParams.get('limit') === '1000' &&
          u.searchParams.get('sort') === 'amount_desc' &&
          u.searchParams.get('q') === 'INV' &&
          u.searchParams.get('type') === 'invoice',
      ),
    ).toBe(true);
  });

  it('stops at the cap and says so', async () => {
    server.use(
      http.get('*/reports/day-summary/entries', ({ request }) =>
        HttpResponse.json({ success: true, data: busyDayBook(2500)(new URL(request.url)) }),
      ),
    );
    const some = await getAllDayEntries({ date: '2026-11-19' }, 500);
    expect(some.items).toHaveLength(500);
    expect(some.total).toBe(2500);
    expect(some.truncated).toBe(true);
  });
});

describe('getDayItems — the item-wise sheet', () => {
  it('asks for one day by date, a range by from and to, with the comparison', async () => {
    server.use(
      http.get('*/reports/day-summary/items', ({ request }) => {
        requestLog.push(new URL(request.url));
        return HttpResponse.json({ success: true, data: dayItemSheetOwner });
      }),
    );
    const day = await getDayItems({ from: '2026-11-19', to: '2026-11-19', compare: 'previous' });
    await getDayItems({ from: '2026-10-25', to: '2026-10-26', createdBy: 'u-staff', compare: 'lastWeek' });
    expect(day.rows).toHaveLength(5);
    const [one, range] = requestLog;
    expect(Object.fromEntries(one.searchParams)).toEqual({ date: '2026-11-19', compare: 'previous' });
    expect(Object.fromEntries(range.searchParams)).toEqual({
      from: '2026-10-25',
      to: '2026-10-26',
      createdBy: 'u-staff',
      compare: 'lastWeek',
    });
  });
});
