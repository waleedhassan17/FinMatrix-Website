import { describe, expect, it } from 'vitest';

import { type CreditSource, fillCredits, spreadCredits } from '@/models/allocation';

const credit = (id: string, available: number, use: string, kind?: string): CreditSource => ({
  id,
  kind,
  reference: `REF-${id}`,
  date: '2026-08-01',
  available,
  use,
});

describe('spreadCredits — credit on account over documents', () => {
  it('spends credit on the first document (oldest due) before the next', () => {
    const s = spreadCredits(
      [
        { documentId: 'overdue', cap: 1000 },
        { documentId: 'current', cap: 500 },
      ],
      [credit('adv', 300, '300', 'advance')],
    );
    expect(s.pieces).toEqual([{ creditId: 'adv', kind: 'advance', documentId: 'overdue', amount: 300 }]);
    expect(s.perDocument).toEqual({ overdue: 300 });
    expect(s.used).toBe(300);
  });

  it('spills a credit onto the next document once the first is covered', () => {
    const s = spreadCredits(
      [
        { documentId: 'a', cap: 200 },
        { documentId: 'b', cap: 500 },
      ],
      [credit('memo', 350, '350', 'credit_memo')],
    );
    expect(s.pieces).toEqual([
      { creditId: 'memo', kind: 'credit_memo', documentId: 'a', amount: 200 },
      { creditId: 'memo', kind: 'credit_memo', documentId: 'b', amount: 150 },
    ]);
    expect(s.perCredit).toEqual({ memo: 350 });
  });

  it('uses credits in the order given, the second picking up where the first stopped', () => {
    const s = spreadCredits(
      [{ documentId: 'a', cap: 1000 }],
      [credit('adv', 300, '300', 'advance'), credit('memo', 200, '200', 'credit_memo')],
    );
    expect(s.perDocument).toEqual({ a: 500 });
    expect(s.perCredit).toEqual({ adv: 300, memo: 200 });
    expect(s.used).toBe(500);
  });

  it('never lands more on a document than its cap — the rest of the credit stays unspent', () => {
    // The server refuses a credit larger than what the invoice still owes, so
    // the spread must never produce one.
    const s = spreadCredits([{ documentId: 'a', cap: 120 }], [credit('adv', 500, '500')]);
    expect(s.perDocument).toEqual({ a: 120 });
    expect(s.perCredit).toEqual({ adv: 120 });
    expect(s.used).toBe(120);
  });

  it('never spends more of a credit than it holds, whatever was typed', () => {
    const s = spreadCredits([{ documentId: 'a', cap: 1000 }], [credit('adv', 250, '900')]);
    expect(s.used).toBe(250);
  });

  it('spends only the part the user chose', () => {
    const s = spreadCredits([{ documentId: 'a', cap: 1000 }], [credit('adv', 250, '100')]);
    expect(s.used).toBe(100);
  });

  it('ignores a blank, zero or negative `use`', () => {
    const s = spreadCredits(
      [{ documentId: 'a', cap: 1000 }],
      [credit('x', 100, ''), credit('y', 100, '0'), credit('z', 100, '-50')],
    );
    expect(s.pieces).toEqual([]);
    expect(s.used).toBe(0);
    expect(s.perCredit).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('skips a document with nothing left to pay', () => {
    const s = spreadCredits(
      [
        { documentId: 'paid', cap: 0 },
        { documentId: 'open', cap: 80 },
      ],
      [credit('adv', 50, '50')],
    );
    expect(s.pieces.map((p) => p.documentId)).toEqual(['open']);
  });

  it('keeps paisa exact — no floating-point drift in the pieces', () => {
    const s = spreadCredits(
      [
        { documentId: 'a', cap: 0.1 },
        { documentId: 'b', cap: 0.2 },
      ],
      [credit('adv', 0.3, '0.3')],
    );
    expect(s.pieces.map((p) => p.amount)).toEqual([0.1, 0.2]);
    expect(s.used).toBe(0.3);
  });
});

describe('fillCredits', () => {
  it('sets every credit to use all it holds, as a 2-dp string', () => {
    expect(fillCredits([credit('a', 1250.5, ''), credit('b', 99.999, '10')]).map((c) => c.use)).toEqual([
      '1250.5',
      '100',
    ]);
  });
});
