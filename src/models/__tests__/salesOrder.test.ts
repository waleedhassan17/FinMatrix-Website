import { describe, expect, it } from 'vitest';

import {
  areLinesEditable,
  billedNotShipped,
  buildFulfilDrafts,
  fulfilDraftsToPayload,
  fulfilledLineCount,
  fulfilmentPercent,
  isFullyFulfilled,
  overFulfilledDrafts,
  remainingOf,
  salesOrderActions,
  unitsToShip,
  type FulfilDraft,
  type SalesOrder,
  type SalesOrderLine,
} from '@/models/salesOrder';

const line = (
  id: string,
  quantity: number,
  quantityFulfilled: number,
  quantityInvoiced = 0,
): SalesOrderLine => ({
  id,
  itemId: '',
  itemName: '',
  description: `Item ${id}`,
  quantity,
  unitPrice: 100,
  taxRate: 0,
  amount: quantity * 100,
  quantityFulfilled,
  quantityInvoiced,
  toInvoice: Math.max(quantityFulfilled - quantityInvoiced, 0),
  toShip: Math.max(quantity - quantityFulfilled, 0),
  onHand: null,
  backorderQty: 0,
});

/**
 * The fulfilment arithmetic.
 *
 * `quantityFulfilled` is a CUMULATIVE total on the wire, not a delta — the
 * server assigns rather than adds. Getting that backwards would silently
 * under-record every shipment after the first, and nothing in the UI would
 * look wrong. These tests are the guard.
 */

describe('remainingOf', () => {
  it('is ordered minus fulfilled', () => {
    expect(remainingOf(line('a', 10, 4))).toBe(6);
  });

  it('never goes negative when over-shipped', () => {
    expect(remainingOf(line('a', 10, 12))).toBe(0);
  });
});

describe('buildFulfilDrafts', () => {
  it('defaults each line to shipping its remainder', () => {
    const drafts = buildFulfilDrafts([line('a', 10, 4), line('b', 5, 0)]);
    expect(drafts[0]).toMatchObject({
      lineId: 'a',
      ordered: 10,
      alreadyFulfilled: 4,
      shipping: '6',
    });
    expect(drafts[1].shipping).toBe('5');
  });

  it('defaults a finished line to shipping nothing', () => {
    expect(buildFulfilDrafts([line('a', 10, 10)])[0].shipping).toBe('0');
  });
});

describe('fulfilDraftsToPayload — cumulative, not incremental', () => {
  const draft = (
    lineId: string,
    ordered: number,
    alreadyFulfilled: number,
    shipping: string,
  ): FulfilDraft => ({
    lineId,
    description: lineId,
    ordered,
    alreadyFulfilled,
    invoiced: 0,
    shipping,
  });

  it('ADDS the shipment to what already shipped', () => {
    // The line is at 3 and we ship 2 more, so the wire value is 5 — not 2.
    // Sending the delta would leave the line at 2, silently losing a shipment.
    expect(fulfilDraftsToPayload([draft('a', 10, 3, '2')])).toEqual([
      { lineId: 'a', quantityFulfilled: '5' },
    ]);
  });

  it('sends the shipment as-is on a first shipment', () => {
    expect(fulfilDraftsToPayload([draft('a', 10, 0, '4')])).toEqual([
      { lineId: 'a', quantityFulfilled: '4' },
    ]);
  });

  it('omits lines that are not shipping anything', () => {
    // Omitted lines keep their current value server-side; sending "0" would
    // actively reset them.
    const payload = fulfilDraftsToPayload([
      draft('a', 10, 3, '2'),
      draft('b', 5, 5, '0'),
      draft('c', 5, 0, ''),
    ]);
    expect(payload).toHaveLength(1);
    expect(payload[0].lineId).toBe('a');
  });

  it('handles decimal quantities without float drift', () => {
    expect(fulfilDraftsToPayload([draft('a', 10, 0.1, '0.2')])).toEqual([
      { lineId: 'a', quantityFulfilled: '0.3' },
    ]);
  });

  it('sends quantities as strings — the DTO is @IsNumberString', () => {
    const [row] = fulfilDraftsToPayload([draft('a', 10, 1, '1')]);
    expect(typeof row.quantityFulfilled).toBe('string');
  });

  it('completes a line exactly when shipping the remainder', () => {
    expect(fulfilDraftsToPayload([draft('a', 10, 4, '6')])).toEqual([
      { lineId: 'a', quantityFulfilled: '10' },
    ]);
  });
});

describe('overFulfilledDrafts', () => {
  const draft = (
    lineId: string,
    ordered: number,
    alreadyFulfilled: number,
    shipping: string,
  ): FulfilDraft => ({ lineId, description: lineId, ordered, alreadyFulfilled, invoiced: 0, shipping });

  it('flags a line whose CUMULATIVE total exceeds the order', () => {
    // 8 already shipped + 5 more = 13 against 10 ordered. The shipment alone
    // looks fine; only the total gives it away.
    expect(overFulfilledDrafts([draft('a', 10, 8, '5')])).toHaveLength(1);
  });

  it('allows shipping exactly the remainder', () => {
    expect(overFulfilledDrafts([draft('a', 10, 8, '2')])).toHaveLength(0);
  });

  it('passes a clean set', () => {
    expect(
      overFulfilledDrafts([draft('a', 10, 0, '3'), draft('b', 5, 1, '2')]),
    ).toHaveLength(0);
  });
});

