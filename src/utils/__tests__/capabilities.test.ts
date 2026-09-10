import { describe, expect, it } from 'vitest';

import {
  ALL_CAPABILITIES,
  can,
  capabilityFor,
  GOVERNANCE_CAPABILITIES,
  needsApproval,
  STAFF_REQUEST_CAPABILITIES,
  submitLabelFor,
  type Capability,
} from '@/utils/capabilities';

/**
 * The capability map mirrors the server's @Roles matrix. Drift between them
 * shows up to a user as a button that 403s, or as a "Save" that silently filed
 * a request — so it is asserted here rather than reviewed by eye.
 */

describe('capabilityFor', () => {
  it('gives the owner everything directly', () => {
    for (const c of ALL_CAPABILITIES) {
      expect(capabilityFor('admin', c)).toBe('direct');
    }
  });

  it('refuses every capability to roles outside the company model', () => {
    // Riders have their own client; super_admin is a platform console.
    for (const c of ALL_CAPABILITIES) {
      expect(capabilityFor('delivery', c)).toBe(false);
      expect(capabilityFor('super_admin', c)).toBe(false);
      expect(capabilityFor(null, c)).toBe(false);
      expect(capabilityFor(undefined, c)).toBe(false);
    }
  });
});

describe('staff matrix', () => {
  // Transcribed from the app's utils/capabilities.ts, which mirrors the
  // backend's controller gates.
  const DIRECT: Capability[] = [
    'estimate.create',
    'salesOrder.create',
    'customer.manage',
    'vendor.manage',
    'delivery.create',
    'delivery.assign',
    'delivery.rejectCompletion',
    'personnel.manage',
    'stock.receive',
    'inventory.manageItems',
    'purchaseOrder.updateStatus',
  ];

  const REQUEST: Capability[] = [
    'invoice.create',
    'payment.receive',
    'inventory.adjust',
    'journal.post',
    'creditMemo.manage',
    'vendorCredit.manage',
    'transaction.void',
    'bill.pay',
    'purchaseOrder.create',
    'delivery.undo',
  ];

  const REFUSED: Capability[] = [
    'delivery.approveCompletion',
    'purchaseOrder.edit',
    'approvals.decide',
    'users.manage',
    'settings.manage',
    'chartOfAccounts.manage',
    'period.close',
  ];

  it('covers every capability exactly once', () => {
    const listed = [...DIRECT, ...REQUEST, ...REFUSED].sort();
    expect(listed).toEqual([...ALL_CAPABILITIES].sort());
  });

  it.each(DIRECT)('staff perform %s directly', (c) => {
    expect(capabilityFor('staff', c)).toBe('direct');
  });

  it.each(REQUEST)('staff must request %s', (c) => {
    expect(capabilityFor('staff', c)).toBe('request');
  });

  it.each(REFUSED)('staff are refused %s', (c) => {
    expect(capabilityFor('staff', c)).toBe(false);
  });

  it('exposes the request set as STAFF_REQUEST_CAPABILITIES', () => {
    expect([...STAFF_REQUEST_CAPABILITIES].sort()).toEqual([...REQUEST].sort());
  });

  it('refuses every governance capability to staff', () => {
    for (const c of GOVERNANCE_CAPABILITIES) {
      expect(can('staff', c)).toBe(false);
    }
  });
});

describe('submitLabelFor', () => {
  it('tells staff a gated save is really a request', () => {
    expect(submitLabelFor('staff', 'invoice.create', 'Save & Send')).toBe(
      'Send for approval',
    );
    expect(needsApproval('staff', 'invoice.create')).toBe(true);
  });

  it('leaves a direct action’s wording alone', () => {
    expect(submitLabelFor('staff', 'customer.manage', 'Save Customer')).toBe(
      'Save Customer',
    );
    expect(submitLabelFor('admin', 'invoice.create', 'Save & Send')).toBe(
      'Save & Send',
    );
  });
});
