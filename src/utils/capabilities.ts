/**
 * WHO CAN DO WHAT — the client-side mirror of the server's permission matrix.
 *
 * Ported verbatim from the app's src/utils/capabilities.ts. Keep the two in
 * step: a drift here means the two clients disagree about what a staff member
 * may do, which users experience as one of them lying.
 *
 * This is a UX map, never a security boundary. The server decides: staff hit a
 * 403 on anything they may not do, and a request they may only ask for comes
 * back as a pending approval no matter what this file says. What this map buys
 * is an interface that tells the truth — no buttons that lead to a 403, and
 * "Send for approval" instead of "Save" where that is what will happen.
 *
 * Three outcomes:
 *   'direct'   the action completes immediately
 *   'request'  it becomes a pending request the owner approves before it posts
 *   false      hidden here, and refused by the server
 */
import type { UserRole } from '@/types';

export type Capability =
  // ── Sales & operations: value IN ────────────────────────────────────────
  | 'invoice.create'
  | 'estimate.create'
  | 'salesOrder.create'
  | 'payment.receive'
  | 'customer.manage'
  | 'vendor.manage'
  | 'delivery.create'
  | 'delivery.assign'
  | 'delivery.approveCompletion'
  | 'delivery.rejectCompletion'
  | 'personnel.manage'
  | 'stock.receive'
  | 'inventory.manageItems'
  | 'purchaseOrder.updateStatus'
  // ── Money out & corrections: needs the owner ────────────────────────────
  | 'inventory.adjust'
  | 'journal.post'
  | 'creditMemo.manage'
  | 'vendorCredit.manage'
  | 'transaction.void'
  | 'bill.pay'
  | 'purchaseOrder.create'
  | 'purchaseOrder.edit'
  | 'delivery.undo'
  // ── Governance: owner only ──────────────────────────────────────────────
  | 'approvals.decide'
  | 'users.manage'
  | 'settings.manage'
  | 'chartOfAccounts.manage'
  | 'period.close';

export type CapabilityOutcome = 'direct' | 'request' | false;

/**
 * The owner column is 'direct' throughout by definition — they are the
 * approver, so nothing they do waits on anyone.
 *
 * The `delivery.*` rows drive the delivery operations screens (Module 20): the
 * Completions page reads approveCompletion / rejectCompletion / undo from here
 * rather than branching on role, so the split lives in one place.
 */
const STAFF_CAPABILITIES: Record<Capability, CapabilityOutcome> = {
  // Value in — staff run the day-to-day, and nothing waits on the owner.
  'estimate.create': 'direct',
  'salesOrder.create': 'direct',
  'customer.manage': 'direct',
  'vendor.manage': 'direct',
  'delivery.create': 'direct',
  // Posts Dr Goods in Transit / Cr Inventory at cost. The one ledger-moving
  // action staff take with no approval at all — deliberately NOT a request.
  'delivery.assign': 'direct',
  // A failed delivery goes back on the shelf. No sale was ever recognised, so
  // there is nothing to correct and nobody to ask — and gating it would strand
  // the stock in transit until the owner next logged in.
  'delivery.rejectCompletion': 'direct',
  'personnel.manage': 'direct',
  'stock.receive': 'direct',
  'inventory.manageItems': 'direct',
  // Send to vendor / close. Posts nothing — the order is a commitment, not a
  // transaction — and the owner's control point is approving the PO into
  // existence. Gating it only stranded an approved PO in draft, since
  // receiving against it requires 'sent'.
  'purchaseOrder.updateStatus': 'direct',

  // Billing and cash in — prepared by staff, posted by the owner. Raising an
  // invoice recognises revenue and banking a receipt moves cash, and the owner
  // wanted their signature on both.
  'invoice.create': 'request',
  'payment.receive': 'request',

  // Money out and corrections — prepared by staff, approved by the owner.
  'inventory.adjust': 'request',
  'journal.post': 'request',
  'creditMemo.manage': 'request',
  'vendorCredit.manage': 'request',
  'transaction.void': 'request',
  'bill.pay': 'request',
  'purchaseOrder.create': 'request',
  // Reverses recognised revenue: staff ask, with a reason.
  'delivery.undo': 'request',

  // Signing off a rider's delivery recognises the sale: Dr A/R / Cr Sales, then
  // Dr COGS / Cr Goods in Transit. The largest ledger event in the product, so
  // it is the owner's signature.
  'delivery.approveCompletion': false,

  // Rewriting an existing PO — vendor, quantities, costs — is refused outright
  // rather than queued: the owner already approved this order into existence,
  // and an edit would undo that signature without asking anyone.
  'purchaseOrder.edit': false,

  // Governance — the owner's alone, and a 403 at the server for staff.
  'approvals.decide': false,
  'users.manage': false,
  'settings.manage': false,
  'chartOfAccounts.manage': false,
  'period.close': false,
};

