// ═══════════════════════════════════════════════════════
// FinMatrix Web — Records → documents
// ═══════════════════════════════════════════════════════
// One builder per document type. Pure: the page supplies the record, the
// letterhead and (when it has loaded) the other party's details.

import {
  docDate,
  partyForDocument,
  stampFor,
  type DocCompany,
  type DocLine,
  type DocTotal,
  type DocumentModel,
  type PartySource,
} from '@/features/documents/documentModel';
import type { Bill } from '@/models/bill';
import type { CreditMemo } from '@/models/creditMemo';
import { PAYMENT_TERMS_OPTIONS, type Customer } from '@/models/customer';
import type { DiscountType } from '@/models/document';
import type { Estimate } from '@/models/estimate';
import type { Invoice } from '@/models/invoice';
import type { PurchaseOrder } from '@/models/purchaseOrder';
import type { SalesOrder } from '@/models/salesOrder';
import type { Vendor } from '@/models/vendor';
import type { VendorCredit } from '@/models/vendorCredit';
import type { DocumentLine } from '@/serializers/documentLines';

export const customerPartySource = (c: Customer | null | undefined): PartySource | null =>
  c
    ? {
        name: c.name,
        company: c.company,
        contactPerson: c.contactPerson,
        email: c.email,
        phone: c.phone,
        address: c.billingAddress,
        taxId: c.taxId,
      }
    : null;

export const vendorPartySource = (v: Vendor | null | undefined): PartySource | null =>
  v
    ? {
        name: v.name,
        contactPerson: v.contactPerson,
        email: v.email,
        phone: v.phone,
        address: v.address,
        taxId: v.taxId,
      }
    : null;

const termsLabel = (terms: string | undefined): string =>
  PAYMENT_TERMS_OPTIONS.find((o) => o.value === terms)?.label ?? '';

type Meta = { label: string; value: string };
const meta = (...rows: Array<Meta | null | false>): Meta[] =>
  rows.filter((r): r is Meta => !!r && r.value.trim().length > 0);

const pricedLine = (l: DocumentLine): DocLine => ({
  description: l.description || l.itemName || '—',
  secondary: l.itemName && l.itemName !== l.description ? l.itemName : undefined,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  taxRate: l.taxRate,
  amount: l.amount,
});

const discountRows = (type: DiscountType, value: number, amount: number): DocTotal[] =>
  amount > 0
    ? [
        {
          label: type === 'percent' ? `Discount (${value}%)` : 'Discount',
          value: amount,
          prefix: '− ',
          tone: 'success',
        },
      ]
    : [];

const subtotalRows = (subtotal: number, tax: number, discount: DocTotal[] = []): DocTotal[] => [
  { label: 'Subtotal', value: subtotal },
  ...discount,
  { label: 'Tax', value: tax },
];

// ─── Sales side ─────────────────────────────────────────

export function invoiceDocument(inv: Invoice, company: DocCompany, customer?: Customer | null): DocumentModel {
  const party = partyForDocument('Bill to', inv.customerName, customerPartySource(customer));
  const owing = inv.balance > 0 && inv.status !== 'void';
  return {
    kind: 'Invoice',
    number: inv.invoiceNumber,
    company,
    party,
    meta: meta(
      { label: 'Invoice #', value: inv.invoiceNumber },
      { label: 'Issue date', value: docDate(inv.issueDate) },
      { label: 'Due date', value: docDate(inv.dueDate) },
      { label: 'Terms', value: termsLabel(customer?.paymentTerms) },
    ),
    showQuantity: true,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines: inv.lines.map(pricedLine),
    totals: [
      ...subtotalRows(inv.subtotal, inv.taxAmount, discountRows(inv.discountType, inv.discountValue, inv.discountAmount)),
      { label: 'Total', value: inv.total, strong: true, dividerBefore: true },
      { label: 'Amount paid', value: inv.amountPaid, tone: 'success' },
      { label: 'Balance due', value: inv.balance, grand: true, tone: owing ? 'danger' : 'success' },
    ],
    notes: [{ title: 'Notes', text: inv.notes }],
    signatures: [],
    stamp: stampFor(inv.status),
    share: {
      kind: 'Invoice',
      number: inv.invoiceNumber,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: owing ? inv.balance : inv.total,
      amountLabel: owing ? 'Amount due' : 'Total',
      dueDate: owing ? docDate(inv.dueDate) : undefined,
      companyName: company.name,
    },
  };
}

