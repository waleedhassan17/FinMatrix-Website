import { describe, expect, it } from 'vitest';

import {
  DIGEST_HOURS,
  attentionItems,
  busiestHour,
  hourTick,
  hourWindow,
  dayChange,
  dayCsvRows,
  dayMoney,
  dayPdfSections,
  dayShareText,
  entryHref,
  entryTime,
  hourLabel,
  relativeDayName,
} from '@/models/daySummary';
import { daySummarySerializer, dayEntriesSerializer } from '@/serializers/daySummarySerializer';
import { dayEntriesPage, daySummaryBuying, daySummaryOwner, daySummaryStaff } from '@/test/msw/daySummaryFixtures';

const owner = daySummarySerializer(daySummaryOwner);

describe('day summary serializer', () => {
  it('reads decimal strings as numbers and keeps the owner-only parts', () => {
    expect(owner.headline.sales.total).toBe(245000);
    expect(owner.team).toHaveLength(2);
    expect(owner.profit?.grossProfit).toBe(95000);
    expect(owner.attention.voided).toEqual({ count: 1, total: 5000 });
  });

  it('keeps staff’s missing parts missing, not zero', () => {
    const staff = daySummarySerializer(daySummaryStaff);
    expect(staff.scope.ownOnly).toBe(true);
    expect(staff.team).toBeNull();
    expect(staff.profit).toBeNull();
    expect(staff.attention.voided).toBeNull();
  });

  it('drops document kinds it does not know', () => {
    const s = daySummarySerializer({ ...daySummaryOwner, documents: [{ kind: 'mystery', count: 1, total: 1 }] });
    expect(s.documents).toEqual([]);
  });
});

describe('dayChange', () => {
  it('is the % move against the comparison day', () => {
    expect(dayChange(245000, 200000)).toEqual({ text: '+23%', up: true });
    expect(dayChange(50, 100)).toEqual({ text: '−50%', up: false });
  });
  it('says New after a day with nothing, and nothing after two empty days', () => {
    expect(dayChange(100, 0)).toEqual({ text: 'New', up: true });
    expect(dayChange(0, 0)).toBeNull();
  });
});

describe('attention', () => {
  it('lists only the checks with something in them, each with its Day Book filter', () => {
    expect(attentionItems(owner).map((a) => a.filter)).toEqual(['backdated', 'drafts', 'voided']);
    expect(attentionItems(owner)[0].label).toBe('2 back-dated entries');
  });
  it('is empty on a clean day', () => {
    expect(attentionItems(daySummarySerializer(daySummaryStaff))).toEqual([]);
  });
});

describe('Day Book links', () => {
  it('opens each document’s page, and nothing for a deleted one or one without a page', () => {
    expect(entryHref({ kind: 'invoice', id: 'inv-1', deleted: false })).toBe('/invoices/inv-1');
    expect(entryHref({ kind: 'receipt', id: 'r 1', deleted: false })).toBe('/payments/r%201');
    expect(entryHref({ kind: 'invoice', id: 'inv-1', deleted: true })).toBeNull();
    expect(entryHref({ kind: 'vendor_payment', id: 'vp-1', deleted: false })).toBeNull();
  });
});

describe('labels', () => {
  it('names the day relative to today', () => {
    expect(relativeDayName('2026-11-19', '2026-11-19', '2026-11-18')).toBe('Today');
    expect(relativeDayName('2026-11-18', '2026-11-19', '2026-11-18')).toBe('Yesterday');
    expect(relativeDayName('2026-11-16', '2026-11-19', '2026-11-18')).toBe('Monday');
  });
  it('labels digest hours, evenings for that day and mornings for the day before', () => {
    expect(hourLabel(21)).toBe('9:00 PM');
    expect(hourLabel(0)).toBe('12:00 AM');
    expect(hourLabel(12)).toBe('12:00 PM');
    expect(DIGEST_HOURS.find((h) => h.hour === 8)?.label).toContain('the day before');
  });
});

describe('exports', () => {
  it('writes the WhatsApp text from the same figures as the screen', () => {
    const text = dayShareText(owner, 'Acme Traders');
    expect(text).toContain('*Acme Traders — Thu 19 Nov*');
    expect(text).toContain('Sales: Rs 245,000.00 (12 invoices)');
    expect(text).toContain('Orders booked: Rs 70,000.00 (3 sales orders)');
    expect(text).toContain('• Ali Traders — Rs 90,000.00');
    expect(text).toContain('⚠ 2 back-dated entries');
  });

  it('says so on a quiet day', () => {
    const quiet = daySummarySerializer({ ...daySummaryOwner, isEmpty: true });
    expect(dayShareText(quiet, 'Acme')).toContain('Nothing was recorded on this day.');
  });

  it('puts plain numbers in the CSV, headline first and the Day Book last', () => {
    const rows = dayCsvRows(owner, dayEntriesSerializer(dayEntriesPage).items);
    expect(rows[0]).toEqual(['Headline', 'Count', 'Amount', 'Day before', 'Same day last week']);
    expect(rows[1]).toEqual(['Sales', '12', '245000.00', '200000.00', '245000.00']);
    const last = rows[rows.length - 1];
    expect(last[1]).toBe('Receipts');
    expect(last[5]).toBe('400.00');
    expect(last[7]).toBe('Sara Staff');
  });
});

