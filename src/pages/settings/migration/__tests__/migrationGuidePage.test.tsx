// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import MigrationGuidePage from '@/pages/settings/migration/MigrationGuidePage';

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/migration/guide" element={<MigrationGuidePage />} />
        <Route path="/settings/migration/guide/:source" element={<MigrationGuidePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Migration guide page', () => {
  it('walks through a source: version, before you start, each file, problems, vendor docs', () => {
    at('/settings/migration/guide/tally');
    expect(screen.getByRole('heading', { name: 'Moving from TallyPrime / Tally.ERP 9' })).toBeTruthy();
    expect(screen.getByText(/Post every invoice, bill, receipt/i)).toBeTruthy();
    expect(document.getElementById('file-tb')).toBeTruthy();
    expect(screen.getByText(/F5 \(Ledger-wise\)/)).toBeTruthy();
    expect(screen.getByText('Vendor documentation')).toBeTruthy();
  });

  it('opens on the version asked for, with that version\'s steps', () => {
    at('/settings/migration/guide/tally?v=Tally.ERP%209');
    expect(screen.getAllByText(/Gateway of Tally → Display → Trial Balance/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/F5 \(Ledger-wise\)/)).toBeNull();
  });

  it('shows both Peachtree routes, so any version has a way in', () => {
    at('/settings/migration/guide/peachtree');
    expect(screen.getByText('A. Backup + four reports (recommended)')).toBeTruthy();
    expect(screen.getByText('B. Eight report exports (any version)')).toBeTruthy();
    expect(screen.getByText(/File → Back Up/)).toBeTruthy();
  });

  it('lists every guide when no source is given', () => {
    at('/settings/migration/guide');
    expect(screen.getByRole('link', { name: 'Peachtree / Sage 50 US' })).toBeTruthy();
  });
});
