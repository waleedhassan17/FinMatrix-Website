// ═══ FinMatrix Web — step-by-step migration guides ═══
//
// One guide per source system: what to do before exporting, each file to
// export (per version), what FinMatrix checks, common problems and what to do
// after the import. The same definition drives the guide page, the Upload
// step's checklist (which ticks as files are recognised) and the mobile app's
// copy (FinMatrix/src/config/migrationGuides.ts — keep the two in step).
//
// Menu paths are taken from each vendor's own documentation, cited in
// `references`. Where a version's menu differs, the guide names the report so
// the owner can search for it.

import type { MigrationSourceSystem } from '@/config/migrationSources';

export interface GuideHow {
  /** Which versions these steps are for, e.g. "Sage 50 2013 – current". */
  versions: string;
  steps: string[];
}

export interface GuideFile {
  id: string;
  title: string;
  required: 'yes' | 'if-stock' | 'optional';
  /** What FinMatrix recognises it as: a detected sheet target, or 'ptb' for a Peachtree backup. */
  detects: string[];
  /** Which route needs it, for sources with more than one way in. */
  routes?: string[];
  how: GuideHow[];
  /** Settings that matter when exporting. */
  settings?: string[];
  /** What FinMatrix takes from it. */
  gives: string;
}

export interface GuideRoute {
  id: string;
  title: string;
  when: string;
}

export interface MigrationGuide {
  source: MigrationSourceSystem;
  title: string;
  /** ready: proven on real exports. guided: works on documented layouts; support checks your files with you. */
  status: 'ready' | 'guided';
  summary: string;
  versions: string[];
  findVersion: string;
  before: string[];
  routes?: GuideRoute[];
  files: GuideFile[];
  problems: Array<{ problem: string; fix: string }>;
  references: Array<{ label: string; url: string }>;
}

/** The same for every source: what to do in the old system before exporting anything. */
export const BEFORE_YOU_START = [
  'Choose your cutover date: the first day FinMatrix keeps your books. Everything up to the day before stays in your old system; everything from the cutover day is entered in FinMatrix.',
  'In your old system, post every invoice, bill, receipt, payment and stock movement dated before the cutover date. Nothing should be left unposted or on hold.',
  'Reconcile your bank and cash accounts up to the day before the cutover, so their balances are right.',
  'Take a full backup of your old system and keep it. FinMatrix never changes your old books.',
  'In FinMatrix, check that Settings → Company has the same fiscal year start month as your old system.',
];

/** The same for every source: what FinMatrix does once the files are in. */
export const AFTER_UPLOAD = [
  'Match: confirm anything FinMatrix is not sure of — a sheet, a column or an account it proposes to match. Each proposal says why.',
  'Fix: answer each question in plain words (a date that could be read two ways, a duplicate customer, an account that is not in your chart). Nothing is guessed.',
  'Check: FinMatrix runs a practice import and eleven checks — every row accounted for, the trial balance balanced, every account, your receivables, payables and stock equal to the detail, the balance sheet, and every figure read back exactly. All must pass at zero difference.',
  'Review: read the certificate — every check, every posting, every row set aside with its reason — tick the spot checks against your old system, and sign off.',
  'Import: everything is posted dated the day before your cutover, and your books are closed through that day. Until you close the migration you can undo it in one step.',
];

const asOf = 'the day before your cutover date';

