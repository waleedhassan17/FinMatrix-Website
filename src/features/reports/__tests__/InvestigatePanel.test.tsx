// @vitest-environment jsdom

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { InvestigatePanel } from '@/features/reports/InvestigatePanel';
import authReducer from '@/store/authSlice';
import { server } from '@/test/msw/server';
import { registerCash } from '@/test/msw/reportsV2Fixtures';
import { startMsw } from '@/test/renderReport';

startMsw();

const entry = (i: number, running: number) => ({
  ...registerCash.entries[0],
  id: `e${i}`,
  documentNumber: `RCT-${i}`,
  debit: 1000,
  amount: 1000,
  runningBalance: running,
});

/** 60 postings of 1,000 on an opening of 250,000, served 50 to a page. */
const pages = (page: number) => {
  const all = Array.from({ length: 60 }, (_, i) => entry(i + 1, 250000 + (i + 1) * 1000));
  return {
    ...registerCash,
    periodDebit: 60000,
    periodCredit: 0,
    periodNet: 60000,
    closingBalance: 310000,
    entries: all.slice((page - 1) * 50, page * 50),
    total: 60,
    page,
  };
};

const renderPanel = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={configureStore({ reducer: { auth: authReducer } })}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvestigatePanel
            onClose={vi.fn()}
            subject={{
              kind: 'account',
              accountCode: '1000',
              accountName: 'Cash',
              lineAmount: 310000,
              basis: 'closing',
              range: { startDate: '2026-09-01', endDate: '2026-09-30' },
              context: 'Balance Sheet',
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
};

describe('InvestigatePanel — register', () => {
  it('ties to the statement and pages on, the running balance continuing across pages', async () => {
    server.use(
      http.get('*/reports/accounts/:code/register', ({ request }) =>
        HttpResponse.json({ success: true, data: pages(Number(new URL(request.url).searchParams.get('page'))) }),
      ),
    );
    renderPanel();
    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('Ties to statement')).toBeInTheDocument();
    expect(within(panel).getByText('Showing 50 of 60')).toBeInTheDocument();
    expect(within(panel).queryByText('RCT-51')).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Load more' }));
    const row51 = (await within(panel).findByText('RCT-51')).closest('tr') as HTMLElement;
    // Page 2's first row continues page 1's last: 300,000 → 301,000.
    expect(within(row51).getByText('301,000.00')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('says so plainly when the register does not tie to the line', async () => {
    server.use(
      http.get('*/reports/accounts/:code/register', () =>
        HttpResponse.json({ success: true, data: { ...pages(1), closingBalance: 309000 } }),
      ),
    );
    renderPanel();
    expect(await screen.findByText(/Does not tie to the statement/)).toBeInTheDocument();
  });

  it('shows what the account is on the Details tab', async () => {
    renderPanel();
    const panel = await screen.findByRole('dialog');
    fireEvent.mouseDown(within(panel).getByRole('tab', { name: 'Details' }));
    expect(await within(panel).findByText('Normal balance')).toBeInTheDocument();
    expect(within(panel).getByText('Debit')).toBeInTheDocument();
  });
});
