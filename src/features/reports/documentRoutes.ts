// ═══════════════════════════════════════════════════════
// FinMatrix Web — Where a ledger row's document lives
// ═══════════════════════════════════════════════════════
// One map from a general-ledger `sourceType` to the page that shows the
// document behind it, shared by every drill-down that lists postings: the P&L
// line detail, the account register, the cash-flow line entries.
//
// `sourceId` is the DOCUMENT's id for document postings and the journal
// entry's own id for a manual journal — the server joins on
// (source_type, source_id), so the id always belongs to the type it travels
// with.
//
// Bill payments and tax payments have no page of their own, so they are not
// here: a row of either type renders its number as plain text rather than a
// link to somewhere that does not exist.

const SOURCE_PATHS: Record<string, string> = {
  invoice: '/invoices',
  invoice_void: '/invoices',
  payment: '/payments',
  credit_memo: '/credit-memos',
  credit_memo_void: '/credit-memos',
  credit_memo_refund: '/credit-memos',
  bill: '/bills',
  bill_void: '/bills',
  vendor_credit: '/vendor-credits',
  vendor_credit_void: '/vendor-credits',
  purchase_order: '/purchase-orders',
  po_receipt: '/purchase-orders',
  delivery: '/deliveries',
  delivery_dispatch: '/deliveries',
  delivery_return: '/deliveries',
  delivery_approval: '/deliveries',
  payroll: '/payroll/runs',
  journal_entry: '/journal-entries',
  opening_balance: '/journal-entries',
};

/** The detail page for a posting's document, or null when it has none. */
export const documentHref = (sourceType: string, sourceId: string): string | null => {
  if (!sourceId) return null;
  const base =
    SOURCE_PATHS[sourceType] ??
    // Delivery postings carry several suffixes (`delivery_…`); all open the delivery.
    (sourceType.startsWith('delivery') ? '/deliveries' : undefined);
  return base ? `${base}/${encodeURIComponent(sourceId)}` : null;
};
