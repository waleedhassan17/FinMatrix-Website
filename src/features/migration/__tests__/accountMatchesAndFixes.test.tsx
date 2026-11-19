// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/settings/migrationNetwork', () => ({
  listIssues: vi.fn(async () => ({
    groups: [{ code: 'SOURCE_REPORT_DATE', severity: 'blocking', count: 1 }],
    items: [
      {
        id: 'i1',
        code: 'SOURCE_REPORT_DATE',
        severity: 'blocking',
        sheet: 'Trial Balance',
        rowNumber: null,
        field: 'report::date::trial_balance',
        message: 'The Trial balance is as of 2026-09-30; it must be as of 2026-11-18.',
        options: [{ value: 'cutover:2026-10-01', label: 'Change the cutover date to 2026-10-01 (the reports are as of 2026-09-30)' }],
      },
    ],
    total: 1,
    page: 1,
    limit: 200,
  })),
  resolveIssue: vi.fn(async () => ({})),
  getMigration: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AccountMatches } from '@/features/migration/AccountMatches';
import { YourChart } from '@/features/migration/YourChart';
import { FixStep } from '@/features/migration/steps/FixStep';
import type { MappingsView, MigrationBatch } from '@/models/migration';
import { resolveIssue } from '@/networks/settings/migrationNetwork';

const row = (source: string, target: string | null, over: Partial<MappingsView['mappings']['account'][number]> = {}) => ({
  id: source, kind: 'account' as const, sheet: null, source, target, confidence: 1, origin: 'rule' as const, reason: null, confirmed: false, needsReview: false, ...over,
});

const view: MappingsView = {
  sheets: [],
  mappings: {
    sheet: [],
    column: [],
    value: [],
    account: [
      row('1200', 'NEW', { confidence: 0.6, needsReview: true, reason: "FinMatrix's 1200 is Inventory (asset), a different account, so yours is created as 1201" }),
      row('6050', 'NEW', { reason: 'a new account from the Accounts sheet' }),
      row('4000', '4000', { reason: 'same number as 4000 Sales Revenue' }),
    ],
  },
  targets: [],
  chartOfAccounts: [
    { number: '1200', name: 'Inventory', type: 'asset' },
    { number: '4000', name: 'Sales Revenue', type: 'revenue' },
  ],
  sourceAccounts: [
    { number: '1200', name: 'Bank Current Account', type: 'asset', balance: '2145780.50', createAs: '1201' },
    { number: '6050', name: 'Salaries & Wages', type: 'expense', balance: '1080000.00', createAs: null },
    { number: '4000', name: 'Sales', type: 'revenue', balance: '-9000000.00', createAs: null },
  ],
};

describe('Match step: accounts', () => {
  it('shows each account as the owner knows it, grouped by what happens to it', () => {
    render(<AccountMatches view={view} editable saving={false} onChange={vi.fn()} />);
    expect(screen.getByText('Needs your decision (1)')).toBeTruthy();
    expect(screen.getByText('New accounts to create (1)')).toBeTruthy();
    expect(screen.getByText('Matched to FinMatrix accounts (1)')).toBeTruthy();
    // Name, type and balance beside the number; the free number it gets.
    expect(screen.getByText('Bank Current Account')).toBeTruthy();
    expect(screen.getByText('Dr 2,145,780.50')).toBeTruthy();
    expect(screen.getByText(/created as 1201$/)).toBeTruthy();
    expect(screen.getByText('Salaries & Wages')).toBeTruthy();
    expect(screen.getAllByText('Expense').length).toBeGreaterThan(0);
    // A new account reads as a choice made, not an empty field.
    expect(screen.getAllByText(/New account 1201/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Matched by name/)).toBeNull();
  });

  it('keeps matched accounts folded until opened, and finds them by name', () => {
    render(<AccountMatches view={view} editable saving={false} onChange={vi.fn()} />);
    expect(screen.queryByText('Sales')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Matched to FinMatrix accounts/ }));
    expect(screen.getByText('Sales')).toBeTruthy();
    expect(screen.getByText('Cr 9,000,000.00')).toBeTruthy();
  });
});

describe('Fix step: a report on another date', () => {
  it('offers the one fix as a button, and no Skip', async () => {
    const batch = { id: 'b1', status: 'mapped', issues: { blocking: 1, warning: 0 }, updatedAt: '' } as unknown as MigrationBatch;
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <FixStep batch={batch} onNext={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Report dates (1)')).toBeTruthy();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(screen.queryByPlaceholderText('Reason to skip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Change the cutover date to 2026-10-01/ }));
    await waitFor(() => expect(vi.mocked(resolveIssue)).toHaveBeenCalledWith('b1', 'i1', expect.objectContaining({ action: 'map', value: 'cutover:2026-10-01' })));
  });
});

describe('Match step: your chart in FinMatrix', () => {
  const chartView: MappingsView = {
    ...view,
    chartOfAccounts: [
      { id: 'fm-ar', number: '1100', name: 'Accounts Receivable', type: 'asset', systemRole: 'accounts_receivable' },
      { id: 'fm-inv', number: '1200', name: 'Inventory', type: 'asset', systemRole: 'inventory' },
      { id: 'fm-rent', number: '6000', name: 'Rent Expense', type: 'expense', systemRole: null },
    ],
    sourceAccounts: [
      { number: '1001', name: 'Stock', type: 'asset', balance: '6052435.00', createAs: null },
      { number: '1200', name: 'Bank Current Account', type: 'asset', balance: '2145780.50', createAs: null },
      { number: '6000', name: 'Productive Labour', type: 'expense', balance: '1.00', createAs: null },
    ],
    chartChanges: [
      { accountId: 'fm-inv', role: 'inventory', fromNumber: '1200', fromName: 'Inventory', toNumber: '1001', toName: 'Stock', change: 'adopt', source: '1001' },
      { accountId: 'fm-rent', role: null, fromNumber: '6000', fromName: 'Rent Expense', toNumber: '6001', toName: 'Rent Expense', change: 'step_aside', source: null },
    ],
  };

  it('says which FinMatrix accounts take the owner’s numbers, and which move aside', () => {
    render(<YourChart view={chartView} editable saving={false} onChoose={vi.fn()} />);
    expect(screen.getByText('Your chart in FinMatrix')).toBeTruthy();
    expect(screen.getByText('FinMatrix accounts that become yours (1)')).toBeTruthy();
    expect(screen.getByText('FinMatrix accounts that move to a free number (1)')).toBeTruthy();
    expect(screen.getByText(/your chart uses 6000/)).toBeTruthy();
    expect(screen.getAllByText(/Your 1001 Stock/).length).toBeGreaterThan(0);
  });

  it('shows nothing when the chart does not change', () => {
    const { container } = render(<YourChart view={{ ...chartView, chartChanges: [] }} editable saving={false} onChoose={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
