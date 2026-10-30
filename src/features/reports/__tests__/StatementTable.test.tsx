// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { statementColumns } from '@/features/reports/statementColumns';
import { resetStatementDensityCache, setStatementDensity } from '@/features/reports/statementPrefs';
import { StatementOptions } from '@/features/reports/StatementOptions';
import { StatementTable } from '@/features/reports/StatementTable';
import type { StatementRowData } from '@/models/reportStatement';
import { parenNegative } from '@/utils/money';

const ROWS: StatementRowData[] = [
  { key: 'h-cash', label: 'Cash and Bank', bold: true, kind: 'heading', section: 'cash' },
  { key: '1000', label: '1000  Cash', name: 'Cash', accountCode: '1000', amount: 300000, prior: 250000, change: 50000, changePct: 20, depth: 1, section: 'cash' },
  { key: '1010', label: '1010  Petty cash', name: 'Petty cash', accountCode: '1010', amount: 0, prior: 0, depth: 1, section: 'cash' },
  { key: 't-cash', label: 'Total Cash and Bank', amount: 300000, prior: 250000, isTotal: true, bold: true, section: 'cash' },
  {
    key: 'synthetic-ni',
    label: 'Net Income (current fiscal year)',
    name: 'Net Income (current fiscal year)',
    kind: 'synthetic',
    note: 'Computed, not posted.',
    amount: -1200,
    prior: 0,
    drill: true,
  },
  { key: 'grand', label: 'TOTAL', amount: 298800, prior: 250000, isGrand: true },
];

beforeEach(() => resetStatementDensityCache());

describe('StatementTable v2', () => {
  it('draws the given columns, with the server’s change and negatives in parentheses', () => {
    render(<StatementTable rows={ROWS} columns={statementColumns({ comparing: true, commonSize: false })} caption="Test" />);
    const table = screen.getByRole('table', { name: 'Test' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Line', 'Current', 'Prior', 'Change', '%']);
    const cash = within(table).getByText('Cash').closest('tr') as HTMLElement;
    expect(within(cash).getByText(parenNegative(50000))).toBeInTheDocument();
    expect(within(cash).getByText('20.0%')).toBeInTheDocument();
    // The account code is printed, muted, before the name.
    expect(within(cash).getByText('1000')).toHaveClass('text-text-tertiary');
    // A loss in parentheses — in the figure and, from a nil prior, in its change.
    const ni = within(table).getByText('Net Income (current fiscal year)').closest('tr') as HTMLElement;
    expect(within(ni).getAllByText(parenNegative(-1200))).toHaveLength(2);
  });

  it('opens a row with Enter or Space, and not a heading or a total', async () => {
    const user = userEvent.setup();
    const onRowActivate = vi.fn();
    render(<StatementTable rows={ROWS} onRowActivate={onRowActivate} comparing />);
    const cash = screen.getByRole('button', { name: 'Cash, 300,000.00, up 20.0%' });
    cash.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onRowActivate).toHaveBeenCalledTimes(2);
    expect(onRowActivate.mock.calls[0][0].key).toBe('1000');
    // A synthetic row that has somewhere to go is drillable too…
    expect(screen.getByRole('button', { name: /^Net Income \(current fiscal year\)/ })).toBeInTheDocument();
    // …and explains itself.
    expect(screen.getByRole('button', { name: 'About Net Income (current fiscal year)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Total Cash and Bank/ })).not.toBeInTheDocument();
  });

  it('folds a section to its heading and subtotal', () => {
    render(<StatementTable rows={ROWS} />);
    const heading = screen.getByRole('button', { name: 'Cash and Bank' });
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    expect(screen.getByText('Total Cash and Bank')).toBeInTheDocument();
  });

  it('does not offer to fold a placeholder line', () => {
    render(
      <StatementTable
        rows={[
          { key: 'h', label: 'Investing', bold: true, section: 'inv' },
          { key: 'none', label: 'No activity in this period', depth: 1, section: 'inv' },
          { key: 't', label: 'Net cash from investing', amount: 0, isTotal: true, bold: true, section: 'inv' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Investing' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: 'No activity in this period' })).not.toBeInTheDocument();
  });

  it('hides zero-balance accounts on request, never a zero subtotal', () => {
    const { rerender } = render(<StatementTable rows={ROWS} />);
    expect(screen.getByText('Petty cash')).toBeInTheDocument();
    rerender(<StatementTable rows={ROWS} showZero={false} />);
    expect(screen.queryByText('Petty cash')).not.toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('keeps the reader’s density in this browser, shared by every table', () => {
    render(
      <>
        <StatementOptions />
        <StatementTable rows={ROWS} caption="One" />
      </>,
    );
    const cell = () => within(screen.getByRole('table', { name: 'One' })).getByText('TOTAL').closest('td') as HTMLElement;
    expect(cell()).toHaveClass('py-sm');
    fireEvent.click(screen.getByRole('button', { name: 'Compact rows' }));
    expect(cell()).toHaveClass('py-xxs');
    expect(window.localStorage.getItem('finmatrix.reports.density')).toBe('compact');
    act(() => setStatementDensity('comfortable'));
    expect(cell()).toHaveClass('py-sm');
  });

  it('colours the change only when the page says which way is good', () => {
    const { rerender } = render(<StatementTable rows={ROWS} comparing />);
    const change = () => within(screen.getByText('Cash').closest('tr') as HTMLElement).getByText(parenNegative(50000));
    expect(change()).not.toHaveClass('text-success');
    rerender(<StatementTable rows={ROWS} comparing changeTone={() => false} />);
    expect(change()).toHaveClass('text-danger');
  });
});
