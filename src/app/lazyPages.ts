// ═══════════════════════════════════════════════════════
// FinMatrix Web — Deferred pages
// ═══════════════════════════════════════════════════════
// Every screen behind sign-in, loaded on demand.
//
// WHY: `/` is now a public marketing page, and router.tsx imports the whole
// product at module scope. Statically, that means a visitor who has never signed
// in downloads the entire ERP — recharts, TanStack Table, every Radix primitive,
// forty-odd pages — before the landing page can paint. Measured before this
// change: one 1,507 kB chunk, 442 kB gzipped.
//
// Dynamic import is the only thing that actually defers a module; manual vendor
// chunking does not, because a statically imported module is in the entry graph
// no matter which chunk it lands in.
//
// The re-exports keep their original names, so router.tsx's JSX is unchanged and
// the swap is confined to its import block. AppLayout holds the <Suspense>
// boundary these resolve against.
//
// The PUBLIC pages stay eager in router.tsx on purpose — landing, sign-in,
// register, the role picker, email verification and the account-status screen are
// the critical path for someone who has no session, and a loading flicker on the
// way to a sign-in form is a worse trade than a slightly larger first chunk.

import { lazy } from 'react';

// The auth screens. Deferred too, even though they are public: they are the only
// thing that pulls zod, react-hook-form and the resolvers, and a first-time
// visitor reading the landing page has not clicked anything yet. The cost is one
// small request after the click; the saving comes off the page whose load time
// decides whether there is a click at all.
//
// LandingPage is the ONE page that stays eagerly imported in router.tsx.
export const RoleSelectPage = lazy(() => import('@/pages/auth/RoleSelectPage'));
export const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
export const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
export const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
export const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
export const AccountStatusPage = lazy(() => import('@/pages/auth/AccountStatusPage'));

export const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
export const ModulePlaceholder = lazy(() => import('@/pages/ModulePlaceholder'));
export const MyRequestsPage = lazy(() => import('@/pages/approvals/MyRequestsPage'));

// Customers
export const CustomerListPage = lazy(() => import('@/pages/customers/CustomerListPage'));
export const CustomerFormPage = lazy(() => import('@/pages/customers/CustomerFormPage'));
export const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'));

// Invoices
export const InvoiceListPage = lazy(() => import('@/pages/invoices/InvoiceListPage'));
export const InvoiceFormPage = lazy(() => import('@/pages/invoices/InvoiceFormPage'));
export const InvoiceDetailPage = lazy(() => import('@/pages/invoices/InvoiceDetailPage'));

// Estimates
export const EstimateListPage = lazy(() => import('@/pages/estimates/EstimateListPage'));
export const EstimateFormPage = lazy(() => import('@/pages/estimates/EstimateFormPage'));
export const EstimateDetailPage = lazy(() => import('@/pages/estimates/EstimateDetailPage'));

// Sales orders
export const SalesOrderListPage = lazy(() => import('@/pages/salesOrders/SalesOrderListPage'));
export const SalesOrderFormPage = lazy(() => import('@/pages/salesOrders/SalesOrderFormPage'));
export const SalesOrderDetailPage = lazy(
  () => import('@/pages/salesOrders/SalesOrderDetailPage'),
);

// Payments
export const PaymentListPage = lazy(() => import('@/pages/payments/PaymentListPage'));
export const ReceivePaymentPage = lazy(() => import('@/pages/payments/ReceivePaymentPage'));
export const PaymentDetailPage = lazy(() => import('@/pages/payments/PaymentDetailPage'));

// Credit memos
export const CreditMemoListPage = lazy(() => import('@/pages/creditMemos/CreditMemoListPage'));
export const CreditMemoFormPage = lazy(() => import('@/pages/creditMemos/CreditMemoFormPage'));
export const CreditMemoDetailPage = lazy(
  () => import('@/pages/creditMemos/CreditMemoDetailPage'),
);

// Vendors
export const VendorListPage = lazy(() => import('@/pages/vendors/VendorListPage'));
export const VendorFormPage = lazy(() => import('@/pages/vendors/VendorFormPage'));
export const VendorDetailPage = lazy(() => import('@/pages/vendors/VendorDetailPage'));

// Bills
export const BillListPage = lazy(() => import('@/pages/bills/BillListPage'));
export const BillFormPage = lazy(() => import('@/pages/bills/BillFormPage'));
export const BillDetailPage = lazy(() => import('@/pages/bills/BillDetailPage'));
export const PayBillsPage = lazy(() => import('@/pages/bills/PayBillsPage'));
export const PaymentReceiptPage = lazy(() => import('@/pages/bills/PaymentReceiptPage'));

// Purchase orders
export const POListPage = lazy(() => import('@/pages/purchaseOrders/POListPage'));
export const POFormPage = lazy(() => import('@/pages/purchaseOrders/POFormPage'));
export const PODetailPage = lazy(() => import('@/pages/purchaseOrders/PODetailPage'));

// Vendor credits
export const VendorCreditListPage = lazy(
  () => import('@/pages/vendorCredits/VendorCreditListPage'),
);
export const VendorCreditFormPage = lazy(
  () => import('@/pages/vendorCredits/VendorCreditFormPage'),
);
export const VendorCreditDetailPage = lazy(
  () => import('@/pages/vendorCredits/VendorCreditDetailPage'),
);

// Chart of accounts — admin only, so staff never download these chunks either.
export const AccountListPage = lazy(() => import('@/pages/accounts/AccountListPage'));
export const AccountFormPage = lazy(() => import('@/pages/accounts/AccountFormPage'));
export const AccountDetailPage = lazy(
  () => import('@/pages/accounts/AccountDetailPage'),
);

// Onboarding and renewal. Behind sign-in, and reached minutes after the landing
// page at the earliest — no reason for a first-time visitor to download the plan
// grid, the bank-transfer panel and the company form before reading the pitch.
export const CompanySetupPage = lazy(
  () => import('@/pages/onboarding/CompanySetupPage'),
);
export const PlanSelectPage = lazy(() => import('@/pages/onboarding/PlanSelectPage'));
export const PaySubscriptionPage = lazy(
  () => import('@/pages/onboarding/PaySubscriptionPage'),
);
export const RenewSubscriptionPage = lazy(
  () => import('@/pages/account/RenewSubscriptionPage'),
);

// The token proof sheet — not linked from the product, so never worth shipping
// in the first chunk.
export const DesignTokens = lazy(() => import('@/pages/DesignTokens'));
