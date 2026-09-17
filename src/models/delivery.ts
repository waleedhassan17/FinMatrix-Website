// ═══════════════════════════════════════════════════════
// FinMatrix Web — Delivery model
// ═══════════════════════════════════════════════════════
// Pure: types, the status machine, validation, and the capability split.
//
// The ledger story every screen here has to tell correctly:
//
//   ASSIGN     Dispatch. A Sales Order is raised and the stock moves to Goods
//              in Transit (Dr 1250 / Cr 1200). Staff do this directly.
//   REJECT     The rider could not complete it. Stock comes back (Dr 1200 /
//              Cr 1250) and NO sale is recognised. Staff may do this directly.
//   ADVANCE    Money the customer paid before dispatch, fully or in part: a
//              receipt held in Customer Advances (Dr Cash / Cr 2400). The owner
//              records it with the delivery; staff send the delivery for
//              approval, and nothing exists until it is approved.
//   APPROVE    The sale: Dr A/R / Cr Sales / Cr Tax, settled from what was paid
//              — the advance (Dr 2400 / Cr A/R), the rider's cash (Dr Cash /
//              Cr A/R), the rest left in A/R — then Dr COGS / Cr Goods in
//              Transit. The largest ledger event in the product — the OWNER's
//              signature alone.
//   UNDO       Reverses that recognised revenue. Owner direct; staff ask.
//
// Pushing a delivery to `delivered` through the status endpoint recognises
// nothing, so this console never offers it: completion goes through approval.

import { taxPercentError } from '@/models/taxRate';
import type { UserRole } from '@/types';
import { capabilityFor, type CapabilityOutcome } from '@/utils/capabilities';
import { Decimal, toDecimal } from '@/utils/money';
import { generatePassword } from '@/utils/password';

// ─── Status machine ─────────────────────────────────────

export type DeliveryStatus =
  | 'unassigned'
  | 'pending'
  | 'picked_up'
  | 'in_transit'
  | 'arrived'
  | 'delivered'
  | 'failed'
  | 'returned'
  | 'cancelled';

export type DeliveryPriority = 'low' | 'normal' | 'medium' | 'high' | 'urgent';

/**
 * `pending` is the server's word for "assigned, not yet picked up" — a rider
 * has it and the stock is already in transit. "Pending" on a screen reads as
 * "nothing has happened yet", which is wrong, so the label says Assigned.
 */
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  unassigned: 'Unassigned',
  pending: 'Assigned',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  arrived: 'Arrived',
  delivered: 'Delivered',
  failed: 'Failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export const DELIVERY_STATUSES = Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[];

/** On the road: assigned, and not yet finished one way or another. */
export const ACTIVE_STATUSES: readonly DeliveryStatus[] = [
  'pending',
  'picked_up',
  'in_transit',
  'arrived',
];

export const PRIORITY_OPTIONS: ReadonlyArray<{ value: DeliveryPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** Mirror of the server's LEGAL_TRANSITIONS (deliveries.service.ts). */
export const LEGAL_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  unassigned: ['pending', 'cancelled'],
  pending: ['picked_up', 'cancelled', 'failed'],
  picked_up: ['in_transit', 'cancelled', 'failed', 'returned'],
  in_transit: ['arrived', 'cancelled', 'failed', 'returned'],
  arrived: ['delivered', 'cancelled', 'failed', 'returned'],
  delivered: [],
  failed: [],
  returned: [],
  cancelled: [],
};

export type OperatorAction = 'cancelled' | 'failed' | 'returned';

/**
 * What the office may do to a delivery's status from here.
 *
 * Only the three that END a delivery without a sale — each of which gives the
 * stock back (releaseOnReject). Progressing a delivery is the rider's job, and
 * `delivered` is never offered: it recognises nothing on its own, so marking it
 * would show a finished delivery with no sale behind it.
 */
export const operatorActions = (status: DeliveryStatus): OperatorAction[] =>
  LEGAL_TRANSITIONS[status].filter(
    (s): s is OperatorAction => s === 'cancelled' || s === 'failed' || s === 'returned',
  );

export const OPERATOR_ACTION_COPY: Record<
  OperatorAction,
  { label: string; title: string; confirm: string }
