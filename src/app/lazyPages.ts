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

// lazyWithReload, not React.lazy: these chunks are fetched on navigation, which
// can be long after index.html loaded, and a deploy in between deletes the hashed
// files this module graph is holding. The wrapper retries, then reloads once for
// a fresh index.html. See src/app/lazyWithReload.ts.
import { lazyWithReload } from '@/app/lazyWithReload';

// The auth screens. Deferred too, even though they are public: they are the only
// thing that pulls zod, react-hook-form and the resolvers, and a first-time
// visitor reading the landing page has not clicked anything yet. The cost is one
// small request after the click; the saving comes off the page whose load time
// decides whether there is a click at all.
//
// LandingPage is the ONE page that stays eagerly imported in router.tsx.
export const RoleSelectPage = lazyWithReload(() => import('@/pages/auth/RoleSelectPage'));
export const LoginPage = lazyWithReload(() => import('@/pages/auth/LoginPage'));
export const RegisterPage = lazyWithReload(() => import('@/pages/auth/RegisterPage'));
export const ForgotPasswordPage = lazyWithReload(() => import('@/pages/auth/ForgotPasswordPage'));
export const VerifyEmailPage = lazyWithReload(() => import('@/pages/auth/VerifyEmailPage'));
export const AccountStatusPage = lazyWithReload(() => import('@/pages/auth/AccountStatusPage'));

export const DashboardPage = lazyWithReload(() => import('@/pages/DashboardPage'));
export const ModulePlaceholder = lazyWithReload(() => import('@/pages/ModulePlaceholder'));
export const MyRequestsPage = lazyWithReload(() => import('@/pages/approvals/MyRequestsPage'));

// Customers
export const CustomerListPage = lazyWithReload(() => import('@/pages/customers/CustomerListPage'));
export const CustomerFormPage = lazyWithReload(() => import('@/pages/customers/CustomerFormPage'));
export const CustomerDetailPage = lazyWithReload(() => import('@/pages/customers/CustomerDetailPage'));

// Invoices
export const InvoiceListPage = lazyWithReload(() => import('@/pages/invoices/InvoiceListPage'));
export const InvoiceFormPage = lazyWithReload(() => import('@/pages/invoices/InvoiceFormPage'));
export const InvoiceDetailPage = lazyWithReload(() => import('@/pages/invoices/InvoiceDetailPage'));

// Estimates
export const EstimateListPage = lazyWithReload(() => import('@/pages/estimates/EstimateListPage'));
export const EstimateFormPage = lazyWithReload(() => import('@/pages/estimates/EstimateFormPage'));
export const EstimateDetailPage = lazyWithReload(() => import('@/pages/estimates/EstimateDetailPage'));

// Sales orders
export const SalesOrderListPage = lazyWithReload(() => import('@/pages/salesOrders/SalesOrderListPage'));
export const SalesOrderFormPage = lazyWithReload(() => import('@/pages/salesOrders/SalesOrderFormPage'));
export const SalesOrderDetailPage = lazyWithReload(
  () => import('@/pages/salesOrders/SalesOrderDetailPage'),
);

// Payments
export const PaymentListPage = lazyWithReload(() => import('@/pages/payments/PaymentListPage'));
export const ReceivePaymentPage = lazyWithReload(() => import('@/pages/payments/ReceivePaymentPage'));
export const PaymentDetailPage = lazyWithReload(() => import('@/pages/payments/PaymentDetailPage'));

// Credit memos
export const CreditMemoListPage = lazyWithReload(() => import('@/pages/creditMemos/CreditMemoListPage'));
export const CreditMemoFormPage = lazyWithReload(() => import('@/pages/creditMemos/CreditMemoFormPage'));
export const CreditMemoDetailPage = lazyWithReload(
  () => import('@/pages/creditMemos/CreditMemoDetailPage'),
);

// Vendors
export const VendorListPage = lazyWithReload(() => import('@/pages/vendors/VendorListPage'));
export const VendorFormPage = lazyWithReload(() => import('@/pages/vendors/VendorFormPage'));
export const VendorDetailPage = lazyWithReload(() => import('@/pages/vendors/VendorDetailPage'));

