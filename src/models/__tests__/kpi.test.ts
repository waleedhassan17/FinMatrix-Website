import { describe, expect, it } from 'vitest';

import {
  assessmentLabel,
  formatKpiChange,
  formatKpiValue,
  kpiAccessibleLabel,
  kpiContext,
  kpiStatusText,
  kpiTone,
  plainKpi,
} from '@/models/kpi';
import { kpiSerializer } from '@/serializers/kpiSerializer';

describe('formatKpiValue', () => {
  it('prints each unit the way a reader expects', () => {
    expect(formatKpiValue(1240500, 'money')).toBe('Rs 1,240,500.00');
    expect(formatKpiValue(1.8, 'ratio')).toBe('1.80×');
    expect(formatKpiValue(42.4, 'days')).toBe('42 days');
    expect(formatKpiValue(1, 'days')).toBe('1 day');
    expect(formatKpiValue(7.46, 'months')).toBe('7.5 mo');
    expect(formatKpiValue(41.25, 'percent')).toBe('41.3%');
    expect(formatKpiValue(-3.1, 'percent')).toBe('−3.1%');
    expect(formatKpiValue(12, 'count')).toBe('12');
  });

  it('prints nothing it does not have', () => {
    expect(formatKpiValue(null, 'ratio')).toBe('—');
  });
});

describe('formatKpiChange', () => {
  it('moves money in rupees with its percentage, a percentage in points', () => {
    expect(formatKpiChange({ change: 20000, changePct: 10, unit: 'money' })).toBe('+Rs 20,000.00 (+10.0%)');
    expect(formatKpiChange({ change: -2.5, changePct: null, unit: 'percent' })).toBe('−2.5 pts');
    expect(formatKpiChange({ change: 0.12, changePct: null, unit: 'ratio' })).toBe('+0.12×');
    expect(formatKpiChange({ change: null, changePct: null, unit: 'days' })).toBeNull();
  });
});

describe('kpiTone', () => {
  it('reads a rise by which way is good for that KPI', () => {
    expect(kpiTone('revenue', 100)).toBe('good');
    expect(kpiTone('dso', 4)).toBe('bad'); // customers paying slower
    expect(kpiTone('dso', -4)).toBe('good');
    expect(kpiTone('debtToEquity', 0.1)).toBe('bad');
    expect(kpiTone('unknownKpi', 5)).toBe('neutral');
    expect(kpiTone('revenue', 0)).toBe('neutral');
    expect(kpiTone('revenue', null)).toBe('neutral');
  });
});

describe('kpiAccessibleLabel and status', () => {
  it('says the figure and its direction in words', () => {
    expect(
      kpiAccessibleLabel({ label: 'Accounts Receivable', value: 1240500, unit: 'money', change: 1000, changePct: 12, status: null }),
    ).toBe('Accounts Receivable, Rs 1,240,500.00, up 12.0%');
    expect(kpiAccessibleLabel({ ...plainKpi('dso', 'DSO', 42, 'days'), change: -3 })).toBe('DSO, 42 days, down 3 days');
  });

  it('explains a null value rather than calling it zero', () => {
    expect(kpiStatusText('cash_positive')).toBe('Cash-positive — no burn');
    expect(kpiStatusText('some_new_status')).toBe('Some new status');
    expect(kpiAccessibleLabel({ ...plainKpi('runwayMonths', 'Runway', null, 'months'), status: 'cash_positive' })).toBe(
      'Runway, —, Cash-positive — no burn',
    );
  });
});

describe('a negative KPI amount', () => {
  it('goes in brackets, as on the statements and in the app', () => {
    expect(formatKpiValue(-146982.8, 'money')).toBe('(Rs 146,982.80)');
  });
});

describe('assessmentLabel', () => {
  it('names the three verdicts, and says nothing for neutral or none', () => {
    expect(assessmentLabel({ level: 'healthy', guide: '' })).toBe('Healthy');
    expect(assessmentLabel({ level: 'watch', guide: '' })).toBe('Watch');
    expect(assessmentLabel({ level: 'risk', guide: '' })).toBe('At risk');
    expect(assessmentLabel({ level: 'neutral', guide: '' })).toBeNull();
    expect(assessmentLabel(null)).toBeNull();
  });
});

describe('kpiContext', () => {
  const k = (key: string, inputs: Record<string, number | null>) => kpiSerializer({ key, label: key, value: 1, unit: 'ratio', inputs });

  it('reads the server’s inputs back in short words', () => {
    expect(kpiContext(k('currentRatio', { currentAssets: 1_470_000, currentLiabilities: 774_000 }))).toBe(
      'Rs 1.5M current assets · Rs 774K current liabilities',
    );
    expect(
      kpiContext(k('quickRatio', { cashAndBank: 191_000, receivables: 178_000, currentLiabilities: 774_000 })),
    ).toBe('Rs 191K cash and bank · Rs 178K receivables · Rs 774K current liabilities');
  });

  it('reads the cash conversion cycle as its sum, in days', () => {
    expect(kpiContext(k('ccc', { dso: 92.6, dio: 2873.7, dpo: 785.9 }))).toBe('93 + 2,874 − 786 days');
  });

  it('adds nothing when a figure is its own one input', () => {
    expect(kpiContext(k('cashAndBank', { cashAndBank: 5 }))).toBeNull();
  });
});
