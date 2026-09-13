// ═══════════════════════════════════════════════════════
// FinMatrix Web — Statements of account
// ═══════════════════════════════════════════════════════
// What a customer or vendor is sent to reconcile against: the opening balance,
// every invoice or bill and payment in the period with a running balance, and
// what is owed at the end.

import { customerPartySource, vendorPartySource } from '@/features/documents/documentBuilders';
import { docDate, partyForDocument, type DocCompany, type DocParty } from '@/features/documents/documentModel';
import type { ReportPdfData } from '@/features/reports/reportPdfTable';
import type { ShareableDocument } from '@/features/share/shareDocument';
import type { Customer } from '@/models/customer';
import type { Vendor } from '@/models/vendor';
import type { CustomerStatement } from '@/serializers/customerSerializer';
import type { VendorStatement } from '@/serializers/vendorSerializer';
import { formatMoney } from '@/utils/money';

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
      kind: l.kind === 'invoice' ? 'Invoice' : 'Payment',
      amount: l.amount,
      runningBalance: l.runningBalance,
    })),
    totals: [
      { label: 'Invoiced', value: statement.totals.invoiced },
      { label: 'Received', value: statement.totals.received },
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
      kind: l.kind === 'bill' ? 'Bill' : 'Payment',
      amount: l.amount,
      runningBalance: l.runningBalance,
    })),
    totals: [
      { label: 'Billed', value: statement.totals.billed },
      { label: 'Paid', value: statement.totals.paid },
    ],
  });
}
