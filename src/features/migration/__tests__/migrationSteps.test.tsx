// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/settings/migrationNetwork', () => ({
  validateMigration: vi.fn(),
  commitMigration: vi.fn(),
  rollbackMigration: vi.fn(),
  closeMigration: vi.fn(),
  downloadCertificate: vi.fn(),
  dryRunMigration: vi.fn(),
  signOffMigration: vi.fn(),
}));

import { CheckStep } from '@/features/migration/steps/CheckStep';
import { ImportStep } from '@/features/migration/steps/ImportStep';
import { ReviewView } from '@/features/migration/steps/ReviewStep';
import { ADMIN_NAV, STAFF_NAV } from '@/config/nav';
import { isPathAllowedForRole } from '@/config/routeAccess';
import type { CertificatePreview, MigrationBatch } from '@/models/migration';

const batch = (over: Partial<MigrationBatch> = {}): MigrationBatch => ({
  id: 'b1', sourceSystem: 'finmatrix_template', cutoverDate: '2026-06-30', status: 'ready', step: 6, readiness: 100, counts: null, checks: [], issues: { blocking: 0, warning: 0 }, lastError: null,
  signedOffAt: null, signedOffBy: null, committedAt: null, closedAt: null, rolledBackAt: null, certificateAvailable: false, createdAt: '', updatedAt: '', ...over,
});
const preview: CertificatePreview = {
  batchId: 'b1', cutoverDate: '2026-06-30', checks: [], allPassed: true, rowCounts: [], rejectedRows: [], rejectedTotal: 0, postings: [], created: {},
  spotChecks: [
    { kind: 'customer', name: 'Al-Noor Traders', documents: 2, sourceBalance: '165000.00', finmatrixBalance: '165000.00', matches: true },
    { kind: 'vendor', name: 'Karachi Packaging', documents: 2, sourceBalance: '123250.00', finmatrixBalance: '123250.00', matches: true },
  ],
};
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

function Review({ confirmed = false, ticked = new Set<number>() }: { confirmed?: boolean; ticked?: Set<number> }) {
  return <ReviewView batch={batch()} preview={preview} loading={false} ticked={ticked} setTicked={() => undefined} confirmed={confirmed} setConfirmed={() => undefined} signing={false} onSignOff={vi.fn()} onNext={vi.fn()} />;
}

describe('Review: sign-off waits for every spot check', () => {
  it('is disabled until the certificate is confirmed and every spot check ticked', () => {
    const { rerender } = render(<Review />);
    const button = () => screen.getByRole('button', { name: 'Sign off' }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    rerender(<Review confirmed ticked={new Set([0])} />);
    expect(button().disabled).toBe(true);
    rerender(<Review confirmed={false} ticked={new Set([0, 1])} />);
    expect(button().disabled).toBe(true);
    rerender(<Review confirmed ticked={new Set([0, 1])} />);
    expect(button().disabled).toBe(false);
  });

  it('shows source and FinMatrix balances side by side', () => {
    render(<Review />);
    expect(screen.getByText('Al-Noor Traders')).toBeTruthy();
    expect(screen.getAllByText(/Source 165000.00/).length).toBe(1);
  });
});

describe('Check and Import: nothing imports until the batch is ready', () => {
  it('keeps Review (and so Import) locked while checks fail', () => {
    wrap(<CheckStep batch={batch({ status: 'validated', readiness: 92 })} onNext={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Continue to review' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens Review once ready', () => {
    wrap(<CheckStep batch={batch({ status: 'ready' })} onNext={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Continue to review' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Import until signed off, and enables it after', () => {
    const { unmount } = wrap(<ImportStep batch={batch({ signedOffAt: null })} />);
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    wrap(<ImportStep batch={batch({ signedOffAt: '2026-11-13T00:00:00Z' })} />);
    const btn = screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(screen.getByText('Import your books?')).toBeTruthy();
  });

  it('offers Undo and Close after import, and neither once closed', () => {
    const { unmount } = wrap(<ImportStep batch={batch({ status: 'committed', committedAt: '2026-11-13T00:00:00Z' })} />);
    expect(screen.getByRole('button', { name: /Undo migration/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Close migration/ })).toBeTruthy();
    unmount();
    wrap(<ImportStep batch={batch({ status: 'closed', committedAt: '2026-11-13T00:00:00Z' })} />);
    expect(screen.queryByRole('button', { name: /Undo migration/ })).toBeNull();
  });
});

describe('navigation: owner only', () => {
  const paths = (nav: typeof ADMIN_NAV) => nav.flatMap((g) => [g.path, ...(g.items ?? []).map((i) => i.path)]).filter(Boolean);
  it('lists both pages for the owner and hides them from staff', () => {
    expect(paths(ADMIN_NAV)).toEqual(expect.arrayContaining(['/settings/backup', '/settings/migration']));
    expect(paths(STAFF_NAV as typeof ADMIN_NAV)).not.toEqual(expect.arrayContaining(['/settings/backup']));
    expect(isPathAllowedForRole('/settings/backup', 'staff')).toBe(false);
    expect(isPathAllowedForRole('/settings/migration/abc', 'staff')).toBe(false);
    expect(isPathAllowedForRole('/settings/backup', 'admin')).toBe(true);
  });
});

describe('Review: figures as typed', () => {
  const asTyped = {
    trialBalance: [{ account: '1000', name: 'Cash', debitText: '۱۵۰۰۰۰', creditText: '', readAs: 'Dr 150000', posted: 'Dr 150000.0000' }],
    openItems: [{ kind: 'invoice' as const, party: 'Al-Noor Traders', document: 'INV-1002', asTyped: '45,000', readAs: '45000', partyBalance: '165000.0000' }],
    stock: [{ sku: 'CHR-001', quantityText: '12', costText: 'Rs 8,500', readAs: '12 × 8500', onHand: '12.0000 × 8500.0000' }],
    more: { trialBalance: 0, openItems: 0, stock: 0 },
  };
  it('shows each figure exactly as typed, as read and as the books hold it', () => {
    const p = { ...preview, asTyped, spotChecks: preview.spotChecks.map((s) => ({ ...s, asTyped: ['1,20,000', '45,000'] })) };
    render(<ReviewView batch={batch()} preview={p} loading={false} ticked={new Set()} setTicked={() => undefined} confirmed={false} setConfirmed={() => undefined} signing={false} onSignOff={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('table', { name: 'Trial balance as typed' }).textContent).toContain('۱۵۰۰۰۰');
    expect(screen.getByRole('table', { name: 'Open invoices and bills as typed' }).textContent).toContain('45,000');
    expect(screen.getByRole('table', { name: 'Stock as typed' }).textContent).toContain('Rs 8,500');
    expect(screen.getAllByText('As typed: 1,20,000 · 45,000')).toHaveLength(2);
    expect(screen.getByText(/All ten checks pass/)).toBeTruthy();
  });
});
