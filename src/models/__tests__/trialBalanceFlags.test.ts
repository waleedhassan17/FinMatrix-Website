import { describe, expect, it } from 'vitest';

import { explainFlag, warningFlags } from '@/models/trialBalanceFlags';

describe('explainFlag', () => {
  it('words an abnormal balance for the account it fires on', () => {
    expect(explainFlag('abnormal_balance', { accountName: 'Cash', accountType: 'asset', subType: 'Cash' }).detail).toBe(
      'Cash shows a credit balance — usually an unrecorded deposit or a payment posted twice.',
    );
    expect(
      explainFlag('abnormal_balance', { accountName: 'Accounts Payable', accountType: 'liability', subType: 'Accounts Payable' }).detail,
    ).toMatch(/supplier was paid twice/);
    expect(explainFlag('abnormal_balance', { accountName: 'Sales', accountType: 'revenue', subType: '' }).detail).toMatch(
      /^Sales shows a debit balance/,
    );
  });

  it('explains the contra-asset assumption as information, not a warning', () => {
    const e = explainFlag('contra_assumed', { accountName: 'Accumulated Depreciation', accountType: 'asset', subType: 'Fixed Asset' });
    expect(e.severity).toBe('info');
    expect(warningFlags(['contra_assumed', 'obe_nonzero'])).toEqual(['obe_nonzero']);
  });

  it('names a flag it does not know rather than dropping it', () => {
    expect(explainFlag('new_flag', { accountName: 'X', accountType: 'asset', subType: '' }).title).toBe('New flag');
  });
});
