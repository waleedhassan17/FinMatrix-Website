// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import ArAgingPage from '@/pages/reports/ArAgingPage';
import { server } from '@/test/msw/server';
import { arAgingV2 } from '@/test/msw/reportsV2Fixtures';
import { locationRef, renderReport, startMsw } from '@/test/renderReport';

startMsw();

const open = (search = '') => renderReport('/reports/ar-aging', `/reports/ar-aging${search}`, <ArAgingPage />);

const ALLAMA = arAgingV2.rows[0].customerId;

describe('ArAgingPage (reports v2)', () => {
  it('leads with the server’s insights, each judged on the server: total open, DSO, days overdue, concentration', async () => {
    open();
    expect(await screen.findByText('Days sales outstanding')).toBeInTheDocument();
    expect(screen.getByText('42 days')).toBeInTheDocument();
    expect(screen.getByText('61 days')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    const total = screen.getByText('Total outstanding').closest('div.group') as HTMLElement;
    expect(within(total).getByText(/Rs 150,000\.00 overdue \(37\.5%\) · 2 customers/)).toBeInTheDocument();
    // The overdue share reads as Watch; lateness and concentration as At risk.
    expect(within(total).getByText('Watch')).toBeInTheDocument();
    expect(within(total).getByRole('img', { name: /By age: Current 63%/ })).toBeInTheDocument();
    const late = screen.getByText('Average days overdue').closest('div.group') as HTMLElement;
    expect(within(late).getByText('At risk')).toBeInTheDocument();
  });

  it('draws the book as a ring by age, and a slice filters the table', async () => {
    open();
    const ring = await screen.findByRole('table', { name: 'What customers owe, by age' });
    fireEvent.click(within(ring).getByRole('button', { name: 'Show only 91 and over' }));
    await waitFor(() => expect(locationRef.current?.search).toContain('bucket=d91plus'));
    const table = screen.getByRole('table', { name: 'Customer aging' });
    await waitFor(() => expect(within(table).queryByText('Madina Wholesale')).not.toBeInTheDocument());
  });

  it('says where each party stands beside its name', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Customer aging' });
    const allama = within(table).getByText('Allama Traders').closest('tr') as HTMLElement;
    expect(within(allama).getByText('90+ days')).toBeInTheDocument();
    const madina = within(table).getByText('Madina Wholesale').closest('tr') as HTMLElement;
    expect(within(madina).getByText('Overdue')).toBeInTheDocument();
  });

  it('charts expected collections from the schedule', async () => {
    open('?chart=schedule');
    expect(await screen.findByText('What customers owe, by when it falls due — overdue first')).toBeInTheDocument();
  });

  it('filters to parties over their credit limit, and keeps the footer the server’s', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Customer aging' });
    expect(within(table).getByText('Madina Wholesale')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Over limit' }));
    await waitFor(() => expect(within(table).queryByText('Madina Wholesale')).not.toBeInTheDocument());
    expect(locationRef.current?.search).toContain('only=over-limit');
    expect(within(table).getByText('Total (all parties)')).toBeInTheDocument();
    // The chip beside the name, in the table.
    expect(within(table).getByText('Over limit')).toBeInTheDocument();
  });

  it('shows the account columns: terms, limit, last payment, oldest due', async () => {
    open('?cols=account');
    const table = await screen.findByRole('table', { name: 'Customer aging' });
    expect(within(table).getByRole('columnheader', { name: 'Terms' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Credit limit' })).toBeInTheDocument();
    expect(within(table).getByText('Net 30')).toBeInTheDocument();
    expect(within(table).getByText('No limit')).toBeInTheDocument();
    expect(within(table).getByText(/Sep 5, 2026 · 70,000\.00/)).toBeInTheDocument();
  });

  it('90+ days keeps only the party with money that late', async () => {
    open('?only=90plus');
    const table = await screen.findByRole('table', { name: 'Customer aging' });
    expect(within(table).getByText('Allama Traders')).toBeInTheDocument();
    expect(within(table).queryByText('Madina Wholesale')).not.toBeInTheDocument();
  });

  it('links an open party row to its summary and its page', async () => {
    server.use(
      http.get('*/reports/ar-aging/customers/:id/documents', () =>
        HttpResponse.json({ success: true, data: { partyType: 'customer', partyId: ALLAMA, documents: [], total: 0 } }),
      ),
    );
    open();
    const table = await screen.findByRole('table', { name: 'Customer aging' });
    fireEvent.click(within(table).getByRole('button', { name: /Allama Traders/ }));
    expect(await screen.findByRole('button', { name: 'Outstanding summary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open customer/ })).toHaveAttribute('href', `/customers/${ALLAMA}`);
  });
});
