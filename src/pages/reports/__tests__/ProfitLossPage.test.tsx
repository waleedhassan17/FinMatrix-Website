// @vitest-environment jsdom

import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import ProfitLossPage from '@/pages/reports/ProfitLossPage';
import { requestLog } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderReport, startMsw } from '@/test/renderReport';

startMsw();

beforeEach(() => {
  server.use(
    http.get('*/reports/profit-loss', ({ request }) => {
      requestLog.push(new URL(request.url));
      return HttpResponse.json({
        range: { startDate: '2026-01-01', endDate: '2026-09-30' },
        revenue: 300000,
        cogs: 100000,
        grossProfit: 200000,
        expenses: 50000,
        netIncome: 150000,
        income: [{ accountCode: '4000', accountName: 'Sales', amount: 300000 }],
        cogsLines: [{ accountCode: '5000', accountName: 'COGS', amount: 100000 }],
        expenseLines: [{ accountCode: '6000', accountName: 'Rent', amount: 50000 }],
        otherIncome: [],
        otherExpense: [],
        totalIncome: 300000,
        totalCogs: 100000,
        totalExpenses: 50000,
        netOperatingIncome: 150000,
        netOtherIncome: 0,
      });
    }),
  );
});

describe('ProfitLossPage — the period and comparison in the URL', () => {
  it('reads ?from=&to= — what the balance sheet’s Net Income line links to', async () => {
    renderReport('/reports/profit-loss', '/reports/profit-loss?from=2026-01-01&to=2026-09-30', <ProfitLossPage />);
    await screen.findByRole('table', { name: 'Profit and loss' });
    const req = requestLog.find((u) => u.pathname.endsWith('/profit-loss'));
    expect(req?.searchParams.get('startDate')).toBe('2026-01-01');
    expect(req?.searchParams.get('endDate')).toBe('2026-09-30');
  });

  it('fetches the comparison period chosen in the URL and shows its columns', async () => {
    renderReport(
      '/reports/profit-loss',
      '/reports/profit-loss?from=2026-01-01&to=2026-09-30&compare=lastYear',
      <ProfitLossPage />,
    );
    await screen.findByRole('table', { name: 'Profit and loss' });
    await waitFor(() =>
      expect(requestLog.some((u) => u.searchParams.get('startDate') === '2025-01-01' && u.searchParams.get('endDate') === '2025-09-30')).toBe(true),
    );
    expect(screen.getByRole('columnheader', { name: 'Change' })).toBeInTheDocument();
  });

  it('ignores a malformed range rather than half-using it', async () => {
    renderReport('/reports/profit-loss', '/reports/profit-loss?from=2026-13-01&to=2026-09-30', <ProfitLossPage />);
    await screen.findByRole('table', { name: 'Profit and loss' });
    expect(requestLog.find((u) => u.pathname.endsWith('/profit-loss'))?.searchParams.get('startDate')).not.toBe('2026-13-01');
  });
});
