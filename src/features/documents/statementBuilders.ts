// ═══════════════════════════════════════════════════════
// FinMatrix Web — Statements of account
// ═══════════════════════════════════════════════════════
// What a customer or vendor is sent to reconcile against: the opening balance,
// every invoice or bill and payment in the period with a running balance, and
// what is owed at the end. And the shorter document beside it — the summary of
// what is still open today, with nothing that has already been settled.

import { customerPartySource, vendorPartySource } from '@/features/documents/documentBuilders';
import {
  docDate,
  partyForDocument,
  type DocCompany,
  type DocParty,
  type DocTotal,
  type PartySource,
} from '@/features/documents/documentModel';
import type { ReportPdfData, ReportSection } from '@/features/reports/reportPdfTable';
import type { ShareableDocument } from '@/features/share/shareDocument';
import {
  PAYMENT_TERMS_LABELS,
  paymentTermsFromApi,
  type Customer,
  type PaymentTerms,
} from '@/models/customer';
import {
  CREDIT_KIND_LABELS,
  SUMMARY_COPY,
  countLabel,
  headlineFigure,
  latenessLabel,
  summaryMessageBody,
} from '@/models/partySummary';
import type { Vendor } from '@/models/vendor';
import { STATEMENT_KIND_LABELS, type CustomerStatement } from '@/serializers/customerSerializer';
import type { PartySummary } from '@/serializers/reportSerializers';
import { VENDOR_STATEMENT_KIND_LABELS, type VendorStatement } from '@/serializers/vendorSerializer';
import { formatMoney, sumMoney } from '@/utils/money';

export interface StatementDocument {
  pdf: ReportPdfData;
  share: ShareableDocument;
}

interface StatementInput {
  company: DocCompany;
  party: DocParty;
  period: { startDate: string; endDate: string };
  opening: number;
  closing: number;
  closingLabel: string;
  lines: { date: string; reference: string; kind: string; amount: number; runningBalance: number }[];
  totals: { label: string; value: number }[];
}

export const statementPeriodLabel = (startDate: string, endDate: string): string =>
  [docDate(startDate), docDate(endDate)].filter(Boolean).join(' – ');

function buildStatement(input: StatementInput): StatementDocument {
  const period = statementPeriodLabel(input.period.startDate, input.period.endDate);
  return {
    pdf: {
      title: 'Statement of account',
      periodLabel: period,
      company: input.company,
      party: input.party,
      meta: [
        { label: 'Period', value: period },
        { label: 'Opening balance', value: formatMoney(input.opening) },
        ...input.totals.map((t) => ({ label: t.label, value: formatMoney(t.value) })),
        { label: input.closingLabel, value: formatMoney(input.closing) },
      ],
      sections: [
        {
          columns: [
            { header: 'Date', flex: 1.4 },
            { header: 'Reference', flex: 2.4 },
            { header: 'Type', flex: 1.2 },
            { header: 'Amount', align: 'right', flex: 1.8 },
            { header: 'Balance', align: 'right', flex: 1.8 },
          ],
          rows: [
            { cells: [docDate(input.period.startDate), 'Opening balance', '', null, input.opening], bold: true },
            ...input.lines.map((l) => ({
              cells: [docDate(l.date), l.reference || '—', l.kind, l.amount, l.runningBalance],
            })),
            { cells: [docDate(input.period.endDate), input.closingLabel, '', null, input.closing], grand: true },
          ],
        },
      ],
    },
    share: {
      kind: 'Statement',
      partyName: input.party.name,
      partyEmail: input.party.email,
      partyPhone: input.party.phone,
      amount: input.closing,
      amountLabel: input.closingLabel,
      period,
      companyName: input.company.name,
    },
  };
}

export function customerStatementDocument(
  statement: CustomerStatement,
  company: DocCompany,
  customer: Customer | null | undefined,
  range: { startDate: string; endDate: string },
): StatementDocument {
  return buildStatement({
    company,
    party: partyForDocument('Statement for', statement.customer.name || customer?.name || '', customerPartySource(customer)),
    period: {
      startDate: statement.period.startDate || range.startDate,
      endDate: statement.period.endDate || range.endDate,
    },
    opening: statement.openingBalance,
    closing: statement.closingBalance,
    closingLabel: 'Balance due',
    lines: statement.lines.map((l) => ({
      date: l.date,
      reference: l.reference,
      kind: STATEMENT_KIND_LABELS[l.kind],
      amount: l.amount,
      runningBalance: l.runningBalance,
    })),
    totals: [
      { label: 'Invoiced', value: statement.totals.invoiced },
      { label: 'Received', value: statement.totals.received },
      // Only when there were any: a line of zeros is noise on a customer's copy.
      ...(statement.totals.credited ? [{ label: 'Credited', value: statement.totals.credited }] : []),
      ...(statement.totals.refunded ? [{ label: 'Refunded', value: statement.totals.refunded }] : []),
    ],
  });
}

