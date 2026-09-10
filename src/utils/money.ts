// ═══════════════════════════════════════════════════════
// FinMatrix Web — Money
// ═══════════════════════════════════════════════════════
// One formatter, used everywhere. Never format an amount by hand: a figure
// rendered with a different rounding or separator than the same figure two rows
// up is how an accounting UI loses a user's trust.
//
// Amounts arrive from the API as numbers or as numeric strings (TypeORM emits
// DECIMAL columns as strings to avoid the float loss that would otherwise
// happen before the value ever reaches us). Everything here normalises through
// Decimal first, so `"1234.565"` and `1234.565` round identically.

import Decimal from 'decimal.js';

/** Anything the API might hand us for a monetary column. */
export type MoneyInput = number | string | Decimal | null | undefined;

/**
 * Normalise an API amount to a Decimal. Unparseable input becomes zero rather
 * than NaN — a total that reads "NaN" is worse than one that reads 0.00, and
 * the underlying bad value shows up in the row it came from.
 */
export const toDecimal = (value: MoneyInput): Decimal => {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};

/** The number of a Decimal, for charting libraries that will not take one. */
export const toNumber = (value: MoneyInput): number => toDecimal(value).toNumber();

/**
 * The app's default currency prefix (src/utils/formatters.ts). It is a prefix
 * string rather than an ISO code because the backend stores it that way.
 */
export const DEFAULT_CURRENCY = 'Rs ';

/**
 * Format an amount for display: `Rs 1,234.57`, `-Rs 40.00`.
 *
 * Matches the app's formatCurrency exactly, including the sign going BEFORE the
 * currency prefix — Intl would put it after, and the two clients would then
 * disagree on every negative figure.
 */
export const formatMoney = (
  amount: MoneyInput,
  currency: string = DEFAULT_CURRENCY,
): string => {
  const d = toDecimal(amount);
  const sign = d.isNegative() ? '-' : '';
  const formatted = d
    .abs()
    .toNumber()
    .toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return `${sign}${currency}${formatted}`;
};

/**
 * Format without the currency prefix — for table columns whose header already
 * names the currency, where repeating it on every row is noise.
 */
export const formatAmount = (amount: MoneyInput): string =>
  formatMoney(amount, '');

/**
 * A negative amount in accounting parentheses: `(1,234.57)`.
 * Ported from the app's reportFormat.parenNegative, used by the statements.
 */
export const parenNegative = (
  amount: MoneyInput,
  currency: string = DEFAULT_CURRENCY,
): string => {
  const d = toDecimal(amount);
  if (!d.isNegative()) return formatMoney(d, currency);
  return `(${formatMoney(d.abs(), currency)})`;
};

/**
 * Compact form for KPI tiles, where the full figure will not fit:
 * `Rs 1.2B`, `Rs 340K`, `Rs 1.5K`.
 *
 * Ported from the app's compactRs (screens/HomeScreen/dashboardTheme.ts),
 * including its two-band K behaviour — below 10K it keeps a decimal
 * (`Rs 1.5K`), above it rounds (`Rs 340K`) — so tiles match the phone.
 *
 * Note this uses the app's U+2212 MINUS SIGN for negatives, not a hyphen: at
 * KPI sizes a hyphen reads as a stray dash.
 */
export const compactMoney = (
  amount: MoneyInput,
  currency: string = DEFAULT_CURRENCY,
): string => {
  const n = toNumber(amount);
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${sign}${currency}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1_000_000) return `${sign}${currency}${(a / 1e6).toFixed(1)}M`;
  if (a >= 10_000) return `${sign}${currency}${Math.round(a / 1e3)}K`;
  if (a >= 1_000) return `${sign}${currency}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${currency}${Math.round(a).toLocaleString('en-US')}`;
};

/** Sum a column without float drift. */
export const sumMoney = (values: MoneyInput[]): Decimal =>
  values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));

/**
 * Do two amounts balance? Used by the journal-entry editor and by the trial
 * balance check. Exact comparison, because Decimal makes it safe to demand one.
 */
export const isBalanced = (debits: MoneyInput[], credits: MoneyInput[]): boolean =>
  sumMoney(debits).equals(sumMoney(credits));

export { Decimal };
