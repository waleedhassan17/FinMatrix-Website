// ═══════════════════════════════════════════════════════
// FinMatrix Web — Trial balance flags, in plain language
// ═══════════════════════════════════════════════════════
// The server decides WHICH rows are flagged (reports v2: 'abnormal_balance',
// 'contra_assumed', 'obe_nonzero') on raw figures. This file only says what a
// flag means to someone who is not an accountant, and where to look first —
// worded for the account it fires on, because "Cash has a credit balance" and
// "Sales has a debit balance" send you to different places.

export type FlagSeverity = 'warning' | 'info';

export interface FlagExplanation {
  /** Short, for a chip or a tooltip heading. */
  title: string;
  /** One or two sentences: what it means and the usual cause. */
  detail: string;
  severity: FlagSeverity;
}

interface FlaggedAccount {
  accountName: string;
  accountType: string;
  subType: string;
}

/** The usual cause of a balance on the wrong side, by subtype then by type. */
const ABNORMAL_BY_SUBTYPE: Record<string, (name: string) => string> = {
  Cash: (n) => `${n} shows a credit balance — usually an unrecorded deposit or a payment posted twice.`,
  Bank: (n) => `${n} shows a credit balance — an overdraft, or more often an unrecorded deposit or a payment posted twice.`,
  'Accounts Receivable': () =>
    'Receivables show a credit balance — usually a customer paid more than was invoiced, or a payment was applied to the wrong customer.',
  Inventory: () =>
    'Inventory is negative — stock was sold or issued before its purchase was recorded.',
  Prepaid: (n) => `${n} shows a credit balance — more was expensed than was ever prepaid.`,
  'Fixed Asset': (n) => `${n} shows a credit balance — a disposal or depreciation was posted against the asset itself.`,
  'Accounts Payable': () =>
    'Payables show a debit balance — usually a supplier was paid twice, or a bill that was paid was never entered.',
  'Credit Card': (n) => `${n} shows a debit balance — a card payment was recorded but the purchases on it were not.`,
  'Tax Payable': () =>
    'Tax payable shows a debit balance — more tax was paid over than was collected, or a sale was entered without its tax.',
  'Payroll Liability': () =>
    'Payroll liabilities show a debit balance — a payment went out before the payroll that created it was posted.',
  'Owner Draws': () =>
    'Owner draws show a credit balance — money put into the business may have been recorded as a negative draw.',
};

const ABNORMAL_BY_TYPE: Record<string, (name: string) => string> = {
  asset: (n) => `${n} has a credit balance, the opposite of an asset’s normal side.`,
  liability: (n) => `${n} has a debit balance, the opposite of a liability’s normal side.`,
  equity: (n) => `${n} has a debit balance, the opposite of equity’s normal side.`,
  revenue: (n) =>
    `${n} shows a debit balance — refunds or credit notes exceed sales, or a sale was reversed twice.`,
  expense: (n) =>
    `${n} shows a credit balance — a refund or reclassification was posted to the wrong account.`,
};

/** A flag as words. Unknown flags are named rather than dropped. */
export const explainFlag = (flag: string, account: FlaggedAccount): FlagExplanation => {
  const name = account.accountName || 'This account';
  switch (flag) {
    case 'abnormal_balance': {
      const text =
        ABNORMAL_BY_SUBTYPE[account.subType]?.(name) ??
        ABNORMAL_BY_TYPE[account.accountType]?.(name) ??
        `${name} has a balance on the opposite side to its normal one.`;
      return { title: 'Balance on the wrong side', detail: text, severity: 'warning' };
    }
    case 'contra_assumed':
      return {
        title: 'Treated as a contra-asset',
        detail: `${name} is read as a contra-asset (its name mentions “accumulated”), so a credit balance is expected here and is not flagged.`,
        severity: 'info',
      };
    case 'obe_nonzero':
      return {
        title: 'Opening balances not cleared',
        detail:
          'Opening Balance Equity is not zero — opening balances were entered but not yet moved into retained earnings or owner’s capital.',
        severity: 'warning',
      };
    default:
      return {
        title: flag.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        detail: `${name} was flagged by the server (${flag}).`,
        severity: 'warning',
      };
  }
};

/** Flags worth a reader's attention — 'info' ones explain, they do not warn. */
export const warningFlags = (flags: readonly string[]): string[] =>
  flags.filter((f) => f !== 'contra_assumed');
