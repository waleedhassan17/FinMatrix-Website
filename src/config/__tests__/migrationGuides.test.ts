import { describe, expect, it } from 'vitest';

import { activeRoute, fileArrived, guideFor, MIGRATION_GUIDES } from '@/config/migrationGuides';
import { MIGRATION_SOURCES } from '@/config/migrationSources';

/** What the server can mark a file as: a starter sheet, 'ptb', or "<source>:<report>". */
const SHEETS = new Set(['accounts', 'customers', 'vendors', 'items', 'trial_balance', 'open_invoices', 'open_bills', 'stock', 'ptb']);
/**
 * The reports each source's parser profile reads on the server
 * (backend src/modules/migrations/sources/reports/profiles/*). A guide may
 * only promise a "<source>:<report>" tick that the server can produce.
 */
const REPORTS: Record<string, string[]> = {
  peachtree: ['trial_balance', 'aged_receivables', 'aged_payables', 'inventory_valuation', 'chart_of_accounts', 'customer_list', 'vendor_list', 'item_list'],
  quickbooks_online: ['trial_balance', 'aged_receivables', 'aged_payables', 'inventory_valuation', 'chart_of_accounts', 'customer_list', 'vendor_list', 'item_list'],
  quickbooks_desktop: ['trial_balance', 'aged_receivables', 'aged_payables', 'inventory_valuation', 'chart_of_accounts', 'customer_list', 'vendor_list', 'item_list'],
  xero: ['trial_balance', 'aged_receivables', 'aged_payables', 'inventory_valuation', 'chart_of_accounts', 'contact_list', 'item_list'],
  zoho_books: ['trial_balance', 'aged_receivables', 'aged_payables', 'inventory_valuation', 'chart_of_accounts', 'contact_list', 'item_list', 'transactions'],
};
const known = (d: string) => {
  if (SHEETS.has(d)) return true;
  const m = /^([a-z_]+):([a-z_]+)$/.exec(d);
  return !!m && (REPORTS[m[1]] ?? []).includes(m[2]);
};

describe('migration guides', () => {
  it('every guide is for a known source, complete, and only names files FinMatrix can recognise', () => {
    for (const g of MIGRATION_GUIDES) {
      expect(MIGRATION_SOURCES.some((s) => s.id === g.source)).toBe(true);
      expect(g.before.length).toBeGreaterThan(3);
      expect(g.files.length).toBeGreaterThan(0);
      expect(g.problems.length).toBeGreaterThan(0);
      for (const f of g.files) {
        expect(f.how.length).toBeGreaterThan(0);
        for (const h of f.how) expect(h.steps.length).toBeGreaterThan(0);
        for (const d of f.detects) expect(known(d), `${g.source} ${f.id}: ${d}`).toBe(true);
        for (const r of f.routes ?? []) expect(g.routes?.some((x) => x.id === r)).toBe(true);
      }
    }
  });

  it('every required file in every route can be ticked off', () => {
    for (const g of MIGRATION_GUIDES) {
      for (const route of g.routes?.map((r) => r.id) ?? [null]) {
        const needed = g.files.filter((f) => f.required === 'yes' && (!route || !f.routes || f.routes.includes(route)));
        const files = needed.map((f) => ({ kind: f.detects[0] === 'ptb' ? 'ptb' : 'xlsx', detected: [{ target: f.detects[0] }] }));
        for (const f of needed) expect(fileArrived(f, files)).toBe(true);
      }
    }
  });

  it('Peachtree: a backup means route A; report lists without a backup mean route B (any version)', () => {
    const g = guideFor('peachtree')!;
    expect(activeRoute(g, [])).toBe('backup');
    expect(activeRoute(g, [{ kind: 'ptb', detected: [] }])).toBe('backup');
    expect(activeRoute(g, [{ kind: 'xlsx', detected: [{ target: 'peachtree:chart_of_accounts' }] }])).toBe('reports');
  });

  it('cites the vendor documentation for every system it describes', () => {
    for (const g of MIGRATION_GUIDES.filter((x) => x.source !== 'finmatrix_template' && x.source !== 'generic_spreadsheet')) {
      expect(g.references.length).toBeGreaterThan(0);
      for (const r of g.references) expect(r.url).toMatch(/^https:\/\//);
    }
  });
});