export const MIGRATION_GUIDES: MigrationGuide[] = [
  {
    source: 'finmatrix_template',
    title: 'FinMatrix starter workbook',
    status: 'ready',
    summary: 'Fill in our Excel workbook — eight sheets, one for each thing FinMatrix needs. The fastest way in, from any system, including books kept by hand.',
    versions: ['Any version of Excel, Google Sheets or LibreOffice'],
    findVersion: 'Any spreadsheet program that saves .xlsx works.',
    before: BEFORE_YOU_START,
    files: [
      {
        id: 'workbook',
        title: 'The starter workbook, filled in',
        required: 'yes',
        detects: ['accounts', 'trial_balance'],
        gives: 'Your chart of accounts, customers, vendors, items, trial balance, open invoices and bills, and stock.',
        how: [
          {
            versions: 'Any',
            steps: [
              'On the Start step, press "Download starter workbook". It already carries your cutover date.',
              'Fill each sheet from your old system. Leave a sheet empty if you have nothing for it (e.g. Stock when you keep no stock).',
              `Trial Balance: every account's balance as at ${asOf}, debit or credit. Debits must equal credits.`,
              'Open Invoices and Open Bills: one row per unpaid document, with the amount still due. They must add up to your receivables and payables accounts.',
              'Stock: quantity on hand and unit cost per item. Quantity × cost must add up to your inventory account.',
              'Save as .xlsx and upload it on the Upload step.',
            ],
          },
        ],
        settings: ['Amounts may be typed as 120000, 1,20,000, Rs 120,000 or in Urdu digits; dates as 30/09/2026 or 2026-09-30.'],
      },
    ],
    problems: [
      { problem: 'The trial balance does not balance.', fix: 'Debits must equal credits. FinMatrix shows the difference; correct the row in the workbook and upload it again.' },
      { problem: 'Receivables do not match the open invoices.', fix: 'The open invoices must add up to the receivables account. A missing invoice or a wrong amount due is the usual cause.' },
      { problem: 'A date could be day/month or month/day.', fix: 'FinMatrix asks which you meant. Typing dates as 2026-09-30 avoids the question.' },
    ],
    references: [],
  },
  {
    source: 'generic_spreadsheet',
    title: 'Any other system (spreadsheets as exported)',
    status: 'ready',
    summary: 'Upload the reports your current system exports to Excel or CSV, as they are. FinMatrix recognises sheets by their columns, asks when unsure, and checks everything before import.',
    versions: ['Any accounting or ERP system that exports to Excel or CSV'],
    findVersion: 'Not needed: FinMatrix reads the columns, whatever the system.',
    before: BEFORE_YOU_START,
    files: [
      { id: 'tb', title: 'Trial balance', required: 'yes', detects: ['trial_balance'], gives: 'Every account balance as at the day before cutover.', how: [{ versions: 'Any', steps: [`Run the trial balance as at ${asOf}, with account codes, and export it to Excel.`] }] },
      { id: 'chart', title: 'Chart of accounts (with each account\'s type)', required: 'yes', detects: ['accounts'], gives: 'Account numbers, names and types (asset, liability, equity, income, expense).', how: [{ versions: 'Any', steps: ['Export the list of accounts with their type or group.'] }] },
      { id: 'ar', title: 'Customer outstanding (unpaid invoices)', required: 'yes', detects: ['open_invoices'], gives: 'Each unpaid invoice with the amount still due.', how: [{ versions: 'Any', steps: [`Export receivables outstanding invoice by invoice (bill-wise), as at ${asOf}.`] }] },
      { id: 'ap', title: 'Supplier outstanding (unpaid bills)', required: 'yes', detects: ['open_bills'], gives: 'Each unpaid bill with the amount still due.', how: [{ versions: 'Any', steps: [`Export payables outstanding bill by bill, as at ${asOf}.`] }] },
      { id: 'customers', title: 'Customer list', required: 'optional', detects: ['customers'], gives: 'Codes, names, phones, cities, terms, credit limits.', how: [{ versions: 'Any', steps: ['Export the customer list.'] }] },
      { id: 'vendors', title: 'Supplier list', required: 'optional', detects: ['vendors'], gives: 'Codes, names and contact details.', how: [{ versions: 'Any', steps: ['Export the supplier list.'] }] },
      { id: 'items', title: 'Item list', required: 'if-stock', detects: ['items'], gives: 'Item codes, names, units and prices.', how: [{ versions: 'Any', steps: ['Export the item / product list.'] }] },
      { id: 'stock', title: 'Closing stock (quantity and cost per item)', required: 'if-stock', detects: ['stock'], gives: 'Quantity on hand and unit cost per item.', how: [{ versions: 'Any', steps: [`Export the stock summary or valuation as at ${asOf}, item by item.`] }] },
    ],
    problems: [
      { problem: 'FinMatrix does not recognise a sheet.', fix: 'On the Match step choose what the sheet holds, or skip it. Nothing is imported from a sheet you have not confirmed.' },
      { problem: 'Accounts have no type.', fix: 'Add your chart of accounts with each account\'s type, or choose a type for each account FinMatrix asks about.' },
      { problem: 'A file is the old Excel format (.xls).', fix: 'Open it in Excel and use Save As → Excel Workbook (.xlsx).' },
    ],
    references: [],
  },
  {
    source: 'tally',
    title: 'TallyPrime / Tally.ERP 9',
    status: 'guided',
    summary: 'Export five reports from Tally as XML (Data Interchange). FinMatrix reads Tally\'s groups, ledgers, bill-wise outstandings and stock directly.',
    versions: ['TallyPrime (all releases)', 'Tally.ERP 9'],
    findVersion: 'TallyPrime shows its release on the startup screen and under Help → About. Tally.ERP 9 shows "Tally.ERP 9" with its release on the Gateway of Tally screen.',
    before: [
      ...BEFORE_YOU_START,
      'In Tally, make sure bill-wise details are on for your party ledgers (Maintain balances bill-by-bill: Yes). Without it Tally cannot list each unpaid invoice.',
      'Set Tally\'s current date (Alt+F2 Period) to end on the day before your cutover date.',
    ],
    files: [
      {
        id: 'masters',
        title: 'All Masters',
        required: 'yes',
        detects: ['accounts'],
        gives: 'Groups, ledgers (with each party\'s details) and stock items.',
        how: [
          { versions: 'TallyPrime', steps: ['Gateway of Tally → Alt+E (Export) → Masters → All Masters.', 'Press C (Configure): File format = XML (Data Interchange). Note the folder.', 'Press Enter / Send to export.'] },
          { versions: 'Tally.ERP 9', steps: ['Gateway of Tally → Display → List of Accounts.', 'Alt+E (Export): Format = XML (Data Interchange), Type of Masters = All Masters.', 'Press Enter to export.'] },
        ],
      },
      {
        id: 'tb',
        title: 'Trial Balance (ledger-wise)',
        required: 'yes',
        detects: ['trial_balance'],
        gives: 'Every ledger\'s closing balance as at the day before cutover.',
        how: [
          { versions: 'TallyPrime', steps: ['Gateway of Tally → Display More Reports → Trial Balance.', 'F5 (Ledger-wise) so each ledger is listed, not just groups.', 'Alt+E (Export) → Current → C (Configure): File format = XML (Data Interchange). Export.'] },
          { versions: 'Tally.ERP 9', steps: ['Gateway of Tally → Display → Trial Balance.', 'Alt+F1 (Detailed) or F5 so ledgers are listed.', 'Alt+E (Export): Format = XML (Data Interchange). Export.'] },
        ],
        settings: [`The period must end on ${asOf}.`],
      },
      {
        id: 'receivables',
        title: 'Bills Receivable (bill-wise outstanding)',
        required: 'yes',
        detects: ['open_invoices'],
        gives: 'Each unpaid sales invoice with its due date and pending amount.',
        how: [
          { versions: 'TallyPrime', steps: ['Gateway of Tally → Display More Reports → Statements of Accounts → Outstandings → Receivables.', 'Alt+E (Export) → Current → Configure: XML (Data Interchange). Export.'] },
          { versions: 'Tally.ERP 9', steps: ['Gateway of Tally → Display → Statements of Accounts → Outstandings → Receivables.', 'Alt+E (Export): XML (Data Interchange). Export.'] },
        ],
      },
      {
        id: 'payables',
        title: 'Bills Payable (bill-wise outstanding)',
        required: 'yes',
        detects: ['open_bills'],
        gives: 'Each unpaid purchase bill with its due date and pending amount.',
        how: [
          { versions: 'TallyPrime', steps: ['Display More Reports → Statements of Accounts → Outstandings → Payables.', 'Alt+E (Export) → Current → Configure: XML (Data Interchange). Export.'] },
          { versions: 'Tally.ERP 9', steps: ['Display → Statements of Accounts → Outstandings → Payables.', 'Alt+E (Export): XML (Data Interchange). Export.'] },
        ],
      },
      {
        id: 'stock',
        title: 'Stock Summary (closing)',
        required: 'if-stock',
        detects: ['stock'],
        gives: 'Closing quantity, rate and value of every stock item.',
        how: [
          { versions: 'TallyPrime', steps: ['Gateway of Tally → Stock Summary.', 'Alt+E (Export) → Current → Configure: XML (Data Interchange). Export.'] },
          { versions: 'Tally.ERP 9', steps: ['Gateway of Tally → Stock Summary.', 'Alt+E (Export): XML (Data Interchange). Export.'] },
        ],
      },
    ],
    problems: [
      { problem: 'Open invoices are missing for a party.', fix: 'That party ledger does not keep bill-wise details. Turn on "Maintain balances bill-by-bill" for it in Tally, or enter its outstanding bills in the starter workbook.' },
      { problem: 'The trial balance shows only groups.', fix: 'Export it ledger-wise (F5 in TallyPrime) so every ledger is listed.' },
      { problem: 'Two ledgers for the same account, e.g. "Sales Tax Payable" in Tally and in FinMatrix.', fix: 'FinMatrix proposes matching them by name; confirm on the Match step, or keep yours separate.' },
    ],
    references: [
      { label: 'TallyPrime help — exporting reports', url: 'https://help.tallysolutions.com/export-data-faq/' },
      { label: 'Trial balance export from TallyPrime (XML, Alt+E)', url: 'https://support.kdksoftware.com/portal/en/kb/articles/express-itr-how-to-import-trial-balance-from-tally' },
    ],
  },
  {
    source: 'peachtree',
    title: 'Peachtree / Sage 50 US',
    status: 'guided',
    summary: 'Two ways in. With a backup FinMatrix reads your books straight from Peachtree\'s database and proves them against four of its reports. Any version can also come in from eight report exports alone.',
    versions: ['Sage 50 US 2013 – current', 'Peachtree 2008 – 2012'],
    findVersion: 'Help → About Sage 50 (or About Peachtree) shows the year and release.',
    before: [
      ...BEFORE_YOU_START,
      'In Peachtree, run File → Data Verification (Sage 50 2013 onwards) and fix anything it reports, so the backup and reports agree.',
    ],
    routes: [
      { id: 'backup', title: 'A. Backup + four reports (recommended)', when: 'Peachtree 2015 backups are verified; other versions\' backups are checked when uploaded, and if FinMatrix cannot read one it says so and points you to route B.' },
      { id: 'reports', title: 'B. Eight report exports (any version)', when: 'Any Peachtree or Sage 50 US version, including ones whose backup FinMatrix cannot read.' },
    ],
    files: [
      {
        id: 'backup',
        title: 'Company backup (.ptb)',
        required: 'yes',
        routes: ['backup'],
        detects: ['ptb'],
        gives: 'Your whole company: accounts, customers, vendors, items, every posted entry. FinMatrix reads it in the background — up to 2 GB.',
        how: [{ versions: 'All versions', steps: ['File → Back Up.', 'Press Back Up, choose a folder, Save, and wait until Sage 50 says the backup is complete.', 'Upload the .ptb file it saved. Large backups go up in pieces and resume if the connection drops.'] }],
      },
      {
        id: 'tb',
        title: 'General Ledger Trial Balance',
        required: 'yes',
        routes: ['backup', 'reports'],
        detects: ['peachtree:trial_balance'],
        gives: 'Every account\'s balance — the proof the backup is read correctly (route A), or the balances themselves (route B).',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → General Ledger → General Ledger Trial Balance.', `Options: As of = ${asOf}; tick "Include Accounts with Zero Amounts". OK.`, 'Press Excel at the top of the report → Create a new Microsoft Excel workbook → Sage 50 layout → OK. Save the workbook as .xlsx.'] }],
      },
      {
        id: 'ar',
        title: 'Aged Receivables (detail)',
        required: 'yes',
        routes: ['backup', 'reports'],
        detects: ['peachtree:aged_receivables'],
        gives: 'Each unpaid invoice per customer.',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → Accounts Receivable → Aged Receivables.', `Options: As of = ${asOf}. The report must list each invoice under its customer, not only customer totals.`, 'Excel → new workbook → Sage 50 layout. Save as .xlsx.'] }],
      },
      {
        id: 'ap',
        title: 'Aged Payables (detail)',
        required: 'yes',
        routes: ['backup', 'reports'],
        detects: ['peachtree:aged_payables'],
        gives: 'Each unpaid bill per vendor.',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → Accounts Payable → Aged Payables.', `Options: As of = ${asOf}. The report must list each bill under its vendor, not only vendor totals.`, 'Excel → new workbook → Sage 50 layout. Save as .xlsx.'] }],
      },
      {
        id: 'stock',
        title: 'Inventory Valuation Report',
        required: 'if-stock',
        routes: ['backup', 'reports'],
        detects: ['peachtree:inventory_valuation'],
        gives: 'Quantity on hand and value per item.',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → Inventory → Inventory Valuation Report.', `Options: As of = ${asOf}.`, 'Excel → new workbook → Sage 50 layout. Save as .xlsx.'] }],
      },
      {
        id: 'chart',
        title: 'Chart of Accounts',
        required: 'yes',
        routes: ['reports'],
        detects: ['peachtree:chart_of_accounts'],
        gives: 'Account IDs, descriptions and types.',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → General Ledger → Chart of Accounts.', 'Excel → new workbook → Sage 50 layout. Save as .xlsx.'] }],
      },
      {
        id: 'customers',
        title: 'Customer List',
        required: 'yes',
        routes: ['reports'],
        detects: ['peachtree:customer_list'],
        gives: 'Customer IDs, names and contact details.',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → Accounts Receivable → Customer List.', 'Excel → new workbook → Sage 50 layout. Save as .xlsx.'] }],
      },
      {
        id: 'vendors',
        title: 'Vendor List',
        required: 'yes',
        routes: ['reports'],
        detects: ['peachtree:vendor_list'],
        gives: 'Vendor IDs, names and contact details.',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → Accounts Payable → Vendor List.', 'Excel → new workbook → Sage 50 layout. Save as .xlsx.'] }],
      },
      {
        id: 'items',
        title: 'Item List',
        required: 'if-stock',
        routes: ['reports'],
        detects: ['peachtree:item_list'],
        gives: 'Item IDs, descriptions, units and prices.',
        how: [{ versions: 'All versions', steps: ['Reports & Forms → Inventory → Item List.', 'Excel → new workbook → Sage 50 layout. Save as .xlsx.'] }],
      },
    ],
    problems: [
      { problem: '"The report is as of a different date."', fix: `Every report must be as of ${asOf}. Run it again with that date in Options and upload it again.` },
      { problem: 'A report does not match the backup.', fix: 'The reports and the backup must come from the same company at the same moment. Make the backup and the reports one after the other, without posting anything in between.' },
      { problem: 'Entries after the cutover date.', fix: 'Peachtree has entries dated on or after your cutover. Choose a cutover date after the last Peachtree entry.' },
      { problem: 'FinMatrix cannot read the backup.', fix: 'Use route B: export the eight reports listed here instead. They carry everything FinMatrix needs.' },
      { problem: 'The Excel button is greyed out.', fix: 'Sage 50 sends reports to Microsoft Excel installed on the same computer. Install Excel there (32- and 64-bit Office can matter), or export on a computer that has it.' },
    ],
    references: [
      { label: 'Sage 50 US — Back Up Company Data', url: 'https://help-sage50.na.sage.com/en-us/2023/Content/ADMIN/Backups/Back_Up_Company_Data.htm' },
      { label: 'Sage 50 US — General Ledger Trial Balance (report)', url: 'https://help-sage50.na.sage.com/en-us/2022/Content/Reports_Forms/FinancialReports/GeneralLedgerTrialBalance.htm' },
      { label: 'Sage 50 US — Copy report data to Microsoft Excel', url: 'https://help-sage50.na.sage.com/en-us/2019/Content/Reports_Forms/MICROSOFT/Copy_Report_to_a_Microsoft_Excel.htm' },
    ],
  },
];


