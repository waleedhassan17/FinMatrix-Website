import { describe, expect, it } from 'vitest';

import { reportCellText, statementSection } from '@/features/reports/reportPdfTable';
import type { StatementRowData } from '@/models/reportStatement';
import { parenNegative } from '@/utils/money';

const rows: StatementRowData[] = [
  { label: 'Income', bold: true },
  { key: '4000', label: '4000  Sales', amount: 1200, depth: 1, prior: 1000 },
  { label: 'Total Income', amount: 1200, isTotal: true, bold: true, prior: 1000 },
  { label: 'Net Income', amount: -300, isGrand: true, prior: 150 },
];

describe('statementSection', () => {
  it('lays a statement out as label and amount', () => {
    const section = statementSection(rows, { title: 'Profit & Loss' });
    expect(section.title).toBe('Profit & Loss');
    expect(section.columns.map((c) => c.header)).toEqual(['', 'Amount']);
    expect(section.rows[0]).toMatchObject({ cells: ['Income', null], heading: true });
    expect(section.rows[1]).toMatchObject({ cells: ['4000  Sales', 1200], depth: 1, heading: false });
    expect(section.rows[2]).toMatchObject({ total: true, heading: false });
    expect(section.rows[3]).toMatchObject({ grand: true, cells: ['Net Income', -300] });
  });

  it('adds prior and change columns when comparing', () => {
    const section = statementSection(rows, {
      comparing: true,
      currentLabel: 'This year',
      priorLabel: 'Last year',
    });
    expect(section.columns.map((c) => c.header)).toEqual(['', 'This year', 'Last year', 'Change']);
    expect(section.rows[1].cells).toEqual(['4000  Sales', 1200, 1000, 200]);
    expect(section.rows[3].cells).toEqual(['Net Income', -300, 150, -450]);
    expect(section.rows[0].cells).toEqual(['Income', null, null, null]);
  });
});

describe('reportCellText', () => {
  it('formats figures and passes text through', () => {
    expect(reportCellText(-1234.5)).toBe(parenNegative(-1234.5, ''));
    expect(reportCellText('Cash')).toBe('Cash');
    expect(reportCellText(null)).toBe('');
    expect(reportCellText(undefined)).toBe('');
  });
});
