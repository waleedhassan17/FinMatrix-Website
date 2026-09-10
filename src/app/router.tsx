import { Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';

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
  DashboardPage,
  DesignTokens,
  EstimateDetailPage,
  ForgotPasswordPage,
  EstimateFormPage,
  EstimateListPage,
  InvoiceDetailPage,
  InvoiceFormPage,
  InvoiceListPage,
  JournalEntryDetailPage,
  JournalEntryFormPage,
  JournalEntryListPage,
  LoginPage,
  ModulePlaceholder,
  MyRequestsPage,
  OpeningBalancePage,
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
  { path: '/', element: <LandingPage /> },

  {
    element: <Root />,
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
