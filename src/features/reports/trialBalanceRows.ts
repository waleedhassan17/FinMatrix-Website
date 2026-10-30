// ═══════════════════════════════════════════════════════
// FinMatrix Web — Trial balance layout
// ═══════════════════════════════════════════════════════
// Groups the server's rows by account type (Assets … Expenses), applies the
// reader's search and "flagged only" filter, and says which columns each mode
// shows. Every figure, every group subtotal and every column total is the
// server's; a group the server sent no subtotal for gets a heading and no
// total line rather than one added up here.

import { warningFlags } from '@/models/trialBalanceFlags';
import type {
  DebitCredit,
  TrialBalanceColumnTotals,
  TrialBalanceGroup,
  TrialBalanceMode,
  TrialBalanceReport,
  TrialBalanceRow,
} from '@/serializers/reportSerializers';

export const TB_GROUPS: { type: string; label: string }[] = [
  { type: 'asset', label: 'Assets' },
  { type: 'liability', label: 'Liabilities' },
  { type: 'equity', label: 'Equity' },
  { type: 'revenue', label: 'Revenue' },
  { type: 'expense', label: 'Expenses' },
];

export type TbPair = 'main' | 'opening' | 'period' | 'closing';

export interface TbColumn {
  pair: TbPair;
  side: 'debit' | 'credit';
  header: string;
  /** The two-level header's top label (working mode). */
  group?: string;
}

/** The figure columns for a mode: Dr | Cr, or Opening/Period/Closing × Dr/Cr. */
export const tbColumns = (mode: TrialBalanceMode): TbColumn[] =>
  mode === 'working'
    ? (['opening', 'period', 'closing'] as const).flatMap((pair) => [
        { pair, side: 'debit' as const, header: 'Debit', group: pair[0].toUpperCase() + pair.slice(1) },
        { pair, side: 'credit' as const, header: 'Credit', group: pair[0].toUpperCase() + pair.slice(1) },
      ])
    : [
        { pair: 'main', side: 'debit', header: 'Debit' },
        { pair: 'main', side: 'credit', header: 'Credit' },
      ];

const pairOf = (source: TrialBalanceRow | TrialBalanceGroup, pair: TbPair): DebitCredit | null => {
  if (pair === 'main') {
    return 'main' in source ? source.main : { debit: source.debit, credit: source.credit };
  }
  return source[pair];
};

/** A row's or a group's figure in a column; null when the server sent none. */
export const tbCell = (source: TrialBalanceRow | TrialBalanceGroup, col: TbColumn): number | null => {
  const pair = pairOf(source, col.pair);
  return pair ? pair[col.side] : null;
};

/** The footer's figure in a column. */
export const tbTotal = (report: TrialBalanceReport, col: TbColumn): number => {
  if (col.pair === 'main') return col.side === 'debit' ? report.totalDebits : report.totalCredits;
  const pair: TrialBalanceColumnTotals | null = report.columnTotals[col.pair];
  return pair ? pair[col.side] : 0;
};

export type TbViewRow =
  | { type: 'group'; key: string; label: string; groupKey: string }
  /** A server statement group inside a type — "Cash and Bank" under Assets. */
  | { type: 'subgroup'; key: string; label: string; groupKey: string }
  | { type: 'account'; key: string; row: TrialBalanceRow; groupKey: string }
  | { type: 'subtotal'; key: string; label: string; group: TrialBalanceGroup; groupKey: string };

export interface TbView {
  rows: TbViewRow[];
  /** Whether the server sent any account with nothing in any column. */
  hasZeroRows: boolean;
  /** Accounts carrying a warning flag, over the whole report. */
  flaggedCount: number;
  /** Whether a filter is hiding rows — the footer then says it totals all accounts. */
  filtered: boolean;
  /** Whether rows carry their type, so they could be grouped. */
  grouped: boolean;
}

const matchGroup = (groups: TrialBalanceGroup[], type: string, label: string) =>
  groups.find(
    (g) => g.key === type || g.key === `${type}s` || g.key.toLowerCase() === label.toLowerCase() || g.label === label,
  );

