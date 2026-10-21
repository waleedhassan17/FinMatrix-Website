import { describe, expect, it } from 'vitest';

import {
  appliedSummary,
  commitLabel,
  importFileError,
  importTabs,
  openingStockDateError,
  rowsForTab,
  rowsToApply,
  type ImportRow,
  type ImportSummary,
} from '@/models/inventoryImport';
import { mapImportResult } from '@/serializers/inventoryImportSerializer';
import { mapInventoryItem } from '@/serializers/inventorySerializer';

// The import page renders straight from these. The server owns every rule;
// they only arrange its answer — and must keep the opening-stock total exactly
// as written, because the commit sends it back as the owner's confirmation.

const summary = (over: Partial<ImportSummary> = {}): ImportSummary => ({
  totalRows: 5,
  create: 2,
  update: 1,
  unchanged: 0,
  error: 2,
  withWarnings: 1,
  openingStock: { items: 1, quantity: 4, value: 34000, confirmValue: '34000.0000' },
  ...over,
});

const row = (rowNumber: number, action: ImportRow['action']): ImportRow => ({
  rowNumber,
  sku: `S${rowNumber}`,
  name: `Item ${rowNumber}`,
  action,
  itemId: null,
  changes: [],
  openingStock: null,
  errors: [],
  warnings: [],
});

describe('inventory import model', () => {
  it('shows All plus only the tabs that have rows', () => {
    expect(importTabs(summary()).map((t) => [t.key, t.count])).toEqual([
      ['all', 5],
      ['create', 2],
      ['update', 1],
      ['error', 2],
    ]);
  });

  it('filters rows by tab and counts only rows the commit writes', () => {
    const rows = [row(2, 'create'), row(3, 'error'), row(4, 'create')];
    expect(rowsForTab(rows, 'create').map((r) => r.rowNumber)).toEqual([2, 4]);
    expect(rowsForTab(rows, 'all')).toHaveLength(3);
    expect(rowsToApply(summary())).toBe(3);
    expect(commitLabel(summary())).toBe('Import 3 items');
    expect(commitLabel(summary({ create: 1, update: 0 }))).toBe('Import 1 item');
  });

  it('checks the opening-stock date the way the server does', () => {
    expect(openingStockDateError('2026-10-21', '2026-10-21', null)).toBeNull();
    expect(openingStockDateError('2026-10-22', '2026-10-21', null)).toMatch(/future/);
    expect(openingStockDateError('2026-06-30', '2026-10-21', '2026-06-30')).toMatch(/closed through/);
    expect(openingStockDateError('', '2026-10-21', null)).toBe('Choose a date.');
  });

  it('refuses a file before uploading it when it cannot be read', () => {
    expect(importFileError({ name: 'stock.xls', size: 10 })).toMatch(/Save As/);
    expect(importFileError({ name: 'stock.pdf', size: 10 })).toMatch(/xlsx/);
    expect(importFileError({ name: 'stock.xlsx', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(importFileError({ name: 'Stock.XLSX', size: 10 })).toBeNull();
    expect(importFileError({ name: 'stock.csv', size: 10 })).toBeNull();
  });

  it('summarises what a commit did', () => {
    const applied = {
      created: 2,
      updated: 1,
      openingStockItems: 0,
      openingStockValue: 0,
      openingStockDate: null,
      journalReference: null,
    };
    expect(appliedSummary(applied)).toBe('2 added, 1 updated');
    expect(appliedSummary({ ...applied, created: 0, updated: 0 })).toBe('Nothing needed changing');
  });
});

describe('mapImportResult', () => {
  const raw = {
    fileName: 'items.xlsx',
    columns: { recognized: ['SKU'], ignored: ['Colour'] },
    openingStockAllowed: true,
    booksLockedUntil: null,
    summary: {
      totalRows: 2,
      create: 1,
      update: 0,
      unchanged: 0,
      error: 1,
      withWarnings: 0,
      openingStock: { items: 1, quantity: '4', value: '34000.1234' },
    },
    rows: [
      {
        rowNumber: 2,
        sku: 'CHR-1',
        name: 'Chair',
        action: 'create',
        itemId: null,
        changes: [],
        openingStock: { quantity: '4', unitCost: '8500.0309', value: '34000.1234' },
        errors: [],
        warnings: [],
      },
      { rowNumber: 3, action: 'delete', errors: ['?'] },
    ],
    applied: { created: 1, updated: 0, openingStockItems: 1, openingStockValue: '34000.1234', openingStockDate: '2026-10-21', journalReference: 'JE-12' },
  };

  it('maps the answer and keeps the opening value verbatim', () => {
    const r = mapImportResult(raw);
    expect(r.summary.openingStock).toEqual({ items: 1, quantity: 4, value: 34000.1234, confirmValue: '34000.1234' });
    expect(r.rows[0].openingStock).toEqual({ quantity: 4, unitCost: 8500.0309, value: 34000.1234 });
    expect(r.ignoredColumns).toEqual(['Colour']);
    expect(r.applied).toMatchObject({ created: 1, journalReference: 'JE-12', openingStockValue: 34000.1234 });
  });

  it('treats an unknown action as a problem, never as a write', () => {
    expect(mapImportResult(raw).rows[1].action).toBe('error');
  });
});

describe('mapInventoryItem photo links', () => {
  it('carries the signed links, and null without a photo', () => {
    expect(mapInventoryItem({ id: 'i', imageUrl: 'https://a/d.jpg?sig=1', thumbnailUrl: 'https://a/t.jpg?sig=2' })).toMatchObject({
      imageUrl: 'https://a/d.jpg?sig=1',
      thumbnailUrl: 'https://a/t.jpg?sig=2',
    });
    expect(mapInventoryItem({ id: 'i', imageUrl: null })).toMatchObject({ imageUrl: null, thumbnailUrl: null });
  });
});
