// ═══════════════════════════════════════════════════════
// FinMatrix Web — Financial statement logic
// ═══════════════════════════════════════════════════════
// The arithmetic and grouping a statement needs that the API does not do for us.
//
// The governing rule here is that THE CLIENT NEVER FOOTS A COLUMN. The backend
// sums every total from unrounded four-decimal figures and rounds once, precisely
// because Σ round(x) ≠ round(Σ x) — across thirty accounts the rounded lines can
// drift a paisa or more from the real total. Re-adding the rounded lines on this
// side would reintroduce that and make a balanced ledger report as unbalanced.
// `reconcile` is how a display sum and the server's figure are reconciled: the
// server's wins, always.

import { toDecimal } from '@/utils/money';

export type AccountGroup =
  | 'bank'
  | 'ar'
  | 'otherCurrentAsset'
  | 'fixedAsset'
  | 'currentLiability'
  | 'longTermLiability'
  | 'equity'
  | 'income'
  | 'cogs'
  | 'expense'
  | 'other';

/** One account's contribution to a statement section, sign already applied. */
export interface StatementLine {
  accountCode: string;
  accountName: string;
  amount: number;
}

/**
 * Which part of a statement an account number belongs to.
 *
 * The number is all there is to go on: `GET /reports/balance-sheet` sends each
 * line as `{accountCode, accountName, amount}` with no type or sub-type, so the
 * statement's shape has to be inferred from the chart's numbering convention.
 *
 * Several bands are wider than their names suggest. Inventory (1200), Goods in
 * Transit (1250) and Sales Tax Recoverable (1300) are all current assets;
 * Accounts Payable (2000), GRNI (2050), Sales Tax Payable (2300) and Customer
 * Advances (2400) are all current liabilities.
 *
 * **The current-liability band runs to 2699, not 2399.** The app's version cuts
 * at 2399 and files everything above as long-term, which puts account 2400 —
 * `Customer Advances (Unearned Revenue)`, a contract liability the server settles
 * when the goods are delivered — under "Long-Term Liabilities". It is money owed
 * within the operating cycle, so that overstates long-term debt and understates
 * current, which is exactly the distinction a reader checks a balance sheet for.
 * No seeded account sits above 2400, so 2700+ is left free for the genuinely
 * long-term items a user adds themselves.
 *
 * Anything non-numeric, or outside every band, is `'other'` — rendered under an
 * "Other" heading, never dropped.
 */
export const classifyAccount = (code: string): AccountGroup => {
  if (!/^\d+$/.test(code)) return 'other';
  const n = Number(code);

  if (n >= 1000 && n <= 1099) return 'bank';
  if (n >= 1100 && n <= 1199) return 'ar';
  if (n >= 1200 && n <= 1499) return 'otherCurrentAsset';
  if (n >= 1500 && n <= 1999) return 'fixedAsset';
  if (n >= 2000 && n <= 2699) return 'currentLiability';
  if (n >= 2700 && n <= 2999) return 'longTermLiability';
  if (n >= 3000 && n <= 3999) return 'equity';
  if (n >= 4000 && n <= 4999) return 'income';
  if (n >= 5000 && n <= 5999) return 'cogs';
  if (n >= 6000 && n <= 7999) return 'expense';
  return 'other';
};

export const ACCOUNT_GROUP_LABELS: Record<AccountGroup, string> = {
  bank: 'Bank Accounts',
  ar: 'Accounts Receivable',
  otherCurrentAsset: 'Other Current Assets',
  fixedAsset: 'Fixed Assets',
  currentLiability: 'Current Liabilities',
  longTermLiability: 'Long-Term Liabilities',
  equity: 'Equity',
  income: 'Income',
  cogs: 'Cost of Goods Sold',
  expense: 'Expenses',
  other: 'Other',
};

/** Asset sub-sections, in the order a balance sheet presents them. */
export const ASSET_GROUPS: AccountGroup[] = [
  'bank',
  'ar',
  'otherCurrentAsset',
  'fixedAsset',
];

/** Liability sub-sections, in presentation order. */
export const LIABILITY_GROUPS: AccountGroup[] = [
  'currentLiability',
  'longTermLiability',
];

export interface GroupedSection {
  group: AccountGroup;
  label: string;
  lines: StatementLine[];
  /** Sum of this group's own lines — display only, never a tie-breaker. */
  subtotal: number;
}

export interface BucketedLines {
  sections: GroupedSection[];
  /** Lines no requested group claimed, surfaced rather than discarded. */
  leftover: StatementLine[];
  leftoverSubtotal: number;
}

const byCode = (a: StatementLine, b: StatementLine) =>
  a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true });

const sumLines = (lines: readonly StatementLine[]): number =>
  lines
    .reduce((acc, l) => acc.plus(toDecimal(l.amount)), toDecimal(0))
    .toDecimalPlaces(2)
    .toNumber();

