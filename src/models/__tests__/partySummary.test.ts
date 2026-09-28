import { describe, expect, it } from 'vitest';

import {
  MESSAGE_DOCUMENT_LIMIT,
  countLabel,
  hasAnythingOpen,
  headlineFigure,
  latenessLabel,
  summaryMessageBody,
  summaryMessageLines,
} from '@/models/partySummary';
import { formatShortDate } from '@/models/reportPeriod';
import { summaryDoc as doc, summaryFixture } from '@/test/partySummaryFixture';

describe('latenessLabel', () => {
  it('reads the signed days the way a person would say them', () => {
    expect(latenessLabel(45)).toBe('45 days overdue');
    expect(latenessLabel(1)).toBe('1 day overdue');
    expect(latenessLabel(0)).toBe('Due today');
    expect(latenessLabel(-1)).toBe('Due in 1 day');
    expect(latenessLabel(-20)).toBe('Due in 20 days');
  });
});

describe('countLabel', () => {
  it('names invoices for a customer and bills for a vendor', () => {
    expect(countLabel(1, 'customer')).toBe('1 invoice');
    expect(countLabel(3, 'vendor')).toBe('3 bills');
  });
});

describe('headlineFigure', () => {
  it('asks for everything open when there are no credits', () => {
    expect(headlineFigure(summaryFixture())).toEqual({ label: 'Total due', value: 1300 });
  });

  it('asks for the net figure once credits come off', () => {
    const s = summaryFixture({
      credits: { total: 400, items: [{ kind: 'payment', id: 'p1', reference: 'RCT-1', date: '2026-09-01', amount: 400, available: 400 }] },
      netDue: 900,
    });
    expect(headlineFigure(s)).toEqual({ label: 'Total due', value: 900 });
  });

  it('turns around rather than printing a negative amount due', () => {
    const s = summaryFixture({
      credits: { total: 1500, items: [{ kind: 'credit_memo', id: 'm1', reference: 'CM-1', date: '2026-09-01', amount: 1500, available: 1500 }] },
      netDue: -200,
    });
    expect(headlineFigure(s)).toEqual({ label: 'Credit in your favour', value: 200 });
    expect(headlineFigure({ ...s, partyType: 'vendor' }).label).toBe('Credit in our favour');
  });

  it('speaks of what is payable on the vendor side', () => {
    expect(headlineFigure(summaryFixture({ partyType: 'vendor' })).label).toBe('Total payable');
  });
});

describe('hasAnythingOpen', () => {
  it('is false only when there is neither a document nor a credit', () => {
    expect(hasAnythingOpen(summaryFixture())).toBe(true);
    expect(hasAnythingOpen(summaryFixture({ documents: [] }))).toBe(false);
    expect(
      hasAnythingOpen(
        summaryFixture({
          documents: [],
          credits: { total: 50, items: [{ kind: 'payment', id: 'p', reference: '', date: '', amount: 50, available: 50 }] },
        }),
      ),
    ).toBe(true);
  });
});

describe('the message that travels with the PDF', () => {
  it('lists each document with its due date and balance, and lateness only when late', () => {
    const [late, notDue] = summaryMessageLines(summaryFixture());
    expect(late).toBe(`INV-1 · due ${formatShortDate('2026-08-14')} · Rs 1,000.00 · 45 days overdue`);
    expect(notDue).toBe(`INV-2 · due ${formatShortDate('2026-08-14')} · Rs 300.00`);
  });

  it('stops listing after ten and points to the PDF for the rest', () => {
    const many = Array.from({ length: 13 }, (_, i) => doc(i + 1, 10, 100));
    const lines = summaryMessageLines(summaryFixture({ documents: many }));
    expect(lines).toHaveLength(MESSAGE_DOCUMENT_LIMIT + 1);
    expect(lines.at(-1)).toBe('…and 3 more in the attached PDF');
  });

  it('says what is owed, what is overdue, and that the PDF is attached', () => {
    const body = summaryMessageBody(summaryFixture(), 'Warehouse Co');
    expect(body[0]).toBe(`Here is a summary of your unpaid invoices with Warehouse Co as of ${formatShortDate('2026-09-28')}:`);
    expect(body).toContain('Total due: Rs 1,300.00');
    expect(body).toContain('Overdue: Rs 1,000.00');
    expect(body.at(-1)).toBe('The full summary is attached as a PDF.');
    expect(body).not.toContain('Less credits: Rs 0.00');
  });

  it('shows the credits coming off before the figure to pay', () => {
    const body = summaryMessageBody(
      summaryFixture({
        credits: { total: 400, items: [{ kind: 'payment', id: 'p1', reference: 'RCT-1', date: '2026-09-01', amount: 400, available: 400 }] },
        netDue: 900,
      }),
      'Warehouse Co',
    );
    const at = body.indexOf('Total outstanding: Rs 1,300.00');
    expect(at).toBeGreaterThan(0);
    expect(body.slice(at, at + 3)).toEqual([
      'Total outstanding: Rs 1,300.00',
      'Less credits: Rs 400.00',
      'Total due: Rs 900.00',
    ]);
  });

  it('writes to a vendor as the one who owes', () => {
    const body = summaryMessageBody(summaryFixture({ partyType: 'vendor' }), 'Warehouse Co');
    expect(body[0]).toBe(`Here is a summary of the bills we have open with you as of ${formatShortDate('2026-09-28')}:`);
    expect(body).toContain('Total payable: Rs 1,300.00');
  });
});
