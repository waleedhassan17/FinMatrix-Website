// ═══ FinMatrix Web — Migration Center sources ═══
//
// One place for what each source system asks of the owner, the guide links
// and the support contact. The guide URLs are placeholders until the help
// pages are published.

export type MigrationSourceSystem =
  | 'finmatrix_template'
  | 'generic_spreadsheet'
  | 'tally'
  | 'peachtree'
  | 'quickbooks_online'
  | 'quickbooks_desktop'
  | 'xero'
  | 'zoho_books'
  | 'odoo'
  | 'sage_50'
  | 'sage_accounting'
  | 'busy'
  | 'marg';

export interface MigrationSource {
  id: MigrationSourceSystem;
  label: string;
  description: string;
  files: string[];
  guideUrl: string;
}

const GUIDE_BASE = 'https://finmatrix.pk/help/migration';

export const MIGRATION_SOURCES: MigrationSource[] = [
  {
    id: 'finmatrix_template',
    label: 'FinMatrix starter workbook',
    description: 'Fill in our Excel workbook. The fastest and most reliable way in.',
    files: ['The starter workbook, filled in (one .xlsx)'],
    guideUrl: `${GUIDE_BASE}/starter-workbook`,
  },
  {
    id: 'tally',
    label: 'TallyPrime',
    description: 'Export from Tally as XML; we read the masters, balances, bills and stock.',
    files: ['All Masters (XML)', 'Trial Balance, ledger-wise (XML)', 'Bills Receivable and Bills Payable (XML)', 'Stock Summary (XML)'],
    guideUrl: `${GUIDE_BASE}/tally`,
  },
  {
    id: 'generic_spreadsheet',
    label: 'Any spreadsheet',
    description: 'Excel or CSV exports from any system. We match the columns and ask about the rest.',
    files: ['Chart of accounts', 'Trial balance at the cutover date', 'Open customer invoices', 'Open vendor bills', 'Stock on hand (if you keep stock)'],
    guideUrl: `${GUIDE_BASE}/spreadsheets`,
  },
  {
    id: 'peachtree',
    label: 'Peachtree / Sage 50',
    description: 'Upload the company backup (.ptb, up to 2 GB) and four of its reports. FinMatrix reads the books from the backup and proves them against the reports.',
    files: ['The company backup (File → Back Up, a .ptb file)', 'General Ledger Trial Balance (Excel)', 'Aged Receivables (Excel)', 'Aged Payables (Excel)', 'Inventory Valuation Report (Excel, if you keep stock)'],
    guideUrl: `${GUIDE_BASE}/peachtree`,
  },
  {
    id: 'quickbooks_online',
    label: 'QuickBooks Online',
    description: 'Upload the "Export data" ZIP and five reports, exported to Excel as they are. FinMatrix reads QuickBooks\' own layouts and proves every total each report prints.',
    files: ['Export data ZIP (trial balance, customers, vendors)', 'Account List', 'A/R Aging Detail', 'A/P Aging Detail', 'Product/Service List', 'Inventory Valuation Summary'],
    guideUrl: `${GUIDE_BASE}/quickbooks-online`,
  },
  {
    id: 'quickbooks_desktop',
    label: 'QuickBooks Desktop',
    description: 'Export the lists to IIF and four reports to Excel or CSV. Pro, Premier, Enterprise and Mac.',
    files: ['Lists exported to IIF (accounts, customers, vendors, items)', 'Trial Balance', 'A/R Aging Detail', 'A/P Aging Detail', 'Inventory Valuation Summary'],
    guideUrl: `${GUIDE_BASE}/quickbooks-desktop`,
  },
  {
    id: 'xero',
    label: 'Xero',
    description: 'Export the chart of accounts, contacts and products as CSV and four reports to Excel, as they are. FinMatrix reads Xero\'s own layouts, uses the trial balance\'s year-to-date figures and proves every total each report prints.',
    files: ['Chart of accounts (CSV)', 'Contacts (CSV)', 'Products and services (CSV)', 'Trial Balance', 'Aged Receivables Detail', 'Aged Payables Detail', 'Inventory Item List'],
    guideUrl: `${GUIDE_BASE}/xero`,
  },
  {
    id: 'zoho_books',
    label: 'Zoho Books',
    description: 'Export the chart of accounts, customers, vendors and items from their list pages and four reports, as they are. FinMatrix reads Zoho Books\' own layouts and proves every total each report prints.',
    files: ['Chart of Accounts', 'Customers', 'Vendors', 'Items', 'Trial Balance', 'AR Aging Details', 'AP Aging Details', 'Inventory Valuation Summary'],
    guideUrl: `${GUIDE_BASE}/zoho-books`,
  },
  {
    id: 'odoo',
    label: 'Odoo',
    description: 'Export the chart of accounts, unpaid invoices and bills, products and stock from Odoo\'s list views (XLSX), and a trial balance. FinMatrix reads them by their columns and asks about anything it is not sure of; the step-by-step guide shows each export.',
    files: ['Chart of Accounts', 'Trial Balance', 'Unpaid customer invoices', 'Unpaid vendor bills', 'Stock valuation'],
    guideUrl: `${GUIDE_BASE}/odoo`,
  },
  {
    id: 'sage_50',
    label: 'Sage 50 Accounts (UK)',
    description: 'Export the nominal list, period trial balance, detailed aged debtors and creditors and product valuation to Excel. FinMatrix reads them by their columns and asks about anything it is not sure of; the step-by-step guide shows each export.',
    files: ['Nominal codes', 'Period Trial Balance', 'Aged Debtors (detailed)', 'Aged Creditors (detailed)', 'Stock valuation'],
    guideUrl: `${GUIDE_BASE}/sage-50`,
  },
  {
    id: 'sage_accounting',
    label: 'Sage Accounting',
    description: 'Export the chart of accounts, trial balance, aged debtors and creditors, contacts and products as CSV. FinMatrix reads them by their columns and asks about anything it is not sure of; the step-by-step guide shows each export.',
    files: ['Chart of Accounts', 'Trial Balance', 'Aged Debtors', 'Aged Creditors', 'Stock valuation'],
    guideUrl: `${GUIDE_BASE}/sage-accounting`,
  },
  {
    id: 'busy',
    label: 'Busy',
    description: 'Export the trial balance, bill-wise outstanding receivables and payables and stock status to Excel (Alt+E). FinMatrix reads them by their columns and asks about anything it is not sure of; the step-by-step guide shows each export.',
    files: ['Trial Balance', 'Bill-wise outstanding (receivables, payables)', 'Stock Status / Valuation'],
    guideUrl: `${GUIDE_BASE}/busy`,
  },
  {
    id: 'marg',
    label: 'Marg',
    description: 'Export the trial balance, bill-wise debtors and creditors outstanding and stock valuation to Excel. FinMatrix reads them by their columns and asks about anything it is not sure of; the step-by-step guide shows each export.',
    files: ['Trial Balance', 'Outstanding (receivables, payables)', 'Stock valuation'],
    guideUrl: `${GUIDE_BASE}/marg`,
  },
];

export const sourceById = (id: string) => MIGRATION_SOURCES.find((s) => s.id === id);

/** How a batch is referred to with support (matches the server's MIG-XXXXXXXX). */
export const supportReference = (batchId: string) => `MIG-${batchId.slice(0, 8).toUpperCase()}`;
