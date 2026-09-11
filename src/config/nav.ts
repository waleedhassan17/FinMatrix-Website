// ═══════════════════════════════════════════════════════
// FinMatrix Web — Navigation
// ═══════════════════════════════════════════════════════
// Mirrors the app's src/navigations-maps/: More.ts for the owner,
// staffMoreRouteNames.ts for staff.
//
// The important property, carried over deliberately: staff navigation is an
// ALLOW-LIST, not the admin list with rows hidden. A route a staff member may
// not reach does not exist in their router at all, so a deep link, a pasted
// URL and a programmatic navigate() are all inert rather than merely invisible.
// The app enforces this with a compile-time Exclude<> assertion; StaffNavPath
// below does the same job — giving a staff nav item a forbidden path is a type
// error, not a code review note.
//
// Delivery operations appear for BOTH roles — staff run dispatch day to day —
// and the whole group is gated on the company's `delivery` feature, as the
// app's StaffMore does with isFeatureEnabled('delivery'). The rider's own
// screens live in the rider app, not here.

import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { FeatureKey } from '@/types';
import type { Capability } from '@/utils/capabilities';

export interface NavItem<P extends string = string> {
  title: string;
  path: P;
  /** Hidden unless the role may perform this. */
  capability?: Capability;
  /** Hidden unless the company's tier includes this feature. */
  feature?: FeatureKey;
  /**
   * Active only on this exact path. For a list whose sibling items live under
   * it (`/deliveries` vs `/deliveries/new`), so both are not lit at once.
   */
  exact?: boolean;
}

export interface NavGroup<P extends string = string> {
  title: string;
  icon: LucideIcon;
  /** A group with a path and no items is a single link, not an accordion. */
  path?: P;
  items?: NavItem<P>[];
  /** Shows a live count badge. */
  badge?: 'approvals';
  /**
   * Hides the whole group when the tier lacks this feature — otherwise an
   * accordion whose every item is hidden would still show an empty header.
   */
  feature?: FeatureKey;
}

/**
 * Every path a staff member may reach.
 *
 * Absent on purpose, mirroring the app's STAFF_FORBIDDEN_ROUTES:
 *   /accounts             chart of accounts  (chartOfAccounts.manage = false)
 *   /settings/company     company profile    (settings.manage = false)
 *   /settings/users       user management    (users.manage = false)
 *   /approvals            the decide inbox   (approvals.decide = false)
 *   /reconciliations      bank rec           (admin-only server-side)
 *   /employees, /payroll/runs, /budgets      (admin-only server-side)
 */
export type StaffNavPath =
  | '/dashboard'
  | '/my-requests'
  | '/customers'
  | '/invoices'
  | '/estimates'
  | '/sales-orders'
  | '/payments'
  | '/payments/receive'
  | '/credit-memos'
  | '/vendors'
  | '/bills'
  | '/bills/pay'
  | '/purchase-orders'
  | '/vendor-credits'
  | '/inventory'
  | '/deliveries'
  | '/deliveries/new'
  | '/deliveries/assign'
  | '/deliveries/completions'
  | '/delivery-personnel'
  | '/journal-entries'
  | '/tax/liability'
  | '/account'
  | `/reports/${string}`;

// ───────────────────────────────────────────────────────────────────────────
// Shared operational areas — identical for both roles.
//
// These are typed against StaffNavPath, not `string`. That is what makes the
// sharing safe: a path added here that staff may not reach fails to compile
// rather than silently widening their navigation. Admin reuses them freely,
// since StaffNavPath is assignable to string.
// ───────────────────────────────────────────────────────────────────────────

const SALES_ITEMS: NavItem<StaffNavPath>[] = [
  { title: 'Customers', path: '/customers', capability: 'customer.manage' },
  { title: 'Invoices', path: '/invoices', capability: 'invoice.create' },
  {
    title: 'Estimates',
    path: '/estimates',
    capability: 'estimate.create',
    feature: 'estimates',
  },
  {
    title: 'Sales Orders',
    path: '/sales-orders',
    capability: 'salesOrder.create',
    feature: 'salesOrders',
  },
  {
    title: 'Receive Payments',
    path: '/payments',
    capability: 'payment.receive',
  },
  {
    title: 'Credit Memos',
    path: '/credit-memos',
    capability: 'creditMemo.manage',
    feature: 'creditMemos',
  },
];

const PURCHASE_ITEMS: NavItem<StaffNavPath>[] = [
  { title: 'Vendors', path: '/vendors', capability: 'vendor.manage' },
  { title: 'Bills', path: '/bills' },
  { title: 'Pay Bills', path: '/bills/pay', capability: 'bill.pay' },
  {
    title: 'Purchase Orders',
    path: '/purchase-orders',
    capability: 'purchaseOrder.create',
    feature: 'purchaseOrders',
  },
  {
    title: 'Vendor Credits',
    path: '/vendor-credits',
    capability: 'vendorCredit.manage',
    feature: 'creditMemos',
  },
];

/**
 * Delivery operations — the same working set for both roles. What differs is
 * one control on the Completions screen: the owner approves a completion (it
 * recognises the sale); staff see "Waiting for Admin Approval" instead.
 */
