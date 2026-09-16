// ═══════════════════════════════════════════════════════
// FinMatrix Web — Invoice model
// ═══════════════════════════════════════════════════════
// The generic document machinery — lines, totals, tax options, date helpers —
// lives in models/document.ts and is shared with estimates and sales orders.
// It is re-exported here so existing imports keep working.

export {
  addDays,
  computeTotals,
  DISCOUNT_TYPE_OPTIONS,
  freshLine,
  isoDate,
  isoToday,
  lineAmountOf,
  TAX_OPTIONS,
  validateLines,
  validateSalesLineKinds,
  type DiscountType,
  type DocumentTotals,
  type FormLineItem,
} from '@/models/document';

import type { DiscountType, FormLineItem } from '@/models/document';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'void';

export interface InvoiceLine {
  id: string;
  itemId: string;
  itemName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** A percentage, e.g. 17 means 17%. */
  taxRate: number;
  /** qty × unitPrice. Tax is NOT included. */
  amount: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  /** The wire calls this `invoiceDate`. */
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  subtotal: number;
  taxAmount: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceFormData {
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  lines: FormLineItem[];
  discountType: DiscountType;
  discountValue: string;
  notes: string;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

/** Only drafts are editable — anything else is 400 CANNOT_EDIT_POSTED. */
export const isEditable = (status: InvoiceStatus): boolean => status === 'draft';
