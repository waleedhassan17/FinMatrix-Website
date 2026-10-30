// ═══════════════════════════════════════════════════════
// FinMatrix Web — Balance sheet layout
// ═══════════════════════════════════════════════════════
// Arranges the server's sections into statement rows: Current Assets with its
// sections, Total Current Assets, Fixed Assets, TOTAL ASSETS; then
// Liabilities, Equity and TOTAL LIABILITIES AND EQUITY.
//
// This is layout only. Every figure — line, section subtotal, cross-section
// total — is the server's, read as sent. The one thing decided here is the
// ORDER the sections are drawn in and where the cross-section totals go,
// which is how every balance sheet is laid out, not a classification.

import type { StatementRowData } from '@/models/reportStatement';
import type {
  BalanceSheetLine,
  BalanceSheetReport,
  BalanceSheetSection,
  BalanceSheetTotal,
} from '@/serializers/reportSerializers';

const CURRENT_ASSET_KEYS = new Set(['cashAndBank', 'receivables', 'inventory', 'otherCurrentAssets']);
const LIABILITY_KEYS = new Set(['currentLiabilities', 'longTermLiabilities', 'liabilities']);
const EQUITY_KEYS = new Set(['equity']);

/** What a synthetic line is, for its ⓘ. */
const SYNTHETIC_NOTES: Record<string, string> = {
  retainedEarnings:
    'Computed, not posted: the net income of every closed fiscal year. There is no Retained Earnings account to hold it.',
  currentYearEarnings:
    'Computed, not posted: net income from the start of this fiscal year to the statement date — the figure on the Profit & Loss for the same dates.',
};

/** The key a line's row (and its investigate panel) goes by. */
export const balanceSheetLineKey = (line: BalanceSheetLine): string => {
  if (line.composite || line.synthetic === 'retainedEarnings') return 'retained-earnings';
  if (line.synthetic) return `synthetic-${line.synthetic}`;
  return line.accountCode;
};

export interface BalanceSheetRows {
  assets: StatementRowData[];
  liabilitiesAndEquity: StatementRowData[];
  /** Every line row, by its key — what the page resolves `?inspect=` against. */
  lines: Map<string, { line: BalanceSheetLine; section: BalanceSheetSection }>;
}

/**
 * Statement rows from a balance sheet.
 *
 * `comparing` puts each line's prior figure in its row (zero where the account
 * had no balance on the comparison date — a line that exists on one date and
 * not the other is still a line on both).
 */