> = {
  cancelled: { label: 'Cancel delivery', title: 'Cancel this delivery?', confirm: 'Cancel delivery' },
  failed: { label: 'Mark failed', title: 'Mark this delivery failed?', confirm: 'Mark failed' },
  returned: { label: 'Mark returned', title: 'Mark this delivery returned?', confirm: 'Mark returned' },
};

// ─── Payment ────────────────────────────────────────────

/**
 * How much of a delivery's sale is paid. Before approval it is the rider's
 * answer; once approved it is always what the invoice says.
 */
export type PaidStatus = 'paid' | 'partial' | 'unpaid';

export const PAID_STATUS_LABELS: Record<PaidStatus, string> = {
  paid: 'Paid',
  partial: 'Part paid',
  unpaid: 'Not paid',
};

// ─── Deliveries ─────────────────────────────────────────

export interface DeliveryLine {
  id: string;
  itemId: string;
  itemName: string;
  orderedQty: number;
  deliveredQty: number;
  returnedQty: number;
  unitPrice: number;
  taxRate: number;
}

export interface Delivery {
  id: string;
  referenceNo: string;
  customerId: string;
  customerName: string;
  zone: string;
  address: string;
  destLat: number | null;
  destLng: number | null;
  personnelId: string | null;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  preferredDate: string;
  preferredTimeSlot: string;
  assignedAt: string;
  completedAt: string;
  notes: string;
  cancelReason: string;
  paidStatus: PaidStatus | null;
  /** Paid for in full before dispatch. */
  prepaid: boolean;
  /** Paid before dispatch, fully or in part. Zero when nothing was. */
  advanceAmount: number;
  /** The receipt holding the advance; null on older prepaid deliveries. */
  advancePaymentId: string | null;
  /** Cash taken at the door — the rider's figure, final once approved. */
  amountCollected: number | null;
  salesOrderId: string | null;
  invoiceId: string | null;
  /** `in_transit` once dispatched; `committed` once the sale is recognised. */
  ledgerStatus: string;
  createdAt: string;
  lines: DeliveryLine[];
}

export interface DeliveryHistoryEntry {
  id: string;
  status: DeliveryStatus;
  timestamp: string;
  notes: string;
  changedBy: string;
}

export interface DeliveryIssue {
  id: string;
  issueType: string;
  notes: string;
  reportedAt: string;
  reportedBy: string;
}

/** True once assignment has moved the stock into Goods in Transit. */
export const isDispatched = (d: Pick<Delivery, 'ledgerStatus'>): boolean =>
  d.ledgerStatus === 'in_transit';

/** Gross value of what was ordered, tax included. */
export const deliveryValue = (lines: Pick<DeliveryLine, 'orderedQty' | 'unitPrice' | 'taxRate'>[]) =>
  lines
    .reduce((sum, l) => {
      const base = toDecimal(l.orderedQty).times(toDecimal(l.unitPrice));
      return sum.plus(base).plus(base.times(toDecimal(l.taxRate)).dividedBy(100));
    }, new Decimal(0))
    .toDecimalPlaces(2);

/** `11 Sept 2026, 14:05` — for status history and submissions, where the time matters. */
export const formatWhen = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

/** A Google Maps link — the monitor has no map of its own, and neither has the app. */
export const mapsLink = (
  point: { lat: number | null; lng: number | null } | null | undefined,
  address?: string,
): string | null => {
  if (point && point.lat !== null && point.lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
  }
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
};

// ─── Create form ────────────────────────────────────────

