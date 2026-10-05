// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The summary panel: what the user checks before sending
// ═══════════════════════════════════════════════════════
// The panel is the preview of a document that goes to a customer, so these pin
// what it must show — the figure to ask for, what is overdue, every open
// document linked to its page — and that it refuses to send an empty summary.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/documents/useDocumentContext', () => ({
  useDocumentCompany: () => ({ name: 'Warehouse Co', logo: null, addressLines: [], contactLines: [] }),
}));
vi.mock('@/networks/reports/agingNetwork', () => ({
  getArPartySummary: vi.fn(),
  getApPartySummary: vi.fn(),
}));

import { PartySummaryPanel } from '@/features/documents/PartySummaryPanel';
import type { Customer } from '@/models/customer';
import type { Vendor } from '@/models/vendor';
import { ApiError } from '@/networks/network/apiHelpers';
import { getApPartySummary, getArPartySummary } from '@/networks/reports/agingNetwork';
import { summaryFixture } from '@/test/partySummaryFixture';

const customer = { id: 'c1', name: 'Acme Traders', paymentTerms: 'net_30' } as unknown as Customer;
const vendor = { id: 'v1', name: 'Habib Oil Mills', paymentTerms: 'net_30' } as unknown as Vendor;

const renderPanel = (party: Parameters<typeof PartySummaryPanel>[0]['party']) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <PartySummaryPanel open onOpenChange={() => undefined} party={party} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.mocked(getArPartySummary).mockReset();
  vi.mocked(getApPartySummary).mockReset();
});

describe('PartySummaryPanel', () => {
  it('leads with the figure to ask for and what is overdue', async () => {
    vi.mocked(getArPartySummary).mockResolvedValue(summaryFixture());
    renderPanel({ type: 'customer', record: customer });

    const dialog = await screen.findByRole('dialog', { name: 'Outstanding invoices' });
    expect(getArPartySummary).toHaveBeenCalledWith('c1');
    expect(await within(dialog).findByText('Rs 1,300.00')).toBeTruthy();
    expect(within(dialog).getByText('Total due')).toBeTruthy();
    expect(within(dialog).getByText('Rs 1,000.00 overdue')).toBeTruthy();
    expect(within(dialog).getByText(/1 of 2 invoices/)).toBeTruthy();
  });

  it('links every unpaid invoice to its page, with how late it is', async () => {
    vi.mocked(getArPartySummary).mockResolvedValue(summaryFixture());
    renderPanel({ type: 'customer', record: customer });

    const link = await screen.findByRole('link', { name: /INV-1/ });
    expect(link.getAttribute('href')).toBe('/invoices/d1');
    expect(within(link).getByText('45 days overdue')).toBeTruthy();
    // A part-paid invoice says what it was, beside what is left.
    const partPaid = screen.getByRole('link', { name: /INV-2/ });
    expect(within(partPaid).getByText('Rs 300.00')).toBeTruthy();
    expect(within(partPaid).getByText('of Rs 500.00')).toBeTruthy();
  });

  it('offers print, PDF and share once there is something to send', async () => {
    vi.mocked(getArPartySummary).mockResolvedValue(summaryFixture());
    renderPanel({ type: 'customer', record: customer });

    const print = await screen.findByRole('button', { name: 'Print' });
    expect(print.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Download PDF' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Share' }).hasAttribute('disabled')).toBe(false);
  });

  it('says there is nothing outstanding, and will not send an empty summary', async () => {
    vi.mocked(getArPartySummary).mockResolvedValue(
      summaryFixture({
        documents: [],
        totals: { count: 0, outstanding: 0, overdue: 0, overdueCount: 0, notYetDue: 0 },
        netDue: 0,
      }),
    );
    renderPanel({ type: 'customer', record: customer });

    expect(await screen.findByText('Nothing outstanding')).toBeTruthy();
    expect(screen.getByText('Acme Traders has no unpaid invoices.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download PDF' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows credits coming off, and the net figure to pay', async () => {
    vi.mocked(getArPartySummary).mockResolvedValue(
      summaryFixture({
        credits: {
          total: 400,
          items: [{ kind: 'payment', id: 'p1', reference: 'RCT-9', date: '2026-09-01', amount: 400, available: 400 }],
        },
        netDue: 900,
      }),
    );
    renderPanel({ type: 'customer', record: customer });

    const credits = await screen.findByRole('region', { name: 'Unapplied credits' });
    expect(within(credits).getByRole('link', { name: /RCT-9/ }).getAttribute('href')).toBe('/payments/p1');
    expect(within(credits).getByText('Less credits')).toBeTruthy();
    // On the credit's own row, and again where it comes off the total.
    expect(within(credits).getAllByText('− Rs 400.00')).toHaveLength(2);
    // The headline is the net figure.
    expect(screen.getAllByText('Rs 900.00').length).toBeGreaterThan(0);
  });

  it('reads as a payables summary for a vendor', async () => {
    vi.mocked(getApPartySummary).mockResolvedValue(
      summaryFixture({
        partyType: 'vendor',
        documents: summaryFixture().documents.map((d) => ({ ...d, documentType: 'bill' as const })),
      }),
    );
    renderPanel({ type: 'vendor', record: vendor });

    expect(await screen.findByRole('dialog', { name: 'Payables summary' })).toBeTruthy();
    expect(getApPartySummary).toHaveBeenCalledWith('v1');
    expect(getArPartySummary).not.toHaveBeenCalled();
    expect((await screen.findByRole('link', { name: /INV-1/ })).getAttribute('href')).toBe('/bills/d1');
    expect(screen.getByText('Total payable')).toBeTruthy();
  });

  it('explains an older server rather than showing a broken panel', async () => {
    vi.mocked(getArPartySummary).mockRejectedValue(
      new ApiError('Cannot GET /api/v1/reports/…/summary', 'NOT_FOUND', 404),
    );
    renderPanel({ type: 'customer', record: customer });

    expect(await screen.findByText(/not available from the server yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('pays the summary from the panel: the payment page, every invoice ticked', async () => {
    vi.mocked(getArPartySummary).mockResolvedValue(summaryFixture());
    renderPanel({ type: 'customer', record: customer });

    const pay = await screen.findByRole('link', { name: /Receive payment/ });
    expect(pay.getAttribute('href')).toBe('/payments/new?customerId=c1&from=summary');
  });

  it('pays a vendor\'s bills the same way', async () => {
    vi.mocked(getApPartySummary).mockResolvedValue(
      summaryFixture({
        partyType: 'vendor',
        documents: summaryFixture().documents.map((d) => ({ ...d, documentType: 'bill' })),
      }),
    );
    renderPanel({ type: 'vendor', record: vendor });

    const pay = await screen.findByRole('link', { name: /Pay bills/ });
    expect(pay.getAttribute('href')).toBe('/bills/pay?vendorId=v1&from=summary');
  });

  it('offers no payment when nothing is open', async () => {
    vi.mocked(getArPartySummary).mockResolvedValue(
      summaryFixture({ documents: [], credits: { total: 0, items: [] } }),
    );
    renderPanel({ type: 'customer', record: customer });

    await screen.findByText('Nothing outstanding');
    expect(screen.queryByRole('link', { name: /Receive payment/ })).toBeNull();
  });
});
