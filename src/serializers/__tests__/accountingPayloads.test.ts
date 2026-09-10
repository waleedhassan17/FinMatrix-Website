import { describe, expect, it } from 'vitest';

import type { AccountFormData } from '@/models/account';
import { emptyAccountForm } from '@/models/account';
import type { VendorCreditFormData } from '@/models/vendorCredit';
import { freshVendorCreditLine } from '@/models/vendorCredit';
import {
  accountDetailSerializer,
  accountFormToCreatePayload,
  accountFormToUpdatePayload,
  accountListSerializer,
  mapAccount,
} from '@/serializers/accountSerializer';
import {
  mapVendorCredit,
  vendorCreditFormToPayload,
  vendorCreditListSerializer,
  vendorCreditSingleSerializer,
} from '@/serializers/vendorCreditSerializer';

// ═══════════════════════════════════════════════════════
// Vendor credits
// ═══════════════════════════════════════════════════════

const creditForm = (
  over: Partial<VendorCreditFormData> = {},
): VendorCreditFormData => ({
  vendorId: 'vendor-1',
  date: '2026-03-01',
  reason: '',
  lines: [
    {
      ...freshVendorCreditLine(),
      description: 'Overcharged on freight',
      amount: '1200.00',
    },
  ],
  ...over,
});

describe('vendorCreditFormToPayload', () => {
  it('sends the fields the DTO declares and nothing else', () => {
    const payload = vendorCreditFormToPayload(
      creditForm({ reason: 'Damaged on arrival' }),
    );

    expect(payload).toEqual({
      vendorId: 'vendor-1',
      date: '2026-03-01',
      reason: 'Damaged on arrival',
      lines: [{ description: 'Overcharged on freight', amount: '1200.00' }],
    });
  });

  it('never sends a credit number — the server assigns it', () => {
    expect(vendorCreditFormToPayload(creditForm())).not.toHaveProperty(
      'vendorCreditNumber',
    );
  });

  it('never sends totals — the server computes them from the lines', () => {
    const payload = vendorCreditFormToPayload(creditForm());
    expect(payload).not.toHaveProperty('subtotal');
    expect(payload).not.toHaveProperty('taxAmount');
    expect(payload).not.toHaveProperty('total');
  });

  it('drops a blank reason rather than sending an empty string', () => {
    expect(vendorCreditFormToPayload(creditForm({ reason: '   ' })).reason).toBe(
      undefined,
    );
  });

  it('omits itemId entirely on a money-only line', () => {
    // `@IsOptional() @IsUUID()` — "" is present and fails, so the key must go.
    const [line] = vendorCreditFormToPayload(creditForm()).lines;
    expect('itemId' in line).toBe(false);
    expect('quantity' in line).toBe(false);
  });

  it('omits accountId rather than sending an empty string', () => {
    const [line] = vendorCreditFormToPayload(creditForm()).lines;
    expect('accountId' in line).toBe(false);
  });

  it('sends accountId on a money-only line that names one', () => {
    const form = creditForm();
    form.lines[0].accountId = 'acct-6000';
    const [line] = vendorCreditFormToPayload(form).lines;
    expect(line.accountId).toBe('acct-6000');
  });

  it('sends quantity only alongside an item', () => {
    const form = creditForm();
    form.lines[0].itemId = 'item-1';
    form.lines[0].quantity = '3';
    form.lines[0].amount = '750.00';

    const [line] = vendorCreditFormToPayload(form).lines;
    expect(line.itemId).toBe('item-1');
    expect(line.quantity).toBe('3');
  });

  it('drops accountId on an item line, which posts to Inventory instead', () => {
    // The server refuses a NON-stock line pointed at 1200; on a stock line it
    // ignores accountId outright. Sending a stale one is misleading either way.
    const form = creditForm();
    form.lines[0].itemId = 'item-1';
    form.lines[0].quantity = '2';
    form.lines[0].accountId = 'acct-6000';

    const [line] = vendorCreditFormToPayload(form).lines;
    expect('accountId' in line).toBe(false);
  });

  it('omits taxRate when it is zero', () => {
    const [line] = vendorCreditFormToPayload(creditForm()).lines;
    expect('taxRate' in line).toBe(false);
  });

  it('sends taxRate when set, so the input tax claim is reversed', () => {
    const form = creditForm();
    form.lines[0].taxRate = '17';
    const [line] = vendorCreditFormToPayload(form).lines;
    expect(line.taxRate).toBe('17');
  });

  it('sends amounts as 2-dp strings', () => {
    const form = creditForm();
    form.lines[0].amount = '1200';
    expect(vendorCreditFormToPayload(form).lines[0].amount).toBe('1200.00');
  });

  it('skips lines with no description or no amount', () => {
    const form = creditForm();
    form.lines = [
      { ...freshVendorCreditLine(), description: 'Real line', amount: '100' },
      { ...freshVendorCreditLine(), description: '', amount: '' },
      { ...freshVendorCreditLine(), description: 'Zero', amount: '0' },
    ];
    expect(vendorCreditFormToPayload(form).lines).toHaveLength(1);
  });
});

