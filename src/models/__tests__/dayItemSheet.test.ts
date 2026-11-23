import { describe, expect, it } from 'vitest';

import {
  groupItemSheet,
  itemShareLines,
  itemSheetCsvRows,
  itemSheetPdfSection,
  qtyCell,
  sheetChange,
  sheetPeriodLabel,
  uncategorizedShare,
} from '@/models/dayItemSheet';
import { dayItemSheetSerializer } from '@/serializers/daySummarySerializer';
import { dayItemSheetOwner, dayItemSheetStaff } from '@/test/msw/daySummaryFixtures';

const owner = dayItemSheetSerializer(dayItemSheetOwner);
const staff = dayItemSheetSerializer(dayItemSheetStaff);

describe('item-wise sales — the serializer', () => {
  it('reads decimal strings, keeps owner-only figures, and the reorder list', () => {
    expect(owner.rows[0]).toMatchObject({ name: 'Lactogen 1 400G', value: 15000, net: 11, margin: 19.3 });
    expect(owner.rows[4]).toMatchObject({ kind: 'service', itemId: null, name: 'Delivery charge' });
    expect(owner.compare).toBe('previous');
    expect(owner.reorder).toHaveLength(2);
    expect(staff.rows[0]).toMatchObject({ cost: null, profit: null, margin: null });
  });

  it('survives a payload with nothing in it', () => {
    const empty = dayItemSheetSerializer({});
    expect(empty.rows).toEqual([]);
    expect(empty.totals.value).toBe(0);
    expect(empty.reorder).toBeNull();
    expect(empty.compare).toBeNull();
  });
});

describe('item-wise sales — grouping', () => {
  it('groups by category ignoring case and spacing, the uncategorised and services last', () => {
    const { groups } = groupItemSheet(owner, { groupBy: 'category', sort: 'code' });
    expect(groups.map((g) => g.label)).toEqual([
      'MILK PACK',
      'NESTLE POWDER',
      'Uncategorized',
      'Services & other charges',
    ]);
    const nestle = groups.find((g) => g.label === 'NESTLE POWDER')!;
    // "Nestle Powder" and "NESTLE POWDER" are one group, sorted by code.
    expect(nestle.rows.map((r) => r.code)).toEqual(['001-004', '001-006']);
    expect(nestle.totals).toMatchObject({
      lines: 2,
      sold: 15,
      free: 1,
      returned: 2,
      net: 14,
      value: 20340,
      profit: 3740,
    });
  });

  it('a group’s comparison includes what sold only in the earlier period', () => {
    const { groups, totals } = groupItemSheet(owner, { groupBy: 'category', sort: 'code' });
    const nestle = groups.find((g) => g.label === 'NESTLE POWDER')!;
    // 12,000 (Lactogen) + 0 (Bunyad) + 900 (Cerelac, not sold today).
    expect(nestle.totals.compareValue).toBe(12900);
    expect(totals.compareValue).toBe(15400);
  });

  it('groups by agency, or not at all', () => {
    const byAgency = groupItemSheet(owner, { groupBy: 'agency', sort: 'code' }).groups.map((g) => g.label);
    expect(byAgency).toEqual(['Nestle', 'No agency', 'Services & other charges']);
    const none = groupItemSheet(owner, { groupBy: 'none', sort: 'value' });
    expect(none.groups.map((g) => g.label)).toEqual(['Items', 'Services & other charges']);
    expect(none.groups[0].rows.map((r) => r.name)).toEqual([
      'Lactogen 1 400G',
      'Bunyad 900G',
      'Milkpak 1000ML',
      'Loose Sundry',
    ]);
  });

  it('sorting by net sales orders the groups by their totals too', () => {
    const { groups } = groupItemSheet(owner, { groupBy: 'category', sort: 'value' });
    expect(groups.map((g) => g.label)).toEqual([
      'NESTLE POWDER',
      'MILK PACK',
      'Uncategorized',
      'Services & other charges',
    ]);
  });

  it('a search keeps the matching lines by name or code, and the totals follow', () => {
    const view = groupItemSheet(owner, { groupBy: 'category', sort: 'code', q: '001-' });
    expect(view.filtered).toBe(true);
    expect(view.groups).toHaveLength(1);
    expect(view.totals).toMatchObject({ lines: 2, value: 20340 });
    expect(groupItemSheet(owner, { groupBy: 'category', sort: 'code', q: 'milk' }).totals.value).toBe(2160);
  });

  it('services add sales but no profit: gross profit and margin are the stock items’', () => {
    const { groups, totals } = groupItemSheet(owner, { groupBy: 'category', sort: 'code' });
    const services = groups.find((g) => g.services)!;
    expect(services.totals).toMatchObject({ value: 250, cost: null, profit: null, margin: null });
    // 22,860 of item sales less 18,600 of cost; the 250 charge is not in the margin.
    expect(totals).toMatchObject({ value: 23110, cost: 18600, profit: 4260, margin: 18.6 });
  });

  it('staff totals carry no cost or profit', () => {
    expect(groupItemSheet(staff, { groupBy: 'category', sort: 'code' }).totals).toMatchObject({
      cost: null,
      profit: null,
      margin: null,
    });
  });
});