// Bills
export const BillListPage = lazyWithReload(() => import('@/pages/bills/BillListPage'));
export const BillFormPage = lazyWithReload(() => import('@/pages/bills/BillFormPage'));
export const BillDetailPage = lazyWithReload(() => import('@/pages/bills/BillDetailPage'));
export const PayBillsPage = lazyWithReload(() => import('@/pages/bills/PayBillsPage'));
export const PaymentReceiptPage = lazyWithReload(() => import('@/pages/bills/PaymentReceiptPage'));

// Purchase orders
export const POListPage = lazyWithReload(() => import('@/pages/purchaseOrders/POListPage'));
export const POFormPage = lazyWithReload(() => import('@/pages/purchaseOrders/POFormPage'));
export const PODetailPage = lazyWithReload(() => import('@/pages/purchaseOrders/PODetailPage'));

// Vendor credits
export const VendorCreditListPage = lazyWithReload(
  () => import('@/pages/vendorCredits/VendorCreditListPage'),
);
export const VendorCreditFormPage = lazyWithReload(
  () => import('@/pages/vendorCredits/VendorCreditFormPage'),
);
export const VendorCreditDetailPage = lazyWithReload(
  () => import('@/pages/vendorCredits/VendorCreditDetailPage'),
);

// Inventory — items, their stock ledger, and adjustments.
export const InventoryListPage = lazyWithReload(() => import('@/pages/inventory/InventoryListPage'));
export const InventoryFormPage = lazyWithReload(() => import('@/pages/inventory/InventoryFormPage'));
export const InventoryDetailPage = lazyWithReload(
  () => import('@/pages/inventory/InventoryDetailPage'),
);
export const AdjustStockPage = lazyWithReload(() => import('@/pages/inventory/AdjustStockPage'));

// Delivery operations — both roles, behind the `delivery` feature.
export const DeliveryMonitorPage = lazyWithReload(
  () => import('@/pages/deliveries/DeliveryMonitorPage'),
);
export const CreateDeliveryPage = lazyWithReload(
  () => import('@/pages/deliveries/CreateDeliveryPage'),
);
export const AssignDeliveriesPage = lazyWithReload(
  () => import('@/pages/deliveries/AssignDeliveriesPage'),
);
export const CompletionsPage = lazyWithReload(() => import('@/pages/deliveries/CompletionsPage'));
export const DeliveryDetailPage = lazyWithReload(
  () => import('@/pages/deliveries/DeliveryDetailPage'),
);
export const RidersListPage = lazyWithReload(() => import('@/pages/deliveries/RidersListPage'));
export const RiderFormPage = lazyWithReload(() => import('@/pages/deliveries/RiderFormPage'));
export const RiderDetailPage = lazyWithReload(() => import('@/pages/deliveries/RiderDetailPage'));

// Payroll and budgets — owner only, so staff never download these chunks.
export const EmployeeListPage = lazyWithReload(() => import('@/pages/payroll/EmployeeListPage'));
export const EmployeeFormPage = lazyWithReload(() => import('@/pages/payroll/EmployeeFormPage'));
export const PayrollRunListPage = lazyWithReload(() => import('@/pages/payroll/PayrollRunListPage'));
export const PayrollRunFormPage = lazyWithReload(() => import('@/pages/payroll/PayrollRunFormPage'));
export const PayrollRunDetailPage = lazyWithReload(
  () => import('@/pages/payroll/PayrollRunDetailPage'),
);
export const BudgetListPage = lazyWithReload(() => import('@/pages/budgets/BudgetListPage'));
export const BudgetFormPage = lazyWithReload(() => import('@/pages/budgets/BudgetFormPage'));
export const BudgetDetailPage = lazyWithReload(() => import('@/pages/budgets/BudgetDetailPage'));

// Settings — owner only. My Account is both roles.
export const CompanyProfilePage = lazyWithReload(() => import('@/pages/settings/CompanyProfilePage'));
export const TeamPage = lazyWithReload(() => import('@/pages/settings/TeamPage'));
export const MyAccountPage = lazyWithReload(() => import('@/pages/account/MyAccountPage'));

// Chart of accounts — admin only, so staff never download these chunks either.
export const AccountListPage = lazyWithReload(() => import('@/pages/accounts/AccountListPage'));
export const AccountFormPage = lazyWithReload(() => import('@/pages/accounts/AccountFormPage'));
export const AccountDetailPage = lazyWithReload(
  () => import('@/pages/accounts/AccountDetailPage'),
);