export const trialBalanceView = (
  report: TrialBalanceReport,
  filters: { search?: string; flaggedOnly?: boolean; showZero?: boolean } = {},
): TbView => {
  const q = (filters.search ?? '').trim().toLowerCase();
  const flaggedCount = report.rows.filter((r) => warningFlags(r.flags).length > 0).length;
  const isZero = (r: TrialBalanceRow) =>
    !r.synthetic &&
    r.debit === 0 &&
    r.credit === 0 &&
    [r.opening, r.period, r.closing].every((p) => !p || (p.debit === 0 && p.credit === 0));

  const keep = (r: TrialBalanceRow) => {
    if (!filters.showZero && isZero(r)) return false;
    if (filters.flaggedOnly && warningFlags(r.flags).length === 0) return false;
    if (q && !r.accountCode.toLowerCase().includes(q) && !r.accountName.toLowerCase().includes(q)) return false;
    return true;
  };
  const filtered = Boolean(q || filters.flaggedOnly);
  const hasZeroRows = report.rows.some(isZero);
  const grouped = report.rows.some((r) => r.accountType);

  const vrKey = (r: TrialBalanceRow) => (r.synthetic ? `synthetic-${r.accountName}` : r.accountCode || r.accountName);
  const accountRow = (r: TrialBalanceRow, groupKey: string): TbViewRow => ({
    type: 'account',
    key: vrKey(r),
    row: r,
    groupKey,
  });

  if (!grouped) {
    return {
      rows: report.rows.filter(keep).map((r) => accountRow(r, 'all')),
      flaggedCount,
      filtered,
      grouped,
      hasZeroRows,
    };
  }

  const rows: TbViewRow[] = [];
  const typeLabel = (type: string) =>
    TB_GROUPS.find((g) => g.type === type)?.label ?? (type ? type[0].toUpperCase() + type.slice(1) : 'Other');

  // Reports v2: the server's own groups (its statement groups, in statement
  // order), each footed by the server. Shown under their account type, so the
  // reader still scans Assets → Expenses; the type itself carries no total,
  // because one would have to be added up here.
  const serverGroups = report.groups.length > 0 && report.rows.some((r) => r.group);
  if (serverGroups) {
    let lastType: string | null = null;
    const placed = new Set<string>();
    const typeOf = (members: TrialBalanceRow[]) =>
      members.find((r) => r.accountType && !r.synthetic)?.accountType ?? (members.some((r) => r.synthetic) ? 'equity' : '');
    const shownGroups = report.groups
      .map((g) => ({ g, members: report.rows.filter((r) => r.group === g.key) }))
      .map((x) => ({ ...x, type: typeOf(x.members), shown: x.members.filter(keep) }));
    const groupsPerType = new Map<string, number>();
    for (const x of shownGroups) {
      if (x.shown.length) groupsPerType.set(x.type, (groupsPerType.get(x.type) ?? 0) + 1);
    }
    for (const { g, members, type, shown } of shownGroups) {
      members.forEach((r) => placed.add(vrKey(r)));
      if (shown.length === 0) continue;
      if (type !== lastType) {
        rows.push({ type: 'group', key: `g-${type}-${g.key}`, label: typeLabel(type), groupKey: type });
        lastType = type;
      }
      // A subheading that only repeats its type's name is left out — but only
      // when it is the type's one group; beside a sibling it names its rows.
      const repeatsType = g.label.toLowerCase() === typeLabel(type).toLowerCase();
      if (g.label && (!repeatsType || (groupsPerType.get(type) ?? 0) > 1)) {
        rows.push({ type: 'subgroup', key: `sg-${g.key}`, label: g.label, groupKey: type });
      }
      rows.push(...shown.map((r) => accountRow(r, type)));
      if (!filtered) rows.push({ type: 'subtotal', key: `t-${g.key}`, label: `Total ${g.label}`, group: g, groupKey: type });
    }
    const leftovers = report.rows.filter((r) => !placed.has(vrKey(r)) && keep(r));
    if (leftovers.length > 0) {
      rows.push({ type: 'group', key: 'g-other', label: 'Other', groupKey: 'other' });
      rows.push(...leftovers.map((r) => accountRow(r, 'other')));
    }
    return { rows, flaggedCount, filtered, grouped, hasZeroRows };
  }

  const known = new Set(TB_GROUPS.map((g) => g.type));
  const groups = [
    ...TB_GROUPS,
    // A type the server knows and this list does not still gets its rows shown.
    ...[...new Set(report.rows.map((r) => r.accountType))]
      .filter((t) => t && !known.has(t))
      .map((t) => ({ type: t, label: t[0].toUpperCase() + t.slice(1) })),
  ];
  for (const { type, label } of groups) {
    // The synthetic prior-years row is equity's, whatever type it carries.
    const members = report.rows.filter((r) => (r.synthetic ? type === 'equity' : r.accountType === type));
    const shown = members.filter(keep);
    if (shown.length === 0) continue;
    rows.push({ type: 'group', key: `g-${type}`, label, groupKey: type });
    rows.push(...shown.map((r) => accountRow(r, type)));
    // A group subtotal over hidden rows would not be the sum of what is shown,
    // so a filtered view drops it; the footer keeps the whole report's total.
    const subtotal = matchGroup(report.groups, type, label);
    if (subtotal && !filtered) {
      rows.push({ type: 'subtotal', key: `t-${type}`, label: `Total ${label}`, group: subtotal, groupKey: type });
    }
  }
  // Untyped rows from a mixed payload, so nothing is dropped.
  const untyped = report.rows.filter((r) => !r.accountType && !r.synthetic && keep(r));
  if (untyped.length > 0) {
    rows.push({ type: 'group', key: 'g-other', label: 'Other', groupKey: 'other' });
    rows.push(...untyped.map((r) => accountRow(r, 'other')));
  }
  return { rows, flaggedCount, filtered, grouped, hasZeroRows };
};

const CREDIT_NORMAL = new Set(['revenue', 'liability', 'equity']);

/** A pair as one signed figure on the account's normal side — what its register reads. */
export const signedBalance = (accountType: string, pair: DebitCredit): number =>
  Math.round((CREDIT_NORMAL.has(accountType) ? pair.credit - pair.debit : pair.debit - pair.credit) * 100) / 100;

/** Balance-sheet accounts carry a balance; revenue and expenses a period's activity. */
export const isBalanceAccount = (accountType: string): boolean =>
  accountType === 'asset' || accountType === 'liability' || accountType === 'equity';
