// ═══════════════════════════════════════════════════════
// FinMatrix Web — Approvals model (maker-checker)
// ═══════════════════════════════════════════════════════
// A staff member's request for something only the owner may do. The request
// does NOTHING until approved: its `payload` is the untouched request body, and
// approving replays it against the owning service — the same code path an
// owner's own action takes, so both produce identical accounting.
//
// Two things the row does not carry, and this module derives: an AMOUNT (it
// lives inside the type-specific payload, and for some types there is none) and
// the requester's NAME (only `requestedBy`, a user id).

import { computeBillTotals } from '@/models/bill';
import { computeTotals, type DiscountType } from '@/models/document';
import { Decimal, toDecimal } from '@/utils/money';

/** The eleven things that can be sent for approval — the backend's own union. */
export type ApprovalType =
  | 'adjustment'
  | 'journal'
  | 'credit_memo'
  | 'vendor_credit'
  | 'void'
  | 'bill_payment'
  | 'po'
  | 'invoice'
  | 'invoice_payment'
  | 'delivery_undo'
  | 'delivery_advance';

export const APPROVAL_TYPES: readonly ApprovalType[] = [
  'invoice',
  'invoice_payment',
  'credit_memo',
  'bill_payment',
  'vendor_credit',
  'po',
  'journal',
  'void',
  'adjustment',
  'delivery_undo',
  'delivery_advance',
];

/**
 * `approving` is a claim held only while the server replays the payload. A row
 * seen sitting in it was stranded mid-post — the work MAY have gone through —
 * which is why the server refuses to decide it again (409 APPROVAL_INTERRUPTED).
 */
export type ApprovalStatus = 'pending' | 'approving' | 'approved' | 'rejected' | 'cancelled';

/** What `GET /approvals?status=` accepts. `approving` is folded under `pending`. */
export type ApprovalFilter = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all';

export interface ApprovalRequest {
  id: string;
  companyId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  /** The original request body, replayed verbatim on approval. */
  payload: Record<string, unknown>;
  /** One-line inbox text, built when the request was filed. */
  summary: string;
  /** Why the requester asked. Required for a delivery undo. */
  reason: string | null;
  requestedBy: string;
  reviewedBy: string | null;
  reviewerRole: string | null;
  reviewedAt: string | null;
  /** The field is `reviewerComment` — sent as `comment` on decide. */
  reviewerComment: string | null;
  journalEntryId: string | null;
  /** The document the approval created — invoice, payment, PO, … */
  resultId: string | null;
  /** Why the last approval attempt failed: a closed period, a since-paid bill. */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  invoice: 'Invoice',
  invoice_payment: 'Customer payment',
  bill_payment: 'Bill payment',
  credit_memo: 'Credit memo',
  vendor_credit: 'Vendor credit',
  journal: 'Journal entry',
  adjustment: 'Inventory adjustment',
  po: 'Purchase order',
  void: 'Void',
  delivery_undo: 'Undo delivery',
  delivery_advance: 'Delivery with advance',
};

/** One line explaining what approving a request actually does to the books. */
export const APPROVAL_TYPE_EFFECTS: Record<ApprovalType, string> = {
  invoice: 'Creates the invoice and recognises the sale.',
  invoice_payment: 'Banks the receipt and clears the invoice balance.',
  bill_payment: 'Pays the vendor and reduces cash.',
  credit_memo: 'Issues a credit against the customer.',
  vendor_credit: 'Records a credit from the vendor.',
  journal: 'Posts the entry to the ledger.',
  adjustment: 'Changes stock on hand and its value.',
  po: 'Creates the purchase order. It posts nothing to the ledger.',
  void: 'Reverses the original transaction with a balancing entry.',
  delivery_undo: 'Reverses recognised delivery revenue.',
  delivery_advance:
    'Creates the delivery and records the advance as a cash receipt, held in Customer Advances until the delivery is approved.',
};

export const APPROVAL_FILTERS: readonly [ApprovalFilter, string][] = [
  ['pending', 'Awaiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Withdrawn'],
  ['all', 'All'],
];

// ─── Status ─────────────────────────────────────────────────────────────────

/** The badge colour key and the words shown for a status. */
export const statusDisplay = (status: ApprovalStatus): { badge: string; label: string } => {
  switch (status) {
    case 'pending':
      return { badge: 'pending', label: 'Awaiting owner' };
    case 'approving':
      // Not mapped by theme/status.ts; shown as a warning, because a row seen in
      // this state was interrupted while posting.
      return { badge: 'pending', label: 'Interrupted' };
    case 'approved':
      return { badge: 'approved', label: 'Approved' };
    case 'rejected':
      return { badge: 'rejected', label: 'Rejected' };
    case 'cancelled':
      return { badge: 'cancelled', label: 'Withdrawn' };
  }
};

