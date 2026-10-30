// ═══════════════════════════════════════════════════════
// FinMatrix Web — What stands out (analytics insights)
// ═══════════════════════════════════════════════════════
// The sentences are the server's (business-insights.ts), built from the same
// figures as the cards beside them, so the web and the app say the same thing
// in the same words. All this file decides is where each one leads.

export type InsightTone = 'negative' | 'warning' | 'positive' | 'neutral';

export interface BusinessInsight {
  key: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** The report that explains it, by the server's key, with its query. */
  report: { key: string; params: Record<string, string> };
}

/** What the link to each report says — the report's own name. */
export const INSIGHT_REPORT_LABEL: Record<string, string> = {
  profitLoss: 'Profit & Loss',
  balanceSheet: 'Balance Sheet',
  cashFlow: 'Cash Flow',
  arAging: 'AR Aging',
  apAging: 'AP Aging',
  inventoryValuation: 'Inventory Valuation',
  budgets: 'Budget',
};

const q = (pairs: [string, string | undefined][]) => {
  const p = new URLSearchParams();
  for (const [k, v] of pairs) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/**
 * The route for an insight's report, on the same period. Null for a report
 * this client does not have — the insight then shows without a link.
 */
export const insightHref = (report: BusinessInsight['report']): string | null => {
  const { startDate, endDate, asOfDate, budgetId } = report.params;
  switch (report.key) {
    case 'profitLoss':
      return `/reports/profit-loss${q([['from', startDate], ['to', endDate]])}`;
    case 'cashFlow':
      return `/reports/cash-flow${q([['from', startDate], ['to', endDate]])}`;
    case 'balanceSheet':
      return `/reports/balance-sheet${q([['asOf', asOfDate ?? endDate]])}`;
    case 'arAging':
      return '/reports/ar-aging';
    case 'apAging':
      return '/reports/ap-aging';
    case 'inventoryValuation':
      return '/reports/inventory-valuation';
    case 'budgets':
      return budgetId ? `/budgets/${encodeURIComponent(budgetId)}` : '/budgets';
    default:
      return null;
  }
};
