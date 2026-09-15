// ═══════════════════════════════════════════════════════
// FinMatrix Web — Status colours
// ═══════════════════════════════════════════════════════
// Ported verbatim from the mobile app's src/theme/theme.ts (§6b).
//
// Every domain names its states differently — an invoice is `paid`, a company
// is `active`, a payment is `approved` — but they mean the same six things.
// One resolver keeps both clients agreeing on what "partial" looks like.
//
// The app's STATUS_CONFIG (delivery labels + Feather icons) is deliberately not
// ported: the delivery view is out of scope for this console.

import { colors } from './tokens';

export type StatusTier =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'success'
  | 'danger'
  | 'moved';

export interface StatusStyle {
  fg: string;
  bg: string;
}

const STATUS_TIER: Record<StatusTier, StatusStyle> = {
  // Inert or terminated — no attention wanted.
  neutral: { fg: colors.neutral500, bg: colors.neutral100 },
  // Live, awaiting the other party.
  info: { fg: colors.info, bg: colors.infoLight },
  // In progress, or waiting on someone here.
  warning: { fg: colors.warning, bg: colors.warningLighter },
  // The happy terminal state.
  success: { fg: colors.success, bg: colors.successLighter },
  // Needs attention now.
  danger: { fg: colors.danger, bg: colors.dangerLighter },
  // Moved on into another document or state.
  moved: { fg: colors.secondary, bg: colors.secondaryLight },
};

const STATUS_TIER_OF: Record<string, StatusTier> = {
  // ── neutral ──
  draft: 'neutral',
  void: 'neutral',
  cancelled: 'neutral',
  inactive: 'neutral',
  unassigned: 'neutral',
  archived: 'neutral',
  none: 'neutral',
  on_leave: 'neutral',
  // A rider paused by the plan's rider limit — fixable, so it asks attention.
  plan_locked: 'warning',
  // ── personnel availability ──
  available: 'success',
  busy: 'warning',
  // ── info ──
  open: 'info',
  sent: 'info',
  submitted: 'info',
  new: 'info',
  // A delivery on the road — live, and in the rider's hands.
  picked_up: 'info',
  in_transit: 'info',
  arrived: 'info',
  // ── warning ──
  partial: 'warning',
  partially_received: 'warning',
  refunded: 'warning',
  expired: 'warning',
  pending: 'warning',
  pending_approval: 'warning',
  processing: 'warning',
  trial: 'warning',
  unpaid: 'warning',
  // ── success ──
  paid: 'success',
  fully_received: 'success',
  received: 'success',
  approved: 'success',
  applied: 'success',
  fulfilled: 'success',
  accepted: 'success',
  posted: 'success',
  active: 'success',
  delivered: 'success',
  completed: 'success',
  verified: 'success',
  // ── danger ──
  overdue: 'danger',
  declined: 'danger',
  rejected: 'danger',
  failed: 'danger',
  suspended: 'danger',
  blocked: 'danger',
  // ── moved on ──
  closed: 'moved',
  invoiced: 'moved',
  converted: 'moved',
  returned: 'moved',
};

/** Resolves any status word to a foreground/background pair. */
export const statusStyle = (status: string): StatusStyle =>
  STATUS_TIER[STATUS_TIER_OF[status] ?? 'neutral'];

/** The tier a status falls into, when you need the category rather than colours. */
export const statusTier = (status: string): StatusTier =>
  STATUS_TIER_OF[status] ?? 'neutral';

// ───────────────────────────────────────────────
// Priority configuration
// ───────────────────────────────────────────────
export interface PriorityStyle {
  label: string;
  color: string;
  bg: string;
}

export const PRIORITY_CONFIG: Record<string, PriorityStyle> = {
  low: { label: 'Low', color: colors.success, bg: colors.successLight },
  normal: { label: 'Normal', color: colors.success, bg: colors.successLight },
  medium: { label: 'Medium', color: colors.warning, bg: colors.warningLight },
  high: { label: 'High', color: colors.danger, bg: colors.dangerLight },
  urgent: { label: 'Urgent', color: colors.neutral0, bg: colors.danger },
};

/**
 * Turns a snake_case status into a display label: `pending_approval` →
 * `Pending Approval`. The app does this ad hoc per screen (titleCase in
 * TxnListUI); one implementation here keeps badges consistent.
 */
export const statusLabel = (status: string): string =>
  status
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
