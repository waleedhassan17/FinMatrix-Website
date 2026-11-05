// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// DocumentActions' WhatsApp item and FinMatrix Connect
// ═══════════════════════════════════════════════════════
// With `connect` and Connect switched on, the WhatsApp item sends from the
// server and opens nothing. With Connect off, the wa.me hand-off runs exactly
// as before and is logged. Without `connect`, nothing about it changes.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockConnect = { enabled: true, featureOn: true };
vi.mock('@/features/messaging/useConnect', () => ({
  useConnect: () => mockConnect,
  messagingKeys: { all: ['messaging'] },
}));
vi.mock('@/networks/messaging/messagingNetwork', () => ({
  sendMessage: vi.fn(),
  logManualShare: vi.fn(),
}));
vi.mock('@/features/pdf/renderPdf', () => ({ downloadBlob: vi.fn(), printBlob: vi.fn() }));

import { DocumentActions } from '@/features/share/DocumentActions';
import { logManualShare, sendMessage } from '@/networks/messaging/messagingNetwork';

const doc = { kind: 'Invoice', number: 'INV-1', partyName: 'Ali Traders', partyPhone: '0312 4890176', companyName: 'Warehouse Co' };

const renderActions = (connect?: { docType: 'invoice'; docId: string; event?: string }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DocumentActions
        document={doc}
        getPdf={() => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' }))}
        cacheKey="k"
        connect={connect}
      />
    </QueryClientProvider>,
  );

const openShare = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Share' }));
  return user;
};

let windowOpen: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.enabled = true;
  mockConnect.featureOn = true;
  (sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', status: 'queued', skipReason: null, duplicate: false });
  (logManualShare as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm2', status: 'sent', skipReason: null, duplicate: false });
  windowOpen = vi.fn(() => ({ location: { replace: vi.fn(), href: 'about:blank' }, close: vi.fn() }));
  vi.stubGlobal('open', windowOpen);
});
afterEach(() => vi.unstubAllGlobals());

describe('DocumentActions with FinMatrix Connect', () => {
  it('Connect on: the server sends it, no chat opens', async () => {
    renderActions({ docType: 'invoice', docId: 'i1', event: 'invoice_issued' });
    const user = await openShare();
    await user.click(await screen.findByRole('menuitem', { name: /Send on WhatsApp/ }));
    expect(sendMessage).toHaveBeenCalledWith({ docType: 'invoice', docId: 'i1', event: 'invoice_issued' });
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('Connect off: the wa.me hand-off runs and the share is logged', async () => {
    mockConnect.enabled = false;
    renderActions({ docType: 'invoice', docId: 'i1', event: 'invoice_issued' });
    const user = await openShare();
    await user.click(await screen.findByRole('menuitem', { name: /WhatsApp/ }));
    expect(windowOpen).toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(logManualShare).toHaveBeenCalledWith({
      docType: 'invoice',
      docId: 'i1',
      event: 'invoice_issued',
      toPhone: '0312 4890176',
    });
  });

  it('no connect prop: the old WhatsApp item, nothing logged', async () => {
    renderActions(undefined);
    const user = await openShare();
    await user.click(await screen.findByRole('menuitem', { name: /WhatsApp/ }));
    expect(windowOpen).toHaveBeenCalled();
    expect(logManualShare).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