/**
 * Whether this viewer may approve or reject this request.
 *
 * All three conditions are the server's: deciding is owner-only, only a
 * `pending` row can be decided (`approving` answers 409), and nobody approves
 * their own request (403 MAKER_IS_CHECKER) — the second pair of eyes is the
 * entire control.
 */
export const canDecide = (
  request: Pick<ApprovalRequest, 'status' | 'requestedBy'>,
  viewerId: string | null | undefined,
  decideAllowed: boolean,
): boolean =>
  decideAllowed && request.status === 'pending' && !!viewerId && request.requestedBy !== viewerId;

/** Only the requester can withdraw, and only while it is still pending. */
export const canWithdraw = (
  request: Pick<ApprovalRequest, 'status' | 'requestedBy'>,
  viewerId: string | null | undefined,
): boolean => request.status === 'pending' && !!viewerId && request.requestedBy === viewerId;

// ─── Amount ─────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(asRaw) : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

const discountTypeOf = (v: unknown): DiscountType =>
  v === 'percent' || v === 'amount' ? v : 'none';

const sum = (values: unknown[]): number =>
  values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v as never)), new Decimal(0)).toNumber();

/**
 * The money a request moves, derived from its payload — or null when the
 * request is not about an amount of money at all.
 *
 * Every figure is computed by the helper that already prices that document on
 * its own form, so the inbox and the form can never disagree:
 *
 *   invoice, credit memo    computeTotals over quantity × unitPrice + tax − discount
 *   purchase order          computeTotals over orderedQty × unitCost + tax
 *   vendor credit           computeBillTotals over net amount + tax
 *   customer payment        the amount received
 *   bill payment            Σ applications — the DTO has no top-level amount
 *   journal entry           Σ debits (= Σ credits on a balanced entry)
 *   apply actions           the amount being applied
 *
 * Null for voids, adjustments, delivery undos, refunds and "post this draft":
 * each either reverses an existing document or moves quantity rather than a
 * figure the payload states. A null is rendered "—", never 0.
 */
export const approvalAmount = (request: Pick<ApprovalRequest, 'type' | 'payload'>): number | null => {
  const p = request.payload;
  const action = text(p.action) || 'create';

  switch (request.type) {
    case 'invoice': {
      const lines = rows(p.lines);
      if (lines.length === 0) return null;
      return computeTotals(
        lines.map((l) => ({ quantity: l.quantity as never, unitPrice: l.unitPrice as never, taxRate: (l.taxRate ?? 0) as never })),
        discountTypeOf(p.discountType),
        (p.discountValue ?? 0) as never,
      ).total;
    }
    case 'credit_memo': {
      if (action === 'apply') return p.amount === undefined ? null : toDecimal(p.amount as never).toNumber();
      if (action === 'refund') return null;
      const lines = rows(p.lines);
      if (lines.length === 0) return null;
      return computeTotals(
        lines.map((l) => ({ quantity: l.quantity as never, unitPrice: l.unitPrice as never, taxRate: (l.taxRate ?? 0) as never })),
        discountTypeOf(p.discountType),
        (p.discountValue ?? 0) as never,
      ).total;
    }
    case 'po': {
      const lines = rows(p.lines);
      if (lines.length === 0) return null;
      return computeTotals(
        lines.map((l) => ({ quantity: l.orderedQty as never, unitPrice: l.unitCost as never, taxRate: (l.taxRate ?? 0) as never })),
        'none',
        0,
      ).total;
    }
    case 'vendor_credit': {
      if (action === 'apply') return p.amount === undefined ? null : toDecimal(p.amount as never).toNumber();
      const lines = rows(p.lines);
      if (lines.length === 0) return null;
      return computeBillTotals(
        lines.map((l) => ({ amount: l.amount as never, taxRate: (l.taxRate ?? 0) as never })),
      ).total;
    }
    case 'invoice_payment':
      return p.amount === undefined ? null : toDecimal(p.amount as never).toNumber();
    case 'bill_payment': {
      const apps = rows(p.applications);
      return apps.length === 0 ? null : sum(apps.map((a) => a.amount));
    }
    case 'journal': {
      if (p.draftEntryId) return null;
      const lines = rows(p.lines);
      return lines.length === 0 ? null : sum(lines.map((l) => l.debit));
    }
    case 'delivery_advance': {
      // The cash coming in now: the amount given, or the whole order when the
      // request only says it is prepaid.
      if (p.advanceAmount !== undefined && text(p.advanceAmount) !== '') {
        return toDecimal(p.advanceAmount as never).toNumber();
      }
      if (p.prePaid !== true) return null;
      const items = rows(p.items);
      if (items.length === 0) return null;
      return computeTotals(
        items.map((l) => ({ quantity: l.orderedQty as never, unitPrice: (l.unitPrice ?? 0) as never, taxRate: (l.taxRate ?? 0) as never })),
        'none',
        0,
      ).total;
    }
    case 'void':
    case 'adjustment':
    case 'delivery_undo':
      return null;
  }
};

