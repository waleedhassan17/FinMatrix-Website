// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import BalanceSheetPage from '@/pages/reports/BalanceSheetPage';
import { requestLog } from '@/test/msw/handlers';
import { AS_OF, balanceSheetV2, FY_START, PRIOR_MONTH_END } from '@/test/msw/reportsV2Fixtures';
import { locationRef, renderReport, startMsw } from '@/test/renderReport';
import { parenNegative } from '@/utils/money';

startMsw();

const open = (search = '') =>
  renderReport('/reports/balance-sheet', `/reports/balance-sheet?asOf=${AS_OF}${search}`, <BalanceSheetPage />);

describe('BalanceSheetPage (reports v2)', () => {
  it('draws the server’s sections and totals, and says the sheet balances', async () => {
    open();
    const assets = await screen.findByRole('table', { name: 'Assets' });

    // The rendered totals ARE the API's — not re-added on this side.
    const totalAssets = within(assets).getByText('TOTAL ASSETS').closest('tr') as HTMLElement;
    expect(within(totalAssets).getByText(parenNegative(1500000))).toBeInTheDocument();
    const current = within(assets).getByText('Total Current Assets').closest('tr') as HTMLElement;
    expect(within(current).getByText(parenNegative(1200000))).toBeInTheDocument();

    const right = screen.getByRole('table', { name: 'Liabilities and equity' });
    const grand = within(right).getByText('TOTAL LIABILITIES AND EQUITY').closest('tr') as HTMLElement;
    expect(within(grand).getByText(parenNegative(balanceSheetV2.subtotals[5].amount))).toBeInTheDocument();

    // Sections from the server, in statement order, with account codes muted before names.
    expect(within(assets).getByText('Cash and Bank')).toBeInTheDocument();
    expect(within(assets).getByText('Meezan Bank')).toBeInTheDocument();
    expect(screen.getByLabelText(/Assets = Liabilities \+ Equity: balanced/i)).toBeInTheDocument();

    // The financial health strip replaces the old totals strip.
    expect(await screen.findByText('Working capital')).toBeInTheDocument();
    expect(screen.getByText('4.00×')).toBeInTheDocument();
  });

  it('asks the server for the comparison and shows its columns', async () => {
    open('&compare=priorMonthEnd');
    const assets = await screen.findByRole('table', { name: 'Assets' });
    await waitFor(() =>
      expect(requestLog.some((u) => u.pathname.endsWith('/balance-sheet') && u.searchParams.get('compareTo') === PRIOR_MONTH_END)).toBe(true),
    );
    expect(within(assets).getByRole('columnheader', { name: 'Change' })).toBeInTheDocument();
    expect(within(assets).getByRole('columnheader', { name: '%' })).toBeInTheDocument();
    // The server's change, as sent: Cash 300,000 against 250,000.
    const cash = within(assets).getByRole('button', { name: /^Cash, 300,000\.00, up 20\.0%/ }).closest('tr') as HTMLElement;
    expect(within(cash).getByText(parenNegative(50000))).toBeInTheDocument();
    expect(within(cash).getByText('20.0%')).toBeInTheDocument();
  });

  it('opens an account’s register from the keyboard, and the register ties to the line', async () => {
    const user = userEvent.setup();
    open('&compare=priorMonthEnd');
    const row = await screen.findByRole('button', { name: /^Cash, 300,000\.00/ });
    row.focus();
    await user.keyboard('{Enter}');

    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('Ties to statement')).toBeInTheDocument();
    expect(within(panel).getByText('Opening balance')).toBeInTheDocument();
    expect(within(panel).getByText('RCT-0042')).toHaveAttribute('href', '/payments/pay-1');
    // A bill payment has no page of its own: plain text, not a dead link.
    expect(within(panel).getByText('BP-0007').tagName).not.toBe('A');
    expect(within(panel).getByRole('link', { name: /Open in General Ledger/ })).toHaveAttribute(
      'href',
      `/reports/general-ledger?view=accounts&account=1000&from=2026-09-01&to=${AS_OF}`,
    );
    // The URL carries the open panel, so the view is linkable.
    expect(locationRef.current?.search).toContain('inspect=1000');

    // With a comparison on, "What changed" explains the move.
    await user.click(within(panel).getByRole('tab', { name: 'What changed' }));
    expect(await within(panel).findByText('Allama Traders')).toBeInTheDocument();
  });

  it('returns focus to the row when the panel closes — opened from the row or from a link', async () => {
    const user = userEvent.setup();
    open();
    const row = await screen.findByRole('button', { name: /^Cash, 300,000\.00/ });
    row.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-row-key', '1000'));
  });

  it('returns focus to the row after a panel that arrived with the link', async () => {
    const user = userEvent.setup();
    open('&inspect=1000');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-row-key', '1000'));
    expect(locationRef.current?.search).not.toContain('inspect');
  });

  it('opens the retained earnings rollforward, which totals the line', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /^Retained Earnings, 300,000\.00/ }));
    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('Net income, FY2025')).toBeInTheDocument();
    expect(within(panel).getByText('Ties to statement')).toBeInTheDocument();
  });

  it('sends Net Income (current fiscal year) to the P&L for the same dates', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /^Net Income \(current fiscal year\)/ }));
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/reports/profit-loss'));
    expect(locationRef.current?.search).toBe(`?from=${FY_START}&to=${AS_OF}`);
  });

  it('adds the common-size column on request', async () => {
    open('&size=common');
    const assets = await screen.findByRole('table', { name: 'Assets' });
    expect(within(assets).getByRole('columnheader', { name: '% of assets' })).toBeInTheDocument();
    const total = within(assets).getByText('TOTAL ASSETS').closest('tr') as HTMLElement;
    expect(within(total).getByText('100.0%')).toBeInTheDocument();
  });
});