export function estimateDocument(est: Estimate, company: DocCompany, customer?: Customer | null): DocumentModel {
  const party = partyForDocument('Quote for', est.customerName, customerPartySource(customer));
  return {
    kind: 'Estimate',
    number: est.estimateNumber,
    company,
    party,
    meta: meta(
      { label: 'Estimate #', value: est.estimateNumber },
      { label: 'Date', value: docDate(est.estimateDate) },
      { label: 'Valid until', value: docDate(est.expiryDate) },
    ),
    showQuantity: true,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines: est.lines.map(pricedLine),
    totals: [
      ...subtotalRows(est.subtotal, est.taxAmount, discountRows(est.discountType, est.discountValue, est.discountAmount)),
      { label: 'Total', value: est.total, grand: true, dividerBefore: true },
    ],
    notes: [{ title: 'Notes', text: est.notes }],
    signatures: [],
    stamp: stampFor(est.status),
    share: {
      kind: 'Estimate',
      number: est.estimateNumber,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: est.total,
      amountLabel: 'Total',
      dueDate: est.expiryDate ? `valid until ${docDate(est.expiryDate)}` : undefined,
      companyName: company.name,
    },
  };
}

export function salesOrderDocument(so: SalesOrder, company: DocCompany, customer?: Customer | null): DocumentModel {
  const party = partyForDocument('Order for', so.customerName, customerPartySource(customer));
  return {
    kind: 'Sales order',
    number: so.orderNumber,
    company,
    party,
    meta: meta(
      { label: 'Order #', value: so.orderNumber },
      { label: 'Order date', value: docDate(so.orderDate) },
      { label: 'Expected', value: docDate(so.expectedDate) },
    ),
    showQuantity: true,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines: so.lines.map(pricedLine),
    totals: [
      ...subtotalRows(so.subtotal, so.taxAmount, discountRows(so.discountType, so.discountValue, so.discountAmount)),
      { label: 'Total', value: so.total, grand: true, dividerBefore: true },
    ],
    notes: [{ title: 'Notes', text: so.notes }],
    signatures: [],
    stamp: stampFor(so.status),
    share: {
      kind: 'Sales order',
      number: so.orderNumber,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: so.total,
      amountLabel: 'Total',
      companyName: company.name,
    },
  };
}

export function creditMemoDocument(cm: CreditMemo, company: DocCompany, customer?: Customer | null): DocumentModel {
  const party = partyForDocument('Credit for', cm.customerName, customerPartySource(customer));
  return {
    kind: 'Credit memo',
    number: cm.creditMemoNumber,
    company,
    party,
    meta: meta(
      { label: 'Credit memo #', value: cm.creditMemoNumber },
      { label: 'Date', value: docDate(cm.date) },
    ),
    showQuantity: true,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines: cm.lines.map(pricedLine),
    totals: [
      ...subtotalRows(cm.subtotal, cm.taxAmount),
      { label: 'Total credit', value: cm.total, strong: true, dividerBefore: true },
      { label: 'Applied', value: cm.amountApplied },
      { label: 'Available', value: cm.balance, grand: true, tone: cm.balance > 0 ? 'success' : undefined },
    ],
    notes: [{ title: 'Reason', text: cm.reason }],
    signatures: [],
    stamp: stampFor(cm.status),
    share: {
      kind: 'Credit memo',
      number: cm.creditMemoNumber,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: cm.total,
      amountLabel: 'Credit',
      companyName: company.name,
    },
  };
}

// ─── Purchase side ──────────────────────────────────────

