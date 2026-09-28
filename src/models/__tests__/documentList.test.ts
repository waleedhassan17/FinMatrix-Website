import { describe, expect, it } from 'vitest';

import { documentListSummaryOf, listPaginationOf, statusCountsOf } from '@/models/documentList';

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