export const ALL_CAPABILITIES = Object.keys(STAFF_CAPABILITIES) as Capability[];

/** Capabilities that become a pending request when staff perform them. */
export const STAFF_REQUEST_CAPABILITIES = ALL_CAPABILITIES.filter(
  (c) => STAFF_CAPABILITIES[c] === 'request',
);

/** Capabilities no staff member may reach at all. */
export const GOVERNANCE_CAPABILITIES: Capability[] = [
  'approvals.decide',
  'users.manage',
  'settings.manage',
  'chartOfAccounts.manage',
  'period.close',
];

/**
 * What happens if this role performs this action.
 *
 * Riders have their own client and super_admin is a platform console outside
 * the company model — both get `false` rather than a special case scattered
 * through the screens.
 */
export const capabilityFor = (
  role: UserRole | null | undefined,
  capability: Capability,
): CapabilityOutcome => {
  if (role === 'admin') return 'direct';
  if (role === 'staff') return STAFF_CAPABILITIES[capability] ?? false;
  return false;
};

/** True when the action is available at all, however it completes. */
export const can = (
  role: UserRole | null | undefined,
  capability: Capability,
): boolean => capabilityFor(role, capability) !== false;

/** True when performing it files a request instead of completing. */
export const needsApproval = (
  role: UserRole | null | undefined,
  capability: Capability,
): boolean => capabilityFor(role, capability) === 'request';

/**
 * The wording a submit button should carry. Staff filing a request are told so
 * before they click, not after.
 */
export const submitLabelFor = (
  role: UserRole | null | undefined,
  capability: Capability,
  directLabel: string,
): string =>
  needsApproval(role, capability) ? 'Send for approval' : directLabel;

// ───────────────────────────────────────────────────────────────────────────
// Per-action admin gates
// ───────────────────────────────────────────────────────────────────────────
/**
 * Actions the capability map above does NOT cover, because the server gates
 * them more tightly than the capability they belong to.
 *
 * `customer.manage` is 'direct' for staff — and it is, for create and edit. But
 * the controllers put `@Roles('admin')` on toggle-active and delete. Same story
 * for vendors, and for inventory's toggle and opening-stock. Reconciliation is
 * admin-only end to end (segregation of duties: the app puts it in
 * STAFF_FORBIDDEN_ROUTES for the same reason).
 *
 * Without this list a staff member sees a Deactivate button, clicks it, and
 * collects a 403 — exactly the outcome the capability map exists to prevent.
 */
export type AdminOnlyAction =
  | 'customer.toggleActive'
  | 'customer.delete'
  | 'vendor.toggleActive'
  | 'vendor.delete'
  | 'inventory.toggleItem'
  | 'inventory.openingStock'
  | 'invoice.delete'
  | 'estimate.delete'
  | 'salesOrder.delete'
  | 'creditMemo.delete'
  | 'vendorCredit.delete'
  | 'bill.delete'
  | 'payment.delete'
  // Letting a sale go past a customer's credit limit, with a reason.
  | 'credit.override'
  | 'purchaseOrder.delete'
  // Discarding a never-dispatched delivery; refused server-side once stock moved.
  | 'delivery.delete'
  | 'account.delete'
  | 'reconciliation.manage'
  // Tax: staff may READ the liability, rates and payments; recording or
  // reversing a payment and changing a rate are @Roles('admin').
  | 'tax.recordPayment'
  | 'tax.manageRates';

export const isAdminOnly = (
  role: UserRole | null | undefined,
  _action: AdminOnlyAction,
): boolean => role === 'admin';
