import { Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, useRouteError } from 'react-router-dom';

import {
  RedirectIfAuthenticated,
  RequireActiveCompany,
  RequireAuth,
  RequireOwner,
  RequireRouteAccess,
  SessionGate,
} from '@/features/auth/SessionGate';
import LandingPage from '@/pages/LandingPage';
import {
  AccountStatusPage,
  BillDetailPage,
  CompanySetupPage,
  BillFormPage,
  BillListPage,
  CreditMemoDetailPage,
  CreditMemoFormPage,
  CreditMemoListPage,
  CustomerDetailPage,
  CustomerFormPage,
  CustomerListPage,
  AccountDetailPage,
  AccountFormPage,
  AccountListPage,
  AnalyticsPage,
  ApAgingPage,
  ArAgingPage,
  BalanceSheetPage,
  CashFlowPage,
  DashboardPage,
  DesignTokens,
  GeneralLedgerPage,
  EstimateDetailPage,
  ForgotPasswordPage,
  EstimateFormPage,
  EstimateListPage,
  InvoiceDetailPage,
  InvoiceFormPage,
  InventoryValuationPage,
  InvoiceListPage,
  JournalEntryDetailPage,
  JournalEntryFormPage,
  JournalEntryListPage,
  LoginPage,
  ModulePlaceholder,
  MyRequestsPage,
  OpeningBalancePage,
  ProfitLossPage,
  ReportsHubPage,
  TrialBalancePage,
  PODetailPage,
  POFormPage,
  POListPage,
  PlanSelectPage,
  PayBillsPage,
  PaymentDetailPage,
  PaymentListPage,
  PaySubscriptionPage,
  PaymentReceiptPage,
  ReceivePaymentPage,
  ReconcilePage,
  ReconciliationDetailPage,
  ReconciliationListPage,
  RegisterPage,
  RenewSubscriptionPage,
  RoleSelectPage,
  SalesOrderDetailPage,
  SalesOrderFormPage,
  SalesOrderListPage,
  VendorCreditDetailPage,
  VendorCreditFormPage,
  VendorCreditListPage,
  VendorDetailPage,
  VendorFormPage,
  VendorListPage,
  VerifyEmailPage,
} from '@/app/lazyPages';
import { AppLayout } from '@/features/shell/AppLayout';

/** Shown while a lazy route's chunk arrives. Mirrors SessionGate's BootSplash. */
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

/**
 * Rendered when a route throws — in practice, almost always a lazy chunk that
 * could not be fetched.
 *
 * Without an `errorElement`, React Router falls back to its built-in developer
 * screen: the raw TypeError, a stack, and a note addressed to "Hey developer 👋".
 * That is the correct default for a page nobody has shipped yet, and the wrong
 * thing to show an accountant mid-invoice.
 *
 * lazyWithReload has already retried and already spent its one reload by the time
 * anything reaches here, so this screen means automatic recovery failed —
 * offline, a blocked request, a genuinely broken deploy. The manual Reload button
 * is kept anyway: it costs nothing, and the user's own connection is the most
 * likely thing to have changed since.
 */