/** The customer or vendor a request concerns, when its payload names one. */
export const approvalCounterparty = (
  request: Pick<ApprovalRequest, 'type' | 'payload'>,
): { kind: 'customer' | 'vendor'; id: string } | null => {
  const p = request.payload;
  const customerId = text(p.customerId);
  const vendorId = text(p.vendorId);
  switch (request.type) {
    case 'invoice':
    case 'invoice_payment':
    case 'credit_memo':
    case 'delivery_advance':
      return customerId ? { kind: 'customer', id: customerId } : null;
    case 'bill_payment':
    case 'po':
    case 'vendor_credit':
      return vendorId ? { kind: 'vendor', id: vendorId } : null;
    default:
      return null;
  }
};

// ─── Links ──────────────────────────────────────────────────────────────────

const VOID_TARGET_ROUTES: Record<string, string> = {
  invoice: '/invoices',
  journal: '/journal-entries',
  credit_memo: '/credit-memos',
  vendor_credit: '/vendor-credits',
};

/** The document a void request would reverse, if the web app has a page for it. */
export const voidTargetLink = (payload: Raw): string | null => {
  const base = VOID_TARGET_ROUTES[text(payload.entity)];
  const id = text(payload.targetId);
  return base && id ? `${base}/${id}` : null;
};

const RESULT_ROUTES: Partial<Record<ApprovalType, string>> = {
  invoice: '/invoices',
  invoice_payment: '/payments',
  po: '/purchase-orders',
  credit_memo: '/credit-memos',
  vendor_credit: '/vendor-credits',
  journal: '/journal-entries',
  delivery_advance: '/deliveries',
};

/**
 * Where to see what an approval produced. Only once it is approved — before
 * that, nothing exists to link to. Falls back to the journal entry it posted
 * when the created document has no page of its own (a bill payment).
 */
export const resultLink = (
  request: Pick<ApprovalRequest, 'type' | 'status' | 'payload' | 'resultId' | 'journalEntryId'>,
): { to: string; label: string } | null => {
  if (request.status !== 'approved') return null;
  if (request.type === 'void') {
    const to = voidTargetLink(request.payload);
    return to ? { to, label: 'Open the reversed document' } : null;
  }
  const base = RESULT_ROUTES[request.type];
  if (base && request.resultId) {
    return { to: `${base}/${request.resultId}`, label: `Open the ${APPROVAL_TYPE_LABELS[request.type].toLowerCase()}` };
  }
  if (request.journalEntryId) {
    return { to: `/journal-entries/${request.journalEntryId}`, label: 'Open the journal entry it posted' };
  }
  return null;
};

// ─── Cache invalidation ─────────────────────────────────────────────────────

/** Everything any approval can move: the queue itself, and the ledger readers. */
const BASE_KEYS: string[][] = [
  ['approvals'],
  ['dashboard'],
  ['reports'],
  ['accounts'],
  ['journal-entries'],
  ['tax'],
  ['reconciliations'],
];

const TYPE_KEYS: Record<ApprovalType, string[][]> = {
  invoice: [['invoices'], ['customers']],
  invoice_payment: [['payments'], ['invoices'], ['customers']],
  bill_payment: [['bills'], ['vendors']],
  po: [['purchase-orders']],
  credit_memo: [['credit-memos'], ['invoices'], ['customers'], ['payments']],
  vendor_credit: [['vendor-credits'], ['bills'], ['vendors']],
  journal: [],
  void: [['invoices'], ['credit-memos'], ['vendor-credits'], ['inventory'], ['customers'], ['vendors']],
  adjustment: [['inventory']],
  delivery_undo: [['inventory'], ['invoices']],
  delivery_advance: [['deliveries'], ['delivery-personnel'], ['inventory'], ['sales-orders'], ['payments'], ['customers']],
};

/**
 * The query keys to invalidate after deciding a request of this type.
 *
 * Approving posts server-side, so every screen showing what it touched is stale
 * — including the reports, which nothing invalidated before. `['approvals']`
 * also covers the pending-count badge.
 */
export const invalidationKeysFor = (type: ApprovalType): string[][] => [
  ...BASE_KEYS,
  ...TYPE_KEYS[type],
];