/**
 * Split a flat list of accounts into the sub-sections a statement shows.
 *
 * `GET /reports/balance-sheet` returns `assets`, `liabilities` and `equity` as
 * FLAT arrays — the server does no grouping at all — so this is the only place
 * the Balance Sheet's shape comes from.
 *
 * An account whose code matches none of the requested groups lands in
 * `leftover`, which the page renders as "Other Assets" / "Other Liabilities".
 * Nothing is allowed to vanish: an account missing from the statement because
 * somebody numbered it oddly is far worse than one shown under a vague heading,
 * and the section totals come from the server either way, so a misfiled line
 * cannot make the statement stop balancing.
 *
 * Empty groups are omitted entirely rather than printing a heading with no rows.
 */
export const bucketStatementLines = (
  lines: readonly StatementLine[] | undefined,
  groups: readonly AccountGroup[],
): BucketedLines => {
  const safe = Array.isArray(lines) ? lines : [];
  const wanted = new Set(groups);
  const byGroup = new Map<AccountGroup, StatementLine[]>();
  const leftover: StatementLine[] = [];

  for (const line of safe) {
    const group = classifyAccount(line.accountCode);
    if (!wanted.has(group)) {
      leftover.push(line);
      continue;
    }
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(line);
    else byGroup.set(group, [line]);
  }

  const sections: GroupedSection[] = [];
  for (const group of groups) {
    const found = byGroup.get(group);
    if (!found || found.length === 0) continue;
    const sorted = found.slice().sort(byCode);
    sections.push({
      group,
      label: ACCOUNT_GROUP_LABELS[group],
      lines: sorted,
      subtotal: sumLines(sorted),
    });
  }

  leftover.sort(byCode);

  return { sections, leftover, leftoverSubtotal: sumLines(leftover) };
};

/**
 * Show the server's total, and say so loudly in development if our own sum of
 * the displayed lines disagrees.
 *
 * Always returns `serverTotal`. The drift this catches is nearly always the
 * presentation rounding described at the top of this file, not a real error —
 * but it is exactly the signal that a section is missing a line, so it is worth
 * a warning rather than silence.
 */
export const reconcile = (
  displaySum: number,
  serverTotal: number,
  label: string,
): number => {
  if (
    import.meta.env.DEV &&
    Math.abs(displaySum - serverTotal) > 0.01
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[reports] ${label}: the rendered lines sum to ${displaySum} but the ` +
        `server reports ${serverTotal}. Showing the server figure.`,
    );
  }
  return serverTotal;
};

export interface Variance {
  delta: number;
  /** Null when the prior figure is zero — a percentage of nothing says nothing. */
  percent: number | null;
}

/**
 * Movement between a figure and its comparison figure.
 *
 * `percent` is deliberately null rather than 0 or Infinity when the prior period
 * is zero: "up 100%" from nothing is a statement about dividing by zero, not
 * about the business. The page renders an em-dash for it.
 *
 * The denominator is the ABSOLUTE prior value, so a loss that shrinks reads as an
 * improvement rather than flipping sign with the arithmetic.
 */
export const variance = (current: number, prior: number): Variance => {
  const delta = toDecimal(current).minus(toDecimal(prior)).toDecimalPlaces(2).toNumber();
  if (prior === 0) return { delta, percent: null };
  const percent = toDecimal(delta)
    .dividedBy(Math.abs(prior))
    .times(100)
    .toDecimalPlaces(1)
    .toNumber();
  return { delta, percent };
};

// ═══════════════════════════════════════════════════════
// Statement rows
// ═══════════════════════════════════════════════════════

/**
 * One line of a rendered statement.
 *
 * A statement is not a uniform table — a row is a group heading, an account, a
 * subtotal or the grand total, and each is drawn differently — which is why this
 * is its own shape rather than a `DataTable` column set.
 */
export interface StatementRowData {
  label: string;
  /** Undefined on a group heading, which carries no figure of its own. */
  amount?: number;
  /** Indent level. Account lines sit at 1 under a heading at 0. */
  depth?: number;
  bold?: boolean;
  /** A subtotal: hairline rule above. */
  isTotal?: boolean;
  /** The statement's bottom line: heavy rule above, heaviest weight. */
  isGrand?: boolean;
  /** The comparison period's figure, when comparing. */
  prior?: number;
  /** A stable key where the label alone is not unique. */
  key?: string;

  /**
   * The account this row reports, when it reports one.
   *
   * Set on account lines so the row can be expanded into the transactions
   * behind it. Absent on headings and subtotals, which have no single account
   * to drill into — that absence is what makes a row non-expandable, rather
   * than a separate flag that could disagree with it.
   */
  accountCode?: string;
}