export function vendorStatementDocument(
  statement: VendorStatement,
  company: DocCompany,
  vendor: Vendor | null | undefined,
  range: { startDate: string; endDate: string },
): StatementDocument {
  return buildStatement({
    company,
    party: partyForDocument('Statement for', statement.vendor.name || vendor?.name || '', vendorPartySource(vendor)),
    period: {
      startDate: statement.period.startDate || range.startDate,
      endDate: statement.period.endDate || range.endDate,
    },
    opening: statement.openingBalance,
    closing: statement.closingBalance,
    closingLabel: 'Balance owed',
    lines: statement.lines.map((l) => ({
      date: l.date,
      reference: l.reference,
      kind: VENDOR_STATEMENT_KIND_LABELS[l.kind],
      amount: l.amount,
      runningBalance: l.runningBalance,
    })),
    totals: [
      { label: 'Billed', value: statement.totals.billed },
      { label: 'Paid', value: statement.totals.paid },
      ...(statement.totals.credited ? [{ label: 'Credited', value: statement.totals.credited }] : []),
    ],
  });
}

// ═══════════════════════════════════════════════════════
// Outstanding invoices / payables summary
// ═══════════════════════════════════════════════════════

/** The terms as a reader knows them; empty when the party has none on file. */
const termsLabel = (recordTerms: PaymentTerms | '' | undefined, apiTerms: string): string => {
  if (recordTerms) return PAYMENT_TERMS_LABELS[recordTerms] ?? '';
  return apiTerms ? PAYMENT_TERMS_LABELS[paymentTermsFromApi(apiTerms)] : '';
};

/** The party block from the summary itself, for when the full record is not to hand. */
const summaryPartySource = (s: PartySummary): PartySource => ({
  name: s.party.name,
  code: s.party.code || undefined,
  codeLabel: s.partyType === 'customer' ? 'Customer ID' : 'Vendor ID',
  contactPerson: s.party.contactPerson || undefined,
  email: s.party.email || undefined,
  phone: s.party.phone || undefined,
  taxId: s.party.taxId || undefined,
  address: s.party.address ? { street: s.party.address } : null,
});

/**
 * Everything still open with one party, as a document: what is unpaid and how
 * late, the credits that come off it, the figure to ask for, and the aging.
 *
 * `source` is the customer or vendor record when the page has it — its
 * structured address prints better than the one-line fallback.
 */