const DELIVERY_ITEMS: NavItem<StaffNavPath>[] = [
  { title: 'Delivery Monitor', path: '/deliveries', feature: 'delivery', exact: true },
  {
    title: 'New Delivery',
    path: '/deliveries/new',
    capability: 'delivery.create',
    feature: 'delivery',
  },
  {
    title: 'Assign Deliveries',
    path: '/deliveries/assign',
    capability: 'delivery.assign',
    feature: 'delivery',
  },
  { title: 'Completions', path: '/deliveries/completions', feature: 'delivery' },
  {
    title: 'Riders',
    path: '/delivery-personnel',
    capability: 'personnel.manage',
    feature: 'delivery',
  },
];

const REPORT_ITEMS: NavItem<StaffNavPath>[] = [
  { title: 'Profit & Loss', path: '/reports/profit-loss' },
  { title: 'Balance Sheet', path: '/reports/balance-sheet' },
  { title: 'Trial Balance', path: '/reports/trial-balance' },
  { title: 'Cash Flow', path: '/reports/cash-flow' },
  { title: 'General Ledger', path: '/reports/general-ledger' },
  { title: 'AR Aging', path: '/reports/ar-aging' },
  { title: 'AP Aging', path: '/reports/ap-aging' },
  {
    title: 'Inventory Valuation',
    path: '/reports/inventory-valuation',
    feature: 'inventory',
  },
  { title: 'Analytics', path: '/reports/analytics' },
];

// ───────────────────────────────────────────────────────────────────────────
// Owner
// ───────────────────────────────────────────────────────────────────────────

export const ADMIN_NAV: NavGroup[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { title: 'Customers & Sales', icon: Users, items: SALES_ITEMS },
  { title: 'Vendors & Purchases', icon: ShoppingCart, items: PURCHASE_ITEMS },
  { title: 'Inventory', icon: Package, path: '/inventory' },
  { title: 'Deliveries', icon: Truck, items: DELIVERY_ITEMS, feature: 'delivery' },
  {
    title: 'Accounting',
    icon: BookOpen,
    items: [
      {
        title: 'Chart of Accounts',
        path: '/accounts',
        capability: 'chartOfAccounts.manage',
      },
      {
        title: 'Journal Entries',
        path: '/journal-entries',
        capability: 'journal.post',
        feature: 'journalEntries',
      },
      {
        title: 'Bank Reconciliation',
        path: '/reconciliations',
        feature: 'bankReconciliation',
      },
      { title: 'Tax', path: '/tax' },
    ],
  },
  { title: 'Reports', icon: BarChart3, items: REPORT_ITEMS },
  {
    title: 'Payroll & Budgets',
    icon: Wallet,
    items: [
      { title: 'Employees', path: '/employees', feature: 'payroll' },
      { title: 'Payroll Runs', path: '/payroll/runs', feature: 'payroll' },
      { title: 'Budgets', path: '/budgets', feature: 'budgets' },
    ],
  },
  { title: 'Approvals', icon: Inbox, path: '/approvals', badge: 'approvals' },
  {
    title: 'Settings',
    icon: Settings,
    items: [
      {
        title: 'Company',
        path: '/settings/company',
        capability: 'settings.manage',
      },
      {
        title: 'Users',
        path: '/settings/users',
        capability: 'users.manage',
        feature: 'multiUser',
      },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Staff
// ───────────────────────────────────────────────────────────────────────────

export const STAFF_NAV: NavGroup<StaffNavPath>[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  // Everything a staff member submits for approval lands here. Same endpoint
  // as the owner's inbox — the server scopes it to the caller — but with no
  // decide actions anywhere.
  {
    title: 'My Requests',
    icon: ClipboardList,
    path: '/my-requests',
    badge: 'approvals',
  },
  { title: 'Customers & Sales', icon: Users, items: SALES_ITEMS },
  { title: 'Vendors & Purchases', icon: ShoppingCart, items: PURCHASE_ITEMS },
  { title: 'Inventory', icon: Package, path: '/inventory' },
  { title: 'Deliveries', icon: Truck, items: DELIVERY_ITEMS, feature: 'delivery' },
  {
    title: 'Accounting',
    icon: BookOpen,
    items: [
      {
        title: 'Journal Entries',
        path: '/journal-entries',
        capability: 'journal.post',
        feature: 'journalEntries',
      },
      // Read-only: the liability figures are visible to staff, but recording a
      // tax payment is admin-only on the server.
      { title: 'Tax Liability', path: '/tax/liability' },
    ],
  },
  { title: 'Reports', icon: BarChart3, items: REPORT_ITEMS },
  { title: 'My Account', icon: UserCircle, path: '/account' },
];

/** Quick actions in the sidebar footer, each gated like any other action. */
export const QUICK_ACTIONS: Array<NavItem & { icon: LucideIcon }> = [
  {
    title: 'New Invoice',
    path: '/invoices/new',
    icon: FileText,
    capability: 'invoice.create',
  },
  {
    title: 'Receive Payment',
    path: '/payments/new',
    icon: Receipt,
    capability: 'payment.receive',
  },
  { title: 'New Bill', path: '/bills/new', icon: ShoppingCart },
  {
    title: 'Journal Entry',
    path: '/journal-entries/new',
    icon: ClipboardList,
    capability: 'journal.post',
    feature: 'journalEntries',
  },
];

/** The nav this role sees. Two configs, never one filtered list. */
export const navForRole = (role: string | null | undefined): NavGroup[] =>
  role === 'admin' ? ADMIN_NAV : (STAFF_NAV as NavGroup[]);
