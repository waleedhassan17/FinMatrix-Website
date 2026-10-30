// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import TrialBalancePage from '@/pages/reports/TrialBalancePage';
import { requestLog } from '@/test/msw/handlers';
import { AS_OF } from '@/test/msw/reportsV2Fixtures';
import { renderReport, startMsw } from '@/test/renderReport';

startMsw();

const open = (search: string) =>
  renderReport('/reports/trial-balance', `/reports/trial-balance${search}`, <TrialBalancePage />);

const footer = () => screen.getByRole('table', { name: 'Trial balance' }).querySelector('tfoot') as HTMLElement;

describe('TrialBalancePage (reports v2)', () => {
  it('opens on Closing, always sends the mode, and groups by type with the server’s subtotals', async () => {
    open(`?asOf=${AS_OF}`);
    await screen.findByRole('table', { name: 'Trial balance' });
    const req = requestLog.find((u) => u.pathname.endsWith('/trial-balance'));
    expect(req?.searchParams.get('mode')).toBe('closing');
    expect(req?.searchParams.get('endDate')).toBe(AS_OF);

    expect(screen.getByRole('button', { name: 'Closing', pressed: true })).toBeInTheDocument();
    // Totals are the server's.
    expect(within(footer()).getAllByText('605,000.00')).toHaveLength(2);
    // Group subtotals come from `groups`, not from adding the rows.
    const equity = screen.getByText('Total Equity').closest('tr') as HTMLElement;
    expect(within(equity).getByText('200,000.00')).toBeInTheDocument();
    // The movements explainer belongs to Movement mode only.
    expect(screen.queryByText(/movements in the period/i, { selector: 'strong' })).not.toBeInTheDocument();
  });

  it('explains a flag in plain language and filters to flagged accounts', async () => {
    open(`?asOf=${AS_OF}`);
    await screen.findByRole('table', { name: 'Trial balance' });
    expect(
      screen.getByRole('button', { name: /Cash shows a credit balance — usually an unrecorded deposit or a payment posted twice/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Flagged only (1)' }));
    await waitFor(() => expect(screen.queryByText('Accounts Receivable')).not.toBeInTheDocument());
    expect(screen.getByText('Cash')).toBeInTheDocument();
    // Filtered: the footer still totals every account, and says so.
    expect(within(footer()).getByText('Total (all accounts)')).toBeInTheDocument();
  });

  it('searches by code or name', async () => {
    open(`?asOf=${AS_OF}&q=4000`);
    await screen.findByRole('table', { name: 'Trial balance' });
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.queryByText('Rent')).not.toBeInTheDocument();
  });

  it('shows the working view with a two-level header and the fiscal-year warning', async () => {
    open('?mode=working&from=2026-07-01&to=2026-09-30');
    await screen.findByRole('table', { name: 'Trial balance' });
    expect(requestLog.find((u) => u.pathname.endsWith('/trial-balance'))?.searchParams.get('mode')).toBe('working');
    for (const group of ['Opening', 'Period', 'Closing']) {
      expect(screen.getByRole('columnheader', { name: group })).toBeInTheDocument();
    }
    expect(screen.getByText(/runs past the fiscal year/)).toBeInTheDocument();
    // Each column pair's own total.
    expect(within(footer()).getAllByText('50,000.00')).toHaveLength(2);
  });

  it('keeps the movements explainer in Movement mode', async () => {
    open('?mode=movement&from=2026-09-01&to=2026-09-30');
    await screen.findByRole('table', { name: 'Trial balance' });
    expect(screen.getByText(/movements in the period/i, { selector: 'strong' })).toBeInTheDocument();
  });

  it('opens an account’s register from a row', async () => {
    open(`?asOf=${AS_OF}`);
    fireEvent.click(await screen.findByRole('button', { name: /^1100 Accounts Receivable/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('1100 Accounts Receivable')).toBeInTheDocument();
    await waitFor(() =>
      expect(requestLog.some((u) => u.pathname.endsWith('/accounts/1100/register'))).toBe(true),
    );
  });
});