const QB_REFERENCES = [
  { label: 'Intuit — Export reports, lists and more from QuickBooks Online', url: 'https://quickbooks.intuit.com/learn-support/en-us/help-articles/export-reports-lists-and-more/00/239728' },
  { label: 'Intuit — IIF overview: import kit, sample files and headers (QuickBooks Desktop)', url: 'https://quickbooks.intuit.com/learn-support/en-us/help-articles/iif-overview-import-kit-sample-files-and-headers/00/262115' },
];

MIGRATION_GUIDES.push(
  {
    source: 'quickbooks_online',
    title: 'QuickBooks Online',
    status: 'guided',
    summary: "Export the \"Export data\" ZIP and five reports to Excel, unchanged. FinMatrix reads QuickBooks' own report layouts, numbers your accounts if QuickBooks does not, gives customers and vendors codes, and proves every total each report prints.",
    versions: ['Simple Start, Essentials, Plus, Advanced', 'US, UK, Canada, Australia, India layouts'],
    findVersion: 'Any QuickBooks Online subscription works the same way. Your region only changes spellings (A/R Ageing in the UK, Supplier for Vendor).',
    before: [
      ...BEFORE_YOU_START,
      'In QuickBooks, empty Undeposited Funds (deposit everything received before the cutover) and Opening Balance Equity (move its balance to Owner\'s Equity or Retained Earnings) — otherwise both come across as they are.',
      'Export amounts in your home currency: FinMatrix keeps one currency. Foreign-currency customers and vendors are read from the reports\' home-currency columns.',
    ],
    files: [
      {
        id: 'export',
        title: '"Export data" ZIP (trial balance, customer and vendor lists)',
        required: 'yes',
        detects: ['quickbooks_online:trial_balance'],
        gives: 'The trial balance and the customer and vendor contact lists. Its general ledger, journal, profit and loss and balance sheet are recognised and skipped.',
        how: [
          {
            versions: 'All subscriptions',
            steps: [
              'Settings (gear) → Tools → Export data.',
              `Reports tab: set the date range to end on ${asOf}. Keep Trial balance on (the others may stay on; FinMatrix skips them).`,
              'Lists tab: keep Customers and Vendors (Suppliers) on.',
              'Press Export to Excel. QuickBooks downloads one ZIP — upload it as it is.',
            ],
          },
        ],
      },
      {
        id: 'chart',
        title: 'Account List',
        required: 'yes',
        detects: ['quickbooks_online:chart_of_accounts'],
        gives: 'Each account\'s type and detail type, so FinMatrix knows receivables, inventory, payables and retained earnings.',
        how: [{ versions: 'All subscriptions', steps: ['Reports → search "Account List" → open it.', 'Export (the arrow at the top of the report) → Export to Excel.'] }],
      },
      {
        id: 'ar',
        title: 'A/R Aging Detail',
        required: 'yes',
        detects: ['quickbooks_online:aged_receivables'],
        gives: 'Every unpaid invoice, credit memo and unapplied payment, by customer.',
        how: [{ versions: 'All subscriptions', steps: ['Reports → search "A/R Aging Detail" (UK: "A/R Ageing Detail").', `Report period / As of: ${asOf}. Run report.`, 'Export → Export to Excel.'] }],
      },
      {
        id: 'ap',
        title: 'A/P Aging Detail',
        required: 'yes',
        detects: ['quickbooks_online:aged_payables'],
        gives: 'Every unpaid bill and vendor credit, by vendor.',
        how: [{ versions: 'All subscriptions', steps: ['Reports → search "A/P Aging Detail".', `As of: ${asOf}. Run report.`, 'Export → Export to Excel.'] }],
      },
      {
        id: 'items',
        title: 'Product/Service List',
        required: 'if-stock',
        detects: ['quickbooks_online:item_list'],
        gives: 'Each product\'s SKU, price and cost.',
        how: [{ versions: 'Plus, Advanced (inventory)', steps: ['Reports → search "Product/Service List".', 'Export → Export to Excel.'] }],
      },
      {
        id: 'stock',
        title: 'Inventory Valuation Summary',
        required: 'if-stock',
        detects: ['quickbooks_online:inventory_valuation'],
        gives: 'Quantity on hand and value of every product.',
        how: [{ versions: 'Plus, Advanced (inventory)', steps: ['Reports → search "Inventory Valuation Summary".', `As of: ${asOf}. Run report.`, 'Export → Export to Excel.'] }],
      },
    ],
    problems: [
      { problem: 'A report shows a different date.', fix: `Every report must be as of ${asOf}. Change the date, run it again, export again.` },
      { problem: '"A total does not add up" on a report.', fix: 'The report was changed after export, or exported in summary form. Export it again from QuickBooks and upload it unchanged.' },
      { problem: 'A customer paid more than they owed.', fix: 'FinMatrix asks you to accept holding the credit on Customer Advances, to apply when they next buy — or apply the credit in QuickBooks first.' },
      { problem: 'Accounts are matched to FinMatrix accounts of the same name.', fix: 'Confirm each proposal on the Match step (e.g. Sales Tax Payable → 2300), or keep yours separate.' },
    ],
    references: QB_REFERENCES,
  },
  {
    source: 'quickbooks_desktop',
    title: 'QuickBooks Desktop',
    status: 'guided',
    summary: 'Export your lists to an IIF file and four reports to Excel or CSV. FinMatrix reads the IIF lists and QuickBooks\' report layouts, brings jobs in under their customers, and proves every total each report prints.',
    versions: ['QuickBooks Desktop Pro, Premier, Enterprise 2016 – current', 'QuickBooks Desktop for Mac'],
    findVersion: 'Press F2 (Product Information) in QuickBooks Desktop for Windows; on a Mac, QuickBooks → About QuickBooks.',
    before: [
      ...BEFORE_YOU_START,
      'Empty Undeposited Funds and Opening Balance Equity in QuickBooks before you export (see the QuickBooks Online guide for why).',
      'Run File → Utilities → Verify Data and fix anything it reports.',
    ],
    files: [
      {
        id: 'iif',
        title: 'Lists exported to IIF',
        required: 'yes',
        detects: ['quickbooks_desktop:chart_of_accounts'],
        gives: 'Chart of accounts (with types and numbers), customers, vendors and items, in one file.',
        how: [
          { versions: 'Windows', steps: ['File → Utilities → Export → Lists to IIF Files.', 'Tick Chart of Accounts, Customer List, Vendor List and Item List. OK.', 'Save the .iif file and upload it.'] },
          { versions: 'Mac', steps: ['File → Export → To IIF (or "Lists to IIF Files" in your version).', 'Choose the chart of accounts, customers, vendors and items. Save and upload the .iif file.'] },
        ],
      },
      {
        id: 'tb',
        title: 'Trial Balance',
        required: 'yes',
        detects: ['quickbooks_desktop:trial_balance'],
        gives: 'Every account\'s balance.',
        how: [
          { versions: 'Windows', steps: ['Reports → Accountant & Taxes → Trial Balance.', `Dates: Custom, To = ${asOf}.`, 'Excel → Create New Worksheet → in a new workbook (or "Create a comma separated values (.csv) file"). Export.'] },
          { versions: 'Mac', steps: ['Reports → Accountant & Taxes → Trial Balance.', `To = ${asOf}.`, 'Export → Excel (or CSV).'] },
        ],
      },
      {
        id: 'ar',
        title: 'A/R Aging Detail',
        required: 'yes',
        detects: ['quickbooks_desktop:aged_receivables'],
        gives: 'Every open invoice, credit memo and payment, by customer and job.',
        how: [{ versions: 'Windows and Mac', steps: ['Reports → Customers & Receivables → A/R Aging Detail.', `Date: ${asOf}.`, 'Excel → Create New Worksheet (or CSV).'] }],
      },
      {
        id: 'ap',
        title: 'A/P Aging Detail',
        required: 'yes',
        detects: ['quickbooks_desktop:aged_payables'],
        gives: 'Every open bill and credit, by vendor.',
        how: [{ versions: 'Windows and Mac', steps: ['Reports → Vendors & Payables → A/P Aging Detail.', `Date: ${asOf}.`, 'Excel → Create New Worksheet (or CSV).'] }],
      },
      {
        id: 'stock',
        title: 'Inventory Valuation Summary',
        required: 'if-stock',
        detects: ['quickbooks_desktop:inventory_valuation'],
        gives: 'Quantity on hand and asset value of every inventory item.',
        how: [{ versions: 'Windows and Mac', steps: ['Reports → Inventory → Inventory Valuation Summary.', `Date: ${asOf}.`, 'Excel → Create New Worksheet (or CSV).'] }],
      },
    ],
    problems: [
      { problem: 'The IIF file is refused.', fix: 'Export it again with File → Utilities → Export → Lists to IIF Files, and upload it without opening it in Excel first (Excel can change it).' },
      { problem: 'Jobs.', fix: 'FinMatrix keeps documents per customer: each job\'s invoices come in under its customer, and the certificate lists them.' },
      { problem: 'A report does not add up.', fix: 'Export it again unchanged, in detail (not summary) form.' },
    ],
    references: QB_REFERENCES,
  },
);