export function purchaseOrderDocument(po: PurchaseOrder, company: DocCompany, vendor?: Vendor | null): DocumentModel {
  const party = partyForDocument('Vendor', po.vendorName, vendorPartySource(vendor));
  return {
    kind: 'Purchase order',
    number: po.poNumber,
    company,
    party,
    meta: meta(
      { label: 'PO #', value: po.poNumber },
      { label: 'Order date', value: docDate(po.orderDate) },
      { label: 'Expected delivery', value: docDate(po.expectedDate) },
      { label: 'Terms', value: termsLabel(vendor?.paymentTerms) },
    ),
    showQuantity: true,
    quantityHeader: 'Qty',
    priceHeader: 'Unit cost',
    lines: po.lines.map(pricedLine),
    totals: [
      ...subtotalRows(po.subtotal, po.taxAmount),
      { label: 'Total', value: po.total, grand: true, dividerBefore: true },
    ],
    notes: [{ title: 'Notes', text: po.notes }],
    signatures: ['Prepared by', 'Authorised signature'],
    stamp: stampFor(po.status),
    share: {
      kind: 'Purchase order',
      number: po.poNumber,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: po.total,
      amountLabel: 'Order total',
      dueDate: po.expectedDate ? `delivery expected ${docDate(po.expectedDate)}` : undefined,
      companyName: company.name,
    },
  };
}

export function billDocument(bill: Bill, company: DocCompany, vendor?: Vendor | null): DocumentModel {
  const party = partyForDocument('From', bill.vendorName, vendorPartySource(vendor));
  const owing = bill.balance > 0 && bill.status !== 'void';
  return {
    kind: 'Bill',
    number: bill.billNumber,
    company,
    party,
    meta: meta(
      { label: 'Bill #', value: bill.billNumber },
      { label: 'Bill date', value: docDate(bill.issueDate) },
      { label: 'Due date', value: docDate(bill.dueDate) },
    ),
    showQuantity: false,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines: bill.lines.map((l) => ({
      description: l.description || l.accountName || '—',
      secondary: l.accountName && l.accountName !== l.description ? l.accountName : undefined,
      quantity: null,
      unitPrice: null,
      taxRate: l.taxRate,
      amount: l.amount,
    })),
    totals: [
      ...subtotalRows(bill.subtotal, bill.taxAmount),
      { label: 'Total', value: bill.total, strong: true, dividerBefore: true },
      { label: 'Amount paid', value: bill.amountPaid, tone: 'success' },
      { label: 'Balance due', value: bill.balance, grand: true, tone: owing ? 'danger' : 'success' },
    ],
    notes: [{ title: 'Memo', text: bill.notes }],
    signatures: ['Checked by', 'Approved for payment'],
    stamp: stampFor(bill.status),
    share: {
      kind: 'Bill',
      number: bill.billNumber,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: owing ? bill.balance : bill.total,
      amountLabel: owing ? 'Balance due' : 'Total',
      dueDate: owing ? docDate(bill.dueDate) : undefined,
      companyName: company.name,
    },
  };
}

export function vendorCreditDocument(vc: VendorCredit, company: DocCompany, vendor?: Vendor | null): DocumentModel {
  const party = partyForDocument('Credit from', vc.vendorName, vendorPartySource(vendor));
  return {
    kind: 'Vendor credit',
    number: vc.vendorCreditNumber,
    company,
    party,
    meta: meta(
      { label: 'Vendor credit #', value: vc.vendorCreditNumber },
      { label: 'Date', value: docDate(vc.date) },
    ),
    showQuantity: false,
    quantityHeader: 'Qty',
    priceHeader: 'Rate',
    lines: vc.lines.map((l) => ({
      description: l.description || l.itemName || '—',
      secondary: [l.itemName && l.itemName !== l.description ? l.itemName : '', l.itemId && l.quantity ? `Qty ${l.quantity}` : '']
        .filter(Boolean)
        .join(' · ') || undefined,
      quantity: null,
      unitPrice: null,
      taxRate: l.taxRate,
      amount: l.amount,
    })),
    totals: [
      ...subtotalRows(vc.subtotal, vc.taxAmount),
      { label: 'Total credit', value: vc.total, strong: true, dividerBefore: true },
      { label: 'Applied', value: vc.amountApplied },
      { label: 'Available', value: vc.balance, grand: true, tone: vc.balance > 0 ? 'success' : undefined },
    ],
    notes: [{ title: 'Reason', text: vc.reason }],
    signatures: [],
    stamp: stampFor(vc.status),
    share: {
      kind: 'Vendor credit',
      number: vc.vendorCreditNumber,
      partyName: party.name,
      partyEmail: party.email,
      partyPhone: party.phone,
      amount: vc.total,
      amountLabel: 'Credit',
      companyName: company.name,
    },
  };
}