describe('mapVendorCredit', () => {
  it('reads the stringified decimals the API sends', () => {
    const credit = mapVendorCredit({
      id: 'vc-1',
      vendorCreditNumber: 'VC-2026-0001',
      vendorId: 'vendor-1',
      vendorName: 'Acme Supplies',
      date: '2026-03-01',
      status: 'open',
      subtotal: '1000.0000',
      taxAmount: '170.0000',
      total: '1170.0000',
      amountApplied: '0.0000',
      balance: '1170.0000',
      lines: [
        {
          id: 'l-1',
          accountId: 'acct-6000',
          description: 'Freight',
          amount: '1000.0000',
          taxRate: '17.0000',
          quantity: null,
          lineOrder: 0,
        },
      ],
    });

    expect(credit.subtotal).toBe(1000);
    expect(credit.taxAmount).toBe(170);
    expect(credit.total).toBe(1170);
    expect(credit.balance).toBe(1170);
    expect(credit.lines[0].amount).toBe(1000);
    expect(credit.lines[0].taxRate).toBe(17);
    // A money-only line has a null quantity, which must read as 0, not NaN.
    expect(credit.lines[0].quantity).toBe(0);
  });

  it('holds the subtotal + tax = total invariant', () => {
    const credit = mapVendorCredit({
      subtotal: '1000.0000',
      taxAmount: '170.0000',
      total: '1170.0000',
    });
    expect(credit.subtotal + credit.taxAmount).toBe(credit.total);
  });

  it('leaves originalBillId null rather than an empty string', () => {
    expect(mapVendorCredit({ id: 'vc-1' }).originalBillId).toBe(null);
  });

  it('defaults a missing status to open', () => {
    expect(mapVendorCredit({ id: 'vc-1' }).status).toBe('open');
  });
});

describe('vendorCreditListSerializer', () => {
  it('reads the paginated {data} envelope the AP side uses', () => {
    const rows = vendorCreditListSerializer({
      data: [{ id: 'vc-1' }, { id: 'vc-2' }],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });
    expect(rows.map((r) => r.id)).toEqual(['vc-1', 'vc-2']);
  });

  it('tolerates a bare array', () => {
    expect(vendorCreditListSerializer([{ id: 'vc-1' }])).toHaveLength(1);
  });

  it('is empty for a malformed payload rather than throwing', () => {
    expect(vendorCreditListSerializer(null)).toEqual([]);
    expect(vendorCreditListSerializer({})).toEqual([]);
  });
});