const XERO_REFERENCES = [
  { label: 'Xero Central — About exporting data out of Xero', url: 'https://central.xero.com/0/article/Export-data-out-of-Xero' },
  { label: 'Xero Central — Export and print a report', url: 'https://central.xero.com/0/article/Export-or-print-a-report' },
  { label: 'Xero Central — Trial Balance report', url: 'https://central.xero.com/0/article/Trial-Balance-report-new-version' },
  { label: 'Xero Central — Aged Receivables Detail report', url: 'https://central.xero.com/0/article/Aged-Receivables-Detail-report-New' },
  { label: 'Xero Central — Export inventory items out of Xero', url: 'https://central.xero.com/0/article/Export-inventory-items-out-of-Xero' },
];

const ZOHO_REFERENCES = [
  { label: 'Zoho Books — Export data', url: 'https://www.zoho.com/books/help/import-export/export.html' },
  { label: 'Zoho Books — Customers and vendors: other actions (export)', url: 'https://www.zoho.com/books/help/contacts/other-actions.html' },
  { label: 'Zoho Books — Back up your data', url: 'https://www.zoho.com/books/help/settings/developer-and-data/backup.html' },
];

/** Xero's reports: run, set the date, Update, then Export → Excel. */
const xeroReport = (name: string, date = true) => [
  `Reporting (Accounting → Reports in older menus) → find "${name}" (use the search box).`,
  ...(date ? [`Set the date to ${asOf} ("As at" / end date). Press Update.`] : ['Press Update.']),
  'Export → Excel. Upload the file as it is.',
];

/** Zoho Books' reports: set the date, run, then Export → XLSX. */
const zohoReport = (where: string, name: string, extra: string[] = []) => [
  `Reports → ${where} → ${name}.`,
  `Change the date to "As of" ${asOf} (Customise Report → Date). Run Report.`,
  ...extra,
  'Export (the arrow at the top right) → XLSX (or CSV). Upload the file as it is.',
];

/** Zoho Books' list pages: More → Export. */
const zohoList = (where: string, action: string) => [
  `${where} → the More (⋯) icon at the top right → ${action}.`,
  'Export As / Export File Format: CSV or XLSX (not XLS). Leave the file protection password empty — FinMatrix cannot open a locked file.',
  'Export, then upload the file as it is.',
];