function RouteError() {
  const error = useRouteError();

  // Only ever visible to us, in the console. The card itself stays plain — a
  // stack trace tells the person at the keyboard nothing they can act on.
  console.error('[router] route failed to render', error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background-alt p-6 text-center">
        <h1 className="text-h4 text-text-primary">Something went wrong</h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          This page could not be loaded. Check your connection and try again.
        </p>
        {/* Deliberately a plain button rather than <Button>. Nothing else in the
            eager router chunk imports it, and this screen is not worth adding
            the component (and cva) to the bundle every visitor downloads. The
            classes are Button's own `primary` variant. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-body-md text-text-inverse hover:bg-primary-hover"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

/**
 * SessionGate wraps every route so boot runs once and the axios client's
 * session events have a handler no matter where the user landed.
 */
function Root() {
  return (
    <SessionGate>
      {/* Covers every lazy route outside AppLayout — the auth screens, onboarding,
          renewal, /dev/tokens. AppLayout has its own boundary so a page
          transition inside the product does not blank the sidebar.

          The fallback matches SessionGate's own BootSplash, so arriving at a
          sign-in screen looks like one continuous load rather than two. */}
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </SessionGate>
  );
}

export const router = createBrowserRouter([
  // ── The landing page, OUTSIDE SessionGate ───────────────────────────
  //
  // Deliberately a sibling of Root rather than one of its children. SessionGate
  // holds a <BootSplash/> until /auth/me settles, so mounted inside it the public
  // homepage would show a spinner to anyone carrying a stale token — seconds of
  // it on a cold dyno, on the one page whose load time decides whether a visitor
  // stays.
  //
  // The cost is that Redux auth state is unusable here (status never leaves
  // 'unknown' without the gate to resolve it), so LandingPage reads hasSession()
  // from storage instead. Providers sit above RouterProvider, so Redux and
  // TanStack Query are still available — only session BOOT is skipped.
  //
  // Being a sibling also means it does not inherit Root's errorElement, so it
  // carries its own — this is the page a first-time visitor sees.
  { path: '/', element: <LandingPage />, errorElement: <RouteError /> },

  {
    element: <Root />,
    // Catches every lazy route outside AppLayout, mirroring the <Suspense> in
    // Root: the same boundary that shows the spinner needs one for the failure.
    errorElement: <RouteError />,
    children: [
      // ── Public ────────────────────────────────────────────────────
      { path: '/get-started', element: <RoleSelectPage /> },
      // The app's word for the same screen, kept so a link from the phone lands
      // somewhere rather than on the placeholder.
      { path: '/welcome', element: <Navigate to="/get-started" replace /> },
      {
        path: '/login',
        element: (
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        ),
      },
      {
        path: '/register',
        element: (
          <RedirectIfAuthenticated>
            <RegisterPage />
          </RedirectIfAuthenticated>
        ),
      },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },

      // Signed in, but the company is gated. Inside RequireAuth (it reads
      // identity) but outside RequireActiveCompany, or it would redirect to
      // itself forever.
      {
        path: '/account-status',
        element: (
          <RequireAuth>
            <AccountStatusPage />
          </RequireAuth>
        ),
      },

      // ── Owner-only, and OUTSIDE RequireActiveCompany ──────────────
      //
      // These are the screens a company reaches precisely when it is NOT active:
      // onboarding runs while it is `draft`, renewal while it is `inactive`. Put
      // inside that guard they would be unreachable exactly when needed, so they
      // sit beside /account-status instead.
      //
      // Which means RequireRouteAccess never runs on them either — hence
      // RequireOwner. Without it any authenticated staff member could open the
      // company's billing, and `/account/renew` would additionally inherit
      // permission from the `/account` staff nav prefix.
      {
        path: '/onboarding/company',
        element: (
          <RequireAuth>
            <RequireOwner>
              <CompanySetupPage />
            </RequireOwner>
          </RequireAuth>
        ),
      },
      {
        path: '/onboarding/plan',
        element: (
          <RequireAuth>
            <RequireOwner>
              <PlanSelectPage />
            </RequireOwner>
          </RequireAuth>
        ),
      },
      {
        path: '/onboarding/pay',
        element: (
          <RequireAuth>
            <RequireOwner>
              <PaySubscriptionPage />
            </RequireOwner>
          </RequireAuth>
        ),
      },
      {
        path: '/account/renew',
        element: (
          <RequireAuth>
            <RequireOwner>
              <RenewSubscriptionPage />
            </RequireOwner>
          </RequireAuth>
        ),
      },

      // The token proof sheet. Not linked from the product; open it directly
      // beside the phone when checking the two clients still agree.
      { path: '/dev/tokens', element: <DesignTokens /> },

      // ── Authenticated ─────────────────────────────────────────────
      {
        element: (
          <RequireAuth>
            <RequireActiveCompany>
              <RequireRouteAccess>
                <AppLayout />
              </RequireRouteAccess>
            </RequireActiveCompany>
          </RequireAuth>
        ),
        // Its own boundary, matching AppLayout's own <Suspense>. Note this
        // REPLACES AppLayout rather than rendering inside it — an errorElement
        // stands in for its own route's element, so the sidebar goes with it.
        // Keeping the shell would mean an errorElement on all ~50 children for a
        // screen the user is meant to leave immediately; not worth it.
        errorElement: <RouteError />,
        children: [
          // The dashboard lives at /dashboard, not at the index. `/` now belongs
          // to the public landing page, and an index route here would fight it
          // for the same path. Both nav maps and the sidebar's exact-match
          // highlighting were moved to suit.
          { path: 'dashboard', element: <DashboardPage /> },

          // ── Module 4: Customers ─────────────────────────────────
          // `/new` is declared before `/:customerId` so it is matched as a
          // literal rather than captured as an id.
          { path: 'customers', element: <CustomerListPage /> },
          { path: 'customers/new', element: <CustomerFormPage /> },
          { path: 'customers/:customerId', element: <CustomerDetailPage /> },
          { path: 'customers/:customerId/edit', element: <CustomerFormPage /> },

          // ── Module 5: Invoices ──────────────────────────────────
          { path: 'invoices', element: <InvoiceListPage /> },
          { path: 'invoices/new', element: <InvoiceFormPage /> },
          { path: 'invoices/:invoiceId', element: <InvoiceDetailPage /> },
          { path: 'invoices/:invoiceId/edit', element: <InvoiceFormPage /> },

          // ── Module 6: Estimates ─────────────────────────────────
          { path: 'estimates', element: <EstimateListPage /> },
          { path: 'estimates/new', element: <EstimateFormPage /> },
          { path: 'estimates/:estimateId', element: <EstimateDetailPage /> },
          { path: 'estimates/:estimateId/edit', element: <EstimateFormPage /> },

          // ── Module 7: Sales Orders ──────────────────────────────
          { path: 'sales-orders', element: <SalesOrderListPage /> },
          { path: 'sales-orders/new', element: <SalesOrderFormPage /> },
          { path: 'sales-orders/:salesOrderId', element: <SalesOrderDetailPage /> },
          {
            path: 'sales-orders/:salesOrderId/edit',
            element: <SalesOrderFormPage />,
          },

          // ── Module 8: Receive Payments ──────────────────────────
          { path: 'payments', element: <PaymentListPage /> },
          { path: 'payments/new', element: <ReceivePaymentPage /> },
          // The old nav path, kept so existing links and bookmarks survive.
          {
            path: 'payments/receive',
            element: <Navigate to="/payments/new" replace />,
          },
          { path: 'payments/:paymentId', element: <PaymentDetailPage /> },

          // ── Module 9: Credit Memos ──────────────────────────────
          { path: 'credit-memos', element: <CreditMemoListPage /> },
          { path: 'credit-memos/new', element: <CreditMemoFormPage /> },
          {
            path: 'credit-memos/:creditMemoId',
            element: <CreditMemoDetailPage />,
          },

          // ── Module 10: Vendors ──────────────────────────────────
          { path: 'vendors', element: <VendorListPage /> },
          { path: 'vendors/new', element: <VendorFormPage /> },
          { path: 'vendors/:vendorId', element: <VendorDetailPage /> },
          { path: 'vendors/:vendorId/edit', element: <VendorFormPage /> },

          // ── Modules 11 & 12: Bills and Pay Bills ────────────────
          // `pay` and `pay/receipt` precede `:billId` so neither is captured
          // as an id.
          { path: 'bills', element: <BillListPage /> },
          { path: 'bills/new', element: <BillFormPage /> },
          { path: 'bills/pay', element: <PayBillsPage /> },
          { path: 'bills/pay/receipt', element: <PaymentReceiptPage /> },
          { path: 'bills/:billId', element: <BillDetailPage /> },
          { path: 'bills/:billId/edit', element: <BillFormPage /> },

          // ── Module 13: Purchase Orders ──────────────────────────
          { path: 'purchase-orders', element: <POListPage /> },
          { path: 'purchase-orders/new', element: <POFormPage /> },
          { path: 'purchase-orders/:poId', element: <PODetailPage /> },
          { path: 'purchase-orders/:poId/edit', element: <POFormPage /> },

          // ── Module 14: Vendor Credits ───────────────────────────
          // No `/edit`: there is no PATCH route. A vendor credit is immutable
          // once created, and a wrong one is voided and re-entered.
          { path: 'vendor-credits', element: <VendorCreditListPage /> },
          { path: 'vendor-credits/new', element: <VendorCreditFormPage /> },
          {
            path: 'vendor-credits/:vendorCreditId',
            element: <VendorCreditDetailPage />,
          },

          // ── Module 15: Chart of Accounts (admin only) ───────────
          // No extra guard needed: `/accounts` is absent from STAFF_NAV, so
          // `RequireRouteAccess` above redirects a staff member who types the
          // URL rather than letting the page 403 on its first request.
          { path: 'accounts', element: <AccountListPage /> },
          { path: 'accounts/new', element: <AccountFormPage /> },
          { path: 'accounts/:accountId', element: <AccountDetailPage /> },
          { path: 'accounts/:accountId/edit', element: <AccountFormPage /> },

          // ── Module 16: Journal Entries ──────────────────────────
          // `new` and `opening-balance` both precede `:journalEntryId` so
          // neither is captured as an id. No `/edit`: an entry is immutable
          // once created, and a wrong one is voided and re-entered.
          { path: 'journal-entries', element: <JournalEntryListPage /> },
          { path: 'journal-entries/new', element: <JournalEntryFormPage /> },
          {
            path: 'journal-entries/opening-balance',
            element: <OpeningBalancePage />,
          },
          {
            path: 'journal-entries/:journalEntryId',
            element: <JournalEntryDetailPage />,
          },

          // ── Module 17: Reports ──────────────────────────────────
          // `/reports` itself is not a nav item, so it is not in the staff
          // prefix list that routeAccess derives from the nav — see
          // STAFF_EXTRA_PREFIXES there, which is what lets staff reach the hub.
          { path: 'reports', element: <ReportsHubPage /> },
          { path: 'reports/profit-loss', element: <ProfitLossPage /> },
          { path: 'reports/balance-sheet', element: <BalanceSheetPage /> },
          { path: 'reports/trial-balance', element: <TrialBalancePage /> },
          { path: 'reports/cash-flow', element: <CashFlowPage /> },
          { path: 'reports/general-ledger', element: <GeneralLedgerPage /> },
          { path: 'reports/ar-aging', element: <ArAgingPage /> },
          { path: 'reports/ap-aging', element: <ApAgingPage /> },
          { path: 'reports/inventory-valuation', element: <InventoryValuationPage /> },
          { path: 'reports/analytics', element: <AnalyticsPage /> },

          // ── Module 22: Bank Reconciliation (owner only) ─────────
          // Absent from STAFF_NAV, so RequireRouteAccess redirects staff; every
          // endpoint is also @Roles('admin') for segregation of duties. The
          // literal `reconcile` segment precedes `:reconciliationId`.
          { path: 'reconciliations', element: <ReconciliationListPage /> },
          {
            path: 'reconciliations/reconcile/:accountId',
            element: <ReconcilePage />,
          },
          {
            path: 'reconciliations/:reconciliationId',
            element: <ReconciliationDetailPage />,
          },

          // A slice of module 18: staff cannot verify that a submitted invoice
          // became a request without somewhere to see it.
          { path: 'my-requests', element: <MyRequestsPage /> },

          // Everything modules 6-24 will build. Inside the guard above, so a
          // staff member reaching an admin-only path is redirected rather than
          // shown a placeholder for a screen they will never have.
          { path: '*', element: <ModulePlaceholder /> },
        ],
      },
    ],
  },
]);

export default router;