describe('fulfilmentPercent', () => {
  it('returns 0–100, not a 0–1 fraction', () => {
    // The app passes a fraction to a bar expecting a percentage, so a finished
    // line renders 1% wide. This is the corrected scale.
    expect(fulfilmentPercent(line('a', 10, 10))).toBe(100);
    expect(fulfilmentPercent(line('a', 10, 5))).toBe(50);
  });

  it('clamps an over-shipped line to 100', () => {
    expect(fulfilmentPercent(line('a', 10, 12))).toBe(100);
  });

  it('does not divide by zero', () => {
    expect(fulfilmentPercent(line('a', 0, 0))).toBe(0);
  });
});

describe('order-level fulfilment', () => {
  const order = (lines: SalesOrderLine[]) => ({ lines }) as SalesOrder;

  it('counts fully shipped lines', () => {
    expect(
      fulfilledLineCount(order([line('a', 10, 10), line('b', 5, 2), line('c', 1, 1)])),
    ).toBe(2);
  });

  it('is fully fulfilled only when every line is', () => {
    expect(isFullyFulfilled(order([line('a', 10, 10), line('b', 5, 5)]))).toBe(true);
    expect(isFullyFulfilled(order([line('a', 10, 10), line('b', 5, 4)]))).toBe(false);
  });

  it('treats an empty order as not fulfilled', () => {
    expect(isFullyFulfilled(order([]))).toBe(false);
  });
});

describe('areLinesEditable', () => {
  it('permits editing only while nothing has shipped', () => {
    // Stricter than the server, deliberately: PATCHing lines on a partial
    // order deletes and reinserts them, resetting every quantityFulfilled to
    // zero with no warning.
    expect(areLinesEditable('open')).toBe(true);
    expect(areLinesEditable('partial')).toBe(false);
    expect(areLinesEditable('fulfilled')).toBe(false);
    expect(areLinesEditable('invoiced')).toBe(false);
    expect(areLinesEditable('closed')).toBe(false);
    expect(areLinesEditable('cancelled')).toBe(false);
  });
});

/**
 * Partial invoicing. An order half shipped and invoiced used to be frozen as
 * 'invoiced' with no way to ship the rest; the detail page now follows the
 * server's `actions`, and only a list row falls back to the status.
 */
describe('salesOrderActions', () => {
  const order = (
    status: SalesOrder['status'],
    lines: SalesOrderLine[],
    actions: SalesOrder['actions'] = null,
  ) => ({ status, lines, actions, totals: null }) as unknown as SalesOrder;

  it("uses the server's answer when the detail carries one", () => {
    const fromServer = {
      ship: true,
      invoice: false,
      close: false,
      reopen: false,
      cancel: false,
      delete: false,
      edit: false,
      editLines: false,
    };
    // An order invoiced in full the old way with goods still to deliver.
    expect(salesOrderActions(order('invoiced', [line('a', 10, 4, 10)], fromServer))).toBe(fromServer);
  });

  it('falls back to the status: a partial order ships, invoices and closes', () => {
    const a = salesOrderActions(order('partial', [line('a', 10, 5, 5)]));
    expect(a).toMatchObject({ ship: true, invoice: true, close: true, cancel: false, editLines: false });
  });

  it('a closed order only reopens', () => {
    const a = salesOrderActions(order('closed', [line('a', 10, 5, 5)]));
    expect(a).toMatchObject({ ship: false, invoice: false, close: false, reopen: true, edit: false });
  });

  it('only an untouched order cancels or deletes', () => {
    expect(salesOrderActions(order('open', [line('a', 10, 0)]))).toMatchObject({ cancel: true, delete: true });
    expect(salesOrderActions(order('fulfilled', [line('a', 10, 10)]))).toMatchObject({
      cancel: false,
      delete: false,
      ship: false,
      invoice: true,
    });
  });
});

describe('what is left on the order', () => {
  const order = (lines: SalesOrderLine[]) => ({ lines, totals: null }) as unknown as SalesOrder;

  it('counts units billed ahead of delivery', () => {
    expect(billedNotShipped(order([line('a', 10, 4, 10), line('b', 2, 2, 2)]))).toBe(6);
  });

  it('counts units still to ship', () => {
    expect(unitsToShip(order([line('a', 10, 5, 5), line('b', 3, 0)]))).toBe(8);
  });

  it("prefers the server's totals", () => {
    const withTotals = {
      lines: [line('a', 10, 5, 5)],
      totals: { ordered: 10, shipped: 5, invoiced: 5, toInvoice: 0, toShip: 0, billedNotShipped: 0 },
    } as unknown as SalesOrder;
    // A closed order: nothing more will ship even though 5 never did.
    expect(unitsToShip(withTotals)).toBe(0);
  });
});

describe('buildFulfilDrafts on a partly invoiced order', () => {
  it('shows what is already invoiced and defaults to the remainder', () => {
    const [d] = buildFulfilDrafts([line('a', 10, 5, 5)]);
    expect(d).toMatchObject({ alreadyFulfilled: 5, invoiced: 5, shipping: '5' });
  });
});
