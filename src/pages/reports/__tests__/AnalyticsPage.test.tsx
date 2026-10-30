// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AnalyticsPage from '@/pages/reports/AnalyticsPage';
import { requestLog } from '@/test/msw/handlers';
import { AS_OF, FY_START } from '@/test/msw/reportsV2Fixtures';
import { locationRef, renderReport, startMsw } from '@/test/renderReport';

startMsw();

const open = (search = '') =>
  renderReport('/reports/analytics', `/reports/analytics?from=${FY_START}&to=${AS_OF}${search}`, <AnalyticsPage />);

/** The card a label sits in. */
const card = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div.group') as HTMLElement;

describe('AnalyticsPage — business overview (reports v2)', () => {
  it('asks /reports/analytics for the period with five-slice donuts, never the old dashboard route', async () => {
    open();
    await screen.findByText('What stands out');
    const req = requestLog.find((u) => u.pathname.endsWith('/reports/analytics'));
    expect(req?.searchParams.get('startDate')).toBe(FY_START);
    expect(req?.searchParams.get('endDate')).toBe(AS_OF);
    expect(req?.searchParams.get('expenseTop')).toBe('5');
    expect(req?.searchParams.get('customerTop')).toBe('5');
    expect(requestLog.some((u) => u.pathname.endsWith('/analytics-dashboard'))).toBe(false);
  });

  it('leads with four headline figures, each with its move, its margin or runway, and its trend', async () => {
    open();
    await screen.findByText('What stands out');
    const revenue = card('Revenue');
    expect(within(revenue).getByText('Rs 220,000.00')).toBeInTheDocument();
    expect(within(revenue).getByText(/\+Rs 20,000\.00 \(\+10\.0%\)/)).toHaveClass('text-success');
    expect(within(revenue).getByRole('img', { name: 'Revenue by month' })).toBeInTheDocument();

    const gross = card('Gross profit');
    expect(within(gross).getByText('Rs 90,000.00')).toBeInTheDocument();
    expect(within(gross).getByText('40.9% gross margin · +2.9 pts')).toBeInTheDocument();
    expect(within(gross).getByText('Healthy')).toBeInTheDocument();

    expect(within(card('Net profit')).getByText('20.5% net margin · −1.5 pts')).toBeInTheDocument();

    // The cash card wears the runway's verdict, and says what the runway is.
    const cash = card('Cash and bank');
    expect(within(cash).getByText('Rs 500,000.00')).toBeInTheDocument();
    expect(within(cash).getByText('Cash-positive — no burn')).toBeInTheDocument();
    expect(within(cash).getByText('Healthy')).toBeInTheDocument();
  });

  it('says what stands out in the server’s words, most pressing first, each linked to its report', async () => {
    open();
    const list = (await screen.findByText('What stands out')).closest('div.overflow-hidden') as HTMLElement;
    const titles = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent);
    expect(titles).toEqual(['Top 5 customers are 100.0% of sales', 'Revenue up 10.0%', 'Keeping 20.5% of revenue as profit']);
    expect(within(list).getByRole('img', { name: 'Needs attention' })).toBeInTheDocument();
    expect(
      within(list).getByRole('link', { name: 'Top 5 customers are 100.0% of sales — open AR Aging' }),
    ).toHaveAttribute('href', '/reports/ar-aging');
    expect(within(list).getByRole('link', { name: 'Revenue up 10.0% — open Profit & Loss' })).toHaveAttribute(
      'href',
      `/reports/profit-loss?from=${FY_START}&to=${AS_OF}`,
    );
  });

  it('shows where the money went as a ring with a table, the share from the server, and opens the ledger', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Operating expenses by account' });
    const rent = within(table).getByRole('button', { name: 'Open the ledger for Rent' });
    const row = rent.closest('tr') as HTMLElement;
    expect(within(row).getByText('Rs 30,000.00')).toBeInTheDocument();
    expect(within(row).getByText('67%')).toBeInTheDocument();
    // Other is grey and not a choice: it is not one account to open.
    expect(within(table).queryByRole('button', { name: /Other accounts/ })).toBeNull();
    fireEvent.click(rent);
    await waitFor(() => expect(locationRef.current?.pathname).toBe('/reports/general-ledger'));
    expect(locationRef.current?.search).toContain('account=6000');
  });

  it('breaks the cash cycle into its parts, each with its reading', async () => {
    open();
    await screen.findByText('Cash cycle');
    expect(screen.getByText('99 days')).toBeInTheDocument();
    const dio = screen.getByText(/Days stock waits to be sold/).closest('div') as HTMLElement;
    expect(within(dio).getByText('87 days')).toBeInTheDocument();
    expect(within(dio).getByText('Watch')).toBeInTheDocument();
  });

  it('names the top customers and judges their concentration', async () => {
    open();
    await screen.findByText('Customers');
    expect(screen.getByText(/The top five hold/)).toHaveTextContent('The top five hold 100.0% of sales');
    expect(screen.getByText('59.1% of sales · 4 invoices')).toBeInTheDocument();
    const customers = screen.getByText(/The top five hold/).parentElement as HTMLElement;
    expect(within(customers).getByText('At risk')).toBeInTheDocument();
  });

  it('quotes the rule of thumb, the formula and its inputs in the ⓘ', async () => {
    open();
    await screen.findByText('Business health');
    fireEvent.click(screen.getAllByRole('button', { name: 'How current ratio is calculated' })[0]);
    expect(await screen.findByText(/Above 1\.5× is generally comfortable/)).toBeInTheDocument();
    expect(screen.getByText('Current assets ÷ Current liabilities')).toBeInTheDocument();
  });

  it('reads operating cash and runway beside the month-end cash', async () => {
    open();
    const cashCard = (await screen.findByText('Cash and bank at each month end', { selector: 'p' })).closest(
      'div.overflow-hidden',
    ) as HTMLElement;
    expect(within(cashCard).getByText('Rs 55,000.00')).toBeInTheDocument();
    expect(within(cashCard).getByText('Cash-positive — no burn')).toBeInTheDocument();
    expect(within(cashCard).getAllByText('Healthy')).toHaveLength(2);
  });
});