export interface DeliveryLineDraft {
  key: string;
  itemId: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

/** What the customer has paid when the delivery is created. */
export type AdvanceChoice = 'none' | 'full' | 'part';

export const ADVANCE_OPTIONS: ReadonlyArray<{ value: AdvanceChoice; label: string }> = [
  { value: 'none', label: 'Nothing yet — the rider collects on delivery' },
  { value: 'full', label: 'All of it, before dispatch' },
  { value: 'part', label: 'Part of it, before dispatch' },
];

export interface DeliveryForm {
  customerId: string;
  advance: AdvanceChoice;
  /** Only read when `advance` is 'part'. */
  advanceAmount: string;
  priority: DeliveryPriority;
  preferredDate: string;
  preferredTimeSlot: string;
  notes: string;
  /** Empty = create unassigned. Set = dispatch at creation. */
  personnelId: string;
  lines: DeliveryLineDraft[];
}

let lineSeq = 0;
export const newLineDraft = (): DeliveryLineDraft => ({
  key: `line-${++lineSeq}`,
  itemId: '',
  quantity: '1',
  unitPrice: '',
  taxRate: '0',
});

export const emptyDeliveryForm = (): DeliveryForm => ({
  customerId: '',
  advance: 'none',
  advanceAmount: '',
  priority: 'normal',
  preferredDate: '',
  preferredTimeSlot: '',
  notes: '',
  personnelId: '',
  lines: [newLineDraft()],
});

export interface StockInfo {
  name: string;
  quantityOnHand: number;
}

export interface DeliveryErrors {
  customerId?: string;
  advanceAmount?: string;
  lines?: string;
  line: Record<string, { itemId?: string; quantity?: string; unitPrice?: string; taxRate?: string }>;
}

const WHOLE = /^\d+$/;
const PRICE = /^\d+(\.\d{1,2})?$/;
const clean = (v: string) => v.replace(/[,\s]/g, '');

export const hasDeliveryErrors = (e: DeliveryErrors): boolean =>
  !!e.customerId || !!e.advanceAmount || !!e.lines || Object.keys(e.line).length > 0;

/**
 * Client-side mirror of what the server will refuse:
 *   - whole units only, at least one (DeliveryItemDto @IsInt @Min(1));
 *   - no more than is on the shelf (assertStockAvailable, before anything is
 *     written);
 *   - a selling price above zero — approval later refuses a delivery with no
 *     price anywhere on it, and by then the stock has already travelled.
 */
export const validateDelivery = (
  form: DeliveryForm,
  stock: Map<string, StockInfo>,
): DeliveryErrors => {
  const e: DeliveryErrors = { line: {} };
  if (!form.customerId) e.customerId = 'Choose the customer.';

  const filled = form.lines.filter((l) => l.itemId);
  if (filled.length === 0) e.lines = 'Add at least one item.';

  const requested = new Map<string, number>();
  for (const l of filled) {
    const q = clean(l.quantity);
    if (WHOLE.test(q)) requested.set(l.itemId, (requested.get(l.itemId) ?? 0) + Number(q));
  }

  const seen = new Set<string>();
  for (const l of form.lines) {
    if (!l.itemId) continue;
    const le: DeliveryErrors['line'][string] = {};
    if (seen.has(l.itemId)) le.itemId = 'This item is already on the delivery — change that line’s quantity.';
    seen.add(l.itemId);

    const q = clean(l.quantity);
    if (!WHOLE.test(q) || Number(q) < 1) {
      le.quantity = 'Whole units, at least 1.';
    } else {
      const info = stock.get(l.itemId);
      const total = requested.get(l.itemId) ?? 0;
      if (info && total > info.quantityOnHand) {
        le.quantity = `Only ${info.quantityOnHand} on hand.`;
      }
    }

    const p = clean(l.unitPrice);
    if (!PRICE.test(p) || !toDecimal(p).greaterThan(0)) le.unitPrice = 'Enter a price above 0.';

    const taxError = taxPercentError(clean(l.taxRate || '0'));
    if (taxError) le.taxRate = taxError;

    if (Object.keys(le).length) e.line[l.key] = le;
  }

  // A part advance is more than nothing and less than the order; the server
  // refuses anything above the order total.
  if (form.advance === 'part') {
    const a = clean(form.advanceAmount);
    const total = toDecimal(draftTotals(form.lines).total);
    if (!PRICE.test(a) || !toDecimal(a).greaterThan(0)) {
      e.advanceAmount = 'Enter the amount paid, above 0.';
    } else if (total.greaterThan(0) && !toDecimal(a).lessThan(total)) {
      e.advanceAmount = 'That is the whole order — choose “All of it” instead.';
    }
  }
  return e;
};

/**
 * The CreateDeliveryDto body.
 *
 * Quantities go as integers and prices as numbers — the DTO transforms and
 * validates them with @IsInt / @IsNumber.
 *
 * An advance goes as `prePaid: true` (the whole order, priced by the server)
 * or `advanceAmount`. It records cash received, so the server takes it from
 * the owner directly and turns a staff member's into a request for the owner.
 */
export const deliveryPayload = (
  form: DeliveryForm,
  customerName: string,
  stock: Map<string, StockInfo>,
) => {
  const body: {
    customerId: string;
    customerName?: string;
    priority: DeliveryPriority;
    preferredDate?: string;
    preferredTimeSlot?: string;
    notes?: string;
    personnelId?: string;
    prePaid?: boolean;
    advanceAmount?: string;
    items: Array<{
      itemId: string;
      itemName?: string;
      orderedQty: number;
      unitPrice: number;
      taxRate: number;
    }>;
  } = {
    customerId: form.customerId,
    priority: form.priority,
    items: form.lines
      .filter((l) => l.itemId)
      .map((l) => ({
        itemId: l.itemId,
        itemName: stock.get(l.itemId)?.name,
        orderedQty: Number(clean(l.quantity)),
        unitPrice: toDecimal(clean(l.unitPrice)).toNumber(),
        taxRate: toDecimal(clean(l.taxRate || '0')).toNumber(),
      })),
  };
  if (customerName) body.customerName = customerName;
  if (form.preferredDate) body.preferredDate = form.preferredDate;
  if (form.preferredTimeSlot.trim()) body.preferredTimeSlot = form.preferredTimeSlot.trim();
  if (form.notes.trim()) body.notes = form.notes.trim();
  if (form.personnelId) body.personnelId = form.personnelId;
  if (form.advance === 'full') body.prePaid = true;
  if (form.advance === 'part') body.advanceAmount = toDecimal(clean(form.advanceAmount)).toFixed(2);
  return body;
};

/** The advance a create form will record, as a number — zero for none. */
export const draftAdvance = (form: Pick<DeliveryForm, 'advance' | 'advanceAmount' | 'lines'>): number => {
  if (form.advance === 'full') return draftTotals(form.lines).total;
  if (form.advance === 'part') {
    const a = clean(form.advanceAmount);
    return PRICE.test(a) ? toDecimal(a).toNumber() : 0;
  }
  return 0;
};

/** Running totals for the create form. Unparseable lines count as zero. */
export const draftTotals = (lines: DeliveryLineDraft[]) => {
  let subtotal = new Decimal(0);
  let tax = new Decimal(0);
  for (const l of lines) {
    if (!l.itemId) continue;
    const q = clean(l.quantity);
    const p = clean(l.unitPrice);
    const t = clean(l.taxRate || '0');
    if (!WHOLE.test(q) || !PRICE.test(p)) continue;
    const base = toDecimal(q).times(toDecimal(p));
    subtotal = subtotal.plus(base);
    if (!taxPercentError(t)) tax = tax.plus(base.times(toDecimal(t)).dividedBy(100));
  }
  return {
    subtotal: subtotal.toDecimalPlaces(2).toNumber(),
    tax: tax.toDecimalPlaces(2).toNumber(),
    total: subtotal.plus(tax).toDecimalPlaces(2).toNumber(),
  };
};

// ─── Riders (delivery personnel) ────────────────────────

/**
 * plan_locked: paused by the SERVER because the plan allows fewer active riders
 * than the company has. The rider cannot sign in or take work until a seat
 * frees up. The owner cannot choose it (it is not in RIDER_STATUS_OPTIONS) —
 * they swap seats by deactivating another rider and activating this one.
 */
export type RiderStatus = 'active' | 'on_leave' | 'inactive' | 'plan_locked';

export interface Rider {
  userId: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  zones: string[];
  maxLoad: number;
  currentLoad: number;
  isAvailable: boolean;
  status: RiderStatus;
  rating: number;
  totalDeliveries: number;
  onTimeRate: number;
  currentLat: number | null;
  currentLng: number | null;
  locationUpdatedAt: string | null;
  createdAt: string;
}

export const RIDER_STATUS_OPTIONS: ReadonlyArray<{ value: RiderStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'inactive', label: 'Inactive' },
];

