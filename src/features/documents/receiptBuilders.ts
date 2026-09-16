// ═══════════════════════════════════════════════════════
// FinMatrix Web — Receipts, payment advices and journal entries
// ═══════════════════════════════════════════════════════

import { customerPartySource } from '@/features/documents/documentBuilders';
import {
  docDate,
  partyForDocument,
  stampFor,
  type DocCompany,
  type DocStamp,
  type DocumentModel,
} from '@/features/documents/documentModel';
import type { ShareableDocument } from '@/features/share/shareDocument';
import type { Customer } from '@/models/customer';
import type { JournalEntry } from '@/models/journalEntry';
import { paymentMethodLabel, type Payment } from '@/models/payment';
import { formatMoney } from '@/utils/money';

type Meta = { label: string; value: string };
const meta = (...rows: Array<Meta | null | false>): Meta[] =>
  rows.filter((r): r is Meta => !!r && r.value.trim().length > 0);

/** A customer's payment, as the receipt they are given for it. */
export function paymentReceiptDocument(
  p: Payment,
  company: DocCompany,
  customer?: Customer | null,
): DocumentModel {
  const party = partyForDocument('Received from', p.customerName, customerPartySource(customer));
  // RCT-YYYY-NNNN from the server; a receipt recorded before numbers existed
  // falls back to its reference, then a stable short id.
  const number = p.paymentNumber || p.reference || `RCT-${p.id.slice(0, 8).toUpperCase()}`;

  const lines =
    p.applications.length > 0
      ? p.applications.map((a) => ({
          description: `Invoice ${a.invoiceNumber || a.invoiceId.slice(0, 8)}`,
          // A part-payment leaves the rest in receivables; say so, so the
          // customer (and the books) can see nothing went missing.
          secondary:
            a.invoiceTotal != null && a.invoiceBalance != null
              ? `Invoice total ${formatMoney(a.invoiceTotal)} · ${
                  a.invoiceBalance > 0.005 ? `${formatMoney(a.invoiceBalance)} still owing` : 'settled in full'
                }`
              : 'Applied to invoice',
          quantity: null,
          unitPrice: null,
          taxRate: 0,
          amount: a.amountApplied,
        }))
      : [
          {
            description: 'Payment on account',
            secondary: 'Held as customer advance',
            quantity: null,
            unitPrice: null,
            taxRate: 0,
            amount: p.amount,
          },
        ];

  return {
    kind: 'Payment receipt',
    number,
    company,
    party,
    meta: meta(
      { label: 'Receipt date', value: docDate(p.paymentDate) },
      { label: 'Method', value: paymentMethodLabel(p.paymentMethod) },
      { label: 'Reference', value: p.reference },
    ),
    showQuantity: false,
    showTax: false,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines,
    totals: [
      { label: 'Applied to invoices', value: p.allocated },
      ...(p.unapplied > 0 ? [{ label: 'Held as advance', value: p.unapplied }] : []),
      { label: 'Amount received', value: p.amount, grand: true, dividerBefore: true, tone: 'success' as const },
    ],
    notes: [{ title: 'Notes', text: p.memo }],
    signatures: ['Received by'],
    stamp: null,
    share: {
      kind: 'Payment receipt',
      number,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: p.amount,
      amountLabel: 'Amount received',
      companyName: company.name,
    },
  };
}

export interface BillPaymentAdviceInput {
  vendorName: string;
  paymentDate: string;
  total: number;
  reference: string;
  lines: { billId: string; billNumber: string; applied: number; remaining: number }[];
}

/** Money paid to a vendor, as the remittance advice that tells them what it settled. */
export function billPaymentAdviceDocument(input: BillPaymentAdviceInput, company: DocCompany): DocumentModel {
  const party = partyForDocument('Paid to', input.vendorName, null);
  return {
    kind: 'Payment advice',
    number: input.reference,
    company,
    party,
    meta: meta(
      { label: 'Payment date', value: docDate(input.paymentDate) },
      { label: 'Reference', value: input.reference },
      { label: 'Bills', value: String(input.lines.length) },
    ),
    showQuantity: false,
    showTax: false,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines: input.lines.map((l) => ({
      description: `Bill ${l.billNumber}`,
      secondary: l.remaining > 0 ? `${formatMoney(l.remaining)} still owing` : 'Settled in full',
      quantity: null,
      unitPrice: null,
      taxRate: 0,
      amount: l.applied,
    })),
    totals: [{ label: 'Total paid', value: input.total, grand: true, tone: 'success' }],
    notes: [],
    signatures: ['Authorised signature'],
    stamp: null,
    share: {
      kind: 'Payment advice',
      number: input.reference || undefined,
      partyName: party.name,
      amount: input.total,
      amountLabel: 'Amount paid',
      companyName: company.name,
    },
  };
}

export interface JournalEntryDocument {
  company: DocCompany;
  reference: string;
  date: string;
  status: string;
  memo: string;
  voidReason: string;
  lines: { account: string; description: string; debit: number; credit: number }[];
  totalDebits: number;
  totalCredits: number;
  stamp: DocStamp | null;
  share: ShareableDocument;
}

export function journalEntryDocument(entry: JournalEntry, company: DocCompany): JournalEntryDocument {
  return {
    company,
    reference: entry.reference,
    date: docDate(entry.date),
    status: entry.status,
    memo: entry.memo,
    voidReason: entry.status === 'void' ? entry.voidReason : '',
    lines: entry.lines.map((l) => ({
      account: l.accountNumber ? `${l.accountNumber} · ${l.accountName}` : l.accountName || '—',
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })),
    totalDebits: entry.totalDebits,
    totalCredits: entry.totalCredits,
    stamp: stampFor(entry.status),
    share: {
      kind: 'Journal entry',
      number: entry.reference || undefined,
      amount: entry.totalDebits,
      amountLabel: 'Total',
      companyName: company.name,
    },
  };
}