MIGRATION_GUIDES.push(
  {
    source: 'xero',
    title: 'Xero',
    status: 'guided',
    summary: "Export three lists as CSV and four reports to Excel, unchanged. FinMatrix reads Xero's own layouts, takes account codes from \"Sales (200)\", uses the trial balance's year-to-date columns, gives contacts codes, and proves every total each report prints.",
    versions: ['Xero (all plans: Starter / Ignite, Standard / Grow, Premium / Comprehensive, Ultimate)', 'All regions: UK, Australia, New Zealand, US, Canada, Singapore, South Africa and others'],
    findVersion: 'Xero is online and always on its latest version. Your region only changes some report names (the US calls Aged Receivables "Accounts Receivable Aging"). Older menus put reports under Accounting → Reports; newer ones under Reporting.',
    before: [
      ...BEFORE_YOU_START,
      'Export amounts in your base currency: FinMatrix keeps one currency, and Xero\'s aged reports and trial balance show the base currency by default.',
      'Check that every tracked inventory item has its quantity and value right as at the day before cutover (run Inventory Item List and compare with your stock count).',
    ],
    files: [
      {
        id: 'chart',
        title: 'Chart of accounts (CSV)',
        required: 'yes',
        detects: ['xero:chart_of_accounts'],
        gives: 'Every account\'s code, name and type, so FinMatrix knows bank, receivables, inventory, payables and equity accounts.',
        how: [{ versions: 'All plans', steps: ['Accounting → Chart of accounts.', 'Export (at the top of the list). Xero downloads ChartOfAccounts.csv — upload it as it is.'] }],
      },
      {
        id: 'contacts',
        title: 'Contacts (CSV)',
        required: 'optional',
        detects: ['xero:contact_list'],
        gives: 'Phone, email and address of each customer and supplier with something open. Xero\'s list does not say who is a customer and who a supplier, so a contact with nothing open is named in a warning, not guessed — add them in FinMatrix when needed.',
        how: [{ versions: 'All plans', steps: ['Contacts → All contacts.', 'Export (at the top of the list) → CSV. Upload Contacts.csv as it is.'] }],
      },
      {
        id: 'items',
        title: 'Products and services (CSV)',
        required: 'if-stock',
        detects: ['xero:item_list'],
        gives: 'Each item\'s code, name, sale price and purchase price. (Quantities come from the Inventory Item List.)',
        how: [{ versions: 'All plans', steps: ['Business → Products and services (older menus: Accounting → Inventory).', 'Export → CSV. Upload the file as it is.'] }],
      },
      {
        id: 'tb',
        title: 'Trial Balance',
        required: 'yes',
        detects: ['xero:trial_balance'],
        gives: 'Every account\'s balance. The year-to-date debit and credit columns are used, so profit and loss accounts carry the whole year, not one month.',
        settings: [`Date: ${asOf}.`, 'Keep the YTD Debit and YTD Credit columns.'],
        how: [{ versions: 'All plans', steps: xeroReport('Trial Balance') }],
      },
      {
        id: 'ar',
        title: 'Aged Receivables Detail',
        required: 'yes',
        detects: ['xero:aged_receivables'],
        gives: 'Every unpaid invoice, credit note and overpayment, by contact.',
        settings: ['Detail (not Summary).', `Date: ${asOf}.`, 'All contacts.'],
        how: [{ versions: 'All plans', steps: xeroReport('Aged Receivables Detail') }],
      },
      {
        id: 'ap',
        title: 'Aged Payables Detail',
        required: 'yes',
        detects: ['xero:aged_payables'],
        gives: 'Every unpaid bill, credit note and prepayment, by contact.',
        settings: ['Detail (not Summary).', `Date: ${asOf}.`, 'All contacts.'],
        how: [{ versions: 'All plans', steps: xeroReport('Aged Payables Detail') }],
      },
      {
        id: 'stock',
        title: 'Inventory Item List',
        required: 'if-stock',
        detects: ['xero:inventory_valuation'],
        gives: 'Quantity and value on hand of every tracked item.',
        how: [
          {
            versions: 'All plans',
            steps: [
              ...xeroReport('Inventory Item List'),
              'If your Xero shows the Inventory Item Summary instead, it works too when it shows the closing quantity and value.',
            ],
          },
        ],
      },
    ],
    problems: [
      { problem: 'A report shows a different date.', fix: `Every report must be as at ${asOf}. Change the date, press Update, export again.` },
      { problem: '"A total does not add up".', fix: 'The report was changed after export, or exported as a summary. Export the Detail report again from Xero and upload it unchanged.' },
      { problem: 'A contact with nothing open was not brought in.', fix: "Xero's contact list does not say whether a contact is a customer or a supplier. FinMatrix names each one in a warning: add them in FinMatrix when you next deal with them." },
      { problem: 'Foreign-currency invoices.', fix: 'The aged reports show the base-currency amount, which is what FinMatrix brings in. FinMatrix keeps one currency.' },
      { problem: 'The trial balance does not balance.', fix: 'Keep the YTD columns when exporting: the month\'s columns alone do not balance.' },
    ],
    references: XERO_REFERENCES,
  },
  {
    source: 'zoho_books',
    title: 'Zoho Books',
    status: 'guided',
    summary: "Export four lists from their pages and four reports, unchanged. FinMatrix reads Zoho Books' own layouts, keeps customers and vendors apart by the page they came from, gives them codes, and proves every total each report prints.",
    versions: ['Zoho Books (all plans: Free, Standard, Professional, Premium, Elite, Ultimate)', 'All regions: India, UAE, Saudi Arabia, US, UK, Canada, Australia, global'],
    findVersion: 'Zoho Books is online and always on its latest version. Your region only changes tax fields; the exports below are the same.',
    before: [
      ...BEFORE_YOU_START,
      'Run every report on the Accrual basis (Customise Report → Report Basis → Accrual), not Cash.',
      'Export amounts in your base currency: FinMatrix keeps one currency.',
    ],
    files: [
      {
        id: 'chart',
        title: 'Chart of Accounts',
        required: 'yes',
        detects: ['zoho_books:chart_of_accounts'],
        gives: 'Every account\'s code, name and type.',
        how: [{ versions: 'All plans', steps: zohoList('Accountant → Chart of Accounts', 'Export') }],
      },
      {
        id: 'customers',
        title: 'Customers',
        required: 'optional',
        detects: ['zoho_books:customer_list', 'zoho_books:contact_list'],
        gives: 'Every customer with phone, email, city, payment terms and credit limit — including customers with nothing open.',
        how: [{ versions: 'All plans', steps: [...zohoList('Sales → Customers', 'Export Customers'), 'Choose "Customers" (not contact persons or addresses). Keep the file name with "Customers" in it — that is how FinMatrix knows they are customers.'] }],
      },
      {
        id: 'vendors',
        title: 'Vendors',
        required: 'optional',
        detects: ['zoho_books:vendor_list', 'zoho_books:contact_list'],
        gives: 'Every vendor with phone, email, city and payment terms.',
        how: [{ versions: 'All plans', steps: [...zohoList('Purchases → Vendors', 'Export Vendors'), 'Choose "Vendors". Keep the file name with "Vendors" in it.'] }],
      },
      {
        id: 'items',
        title: 'Items',
        required: 'if-stock',
        detects: ['zoho_books:item_list'],
        gives: 'Each item\'s SKU, name, selling rate, purchase rate and unit.',
        how: [{ versions: 'All plans', steps: zohoList('Items', 'Export Items') }],
      },
      {
        id: 'tb',
        title: 'Trial Balance',
        required: 'yes',
        detects: ['zoho_books:trial_balance'],
        gives: 'Every account\'s balance, with account codes.',
        settings: [`As of ${asOf}.`, 'Report Basis: Accrual.', 'Show the account code column.'],
        how: [{ versions: 'All plans', steps: zohoReport('Accountant', 'Trial Balance', ['Customise Report → Report Basis: Accrual. Make sure the Account Code column is shown.']) }],
      },
      {
        id: 'ar',
        title: 'AR Aging Details',
        required: 'yes',
        detects: ['zoho_books:aged_receivables'],
        gives: 'Every unpaid invoice and unused credit, by customer.',
        settings: ['Details (not Summary).', `As of ${asOf}.`],
        how: [{ versions: 'All plans', steps: zohoReport('Receivables', 'AR Aging Details') }],
      },
      {
        id: 'ap',
        title: 'AP Aging Details',
        required: 'yes',
        detects: ['zoho_books:aged_payables'],
        gives: 'Every unpaid bill and vendor credit, by vendor.',
        settings: ['Details (not Summary).', `As of ${asOf}.`],
        how: [{ versions: 'All plans', steps: zohoReport('Payables', 'AP Aging Details') }],
      },
      {
        id: 'stock',
        title: 'Inventory Valuation Summary',
        required: 'if-stock',
        detects: ['zoho_books:inventory_valuation'],
        gives: 'Stock on hand and inventory asset value of every item.',
        how: [{ versions: 'All plans', steps: zohoReport('Inventory', 'Inventory Valuation Summary') }],
      },
    ],
    problems: [
      { problem: '"This ZIP is password-protected".', fix: 'Zoho Books always locks its data backup. Use the list exports above (leave their password empty), or open the backup on your computer with its password and upload the CSV files inside it.' },
      { problem: 'An .xls file is refused.', fix: 'Choose CSV or XLSX when exporting.' },
      { problem: 'More than 25,000 customers or items.', fix: 'Zoho exports only the first 25,000 rows of a list. Take a data backup instead (Settings → Data Management → Backup Your Data, CSV), open it with its password and upload its Contacts, Item and Chart of Accounts files.' },
      { problem: 'A report shows a different date, or is on the Cash basis.', fix: `Every report must be as of ${asOf}, on the Accrual basis. Change it, run it again, export again.` },
      { problem: '"A total does not add up".', fix: 'Export the Details report again from Zoho Books and upload it unchanged.' },
    ],
    references: ZOHO_REFERENCES,
  },
);

