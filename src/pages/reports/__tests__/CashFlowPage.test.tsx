// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CashFlowPage from '@/pages/reports/CashFlowPage';
import { AS_OF, cashFlowV2, FY_START } from '@/test/msw/reportsV2Fixtures';
import { locationRef, renderReport, startMsw } from '@/test/renderReport';
import { parenNegative } from '@/utils/money';

startMsw();

const URL_BASE = `/reports/cash-flow?from=${FY_START}&to=${AS_OF}`;
const open = (search = '') => renderReport('/reports/cash-flow', `${URL_BASE}${search}`, <CashFlowPage />);

describe('CashFlowPage (reports v2)', () => {
  it('draws the three sections with the server’s subtotals, and ties ending cash to the balance sheet', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Statement of cash flows' });
    const operating = within(table).getByText('Net cash from operating activities').closest('tr') as HTMLElement;
    expect(within(operating).getByText(parenNegative(250000))).toBeInTheDocument();
    const ending = within(table).getByText('Cash at end of period').closest('tr') as HTMLElement;
    expect(within(ending).getByText(parenNegative(cashFlowV2.endingCash))).toBeInTheDocument();
    // The server's own tie: ending cash against the balance sheet's Cash and Bank.
    expect(await screen.findByLabelText(/Ending cash = Balance Sheet cash: ties/)).toBeInTheDocument();
    // Runway: the server says cash-positive, so there is no number to print.
    expect(await screen.findByText('Cash-positive — no burn')).toBeInTheDocument();
  });

  it('opens a keyed line into the cash rows behind it, with the allocation shown', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /^Cash paid to suppliers/ }));
    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('BP-0009')).toBeInTheDocument();
    expect(within(panel).getByText(/65\.0% of/)).toBeInTheDocument();
    expect(within(panel).getByText('Ties to statement')).toBeInTheDocument();
  });

  it('switches to the indirect method, whose net income opens the P&L', async () => {
    open('&method=indirect');
    const table = await screen.findByRole('table', { name: 'Statement of cash flows' });
    expect(within(table).getByText('Accounts Payable')).toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: /^Net income/ }));
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/reports/profit-loss'));
    expect(locationRef.current?.search).toBe(`?from=${FY_START}&to=${AS_OF}`);
  });

  it('lists each bank account, totalled by the statement’s own ending cash', async () => {
    open('&view=accounts');
    const table = await screen.findByRole('table', { name: 'Cash and bank accounts' });
    expect(within(table).getByText('Meezan Bank')).toBeInTheDocument();
    const total = table.querySelector('tfoot') as HTMLElement;
    expect(within(total).getByText(parenNegative(500000))).toBeInTheDocument();
  });

  it('charts the balance and the flows by month as two charts, never one with two scales', async () => {
    open('&view=monthly');
    expect(await screen.findByLabelText('Cash and bank at each month end')).toBeInTheDocument();
    expect(screen.getByLabelText('Cash in and cash out by month')).toBeInTheDocument();
    // The best and the worst month, by net, from the server's months.
    expect(screen.getByText(/Strongest month: Sep 26/)).toHaveTextContent('+Rs 60,000.00 net');
    expect(screen.getByText(/Weakest month: Aug 26/)).toHaveTextContent('+Rs 40,000.00 net');
    // The figures behind both, as a table.
    const table = screen.getByRole('table', { name: 'Cash in, cash out, net and ending cash by month' });
    expect(within(table).getByText('Rs 90,000.00')).toBeInTheDocument();
  });
});