describe('vendorCreditSingleSerializer', () => {
  it('reads the bare entity the detail route returns', () => {
    const credit = vendorCreditSingleSerializer({
      id: 'vc-1',
      total: '500.0000',
      lines: [],
    });
    expect(credit?.id).toBe('vc-1');
    expect(credit?.total).toBe(500);
  });

  it('reads a wrapped entity too', () => {
    expect(
      vendorCreditSingleSerializer({ vendorCredit: { id: 'vc-9' } })?.id,
    ).toBe('vc-9');
  });

  it('is null for an empty payload', () => {
    expect(vendorCreditSingleSerializer(null)).toBe(null);
    expect(vendorCreditSingleSerializer({})).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════
// Chart of accounts
// ═══════════════════════════════════════════════════════

const accountForm = (over: Partial<AccountFormData> = {}): AccountFormData => ({
  ...emptyAccountForm('expense'),
  accountNumber: '6500',
  name: 'Packaging Materials',
  subType: 'Operating',
  ...over,
});

describe('accountFormToCreatePayload', () => {
  it('sends the DTO’s field names, not the mobile app’s', () => {
    expect(accountFormToCreatePayload(accountForm())).toEqual({
      accountNumber: '6500',
      name: 'Packaging Materials',
      type: 'expense',
      subType: 'Operating',
    });
  });

  it('never sends the five fields the DTO would strip', () => {
    // The app sends code/balance/normalBalance/isSystemAccount/companyId. None
    // is on CreateAccountDto, whitelist:true drops them all, and that is why
    // the app's opening balances never posted.
    const payload = accountFormToCreatePayload(accountForm()) as unknown as Record<string, unknown>;
    expect('code' in payload).toBe(false);
    expect('balance' in payload).toBe(false);
    expect('normalBalance' in payload).toBe(false);
    expect('isSystemAccount' in payload).toBe(false);
    expect('companyId' in payload).toBe(false);
  });

  it('sends subType as the human label the server compares against', () => {
    expect(accountFormToCreatePayload(accountForm()).subType).toBe('Operating');
  });

  it('omits parentId rather than sending an empty string', () => {
    // @IsOptional() @IsUUID() — "" is present and fails.
    const payload = accountFormToCreatePayload(accountForm({ parentId: '' }));
    expect('parentId' in payload).toBe(false);
  });

  it('sends parentId when one is chosen', () => {
    expect(
      accountFormToCreatePayload(accountForm({ parentId: 'acct-6000' })).parentId,
    ).toBe('acct-6000');
  });

  it('omits a blank description', () => {
    const payload = accountFormToCreatePayload(accountForm({ description: '  ' }));
    expect('description' in payload).toBe(false);
  });

  it('omits a blank or zero opening balance', () => {
    // Zero posts no journal entry server-side, so omitting says what was meant.
    expect('openingBalance' in accountFormToCreatePayload(accountForm())).toBe(false);
    expect(
      'openingBalance' in accountFormToCreatePayload(accountForm({ openingBalance: '0' })),
    ).toBe(false);
  });

  it('sends a real opening balance as a 2-dp string', () => {
    expect(
      accountFormToCreatePayload(accountForm({ openingBalance: '1500' }))
        .openingBalance,
    ).toBe('1500.00');
  });

  it('keeps a negative opening balance negative', () => {
    expect(
      accountFormToCreatePayload(accountForm({ openingBalance: '-250.5' }))
        .openingBalance,
    ).toBe('-250.50');
  });

  it('trims the number and name', () => {
    const payload = accountFormToCreatePayload(
      accountForm({ accountNumber: ' 6500 ', name: '  Packaging  ' }),
    );
    expect(payload.accountNumber).toBe('6500');
    expect(payload.name).toBe('Packaging');
  });
});

describe('accountFormToUpdatePayload', () => {
  it('leaves out the fields update() ignores', () => {
    // PartialType would ACCEPT all three, but update() never reads them — so
    // sending them looks like an edit that silently does nothing.
    const payload = accountFormToUpdatePayload(
      accountForm({ openingBalance: '999' }),
    ) as unknown as Record<string, unknown>;
    expect('accountNumber' in payload).toBe(false);
    expect('type' in payload).toBe(false);
    expect('openingBalance' in payload).toBe(false);
  });

  it('sends the mutable fields', () => {
    expect(
      accountFormToUpdatePayload(
        accountForm({ parentId: 'acct-6000', description: 'Boxes and tape' }),
      ),
    ).toEqual({
      name: 'Packaging Materials',
      subType: 'Operating',
      parentId: 'acct-6000',
      description: 'Boxes and tape',
      isActive: true,
    });
  });

  it('sends parentId as null to clear it, never undefined', () => {
    // undefined disappears from the JSON, so the service would never see the
    // key and a sub-account could never be detached. null hits the ?? branch.
    expect(accountFormToUpdatePayload(accountForm({ parentId: '' })).parentId).toBe(
      null,
    );
  });

  it('sends an empty description so it can be cleared', () => {
    expect(
      accountFormToUpdatePayload(accountForm({ description: '' })).description,
    ).toBe('');
  });
});

describe('mapAccount', () => {
  it('reads the real field names', () => {
    const account = mapAccount({
      id: 'a-1',
      accountNumber: '1010',
      name: 'Business Checking',
      type: 'asset',
      subType: 'Bank',
      parentId: null,
      openingBalance: '5000.0000',
      balance: '7250.5000',
      isActive: true,
      isSystemAccount: true,
    });
    expect(account.accountNumber).toBe('1010');
    expect(account.openingBalance).toBe(5000);
    expect(account.balance).toBe(7250.5);
    expect(account.isSystemAccount).toBe(true);
  });

  it('falls back to `code` when accountNumber is absent', () => {
    // A blank account number breaks sorting, grouping and the duplicate check
    // all at once, so both spellings are read.
    expect(mapAccount({ code: '6000' }).accountNumber).toBe('6000');
  });

  it('leaves parentId null rather than an empty string', () => {
    expect(mapAccount({ id: 'a-1' }).parentId).toBe(null);
  });

  it('treats a missing isActive as active', () => {
    expect(mapAccount({ id: 'a-1' }).isActive).toBe(true);
  });

  it('treats a missing isSystemAccount as false', () => {
    expect(mapAccount({ id: 'a-1' }).isSystemAccount).toBe(false);
  });
});

describe('accountListSerializer', () => {
  it('reads the nested {accounts, summary} shape', () => {
    const { accounts, summary } = accountListSerializer({
      accounts: [{ id: 'a', accountNumber: '1000' }, { id: 'b', accountNumber: '2000' }],
      summary: {
        totals: { asset: '1000.0000', liability: '500.0000', equity: '0', revenue: '0', expense: '0' },
        counts: { asset: 1, liability: 1, equity: 0, revenue: 0, expense: 0 },
        totalAccounts: 2,
      },
    });

    expect(accounts).toHaveLength(2);
    expect(summary.totals.asset).toBe(1000);
    expect(summary.counts.liability).toBe(1);
    expect(summary.totalAccounts).toBe(2);
  });

  it('falls back to the row count when the summary is missing', () => {
    // A missing summary must not make a populated chart read as empty.
    const { summary } = accountListSerializer({
      accounts: [{ id: 'a' }, { id: 'b' }],
    });
    expect(summary.totalAccounts).toBe(2);
  });

  it('zeroes every type in a missing summary rather than leaving holes', () => {
    const { summary } = accountListSerializer({ accounts: [] });
    expect(summary.totals).toEqual({
      asset: 0,
      liability: 0,
      equity: 0,
      revenue: 0,
      expense: 0,
    });
  });

  it('tolerates a bare array', () => {
    expect(accountListSerializer([{ id: 'a' }]).accounts).toHaveLength(1);
  });

  it('is empty for a malformed payload', () => {
    expect(accountListSerializer(null).accounts).toEqual([]);
  });
});

describe('accountDetailSerializer', () => {
  it('reads {account, recentEntries}', () => {
    const { account, recentEntries } = accountDetailSerializer({
      account: { id: 'a-1', accountNumber: '1000', balance: '500.0000' },
      recentEntries: [
        {
          id: 'gl-1',
          date: '2026-03-01',
          reference: 'JE-2026-0001',
          debit: '500.0000',
          credit: '0.0000',
          balance: '500.0000',
          memo: 'Opening balance',
        },
      ],
    });

    expect(account?.accountNumber).toBe('1000');
    expect(recentEntries).toHaveLength(1);
    expect(recentEntries[0].debit).toBe(500);
    expect(recentEntries[0].balance).toBe(500);
  });

  it('reads a bare account with no wrapper', () => {
    expect(accountDetailSerializer({ id: 'a-1' }).account?.id).toBe('a-1');
  });

  it('is null with no entries for an empty payload', () => {
    const result = accountDetailSerializer({});
    expect(result.account).toBe(null);
    expect(result.recentEntries).toEqual([]);
  });
});