/**
 * Systems FinMatrix reads through its spreadsheet route: their exports are
 * recognised by their columns, anything unsure is asked on the Match step,
 * and the same eleven checks prove the result. Menu paths are the vendors'
 * where their documentation confirms them; otherwise the report is named so
 * it can be searched for.
 */
const viaSpreadsheets = 'FinMatrix reads these exports by their columns and asks you to confirm each sheet it is not sure of. The eleven checks then prove the result, exactly as for every other system. Our support team checks your first upload with you.';

MIGRATION_GUIDES.push(
  {
    source: 'odoo',
    title: 'Odoo',
    status: 'guided',
    summary: `Export your chart of accounts, open invoices and bills, customers, products and stock from Odoo's list views (Action → Export, XLSX), and a trial balance. ${viaSpreadsheets}`,
    versions: ['Odoo 14, 15, 16, 17, 18 — Community and Enterprise', 'Odoo Online, Odoo.sh and on-premise'],
    findVersion: 'Settings → scroll to the bottom (About): the version is shown there. Enterprise has Accounting → Reporting → Trial Balance and Aged Receivable; Community does not, and uses the pivot steps below.',
    before: [
      ...BEFORE_YOU_START,
      'Export everything before you record anything dated on or after the cutover date in Odoo: an invoice list\'s "Amount Due" is today\'s, not the cutover date\'s.',
      'Make sure amounts are in your company currency (Odoo\'s "Amount Due Signed" / company-currency columns).',
    ],
    files: [
      {
        id: 'chart',
        title: 'Chart of Accounts',
        required: 'yes',
        detects: ['accounts'],
        gives: 'Account codes, names and types.',
        how: [{ versions: 'All versions', steps: ['Accounting → Configuration → Chart of Accounts.', 'Tick the box at the top of the list to select all accounts → Action (⚙) → Export.', 'Fields: Code, Account Name, Type. Format: XLSX. Export.'] }],
      },
      {
        id: 'tb',
        title: 'Trial Balance',
        required: 'yes',
        detects: ['trial_balance'],
        gives: 'Every account balance as at the day before cutover.',
        how: [
          { versions: 'Enterprise', steps: ['Accounting → Reporting → Trial Balance.', `Date: up to ${asOf}.`, 'Press XLSX to download. Upload it as it is.'] },
          { versions: 'Community', steps: ['Accounting → Accounting → Journal Items (enable Developer mode if the menu is hidden).', `Filters: Posted; Date on or before ${asOf}.`, 'Switch to the Pivot view: rows = Account, measures = Debit and Credit.', 'Press Download xlsx.'] },
        ],
      },
      {
        id: 'ar',
        title: 'Unpaid customer invoices',
        required: 'yes',
        detects: ['open_invoices'],
        gives: 'Each unpaid invoice with what is still due.',
        how: [{ versions: 'All versions', steps: ['Accounting → Customers → Invoices. Filters: Posted, Not Paid (or Unpaid); include credit notes.', 'Select all → Action → Export.', 'Fields: Number, Partner (Customer), Invoice Date, Due Date, Total, Amount Due. Format: XLSX.'] }],
      },
      {
        id: 'ap',
        title: 'Unpaid vendor bills',
        required: 'yes',
        detects: ['open_bills'],
        gives: 'Each unpaid bill with what is still due.',
        how: [{ versions: 'All versions', steps: ['Accounting → Vendors → Bills. Filters: Posted, Not Paid; include refunds.', 'Select all → Action → Export: Number, Partner (Vendor), Bill Date, Due Date, Total, Amount Due. XLSX.'] }],
      },
      {
        id: 'customers',
        title: 'Customers and vendors',
        required: 'optional',
        detects: ['customers', 'vendors'],
        gives: 'Names, phones, emails, cities.',
        how: [{ versions: 'All versions', steps: ['Accounting → Customers → Customers (and Vendors → Vendors).', 'Select all → Action → Export: Name, Phone, Email, City, Tax ID. XLSX. One file for customers, one for vendors.'] }],
      },
      {
        id: 'items',
        title: 'Products',
        required: 'if-stock',
        detects: ['items'],
        gives: 'Internal reference (SKU), name, unit, sales price and cost.',
        how: [{ versions: 'All versions', steps: ['Inventory → Products → Products (list view).', 'Select all → Action → Export: Internal Reference, Name, Unit of Measure, Sales Price, Cost. XLSX.'] }],
      },
      {
        id: 'stock',
        title: 'Stock on hand and value',
        required: 'if-stock',
        detects: ['stock'],
        gives: 'Quantity and value per product (and per location where you have several).',
        how: [{ versions: 'All versions', steps: [`Inventory → Reporting → Stock (Odoo 14–16: Inventory Report / Valuation; use "Inventory at Date" for ${asOf}).`, 'List view → select all → Action → Export: Product, Location, Quantity, Value. XLSX.'] }],
      },
    ],
    problems: [
      { problem: 'Amounts due are lower than at the cutover date.', fix: 'Payments recorded after the cutover reduce Odoo\'s "Amount Due". Export before recording them, or use Enterprise\'s Aged Receivable / Aged Payable as at the day before cutover.' },
      { problem: 'A sheet is not recognised.', fix: 'On the Match step choose what it holds (for example "Open invoices"), and confirm its columns.' },
      { problem: 'Foreign-currency invoices.', fix: 'Export the company-currency columns (Amount Due Signed, Total Signed). FinMatrix keeps one currency.' },
    ],
    references: [{ label: 'Odoo documentation — Export and import data', url: 'https://www.odoo.com/documentation/17.0/applications/essentials/export_import_data.html' }],
  },
  {
    source: 'sage_50',
    title: 'Sage 50 Accounts (UK & Ireland)',
    status: 'guided',
    summary: `Export the nominal list, a period trial balance, detailed aged debtors and creditors, your customer and supplier lists and a stock valuation to Excel. ${viaSpreadsheets}`,
    versions: ['Sage 50 Accounts / Sage 50cloud Accounts v24 – current (Essentials, Standard, Professional)', 'Older Sage Line 50 versions: the same reports by name'],
    findVersion: 'Help → About shows the version (for example v29).',
    before: [
      ...BEFORE_YOU_START,
      'Run Period End → Month End for every month up to the cutover (or at least post everything dated before it).',
      'Your Sage nominal codes (1200 Bank, 2100 Creditors…) are kept: where FinMatrix already uses a number for a different account, yours gets the next free number and FinMatrix tells you.',
    ],
    files: [
      {
        id: 'chart',
        title: 'Nominal list (with each code\'s category)',
        required: 'yes',
        detects: ['accounts'],
        gives: 'Nominal codes and names; FinMatrix asks for the type of any it cannot tell.',
        how: [{ versions: 'v24 – current', steps: ['Nominal codes → select all codes → Reports (or the Report Browser) → search "Nominal List".', 'Run it → Export (or Output: File) → Microsoft Excel.', 'If your report has no category column, FinMatrix asks each account\'s type once.'] }],
      },
      {
        id: 'tb',
        title: 'Period Trial Balance',
        required: 'yes',
        detects: ['trial_balance'],
        gives: 'Every nominal code\'s balance at the end of the period before cutover.',
        how: [{ versions: 'v24 – current', steps: ['Company → Financials → Trial (or Report Browser → search "Period Trial Balance").', 'Choose the period that ends on the day before your cutover date. Preview.', 'Export → Microsoft Excel.'] }],
      },
      {
        id: 'ar',
        title: 'Aged Debtors Analysis (Detailed)',
        required: 'yes',
        detects: ['open_invoices'],
        gives: 'Each unpaid invoice and credit by customer.',
        settings: [`Aged balance date and transaction date: ${asOf}.`, 'Exclude later payments.'],
        how: [{ versions: 'v24 – current', steps: ['Customers → Reports → Aged Debtors Reports → Aged Debtors Analysis (Detailed).', `Dates: ${asOf}; exclude later payments. Run → Export to Excel.`, 'If the columns come out misaligned, use the Customers → Aged screen instead: File → Send → Contents to Microsoft Excel.'] }],
      },
      {
        id: 'ap',
        title: 'Aged Creditors Analysis (Detailed)',
        required: 'yes',
        detects: ['open_bills'],
        gives: 'Each unpaid invoice and credit by supplier.',
        how: [{ versions: 'v24 – current', steps: ['Suppliers → Reports → Aged Creditors Reports → Aged Creditors Analysis (Detailed).', `Dates: ${asOf}; exclude later payments. Run → Export to Excel.`] }],
      },
      {
        id: 'customers',
        title: 'Customer and supplier lists',
        required: 'optional',
        detects: ['customers', 'vendors'],
        gives: 'Account references, names, phones, credit limits.',
        how: [{ versions: 'v24 – current', steps: ['Customers → select all → File → Send → Contents to Microsoft Excel (the list as shown: A/C, Name, Balance, Credit Limit, Contact, Telephone).', 'The same from Suppliers.'] }],
      },
      {
        id: 'stock',
        title: 'Product valuation',
        required: 'if-stock',
        detects: ['stock', 'items'],
        gives: 'Product code, description, quantity in stock and cost.',
        how: [{ versions: 'Accounts Professional / Standard with products', steps: ['Products and Services → Reports → search "Product Valuation".', `As at ${asOf}. Run → Export to Excel.`] }],
      },
    ],
    problems: [
      { problem: 'The aged report exports without headings.', fix: 'Export to Excel, not CSV: Sage\'s CSV of this report has no column titles. Or send the Aged screen to Excel.' },
      { problem: 'Your nominal code is FinMatrix\'s code for something else.', fix: 'FinMatrix gives yours the next free number (1200 Bank becomes 1201) and asks you to confirm. Nothing is merged by number alone.' },
      { problem: 'A sheet is not recognised.', fix: 'On the Match step choose what it holds and confirm its columns.' },
    ],
    references: [{ label: 'Sage Community Hub — exporting aged debtors / creditors to Excel', url: 'https://communityhub.sage.com/gb/sage-50-accounts/f/general-discussion-uk/227806/excel-reports---aged-debtors-aged-creditors-report-report-to-excel' }],
  },
  {
    source: 'sage_accounting',
    title: 'Sage Accounting (cloud)',
    status: 'guided',
    summary: `Export your chart of accounts, trial balance, aged debtors and creditors, contacts and products as CSV. ${viaSpreadsheets}`,
    versions: ['Sage Accounting (formerly Sage Business Cloud Accounting / Sage One): Start, Standard, Plus — UK, Ireland, Canada, US, Spain'],
    findVersion: 'Sage Accounting is online and always on its latest version.',
    before: BEFORE_YOU_START,
    files: [
      { id: 'chart', title: 'Chart of accounts', required: 'yes', detects: ['accounts'], gives: 'Ledger account codes, names and types.', how: [{ versions: 'All plans', steps: ['Settings → Chart of Accounts.', 'Export (CSV).'] }] },
      { id: 'tb', title: 'Trial Balance', required: 'yes', detects: ['trial_balance'], gives: 'Every ledger account\'s balance.', how: [{ versions: 'All plans', steps: ['Reporting → Trial Balance (under More if it is not listed).', `To date: ${asOf}.`, 'Export → CSV.'] }] },
      { id: 'ar', title: 'Aged Debtors', required: 'yes', detects: ['open_invoices'], gives: 'Each unpaid invoice by customer.', how: [{ versions: 'All plans', steps: ['Reporting → More → Aged Debtors.', `As at ${asOf}, detailed (by transaction).`, 'Export → CSV.'] }] },
      { id: 'ap', title: 'Aged Creditors', required: 'yes', detects: ['open_bills'], gives: 'Each unpaid invoice by supplier.', how: [{ versions: 'All plans', steps: ['Reporting → More → Aged Creditors.', `As at ${asOf}, detailed.`, 'Export → CSV.'] }] },
      { id: 'customers', title: 'Customers and suppliers', required: 'optional', detects: ['customers', 'vendors'], gives: 'Names, references, contact details.', how: [{ versions: 'All plans', steps: ['Contacts → Customers → Export (CSV). The same from Contacts → Suppliers.'] }] },
      { id: 'items', title: 'Products and services', required: 'if-stock', detects: ['items', 'stock'], gives: 'Codes, descriptions, prices and quantity in stock.', how: [{ versions: 'Plans with products', steps: ['Products & Services → Export (CSV).'] }] },
    ],
    problems: [
      { problem: 'An aged report run for a past date shows invoices paid later as unpaid.', fix: 'That is correct: they were unpaid on the cutover date. Their later payments are entered in FinMatrix.' },
      { problem: 'Your plan has no Trial Balance report.', fix: 'Export the Balance Sheet and Profit and Loss as at the same date and fill the starter workbook\'s Trial Balance sheet from them.' },
    ],
    references: [
      { label: 'Sage Accounting help — Aged Debtors report', url: 'https://help.sbc.sage.com/en-ie/accounting/reporting/financial_reports/extra-aged-debtors-report.html' },
      { label: 'Sage Accounting help — Aged Creditors report', url: 'https://help.sbc.sage.com/en-gb/accounting/reporting/financial_reports/extra-aged-creditors-report.html' },
    ],
  },
  {
    source: 'busy',
    title: 'Busy',
    status: 'guided',
    summary: `Export the trial balance, bill-wise outstanding receivables and payables, the account and item lists and the stock status to Excel (Alt+E). ${viaSpreadsheets}`,
    versions: ['BUSY 17, 18, 21 (Basic, Standard, Enterprise)'],
    findVersion: 'Help → About BUSY shows the version and release.',
    before: [
      ...BEFORE_YOU_START,
      'Bill-by-bill must be on for party accounts, with a bill reference in each voucher — otherwise Busy cannot list each unpaid bill.',
    ],
    files: [
      { id: 'chart', title: 'List of accounts (with groups)', required: 'yes', detects: ['accounts'], gives: 'Account names and their groups; FinMatrix asks for any type it cannot tell.', how: [{ versions: 'BUSY 17 – 21', steps: ['Display → Account Books / Masters → List of Accounts (with group).', 'Alt+E → Microsoft Excel.'] }] },
      { id: 'tb', title: 'Trial Balance', required: 'yes', detects: ['trial_balance'], gives: 'Every account\'s closing balance.', how: [{ versions: 'BUSY 17 – 21', steps: ['Display → Final Results → Trial Balance (account-wise, not group-wise).', `As on ${asOf}.`, 'Alt+E → Microsoft Excel.'] }] },
      { id: 'ar', title: 'Bills Receivable (bill-wise outstanding)', required: 'yes', detects: ['open_invoices'], gives: 'Each unpaid sale bill by party.', how: [{ versions: 'BUSY 17 – 21', steps: ['Display → Outstanding Analysis → Bills Receivable.', `All accounts, bill-wise, as on ${asOf}.`, 'Alt+E → Microsoft Excel.'] }] },
      { id: 'ap', title: 'Bills Payable (bill-wise outstanding)', required: 'yes', detects: ['open_bills'], gives: 'Each unpaid purchase bill by party.', how: [{ versions: 'BUSY 17 – 21', steps: ['Display → Outstanding Analysis → Bills Payable.', `All accounts, bill-wise, as on ${asOf}.`, 'Alt+E → Microsoft Excel.'] }] },
      { id: 'stock', title: 'Stock status with value', required: 'if-stock', detects: ['stock', 'items'], gives: 'Closing quantity and value per item.', how: [{ versions: 'BUSY 17 – 21', steps: ['Display → Inventory Books → Stock Status (item-wise, with value).', `As on ${asOf}.`, 'Alt+E → Microsoft Excel.'] }] },
    ],
    problems: [
      { problem: 'The outstanding report lists parties, not bills.', fix: 'Choose the bill-wise option; turn on Bill-by-Bill for party accounts if it is off.' },
      { problem: 'A sheet is not recognised.', fix: 'On the Match step choose what it holds and confirm its columns.' },
    ],
    references: [{ label: 'BUSY FAQs — Outstanding analysis', url: 'https://busy.in/faqs/accounting-reports/outstanding-analysis/5/' }],
  },
  {
    source: 'marg',
    title: 'Marg ERP 9+',
    status: 'guided',
    summary: `Export the trial balance, party-wise outstanding (with bills), the party and item lists and the stock valuation to Excel. ${viaSpreadsheets}`,
    versions: ['Marg ERP 9+ (all editions)', 'Marg Books: the same reports by name'],
    findVersion: 'The version is shown on Marg\'s start screen and under Help.',
    before: BEFORE_YOU_START,
    files: [
      { id: 'chart', title: 'Party / account list', required: 'yes', detects: ['accounts', 'customers', 'vendors'], gives: 'Ledgers with their groups, and parties.', how: [{ versions: 'Marg ERP 9+', steps: ['Reports → Other Reports → Party/Account List.', 'Export → Excel.'] }] },
      { id: 'tb', title: 'Trial Balance', required: 'yes', detects: ['trial_balance'], gives: 'Every ledger\'s closing balance.', how: [{ versions: 'Marg ERP 9+', steps: ['Search Marg\'s menu for "Trial Balance" (under the final results / balance sheet reports).', `As on ${asOf}, ledger-wise. Export → Excel.`] }] },
      { id: 'ar', title: 'Debtors outstanding (bill-wise)', required: 'yes', detects: ['open_invoices'], gives: 'Each unpaid bill by party.', how: [{ versions: 'Marg ERP 9+', steps: ['Books → Outstandings (Alt+O) → Party Wise → Debtors.', `As on ${asOf}, with bill details.`, 'Export (F7) → Excel.'] }] },
      { id: 'ap', title: 'Creditors outstanding (bill-wise)', required: 'yes', detects: ['open_bills'], gives: 'Each unpaid purchase bill by party.', how: [{ versions: 'Marg ERP 9+', steps: ['Books → Outstandings (Alt+O) → Party Wise → Creditors.', `As on ${asOf}, with bill details.`, 'Export (F7) → Excel.'] }] },
      { id: 'stock', title: 'Stock valuation', required: 'if-stock', detects: ['stock', 'items'], gives: 'Closing quantity and value per item.', how: [{ versions: 'Marg ERP 9+', steps: ['Search Marg\'s menu for "Stock Valuation" (stock reports).', `As on ${asOf}. Export → Excel.`] }] },
    ],
    problems: [
      { problem: 'The outstanding report shows one line per party.', fix: 'Choose the bill-wise / detailed view so each unpaid bill is listed, then export again.' },
      { problem: 'A sheet is not recognised.', fix: 'On the Match step choose what it holds and confirm its columns.' },
    ],
    references: [{ label: 'Marg Care — party-wise debtors outstanding', url: 'https://care.margcompusoft.com/margerp/outstandings/48/1/how-to-view-party-wise-debtors-outstanding-report-in-marg-software' }],
  },
);