function buildPartySummary(
  s: PartySummary,
  company: DocCompany,
  source: PartySource | null,
  terms: string,
): StatementDocument {
  const copy = SUMMARY_COPY[s.partyType];
  const asOf = docDate(s.asOfDate);
  const head = headlineFigure(s);
  const hasCredits = s.credits.items.length > 0;
  const party = partyForDocument(copy.partyLabel, s.party.name, source ?? summaryPartySource(s));
  const paidTotal = sumMoney(s.documents.map((d) => d.amountPaid)).toNumber();

  const documents: ReportSection = {
    title: copy.documentsTitle,
    // The number gets the widest column: a bill number is the vendor's own, and
    // "INV/2026/00123-A" does not wrap — a PDF cell breaks only at spaces.
    columns: [
      { header: copy.numberHeader, flex: 2.3 },
      { header: 'Date', flex: 1.25 },
      { header: 'Due', flex: 1.25 },
      { header: 'Status', flex: 1.75 },
      { header: 'Amount', align: 'right', flex: 1.35 },
      { header: 'Paid', align: 'right', flex: 1.15 },
      { header: 'Balance', align: 'right', flex: 1.4 },
    ],
    rows:
      s.documents.length === 0
        ? [{ cells: [`No unpaid ${copy.nounPlural}`, '', '', '', null, null, null] }]
        : [
            ...s.documents.map((d) => ({
              cells: [
                d.documentNumber || '—',
                docDate(d.issueDate),
                docDate(d.dueDate),
                latenessLabel(d.daysOverdue),
                d.total,
                // A dash, not 0.00: nothing has been paid is the usual case, and
                // a column of zeros is noise the eye has to read past.
                d.amountPaid === 0 ? '—' : d.amountPaid,
                d.balance,
              ],
            })),
            {
              cells: [
                'Total',
                '',
                '',
                countLabel(s.documents.length, s.partyType),
                sumMoney(s.documents.map((d) => d.total)).toNumber(),
                paidTotal === 0 ? '—' : paidTotal,
                s.totals.outstanding,
              ],
              total: true,
            },
          ],
  };

  const credits: ReportSection = {
    title: 'Unapplied credits',
    columns: [
      { header: 'Reference', flex: 2.3 },
      { header: 'Date', flex: 1.25 },
      { header: 'Type', flex: 2.55 },
      { header: 'Amount', align: 'right', flex: 1.5 },
      { header: 'Available', align: 'right', flex: 1.6 },
    ],
    rows: [
      ...s.credits.items.map((c) => ({
        cells: [c.reference || '—', docDate(c.date), CREDIT_KIND_LABELS[c.kind], c.amount, c.available],
      })),
      { cells: ['Total', '', '', null, s.credits.total], total: true },
    ],
  };

  const aging: ReportSection = {
    title: 'Aging · days overdue',
    columns: [
      ...s.buckets.map((b) => ({ header: b.label, align: 'right' as const, flex: 1 })),
      { header: 'Total', align: 'right', flex: 1.2 },
    ],
    rows: [
      {
        cells: [...s.buckets.map((b) => (b.amount === 0 ? '—' : b.amount)), s.totals.outstanding],
        bold: true,
      },
    ],
  };

  const totals: DocTotal[] = hasCredits
    ? [
        { label: 'Total outstanding', value: s.totals.outstanding },
        { label: 'Less credits', value: s.credits.total, prefix: '− ' },
        { label: head.label, value: head.value, grand: true },
      ]
    : [{ label: head.label, value: head.value, grand: true }];

  const sections = [documents, ...(hasCredits ? [credits] : []), ...(s.documents.length > 0 ? [aging] : [])];

  return {
    pdf: {
      title: copy.title,
      periodLabel: `As of ${asOf}`,
      company,
      party,
      meta: [
        { label: 'As of', value: asOf },
        ...(terms ? [{ label: 'Payment terms', value: terms }] : []),
        { label: head.label, value: formatMoney(head.value) },
        ...(s.totals.overdue > 0
          ? [{ label: `Overdue (${countLabel(s.totals.overdueCount, s.partyType)})`, value: formatMoney(s.totals.overdue) }]
          : []),
        ...(s.lastPayment
          ? [{ label: copy.lastPaymentLabel, value: `${formatMoney(s.lastPayment.amount)} · ${docDate(s.lastPayment.date)}` }]
          : []),
      ],
      sections,
      totals,
      totalsAfter: hasCredits ? 1 : 0,
      notes: [
        {
          title: 'Note',
          text:
            s.partyType === 'customer'
              ? `Balances as of ${asOf}. A payment made after that date may not be shown yet — if anything here differs from your records, please let us know.`
              : `Balances as recorded in our books on ${asOf}. If anything here differs from your records, please let us know.`,
        },
      ],
    },
    share: {
      kind: copy.title,
      partyName: party.name,
      partyEmail: party.email ?? (s.party.email || undefined),
      partyPhone: party.phone ?? (s.party.phone || undefined),
      amount: head.value,
      amountLabel: head.label,
      period: asOf,
      companyName: company.name,
      body: summaryMessageBody(s, company.name),
    },
  };
}

/** The outstanding-invoices summary a business sends a customer. */
export const customerSummaryDocument = (
  summary: PartySummary,
  company: DocCompany,
  customer: Customer | null | undefined,
): StatementDocument =>
  buildPartySummary(summary, company, customerPartySource(customer), termsLabel(customer?.paymentTerms, summary.party.paymentTerms));

/** Everything owed to one vendor — the payables summary. */
export const vendorSummaryDocument = (
  summary: PartySummary,
  company: DocCompany,
  vendor: Vendor | null | undefined,
): StatementDocument =>
  buildPartySummary(summary, company, vendorPartySource(vendor), termsLabel(vendor?.paymentTerms, summary.party.paymentTerms));
