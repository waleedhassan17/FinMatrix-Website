// ═══════════════════════════════════════════════════════
// FinMatrix Web — Financial statement logic
// ═══════════════════════════════════════════════════════
// The little arithmetic a statement still needs on this side, and its row model.
// Grouping is NOT here any more: reports v2 groups the balance sheet on the
// server, by account subtype, and the client draws what it is sent.
//
// The governing rule here is that THE CLIENT NEVER FOOTS A COLUMN. The backend
// sums every total from unrounded four-decimal figures and rounds once, precisely
// because Σ round(x) ≠ round(Σ x) — across thirty accounts the rounded lines can
// drift a paisa or more from the real total. Re-adding the rounded lines on this
// side would reintroduce that and make a balanced ledger report as unbalanced.
// `reconcile` is how a display sum and the server's figure are reconciled: the
// server's wins, always.

import { toDecimal } from '@/utils/money';

/** One account's contribution to a statement section, sign already applied. */
export interface StatementLine {
  accountCode: string;
  accountName: string;
  amount: number;
}

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

  // ── StatementTable v2 ──────────────────────────────────────────────────
  /**
   * What the row is. Inferred from the older flags when absent (a heading has
   * no amount, `isTotal` is a subtotal, `isGrand` the bottom line), so the
   * P&L and cash flow keep drawing as they did.
   *
   * `synthetic` is a computed line no account holds — Net Income (current
   * fiscal year), prior years' retained earnings — and carries an info mark
   * that says so.
   */
  kind?: 'heading' | 'account' | 'subtotal' | 'grand' | 'synthetic';
  /** The account name alone; the table prints `accountCode` muted before it. */
  name?: string;
  /** Server-supplied movement against `prior`. Preferred over `variance()`. */
  change?: number | null;
  changePct?: number | null;
  /** Common-size: this figure as a percentage of the base (total assets …). */
  pctOfTotal?: number | null;
  /** On a synthetic row: what it is and how it was computed, in one sentence. */
  note?: string;
  /**
   * On a heading: the section it opens, which makes the heading collapsible.
   * On the rows under it: the same key, so they fold with it.
   */
  section?: string;
  /**
   * Whether `onRowActivate` opens this row. Account rows that carry a code
   * default to true; set it on a synthetic row that has somewhere to go.
   */
  drill?: boolean;
}

/** The row's kind, read from `kind` or inferred from the older flags. */
export const rowKind = (row: StatementRowData): NonNullable<StatementRowData['kind']> => {
  if (row.kind) return row.kind;
  if (row.isGrand) return 'grand';
  if (row.isTotal) return 'subtotal';
  if (row.amount === undefined) return 'heading';
  return 'account';
};

/**
 * A line that is zero on every date shown. Hidden unless "Show zero-balance
 * accounts" is on — but only account lines: a subtotal of zero is a fact the
 * statement must still state.
 */
export const isZeroRow = (row: StatementRowData): boolean =>
  rowKind(row) === 'account' &&
  (row.amount ?? 0) === 0 &&
  (row.prior === undefined || row.prior === 0);

/**
 * A ratio as a figure's caption prints it: "41.2%", "−3.1%", or "—" when the
 * base is zero. For margins, where a loss must read as one.
 */
export const formatRatio = (part: number, whole: number): string => {
  if (!whole) return '—';
  const pct = Math.round((part / whole) * 1000) / 10;
  return `${pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
};
