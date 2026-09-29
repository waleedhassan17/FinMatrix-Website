import { describe, expect, it } from 'vitest';

import {
  documentListSummaryOf,
  documentPageOf,
  extraNumber,
  fetchAllPages,
  listPaginationOf,
  pageOfRows,
  statusCountsOf,
} from '@/models/documentList';

// What GET /invoices and GET /bills now return: `data` stays the bare array,
// with the server's summary and pagination beside it.
const response = {
  success: true,
  data: [{ id: 'i1', status: 'sent' }],
  summary: {
    count: 312,
    outstanding: '85000.5000',
    overdue: '12000.0000',
    byStatus: { sent: { count: 40, balance: '50000' }, overdue: { count: 7, balance: '12000' } },
  },
  pagination: { page: 1, limit: 50, total: 312, totalPages: 7 },
};

describe('documentListSummaryOf', () => {
  it('reads the summary beside the rows, as numbers', () => {
    expect(documentListSummaryOf(response)).toEqual({
      count: 312,
      outstanding: 85000.5,
      overdue: 12000,
      byStatus: { sent: { count: 40, balance: 50000 }, overdue: { count: 7, balance: 12000 } },
    });
  });

  it('is null from a server that sends none', () => {
    expect(documentListSummaryOf({ success: true, data: [] })).toBeNull();
  });
});

describe('listPaginationOf', () => {
  it('reads the pagination beside the rows', () => {
    expect(listPaginationOf(response, 1)).toEqual({ page: 1, totalPages: 7, total: 312 });
  });

  it('is one page of what came when there is none', () => {
    expect(listPaginationOf({ data: [] }, 4)).toEqual({ page: 1, totalPages: 1, total: 4 });
  });
});

describe('statusCountsOf', () => {
  it("prefers the server's counts — every tab, not just the rows loaded", () => {
    expect(statusCountsOf(documentListSummaryOf(response), [{ status: 'sent' }])).toEqual({ all: 312, sent: 40, overdue: 7 });
  });

  it('counts the loaded rows when the server sent none', () => {
    expect(statusCountsOf(null, [{ status: 'sent' }, { status: 'paid' }, { status: 'paid' }])).toEqual({ all: 3, sent: 1, paid: 2 });
  });
});

describe('documentPageOf', () => {
  it('keeps the rows, the pagination and the summary as sent', () => {
    const raw = {
      success: true,
      data: [{ id: 'a' }],
      pagination: { page: 2, limit: 1, total: 3, totalPages: 3 },
      summary: { count: 3, byStatus: { open: { count: 3 } }, onOrder: '12.5000' },
    };
    const page = documentPageOf(raw, [{ id: 'a' }]);
    expect(page).toMatchObject({ page: 2, totalPages: 3, total: 3, rows: [{ id: 'a' }] });
    expect(page.summary?.byStatus.open.count).toBe(3);
    expect(extraNumber(page.extras, 'onOrder')).toBe(12.5);
    expect(extraNumber(page.extras, 'missing')).toBe(0);
  });

  it('is one complete page from a server that sends no paging', () => {
    const page = documentPageOf([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }]);
    expect(page).toMatchObject({ page: 1, totalPages: 1, total: 2, summary: null });
  });
});

describe('pageOfRows', () => {
  it('reads a nested `{ rows, pagination }` page', () => {
    expect(pageOfRows({ rows: [1, 2], pagination: { page: 1, totalPages: 4, total: 7 } })).toMatchObject({
      rows: [1, 2],
      page: 1,
      totalPages: 4,
      total: 7,
      summary: null,
    });
  });
});

describe('fetchAllPages', () => {
  const pages = [[{ id: '1' }, { id: '2' }], [{ id: '3' }, { id: '4' }], [{ id: '5' }]];

  it('walks every page in order', async () => {
    const asked: number[] = [];
    const rows = await fetchAllPages(async (page, limit) => {
      asked.push(page);
      expect(limit).toBe(2);
      return { rows: pages[page - 1], totalPages: 3 };
    }, 2);
    expect(asked).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('adds a row seen on an earlier page only once', async () => {
    const shifted = [[{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }]];
    const rows = await fetchAllPages(async (page) => ({ rows: shifted[page - 1], totalPages: 2 }), 2);
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('dedupes on a custom key (riders have no id)', async () => {
    const riders = [[{ userId: 'u1' }], [{ userId: 'u1' }, { userId: 'u2' }]];
    const rows = await fetchAllPages(
      async (page) => ({ rows: riders[page - 1], totalPages: 2 }),
      1,
      (r) => r.userId,
    );
    expect(rows.map((r) => r.userId)).toEqual(['u1', 'u2']);
  });

  it('stops after one request when there is one page', async () => {
    let calls = 0;
    await fetchAllPages(async () => {
      calls++;
      return { rows: [{ id: 'x' }], totalPages: 1 };
    });
    expect(calls).toBe(1);
  });
});