export const balanceSheetRows = (
  report: BalanceSheetReport,
  comparing: boolean,
): BalanceSheetRows => {
  const lines = new Map<string, { line: BalanceSheetLine; section: BalanceSheetSection }>();
  const prior = (value: number | null): number | undefined =>
    comparing ? (value ?? 0) : undefined;

  const lineRow = (line: BalanceSheetLine, section: BalanceSheetSection, depth: number): StatementRowData => {
    const key = balanceSheetLineKey(line);
    lines.set(key, { line, section });
    const synthetic = !!line.synthetic;
    return {
      key,
      kind: synthetic ? 'synthetic' : 'account',
      label: `${line.accountCode}  ${line.accountName}`.trim(),
      name: line.accountName,
      // A synthetic line never carries a real code; it opens nothing by code.
      accountCode: synthetic ? undefined : line.accountCode || undefined,
      amount: line.amount,
      prior: prior(line.priorAmount),
      change: comparing ? line.change : undefined,
      changePct: comparing ? line.changePct : undefined,
      pctOfTotal: line.pctOfTotalAssets,
      note: synthetic ? SYNTHETIC_NOTES[line.synthetic as string] : undefined,
      depth,
      section: section.key,
      drill: true,
    };
  };

  const sectionBlock = (section: BalanceSheetSection, depth: number, totalLabel?: string): StatementRowData[] => [
    { key: `h-${section.key}`, label: section.label, bold: true, depth, section: section.key, kind: 'heading' },
    ...section.lines.map((l) => lineRow(l, section, depth + 1)),
    {
      key: `t-${section.key}`,
      label: totalLabel ?? `Total ${section.label}`,
      amount: section.subtotal,
      prior: prior(section.priorSubtotal),
      // The server's movement when it sent one; otherwise the table derives it.
      change: comparing && section.change !== null ? section.change : undefined,
      changePct: comparing && section.change !== null ? section.changePct : undefined,
      pctOfTotal: section.pctOfTotalAssets,
      depth,
      isTotal: true,
      bold: true,
      section: section.key,
    },
  ];

  const totalRow = (
    total: BalanceSheetTotal | undefined,
    grand: boolean,
    depth = 0,
  ): StatementRowData[] =>
    total
      ? [
          {
            key: `total-${total.key}`,
            label: total.label,
            amount: total.amount,
            prior: prior(total.prior),
            change: comparing && total.change !== null ? total.change : undefined,
            changePct: comparing && total.change !== null ? total.changePct : undefined,
            pctOfTotal: total.pctOfTotalAssets,
            depth,
            ...(grand ? { isGrand: true } : { isTotal: true, bold: true }),
          },
        ]
      : [];

  // Sides by section key; an unknown key stays on the side it appears in.
  const assetSections: BalanceSheetSection[] = [];
  const liabilitySections: BalanceSheetSection[] = [];
  const equitySections: BalanceSheetSection[] = [];
  let side: 'assets' | 'liabilities' | 'equity' = 'assets';
  // The server sends every statement group, used or not. One with no lines
  // and nothing on either date is left out — a heading over a 0.00 total
  // says nothing — but still counts towards which side the next one is on.
  const empty = (s: BalanceSheetSection) =>
    s.lines.length === 0 && s.subtotal === 0 && (s.priorSubtotal ?? 0) === 0;
  for (const section of report.sections) {
    if (LIABILITY_KEYS.has(section.key)) side = 'liabilities';
    else if (EQUITY_KEYS.has(section.key)) side = 'equity';
    if (report.grouped && empty(section)) continue;
    (side === 'assets' ? assetSections : side === 'liabilities' ? liabilitySections : equitySections).push(section);
  }

  const assets: StatementRowData[] = [];
  if (!report.grouped) {
    // An older server's flat list: one heading, its lines, the total.
    for (const s of assetSections) {
      assets.push({ key: `h-${s.key}`, label: s.label, bold: true, kind: 'heading', section: s.key });
      assets.push(...s.lines.map((l) => lineRow(l, s, 1)));
    }
  } else {
    const current = assetSections.filter((s) => CURRENT_ASSET_KEYS.has(s.key));
    const other = assetSections.filter((s) => !CURRENT_ASSET_KEYS.has(s.key));
    if (current.length > 0) {
      assets.push({ key: 'h-current-assets', label: 'Current Assets', bold: true, kind: 'heading' });
      for (const s of current) assets.push(...sectionBlock(s, 1));
      assets.push(...totalRow(report.totals.currentAssets, false));
    }
    for (const s of other) assets.push(...sectionBlock(s, 0));
  }
  assets.push(...totalRow(report.totals.totalAssets, true));

  const right: StatementRowData[] = [];
  if (!report.grouped) {
    for (const s of liabilitySections) {
      right.push({ key: `h-${s.key}`, label: s.label, bold: true, kind: 'heading', section: s.key });
      right.push(...s.lines.map((l) => lineRow(l, s, 1)));
    }
  } else if (liabilitySections.length > 0) {
    right.push({ key: 'h-liabilities', label: 'Liabilities', bold: true, kind: 'heading' });
    for (const s of liabilitySections) right.push(...sectionBlock(s, 1));
  }
  right.push(...totalRow(report.totals.totalLiabilities, false));

  // Equity's own subtotal is Total Equity, so `totals.totalEquity` is not
  // printed a second time beneath it.
  for (const s of equitySections) {
    right.push(...sectionBlock(s, 0, 'Total Equity'));
  }
  right.push(...totalRow(report.totals.totalLiabilitiesAndEquity, true));

  return { assets, liabilitiesAndEquity: right, lines };
};
