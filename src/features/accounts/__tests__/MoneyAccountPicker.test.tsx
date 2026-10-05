// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The account money moves through — every bank, and why one is missing
// ═══════════════════════════════════════════════════════
// Pay bills offered only Cash and Business Checking, and a "Meezan Bank" the
// owner had added never appeared — it had been saved as an Other Expense, and
// nothing on the screen said so. These pin the picker's answer to both.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capability = { allowed: true };
vi.mock('@/hooks/useCapability', () => ({
  useCapability: () => ({ ...capability, needsApproval: false }),
}));
vi.mock('@/networks/accounting/accountNetwork', () => ({
  getAccounts: vi.fn(),
  createAccount: vi.fn(),
}));

import { MoneyAccountPicker } from '@/features/accounts/MoneyAccountPicker';
import type { Account } from '@/models/account';
import { getAccounts } from '@/networks/accounting/accountNetwork';

const account = (over: Partial<Account>): Account => ({
  id: 'a',
  accountNumber: '1000',
  name: 'Cash',
  type: 'asset',
  subType: 'Cash',
  parentId: null,
  description: '',
  openingBalance: 0,
  balance: 0,
  isActive: true,
  isSystemAccount: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const CHART: Account[] = [
  account({ id: 'cash', accountNumber: '1000', name: 'Cash', subType: 'Cash', balance: 25000 }),
  account({ id: 'bank', accountNumber: '1010', name: 'Business Checking', subType: 'Bank', balance: 90000 }),
  account({ id: 'mcb', accountNumber: '1020', name: 'MCB Current', subType: 'Bank', balance: 120000 }),
  account({ id: 'ar', accountNumber: '1100', name: 'Accounts Receivable', subType: 'Accounts Receivable' }),
  account({ id: 'meezan', accountNumber: '5010', name: 'MEEZAN BANK', type: 'expense', subType: 'Other Expense' }),
];

function Harness(props: { initial?: string; defaultToCash?: boolean; allowCreate?: boolean }) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <>
      <MoneyAccountPicker
        label="Pay from"
        value={value}
        onChange={setValue}
        defaultToCash={props.defaultToCash}
        allowCreate={props.allowCreate}
      />
      <output data-testid="chosen">{value}</output>
    </>
  );
}

const renderPicker = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Harness {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  capability.allowed = true;
  vi.mocked(getAccounts).mockReset();
  vi.mocked(getAccounts).mockResolvedValue(CHART);
});

describe('MoneyAccountPicker', () => {
  it('offers every cash and bank account, with what each holds', async () => {
    renderPicker();
    fireEvent.click(await screen.findByRole('button', { name: /Pay from|Choose an account/ }));

    expect(await screen.findByText('1020 · MCB Current')).toBeTruthy();
    expect(screen.getByText('1000 · Cash')).toBeTruthy();
    expect(screen.getByText('1010 · Business Checking')).toBeTruthy();
    expect(screen.getByText('Rs 120,000.00')).toBeTruthy();
    // Not money: receivables and the mis-filed expense are not options.
    expect(screen.queryByRole('button', { name: /1100 · Accounts Receivable/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /5010 · MEEZAN BANK/ })).toBeNull();
  });

  it('says why "Meezan Bank" is missing, and links an owner to the fix', async () => {
    renderPicker();
    expect(await screen.findByText('5010 · MEEZAN BANK')).toBeTruthy();
    expect(screen.getByText(/is set up as an Expense \(Other Expense\)/)).toBeTruthy();
    const fix = screen.getByRole('link', { name: 'Make it a bank account' });
    expect(fix.getAttribute('href')).toBe('/accounts/meezan/edit');
  });

  it('tells staff to ask the owner instead', async () => {
    capability.allowed = false;
    renderPicker();
    expect(await screen.findByText(/Ask the owner to make it a bank account/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Make it a bank account' })).toBeNull();
  });

  it('offers "New bank account" at the foot of the list to an owner only', async () => {
    renderPicker();
    fireEvent.click(await screen.findByRole('button', { name: /Pay from|Choose an account/ }));
    expect(await screen.findByRole('button', { name: 'New bank account' })).toBeTruthy();
  });

  it('has no create action inside a dialog, and names a mis-filed bank in one line', async () => {
    renderPicker({ allowCreate: false });
    expect(
      await screen.findByText(/MEEZAN BANK isn’t set up as a bank or cash account, so it isn’t listed\./),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Pay from|Choose an account/ }));
    await screen.findByText('1020 · MCB Current');
    expect(screen.queryByRole('button', { name: 'New bank account' })).toBeNull();
  });

  it('fills in Cash where Cash was always the default', async () => {
    renderPicker({ defaultToCash: true });
    expect(await screen.findByText('cash', { selector: 'output' })).toBeTruthy();
  });
});
