import { describe, expect, it } from 'vitest';

import { isPathAllowedForRole } from '@/config/routeAccess';
import {
  groupHits,
  parseSearchResults,
  visibleHits,
  type SearchHit,
} from '@/models/search';
import { formatMoney } from '@/utils/money';

const body = {
  query: 'acme',
  results: {
    customers: [
      { id: 'c1', name: 'Acme Traders', email: 'acme@example.com', balance: '1500.0000' },
      { id: 'c2', name: '', company: 'Acme Holdings', phone: '0300', balance: 0 },
    ],
    vendors: [{ id: 'v1', companyName: 'Acme Supply', balance: '0' }],
    invoices: [
      { id: 'i1', invoiceNumber: 'INV-2026-0047', customerName: 'Acme Traders', total: '12000.0000', status: 'partially_paid' },
    ],
    bills: [{ id: 'b1', billNumber: 'BILL-7', vendorName: 'Acme Supply', total: 500, status: 'open' }],
    inventory: [{ id: 'p1', name: 'Acme Widget', sku: 'AW-1', quantityOnHand: '12.5000', category: 'Parts' }],
  },
};

describe('parseSearchResults', () => {
  it('flattens buckets in display order with routes and readable subtitles', () => {
    const hits = parseSearchResults(body);
    expect(hits.map((h) => h.id)).toEqual([
      'invoices:i1',
      'bills:b1',
      'customers:c1',
      'customers:c2',
      'vendors:v1',
      'inventory:p1',
    ]);
    expect(hits[0]).toEqual({
      id: 'invoices:i1',
      kind: 'invoices',
      title: 'INV-2026-0047',
      subtitle: `Acme Traders · ${formatMoney(12000)} · Partially paid`,
      to: '/invoices/i1',
    });
    expect(hits[1].subtitle).toBe(`Acme Supply · ${formatMoney(500)} · Open`);
    expect(hits[2].subtitle).toBe(`acme@example.com · Balance ${formatMoney(1500)}`);
    // Falls back to the company, and to the phone when there is no email.
    expect(hits[3]).toMatchObject({ title: 'Acme Holdings', subtitle: `0300 · Balance ${formatMoney(0)}` });
    expect(hits[5]).toMatchObject({ title: 'Acme Widget', subtitle: 'AW-1 · Qty 12.5 · Parts', to: '/inventory/p1' });
  });

  it('skips missing buckets, non-arrays and rows without an id', () => {
    const hits = parseSearchResults({
      results: { customers: 'nope', invoices: [null, { invoiceNumber: 'X' }, { id: 'i2' }] },
    });
    expect(hits).toEqual([
      { id: 'invoices:i2', kind: 'invoices', title: 'Invoice', subtitle: `${formatMoney(0)}`, to: '/invoices/i2' },
    ]);
  });

  it('returns nothing for a malformed body', () => {
    expect(parseSearchResults(undefined)).toEqual([]);
    expect(parseSearchResults({ query: 'a' })).toEqual([]);
    expect(parseSearchResults('error')).toEqual([]);
  });
});

describe('visibleHits', () => {
  const hits = parseSearchResults(body);

  it('keeps everything for the owner', () => {
    expect(visibleHits(hits, 'admin', null)).toEqual(hits);
  });

  it('drops hits whose page staff cannot open', () => {
    expect(visibleHits(hits, 'staff', null)).toEqual(
      hits.filter((h) => isPathAllowedForRole(h.to, 'staff')),
    );
  });

  it('shows nothing before the role is known', () => {
    expect(visibleHits(hits, null, null)).toEqual([]);
  });

  it('drops inventory when the plan has none', () => {
    const kinds = visibleHits(hits, 'admin', { inventory: false }).map((h) => h.kind);
    expect(kinds).not.toContain('inventory');
    expect(kinds).toContain('invoices');
  });
});

describe('groupHits', () => {
  it('groups by kind in display order, capped per group', () => {
    const many: SearchHit[] = Array.from({ length: 7 }, (_, i) => ({
      id: `customers:${i}`,
      kind: 'customers',
      title: `C${i}`,
      subtitle: '',
      to: `/customers/${i}`,
    }));
    const groups = groupHits([...many, ...parseSearchResults(body).slice(0, 1)], 5);
    expect(groups.map((g) => g.kind)).toEqual(['invoices', 'customers']);
    expect(groups[1].hits).toHaveLength(5);
  });
});