describe('item-wise sales — words and exports', () => {
  it('names a day or a range', () => {
    expect(sheetPeriodLabel('2026-10-25', '2026-10-25')).toBe('Sunday, 25 October 2026');
    expect(sheetPeriodLabel('2026-10-25', '2026-10-26')).toBe('25 Oct – 26 Oct 2026');
    expect(sheetPeriodLabel('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
  });

  it('shows change, dashes for zero quantities', () => {
    expect(sheetChange(15000, 12000)).toEqual({ text: '+25%', up: true });
    expect(sheetChange(5340, 0)).toEqual({ text: 'New', up: true });
    expect(sheetChange(100, null)).toBeNull();
    expect(qtyCell(0)).toBe('–');
    expect(qtyCell(12)).toBe('12');
  });

  it('the CSV has the free and owner columns, group subtotals and the grand total', () => {
    const rows = itemSheetCsvRows(owner, { groupBy: 'category', sort: 'code' });
    expect(rows[0]).toEqual([
      'Code',
      'Item',
      'Unit',
      'Sold',
      'Free',
      'Returned',
      'Net units',
      'Net sales',
      'Cost',
      'Gross profit',
      'Margin %',
      'Compared',
    ]);
    expect(rows).toContainEqual(['NESTLE POWDER']);
    expect(rows.find((r) => r[1] === 'Grand total')).toEqual([
      '',
      'Grand total',
      '',
      '26',
      '1',
      '2',
      '25',
      '23110.00',
      '18600.00',
      '4260.00',
      '18.6',
      '15400.00',
    ]);
  });

  it('staff get a CSV and PDF without cost, profit or the free column when nothing went free', () => {
    const rows = itemSheetCsvRows(staff, { groupBy: 'category', sort: 'code' });
    expect(rows[0]).not.toContain('Gross profit');
    expect(rows[0]).not.toContain('Free');
    const pdf = itemSheetPdfSection(staff, { groupBy: 'category', sort: 'code' });
    expect(pdf.columns.map((c) => c.header)).toEqual(['Code', 'Item', 'Sold', 'Returned', 'Net units', 'Net sales']);
  });

  it('the PDF lays out headings, item lines, subtotals and one grand total', () => {
    const pdf = itemSheetPdfSection(owner, { groupBy: 'category', sort: 'code' });
    expect(pdf.rows.filter((r) => r.heading).map((r) => r.cells[0])).toEqual([
      'MILK PACK',
      'NESTLE POWDER',
      'Uncategorized',
      'Services & other charges',
    ]);
    expect(pdf.rows.filter((r) => r.total)).toHaveLength(4);
    expect(pdf.rows.at(-1)).toMatchObject({ grand: true });
    expect(pdf.rows.at(-1)?.cells[1]).toBe('Grand total');
  });

  it('a WhatsApp summary lists the top groups by net sales; categories missing are spotted', () => {
    expect(itemShareLines(owner)).toEqual([
      'Top product groups:',
      '• NESTLE POWDER — Rs 20,340.00 (14 units)',
      '• MILK PACK — Rs 2,160.00 (6 units)',
      '• Uncategorized — Rs 360.00 (4 units)',
    ]);
    expect(uncategorizedShare(owner)).toBe(0.25);
  });
});
