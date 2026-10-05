import { describe, expect, it } from 'vitest';

import { normalizePartyCode, partyCodeProblem, partyLabel } from '@/models/partyCode';
import { historyFieldLabel, historyValue, monthLabel } from '@/models/partyHistory';

describe('party IDs', () => {
  it('reads a party the way every list and picker shows it — and filters it', () => {
    expect(partyLabel('C-0007', 'Ali Traders')).toBe('C-0007 · Ali Traders');
    expect(partyLabel('', 'Ali Traders')).toBe('Ali Traders');
    expect(partyLabel(null, 'Ali Traders')).toBe('Ali Traders');
  });

  it('normalizes and checks a typed ID as the server will', () => {
    expect(normalizePartyCode('  ali-01 ')).toBe('ALI-01');
    expect(partyCodeProblem('', 'Customer')).toBeNull();
    expect(partyCodeProblem('khi/001', 'Customer')).toBeNull();
    expect(partyCodeProblem('A B', 'Vendor')).toMatch(/no spaces/);
    expect(partyCodeProblem('X'.repeat(21), 'Customer')).toMatch(/20 characters/);
  });
});

describe('History wording', () => {
  it('names fields and values the way a person reads them', () => {
    expect(historyFieldLabel('code', 'customer')).toBe('Customer ID');
    expect(historyFieldLabel('code', 'vendor')).toBe('Vendor ID');
    expect(historyFieldLabel('creditLimit', 'customer')).toBe('Credit limit');
    expect(historyValue('creditLimit', '7500000')).toBe('Rs 7,500,000.00');
    expect(historyValue('creditLimit', '0.0000')).toBe('No limit');
    expect(historyValue('paymentTerms', 'net45')).toBe('Net 45');
    expect(historyValue('isActive', false)).toBe('No');
    expect(historyValue('phone', null)).toBe('—');
    expect(monthLabel('2026-07')).toBe('Jul 2026');
  });
});