// Journal entries
export const JournalEntryListPage = lazyWithReload(
  () => import('@/pages/journalEntries/JournalEntryListPage'),
);
export const JournalEntryFormPage = lazyWithReload(
  () => import('@/pages/journalEntries/JournalEntryFormPage'),
);
export const JournalEntryDetailPage = lazyWithReload(
  () => import('@/pages/journalEntries/JournalEntryDetailPage'),
);
export const OpeningBalancePage = lazyWithReload(
  () => import('@/pages/journalEntries/OpeningBalancePage'),
);

// Reports. Lazy matters more here than anywhere: four of these pull in recharts,
// and nobody reaches a report in the first few seconds of a session.
export const ReportsHubPage = lazyWithReload(() => import('@/pages/reports/ReportsHubPage'));
export const ProfitLossPage = lazyWithReload(() => import('@/pages/reports/ProfitLossPage'));
export const BalanceSheetPage = lazyWithReload(() => import('@/pages/reports/BalanceSheetPage'));
export const TrialBalancePage = lazyWithReload(() => import('@/pages/reports/TrialBalancePage'));
export const CashFlowPage = lazyWithReload(() => import('@/pages/reports/CashFlowPage'));
export const GeneralLedgerPage = lazyWithReload(
  () => import('@/pages/reports/GeneralLedgerPage'),
);
export const ArAgingPage = lazyWithReload(() => import('@/pages/reports/ArAgingPage'));
export const ApAgingPage = lazyWithReload(() => import('@/pages/reports/ApAgingPage'));
export const InventoryValuationPage = lazyWithReload(
  () => import('@/pages/reports/InventoryValuationPage'),
);
export const InventoryItemReportPage = lazyWithReload(
  () => import('@/pages/reports/InventoryItemReportPage'),
);
export const AnalyticsPage = lazyWithReload(() => import('@/pages/reports/AnalyticsPage'));

// Bank reconciliation — owner only, so staff never download these chunks either.
export const ReconciliationListPage = lazyWithReload(
  () => import('@/pages/reconciliations/ReconciliationListPage'),
);
export const ReconcilePage = lazyWithReload(
  () => import('@/pages/reconciliations/ReconcilePage'),
);
export const ReconciliationDetailPage = lazyWithReload(
  () => import('@/pages/reconciliations/ReconciliationDetailPage'),
);

// Tax — the liability is shared with staff; payments and rates are owner only.
export const TaxLiabilityPage = lazyWithReload(() => import('@/pages/tax/TaxLiabilityPage'));
export const TaxPaymentsPage = lazyWithReload(() => import('@/pages/tax/TaxPaymentsPage'));
export const TaxPaymentFormPage = lazyWithReload(
  () => import('@/pages/tax/TaxPaymentFormPage'),
);
export const TaxRatesPage = lazyWithReload(() => import('@/pages/tax/TaxRatesPage'));

// Approvals — the owner's inbox, and the detail view both roles share.
export const ApprovalsInboxPage = lazyWithReload(
  () => import('@/pages/approvals/ApprovalsInboxPage'),
);
export const ApprovalDetailPage = lazyWithReload(
  () => import('@/pages/approvals/ApprovalDetailPage'),
);

// Onboarding and renewal. Behind sign-in, and reached minutes after the landing
// page at the earliest — no reason for a first-time visitor to download the plan
// grid, the bank-transfer panel and the company form before reading the pitch.
export const CompanySetupPage = lazyWithReload(
  () => import('@/pages/onboarding/CompanySetupPage'),
);
export const PlanSelectPage = lazyWithReload(() => import('@/pages/onboarding/PlanSelectPage'));
export const PaySubscriptionPage = lazyWithReload(
  () => import('@/pages/onboarding/PaySubscriptionPage'),
);
export const RenewSubscriptionPage = lazyWithReload(
  () => import('@/pages/account/RenewSubscriptionPage'),
);

// The token proof sheet — not linked from the product, so never worth shipping
// in the first chunk.
export const DesignTokens = lazyWithReload(() => import('@/pages/DesignTokens'));
