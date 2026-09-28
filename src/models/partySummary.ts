// ═══════════════════════════════════════════════════════
// FinMatrix Web — Outstanding-invoices and payables summaries
// ═══════════════════════════════════════════════════════
// What a business sends a customer ("here is everything you still owe us"), or
// keeps for a vendor ("here is everything we owe you"). The panel, the PDF and
// the WhatsApp/email message all take their words and figures from here, so
// the three cannot describe the same money differently.

import { formatShortDate } from '@/models/reportPeriod';
import type { PartySummary, PartySummaryCredit } from '@/serializers/reportSerializers';
import { formatMoney } from '@/utils/money';

export type SummaryParty = PartySummary['partyType'];

export interface SummaryCopy {
  /** The panel's and the PDF's title. */
  title: string;
  /** The button that opens it. */
  action: string;
  noun: string;
  nounPlural: string;
  /** Heading over the documents. */
  documentsTitle: string;
  /** Header of the document-number column. */
  numberHeader: string;
  /** Over the party's name on the PDF. */
  partyLabel: string;
  /** The figure to ask for. */
  dueLabel: string;
  /** When credits cover more than is open. */
  creditBalanceLabel: string;
  lastPaymentLabel: string;
  /** The empty state, after the party's name. */
  nothingOpen: string;
}

export const SUMMARY_COPY: Record<SummaryParty, SummaryCopy> = {
  customer: {
    title: 'Outstanding invoices',
    action: 'Outstanding summary',
    noun: 'invoice',
    nounPlural: 'invoices',
    documentsTitle: 'Unpaid invoices',
    numberHeader: 'Invoice',
    partyLabel: 'Prepared for',
    dueLabel: 'Total due',
    creditBalanceLabel: 'Credit in your favour',
    lastPaymentLabel: 'Last payment received',
    nothingOpen: 'has no unpaid invoices',
  },
  vendor: {
    title: 'Payables summary',
    action: 'Payables summary',
    noun: 'bill',
    nounPlural: 'bills',
    documentsTitle: 'Unpaid bills',
    numberHeader: 'Bill',
    partyLabel: 'Payable to',
    dueLabel: 'Total payable',
    creditBalanceLabel: 'Credit in our favour',
    lastPaymentLabel: 'Last payment made',
    nothingOpen: 'has no unpaid bills',
  },
};

export const CREDIT_KIND_LABELS: Record<PartySummaryCredit['kind'], string> = {
  payment: 'Unapplied payment',
  credit_memo: 'Credit memo',
  vendor_credit: 'Vendor credit',
};

/**
 * How late, in words.
 *
 * `daysOverdue` arrives signed: a document not yet due is negative and one due
 * today is zero. "0 days overdue" for a document due this afternoon is the
 * kind of true-but-wrong that makes a report feel careless.
 */
export const latenessLabel = (daysOverdue: number): string => {
  if (daysOverdue < 0) return `Due in ${-daysOverdue} day${daysOverdue === -1 ? '' : 's'}`;
  if (daysOverdue === 0) return 'Due today';
  return `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`;
};

/** "1 invoice", "3 bills". */
export const countLabel = (count: number, party: SummaryParty): string => {
  const copy = SUMMARY_COPY[party];
  return `${count} ${count === 1 ? copy.noun : copy.nounPlural}`;
};

/**
 * The figure to ask for, and what to call it.
 *
 * Net of credits whenever there are any: a customer holding an unapplied
 * receipt will point to it, and a summary that ignored it would overstate what
 * they owe. When credits cover more than is open, the figure turns around and
 * says so rather than printing a negative amount due.
 */
export const headlineFigure = (s: PartySummary): { label: string; value: number } => {
  const copy = SUMMARY_COPY[s.partyType];
  if (s.credits.total <= 0) return { label: copy.dueLabel, value: s.totals.outstanding };
  if (s.netDue < 0) return { label: copy.creditBalanceLabel, value: -s.netDue };
  return { label: copy.dueLabel, value: s.netDue };
};

/** Whether there is anything worth sending: an open document or a credit. */
export const hasAnythingOpen = (s: PartySummary): boolean =>
  s.documents.length > 0 || s.credits.items.length > 0;

/** How many documents a chat message lists before pointing to the PDF. */
export const MESSAGE_DOCUMENT_LIMIT = 10;

/** One line per document for a chat message, soonest due first, capped. */
export const summaryMessageLines = (s: PartySummary, limit = MESSAGE_DOCUMENT_LIMIT): string[] => {
  const copy = SUMMARY_COPY[s.partyType];
  const lines = s.documents.slice(0, limit).map((d) =>
    [
      d.documentNumber || copy.noun,
      d.dueDate ? `due ${formatShortDate(d.dueDate)}` : '',
      formatMoney(d.balance),
      d.daysOverdue > 0 ? latenessLabel(d.daysOverdue) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
  const more = s.documents.length - limit;
  if (more > 0) lines.push(`…and ${more} more in the attached PDF`);
  return lines;
};

/**
 * The message that travels with the PDF, between the greeting and the
 * sign-off. It stands on its own — a WhatsApp chat shows the text first, and
 * the reader should know what they owe before they open anything.
 */
export const summaryMessageBody = (s: PartySummary, companyName: string): string[] => {
  const asOf = formatShortDate(s.asOfDate);
  const withCompany = companyName ? ` with ${companyName}` : '';
  const body: string[] = [];

  if (s.documents.length === 0) {
    body.push(
      s.partyType === 'customer'
        ? `You have no unpaid invoices${withCompany} as of ${asOf}.`
        : `We have no unpaid bills with you as of ${asOf}.`,
    );
  } else {
    body.push(
      s.partyType === 'customer'
        ? `Here is a summary of your unpaid invoices${withCompany} as of ${asOf}:`
        : `Here is a summary of the bills we have open with you as of ${asOf}:`,
      '',
      ...summaryMessageLines(s),
    );
  }

  body.push('');
  if (s.credits.total > 0 && s.documents.length > 0) {
    body.push(`Total outstanding: ${formatMoney(s.totals.outstanding)}`);
    body.push(`Less credits: ${formatMoney(s.credits.total)}`);
  }
  const head = headlineFigure(s);
  body.push(`${head.label}: ${formatMoney(head.value)}`);
  if (s.totals.overdue > 0) body.push(`Overdue: ${formatMoney(s.totals.overdue)}`);
  body.push('', 'The full summary is attached as a PDF.');
  return body;
};