describe('purchasing', () => {
  const buying = daySummarySerializer(daySummaryBuying);

  it('reads the buying figures, and an older server as none', () => {
    expect(buying.headline.purchaseOrders?.count).toBe(3);
    expect(buying.headline.goodsReceived?.total).toBe(74000);
    expect(buying.purchasing?.position?.overdue).toEqual({ count: 2, total: 35000, oldest: '2026-11-12' });
    expect(buying.team?.[0].purchaseOrders).toEqual({ count: 3, total: 90000 });
    expect(owner.purchasing).toBeNull();
    expect(owner.headline.purchaseOrders).toBeNull();
    expect(owner.team?.[0].purchaseOrders).toEqual({ count: 0, total: 0 });
  });

  it('flags overdue POs with a link, and calls withdrawn POs what they are', () => {
    const items = attentionItems(buying);
    const overdue = items.find((i) => i.key === 'overdue-pos');
    expect(overdue).toMatchObject({ href: '/purchase-orders', count: 2, label: '2 purchase orders overdue' });
    expect(overdue?.detail).toContain('Rs 35,000.00 still to arrive');
    expect(items.find((i) => i.key === 'cancelled')?.label).toBe('1 order cancelled or withdrawn');
  });

  it('puts the buying side in the CSV, the PDF and the WhatsApp text', () => {
    const rows = dayCsvRows(buying, []);
    expect(rows.map((r) => r[0])).toEqual(expect.arrayContaining(['POs placed', 'Goods received', 'Bills']));
    expect(rows).toContainEqual(['Overdue (now)', '2', '35000.00']);
    expect(rows).toContainEqual(['Supplier: Nestle Distributors', '2', '60000.00']);
    const pdf = dayPdfSections(buying, []);
    expect(pdf.map((x) => x.title)).toContain('Purchasing');
    const text = dayShareText(buying, 'Acme');
    expect(text).toContain('POs placed: Rs 90,000.00 (3 purchase orders)');
    expect(text).toContain('Goods received: Rs 74,000.00 at cost (2 purchase orders)');
    expect(text).toContain('Bills: Rs 40,000.00 (1 bill)');
    expect(text).toContain('⚠ 2 purchase orders overdue');
  });
});

describe('exports follow the comparison chosen', () => {
  it('heads the CSV and the PDF with the chosen comparison', () => {
    const csv = dayCsvRows(owner, [], 'lastWeek');
    expect(csv[0]).toEqual(['Headline', 'Count', 'Amount', 'Same day last week', 'Day before']);
    expect(csv[1]).toEqual(['Sales', '12', '245000.00', '245000.00', '200000.00']);
    const pdf = dayPdfSections(owner, [], 'lastWeek');
    expect(pdf[0].columns[3].header).toBe('Same day last week');
  });

  it('leaves out of the WhatsApp text the figures that were nil', () => {
    const quietOrders = daySummarySerializer({
      ...daySummaryOwner,
      headline: { ...daySummaryOwner.headline, orders: { ...daySummaryOwner.headline.orders, count: 0, total: 0 } },
    });
    expect(dayShareText(quietOrders, 'Acme')).not.toContain('Orders booked');
  });
});

describe('money and times', () => {
  it('shows a negative with a true minus sign', () => {
    expect(dayMoney(-3000)).toBe('−Rs 3,000.00');
    expect(dayMoney(3000)).toBe('Rs 3,000.00');
  });

  it('gives entry times on the company clock, not the device’s', () => {
    expect(entryTime('2026-11-19T10:15:00.000Z', 'Asia/Karachi')).toBe('15:15');
    expect(entryTime('2026-11-19T10:15:00.000Z', 'UTC')).toBe('10:15');
    expect(entryTime('', 'UTC')).toBe('—');
  });
});

describe('activity by hour', () => {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sales: hour === 16 ? 2800 : hour === 22 ? 500 : 0,
    salesCount: hour === 16 ? 3 : hour === 22 ? 1 : 0,
    received: hour === 10 ? 400 : 0,
    receivedCount: hour === 10 ? 1 : 0,
  }));

  it('reads 24 hours, filling the ones the server left out', () => {
    const s = daySummarySerializer({ ...daySummaryOwner, hourly: [{ hour: 16, sales: '2800.0000', salesCount: 3 }] });
    expect(s.hourly).toHaveLength(24);
    expect(s.hourly[16]).toMatchObject({ sales: 2800, salesCount: 3, received: 0 });
  });

  it('draws the working day, widened to any busy hour', () => {
    const w = hourWindow(hours);
    expect(w[0].hour).toBe(8);
    expect(w[w.length - 1].hour).toBe(22);
  });

  it('names the busiest hour, or none on a quiet day', () => {
    expect(busiestHour(hours)?.hour).toBe(16);
    expect(busiestHour(hours.map((h) => ({ ...h, sales: 0, received: 0 })))).toBeNull();
    expect(hourTick(16)).toBe('4 PM');
    expect(hourTick(0)).toBe('12 AM');
  });
});