export const riderLabel = (r: Pick<Rider, 'name' | 'username'> | null | undefined): string =>
  r ? r.name || r.username || 'Rider' : 'Unassigned';

/** The server's own threshold: a location ping in the last two minutes. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export const isRiderOnline = (
  r: Pick<Rider, 'locationUpdatedAt'>,
  now: number = Date.now(),
): boolean =>
  !!r.locationUpdatedAt && now - new Date(r.locationUpdatedAt).getTime() < ONLINE_WINDOW_MS;

/** One word for a badge: why this rider can or cannot take work right now. */
export const riderAvailability = (
  r: Pick<Rider, 'status' | 'isAvailable'>,
): 'available' | 'busy' | 'on_leave' | 'inactive' | 'plan_locked' => {
  if (r.status === 'plan_locked') return 'plan_locked';
  if (r.status === 'inactive') return 'inactive';
  if (r.status === 'on_leave') return 'on_leave';
  return r.isAvailable ? 'available' : 'busy';
};

/** Auto-assign picks from exactly this set: active, available, least loaded first. */
export const canTakeWork = (r: Pick<Rider, 'status' | 'isAvailable'>): boolean =>
  r.status === 'active' && r.isAvailable;

export interface RiderForm {
  name: string;
  username: string;
  password: string;
  phone: string;
  email: string;
  vehicleType: string;
  vehicleNumber: string;
  zones: string;
  maxLoad: string;
}

