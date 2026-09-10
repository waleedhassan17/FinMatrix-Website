import { describe, expect, it } from 'vitest';

import {
  autoDistribute,
  isOverAllocated,
  overAppliedRows,
  payInFull,
  totalAllocated,
  totalOutstanding,
  unappliedOf,
  type AllocationRow,
} from '@/models/payment';

const row = (
  documentId: string,
  balance: number,
  dueDate = '2026-01-01',
  checked = false,
  applied = '0',
): AllocationRow => ({
  documentId,
  documentNumber: `INV-${documentId}`,
  dueDate,
  total: balance,
  amountPaid: 0,
  balance,
  checked,
  applied,
});

/**
 * The allocation engine.
 *
 * This decides which invoices a customer's money settles, so a quiet error
 * here is an accounting error the user has no way to see.
 */

describe('autoDistribute', () => {
  it('fills checked rows oldest-first until the money runs out', () => {
    // Rows arrive from the server already sorted by due date.
    const rows = [
      row('a', 100, '2026-01-01', true),
      row('b', 100, '2026-02-01', true),
      row('c', 100, '2026-03-01', true),
    ];
    const out = autoDistribute(rows, 150);
    expect(out.map((r) => r.applied)).toEqual(['100', '50', '0']);
  });

  it('never gives a row more than that invoice owes', () => {
    const out = autoDistribute([row('a', 40, '2026-01-01', true)], 500);
    expect(out[0].applied).toBe('40');
  });

  it('skips unchecked rows entirely', () => {
    const rows = [
      row('a', 100, '2026-01-01', false),
      row('b', 100, '2026-02-01', true),
    ];
    const out = autoDistribute(rows, 150);
    expect(out[0].applied).toBe('0');
    expect(out[1].applied).toBe('100');
  });

  it('clears a previously applied figure when a row is unchecked', () => {
    const out = autoDistribute([row('a', 100, '2026-01-01', false, '75')], 100);
    expect(out[0].applied).toBe('0');
  });

  it('can never over-allocate, whatever the amount', () => {
    const rows = [
      row('a', 100, '2026-01-01', true),
      row('b', 100, '2026-02-01', true),
    ];
    const out = autoDistribute(rows, 10_000);
    expect(totalAllocated(out)).toBe(200);
    expect(isOverAllocated(10_000, totalAllocated(out))).toBe(false);
  });

  it('handles decimals without float drift', () => {
    const rows = [
      row('a', 0.1, '2026-01-01', true),
      row('b', 0.2, '2026-02-01', true),
    ];
    expect(totalAllocated(autoDistribute(rows, 0.3))).toBe(0.3);
  });
});

describe('payInFull', () => {
  it('checks every row and matches the amount to the total outstanding', () => {
    const rows = [row('a', 120.5), row('b', 79.5)];
    const result = payInFull(rows);
    expect(result.amount).toBe('200');
    expect(result.rows.every((r) => r.checked)).toBe(true);
    expect(totalAllocated(result.rows)).toBe(200);
    expect(totalOutstanding(rows)).toBe(200);
  });
});

describe('unappliedOf', () => {
  it('is the remainder held as customer credit', () => {
    expect(unappliedOf(500, 300)).toBe(200);
  });

  it('floors at zero rather than reporting a negative remainder', () => {
    // Over-allocation is a separate error state, not a negative "unapplied".
    expect(unappliedOf(300, 500)).toBe(0);
  });

  it('treats an unparseable amount as zero', () => {
    expect(unappliedOf('', 0)).toBe(0);
  });
});

describe('guards', () => {
  it('flags allocations exceeding the payment', () => {
    // The server refuses this with INVALID_PAYMENT_APPLICATION.
    expect(isOverAllocated(100, 150)).toBe(true);
    expect(isOverAllocated(100, 100)).toBe(false);
  });

  it('flags a row given more than that invoice owes', () => {
    // The server refuses the whole request with PAYMENT_EXCEEDS_BALANCE.
    const rows = [row('a', 100, '2026-01-01', true, '150')];
    expect(overAppliedRows(rows)).toHaveLength(1);
  });

  it('ignores unchecked rows when checking over-application', () => {
    const rows = [row('a', 100, '2026-01-01', false, '150')];
    expect(overAppliedRows(rows)).toHaveLength(0);
  });

  it('accepts a row allocated exactly its balance', () => {
    const rows = [row('a', 100, '2026-01-01', true, '100')];
    expect(overAppliedRows(rows)).toHaveLength(0);
  });
});
