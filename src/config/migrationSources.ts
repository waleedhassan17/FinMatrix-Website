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
  | 'xero'
  | 'odoo';

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
    description: 'Export reports to Excel or CSV. Read as a spreadsheet for now.',
    files: ['Chart of Accounts', 'General Ledger Trial Balance', 'Aged Receivables', 'Aged Payables', 'Inventory Valuation'],
    guideUrl: `${GUIDE_BASE}/peachtree`,
  },
  {
    id: 'quickbooks_online',
    label: 'QuickBooks Online',
    description: 'Export reports to Excel. Read as a spreadsheet for now.',
    files: ['Account List', 'Trial Balance', 'Open Invoices', 'Unpaid Bills', 'Inventory Valuation Summary'],
    guideUrl: `${GUIDE_BASE}/quickbooks`,
  },
  {
    id: 'xero',
    label: 'Xero',
    description: 'Export reports to Excel. Read as a spreadsheet for now.',
    files: ['Chart of Accounts', 'Trial Balance', 'Aged Receivables Detail', 'Aged Payables Detail', 'Inventory Item Summary'],
    guideUrl: `${GUIDE_BASE}/xero`,
  },
  {
    id: 'odoo',
    label: 'Odoo',
    description: 'Export lists to Excel. Read as a spreadsheet for now.',
    files: ['Chart of Accounts', 'Trial Balance', 'Unpaid customer invoices', 'Unpaid vendor bills', 'Stock valuation'],
    guideUrl: `${GUIDE_BASE}/odoo`,
  },
];

export const sourceById = (id: string) => MIGRATION_SOURCES.find((s) => s.id === id);

/** "Ask for help": the support inbox and how a batch is referred to. */
export const MIGRATION_SUPPORT = {
  email: 'support@finmatrix.pk',
  subject: (batchId: string) => `Migration help — ${supportReference(batchId)}`,
};

export const supportReference = (batchId: string) => `MIG-${batchId.slice(0, 8).toUpperCase()}`;