export const emptyRiderForm = (): RiderForm => ({
  name: '',
  username: '',
  password: '',
  phone: '',
  email: '',
  vehicleType: '',
  vehicleNumber: '',
  zones: '',
  maxLoad: '',
});

/** Same rule as the server's RIDER_USERNAME_REGEX: no '@', so it can never pass for an email. */
export const RIDER_USERNAME = /^[a-z0-9][a-z0-9._-]{2,63}$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseZones = (zones: string): string[] =>
  zones
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);

export const validateRider = (form: RiderForm): Partial<Record<keyof RiderForm, string>> => {
  const e: Partial<Record<keyof RiderForm, string>> = {};
  if (!form.name.trim()) e.name = 'Name is required.';
  const username = form.username.trim().toLowerCase();
  if (!RIDER_USERNAME.test(username)) {
    e.username =
      '3–64 characters: lowercase letters, digits, dot, underscore or hyphen, starting with a letter or digit.';
  }
  if (form.password.length < 8) e.password = 'At least 8 characters.';
  const digits = form.phone.replace(/[^\d]/g, '');
  if (form.phone.trim() && (digits.length < 10 || digits.length > 13)) {
    e.phone = 'Enter a Pakistani number, e.g. 0312 4890176.';
  }
  if (form.email.trim() && !EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.';
  if (form.vehicleType.trim().length > 64) e.vehicleType = '64 characters or fewer.';
  if (form.vehicleNumber.trim().length > 64) e.vehicleNumber = '64 characters or fewer.';
  if (form.maxLoad.trim() && !/^\d+(\.\d{1,2})?$/.test(clean(form.maxLoad))) {
    e.maxLoad = 'Enter a number.';
  }
  return e;
};

/** CreatePersonnelDto. The username is sent lowercased — the regex allows nothing else. */
export const riderPayload = (form: RiderForm) => {
  const body: Record<string, unknown> = {
    username: form.username.trim().toLowerCase(),
    password: form.password,
    name: form.name.trim(),
  };
  if (form.phone.trim()) body.phone = form.phone.replace(/[\s-]/g, '');
  if (form.email.trim()) body.email = form.email.trim();
  if (form.vehicleType.trim()) body.vehicleType = form.vehicleType.trim();
  if (form.vehicleNumber.trim()) body.vehicleNumber = form.vehicleNumber.trim();
  const zones = parseZones(form.zones);
  if (zones.length) body.zones = zones;
  if (form.maxLoad.trim()) body.maxLoad = toDecimal(clean(form.maxLoad)).toString();
  return body;
};

/** Riders get the same kind of password as any hand-issued account — see utils/password. */
export const generateRiderPassword = generatePassword;

// ─── Completions (rider returns awaiting sign-off) ──────

export type CompletionStatus = 'pending' | 'approved' | 'rejected';

export interface CompletionChange {
  itemId: string;
  itemName: string;
  beforeQty: number;
  deliveredQty: number;
  returnedQty: number;
}

export interface Completion {
  id: string;
  deliveryId: string;
  deliveryReference: string;
  personnelId: string;
  personnelName: string;
  submittedAt: string;
  status: CompletionStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerRole: string | null;
  reviewerComment: string;
  reversalCreditMemoId: string | null;
  changes: CompletionChange[];
  proof: {
    signedBy: string;
    billPhotoUri: string;
    billPhotoCapturedAt: string | null;
    verificationMethod: string;
  };
  paidStatus: PaidStatus;
  prepaid: boolean;
  ledgerStatus: string;
  customerId: string | null;
  customerName: string;
  /** What approving will recognise: delivered × price, tax included. */
  saleAmount: number;
  /** Paid before dispatch. */
  advanceAmount: number;
  /** The part of the advance this sale uses (never more than the sale). */
  advanceApplied: number;
  /** What the advance leaves for the door. */
  amountDue: number;
  /** Cash the rider collected — their figure until approval. */
  amountCollected: number;
  /** Left for Accounts Receivable. */
  balanceDue: number;
}

/**
 * How a completion's sale is settled, in the order approval applies it.
 * With `cashCounted` it shows what approving with the owner's own count
 * would record instead of the rider's figure.
 */
export const completionSettlement = (
  c: Pick<Completion, 'saleAmount' | 'advanceApplied' | 'amountDue' | 'amountCollected'>,
  cashCounted?: number,
) => {
  const due = toDecimal(c.amountDue);
  const cash = Decimal.min(Decimal.max(toDecimal(cashCounted ?? c.amountCollected), 0), due);
  const onAccount = due.minus(cash);
  const status: PaidStatus = !onAccount.greaterThan('0.005')
    ? 'paid'
    : cash.greaterThan(0) || toDecimal(c.advanceApplied).greaterThan(0)
      ? 'partial'
      : 'unpaid';
  return {
    advance: toDecimal(c.advanceApplied).toDecimalPlaces(2).toNumber(),
    cash: cash.toDecimalPlaces(2).toNumber(),
    onAccount: onAccount.toDecimalPlaces(2).toNumber(),
    status,
  };
};

/**
 * The owner's cash count: a number from zero up to what was due at the door.
 * Mirrors the server's collectionFromAmount, which refuses the rest.
 */
export const cashCountError = (raw: string, amountDue: number): string | undefined => {
  const v = clean(raw);
  if (v === '') return 'Enter the cash the rider handed in (0 if none).';
  if (!PRICE.test(v)) return 'Enter an amount, e.g. 1500 or 1500.50.';
  if (toDecimal(v).greaterThan(toDecimal(amountDue).plus('0.005'))) {
    return `No more than the ${toDecimal(amountDue).toFixed(2)} due.`;
  }
  return undefined;
};

/** Minimum for a rejection note and a staff undo reason — both server rules. */
export const REVIEW_REASON_MIN = 5;

export const completionUnits = (c: Pick<Completion, 'changes'>) =>
  c.changes.reduce(
    (acc, ch) => ({
      delivered: acc.delivered + ch.deliveredQty,
      returned: acc.returned + ch.returnedQty,
    }),
    { delivered: 0, returned: 0 },
  );

type Outcome = Exclude<CapabilityOutcome, false>;

export interface CompletionActions {
  /** Owner: the Approve button. */
  approve: boolean;
  /** Staff: a read-only "Waiting for Admin Approval" badge where Approve would be. */
  waiting: boolean;
  reject: boolean;
  /**
   * Undo the approval outright. Only for a delivery whose sale never reached
   * the ledger — the server refuses the rest (LEDGER_COMMITTED).
   * 'direct' for the owner, 'request' for staff.
   */
  undo: Outcome | null;
  /**
   * Reverse a posted sale with a credit memo prefilled from the delivery —
   * the server's own route once revenue is on the books. Follows
   * `creditMemo.manage`: the owner issues it, staff send it for approval.
   */
  reverse: Outcome | null;
}

/**
 * The capability split, in one place.
 *
 * A pending completion is approved by the owner only (it recognises the sale)
 * but rejected by either role (no sale was ever recognised).
 *
 * An approved one is corrected one of two ways, and which is not a choice:
 *   - its sale is committed to the ledger (every Goods-in-Transit delivery):
 *     corrections REVERSE rather than delete, so it gets a credit memo;
 *   - it never posted a sale (legacy deliveries): it can be undone.
 * Once a reversing credit memo exists, there is nothing left to do.
 */
export const completionActions = (
  role: UserRole | null | undefined,
  c: Pick<Completion, 'status' | 'ledgerStatus' | 'reversalCreditMemoId'>,
): CompletionActions => {
  const none: CompletionActions = {
    approve: false,
    waiting: false,
    reject: false,
    undo: null,
    reverse: null,
  };
  if (role !== 'admin' && role !== 'staff') return none;

  if (c.status === 'pending') {
    const approve = capabilityFor(role, 'delivery.approveCompletion') !== false;
    return {
      ...none,
      approve,
      waiting: !approve,
      reject: capabilityFor(role, 'delivery.rejectCompletion') !== false,
    };
  }
  if (c.status === 'approved' && !c.reversalCreditMemoId) {
    if (c.ledgerStatus === 'committed') {
      const reverse = capabilityFor(role, 'creditMemo.manage');
      return { ...none, reverse: reverse === false ? null : reverse };
    }
    const undo = capabilityFor(role, 'delivery.undo');
    return { ...none, undo: undo === false ? null : undo };
  }
  return none;
};

/** GET /inventory-update-requests/:id/credit-memo-draft */
export interface DeliveryCreditMemoDraft {
  deliveryRequestId: string;
  deliveryId: string;
  deliveryReference: string;
  customerId: string;
  customerName: string;
  originalInvoiceId: string | null;
  invoiceNumber: string;
  /** Zero when the delivery was prepaid or already collected. */
  invoiceBalance: number;
  /**
   * What the customer still owes is cleared from the invoice; what they have
   * already paid goes back out as cash.
   *   apply_to_invoice   nothing was paid
   *   refund_cash        everything was paid (prepaid, or collected)
   *   apply_then_refund  part was paid
   */
  settlement: 'apply_to_invoice' | 'refund_cash' | 'apply_then_refund';
  settlementAmount: number;
  /** Cash going back to the customer. */
  refundAmount: number;
  date: string;
  reason: string;
  lines: Array<{
    itemId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    taxRate: string;
  }>;
}

/**
 * The extra CreateCreditMemoDto fields that make a credit memo a delivery
 * reversal: tied to the invoice it reverses, settled in the same action (or
 * refunded when there is nothing to settle), and recorded on the delivery so
 * it cannot be reversed twice.
 */
export const creditMemoReversalFields = (draft: DeliveryCreditMemoDraft) => {
  const applies = draft.settlement !== 'refund_cash' && !!draft.originalInvoiceId;
  const refunds = draft.settlement !== 'apply_to_invoice' || !draft.originalInvoiceId;
  return {
    ...(draft.originalInvoiceId ? { originalInvoiceId: draft.originalInvoiceId } : {}),
    ...(applies ? { applyToInvoiceId: draft.originalInvoiceId as string } : {}),
    ...(refunds ? { refundRemainderToCash: true } : {}),
    reversesDeliveryRequestId: draft.deliveryRequestId,
  };
};

/** Who signed it off — which AUTHORITY, not just which person. */
export const reviewerLabel = (c: Pick<Completion, 'status' | 'reviewerRole'>): string => {
  const verb = c.status === 'rejected' ? 'rejected' : 'approved';
  if (c.reviewerRole === 'admin') return `Owner ${verb}`;
  if (c.reviewerRole === 'staff') return `Staff ${verb}`;
  return c.status === 'pending' ? 'Awaiting review' : 'Reviewed';
};