export const guideFor = (source: string) => MIGRATION_GUIDES.find((g) => g.source === source);

/** A file has arrived when one of the batch's files was recognised as it. */
export function fileArrived(f: GuideFile, files: Array<{ kind: string; detected: Array<{ target: string | null }> | null }>): boolean {
  return f.detects.some((t) => (t === 'ptb' ? files.some((x) => x.kind === 'ptb') : files.some((x) => (x.detected ?? []).some((d) => d.target === t))));
}

type BatchFiles = Array<{ kind: string; detected: Array<{ target: string | null; confidence?: number; rows?: number; sheet?: string }> | null }>;

export interface DocumentGate {
  /** Required documents (for this route) not yet recognised among the files. */
  missing: GuideFile[];
  /** "If you keep stock" documents not yet recognised. */
  stockMissing: GuideFile[];
  /** Sheets FinMatrix could not identify: the owner may say what they are on the Match step. */
  unplaced: string[];
  /** Nothing required is missing: the wizard may move on. */
  complete: boolean;
}

/**
 * Whether every document the source needs has arrived. Stock documents count
 * when the company keeps stock, unless the owner says there is none to bring
 * in. Sources without a guide are not gated here (the checks still are).
 */
export function documentGate(
  sourceSystem: string,
  files: BatchFiles,
  opts: { keepsStock: boolean; noStock: boolean },
): DocumentGate {
  const guide = guideFor(sourceSystem);
  const unplaced = files.flatMap((f) =>
    (f.detected ?? []).filter((d) => d.target === null && (d.confidence ?? 0) < 1 && (d.rows ?? 0) > 0).map((d) => d.sheet ?? ''),
  );
  if (!guide) return { missing: [], stockMissing: [], unplaced, complete: true };
  const route = activeRoute(guide, files);
  const items = guide.files.filter((f) => !route || !f.routes || f.routes.includes(route));
  const missing = items.filter((f) => f.required === 'yes' && !fileArrived(f, files));
  const stockMissing = items.filter((f) => f.required === 'if-stock' && !fileArrived(f, files));
  const stockCounts = opts.keepsStock && !opts.noStock;
  return { missing, stockMissing, unplaced, complete: missing.length === 0 && (!stockCounts || stockMissing.length === 0) };
}

/** Route B when no backup has been uploaded and a report-only file has arrived; route A otherwise. */
export function activeRoute(g: MigrationGuide, files: Array<{ kind: string; detected: Array<{ target: string | null }> | null }>): string | null {
  if (!g.routes?.length) return null;
  if (files.some((f) => f.kind === 'ptb')) return g.routes[0].id;
  const reportsOnly = g.files.filter((f) => f.routes?.length === 1 && f.routes[0] === 'reports');
  return reportsOnly.some((f) => fileArrived(f, files)) ? 'reports' : g.routes[0].id;
}
