import { describe, expect, it } from 'vitest';

import { insightHref } from '@/models/insights';

describe('insightHref', () => {
  const period = { startDate: '2026-01-01', endDate: '2026-09-30' };

  it('opens each report on the insight’s own period', () => {
    expect(insightHref({ key: 'profitLoss', params: period })).toBe('/reports/profit-loss?from=2026-01-01&to=2026-09-30');
    expect(insightHref({ key: 'cashFlow', params: period })).toBe('/reports/cash-flow?from=2026-01-01&to=2026-09-30');
    expect(insightHref({ key: 'balanceSheet', params: period })).toBe('/reports/balance-sheet?asOf=2026-09-30');
    expect(insightHref({ key: 'arAging', params: {} })).toBe('/reports/ar-aging');
    expect(insightHref({ key: 'apAging', params: {} })).toBe('/reports/ap-aging');
    expect(insightHref({ key: 'inventoryValuation', params: {} })).toBe('/reports/inventory-valuation');
    expect(insightHref({ key: 'budgets', params: { budgetId: 'b 1' } })).toBe('/budgets/b%201');
  });

  it('leaves a report this client does not have unlinked', () => {
    expect(insightHref({ key: 'somethingNew', params: {} })).toBeNull();
  });
});
