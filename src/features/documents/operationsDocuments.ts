// ═══════════════════════════════════════════════════════
// FinMatrix Web — Operational documents
// ═══════════════════════════════════════════════════════
// The paper that leaves the office outside sales and purchases: the delivery
// note a rider carries, a budget against actuals, a bank reconciliation for the
// file, and the message that travels with a payslip.

import { docDate, type DocCompany, type DocParty } from '@/features/documents/documentModel';
import type { ReportPdfData, ReportRow, ReportSection } from '@/features/reports/reportPdfTable';
import type { ShareableDocument } from '@/features/share/shareDocument';
import { favourableVariance, isRevenueType, type Budget, type VsActualRow } from '@/models/budget';
import type { Delivery } from '@/models/delivery';
import { formatQty } from '@/models/inventory';
import type { PayrollItem, PayrollRun } from '@/models/payroll';
import { sourceTypeLabel, type ReconciliationDetail, type ReconEntry } from '@/models/reconciliation';
import { statusLabel } from '@/theme/status';
import { formatMoney } from '@/utils/money';

export interface PrintableReport {
  pdf: ReportPdfData;
  share: ShareableDocument;
}

const dateOrBlank = (iso: string | null | undefined): string => (iso ? docDate(iso) : '');

// ─── Delivery note ─────────────────────────────────────

/**
 * What the rider hands over and the customer signs: items and quantities, no
 * prices — the invoice carries those.
 */
export function deliveryNoteDocument(
  d: Delivery,
  company: DocCompany,
  riderName: string | null,
): PrintableReport {
  const reference = d.referenceNo || 'Delivery';
  const party: DocParty = {
    label: 'Deliver to',
    name: d.customerName || 'Customer',
    lines: [...d.address.split('\n'), d.zone ? `Zone ${d.zone}` : '']
      .map((l) => l.trim())
      .filter(Boolean),
  };
  const wanted = [dateOrBlank(d.preferredDate), d.preferredTimeSlot].filter(Boolean).join(' · ');
  const sum = (key: 'orderedQty' | 'deliveredQty' | 'returnedQty') =>
    d.lines.reduce((s, l) => s + l[key], 0);

  return {
    pdf: {
      title: 'Delivery note',
      periodLabel: reference,
      company,
      party,
      meta: [
        { label: 'Reference', value: reference },
        { label: 'Created', value: dateOrBlank(d.createdAt) },
        ...(wanted ? [{ label: 'Wanted', value: wanted }] : []),
        { label: 'Status', value: statusLabel(d.status) },
        ...(riderName ? [{ label: 'Rider', value: riderName }] : []),
      ],
      sections: [
        {
          columns: [
            { header: '#', flex: 0.5 },
            { header: 'Item', flex: 5 },
            { header: 'Ordered', align: 'right', flex: 1.5 },
            { header: 'Delivered', align: 'right', flex: 1.5 },
            { header: 'Returned', align: 'right', flex: 1.5 },
          ],
          rows: [
            ...d.lines.map((l, i) => ({
              cells: [
                String(i + 1),
                l.itemName || 'Item',
                formatQty(l.orderedQty),
                formatQty(l.deliveredQty),
                formatQty(l.returnedQty),
              ],
            })),
            {
              cells: ['', 'Total units', formatQty(sum('orderedQty')), formatQty(sum('deliveredQty')), formatQty(sum('returnedQty'))],
              total: true,
            },
          ],
        },
      ],
      notes: d.notes ? [{ title: 'Delivery instructions', text: d.notes }] : undefined,
      signatures: ['Dispatched by', 'Received by (name and signature)'],
    },
    share: {
      kind: 'Delivery note',
      number: d.referenceNo || undefined,
      partyName: d.customerName || undefined,
      companyName: company.name,
    },
  };
}

// ─── Budget vs actual ──────────────────────────────────

const percentOf = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';

function budgetSection(title: string, rows: VsActualRow[]): ReportSection {
  const budgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  const variance = rows.reduce((s, r) => s + favourableVariance(r).toNumber(), 0);
  return {
    title,
    columns: [
      { header: 'Account', flex: 4.5 },
      { header: 'Budget', align: 'right', flex: 2 },
      { header: 'Actual', align: 'right', flex: 2 },
      { header: 'Variance', align: 'right', flex: 2 },
      { header: 'Used', align: 'right', flex: 1.2 },
    ],
    rows: [
      ...rows.map((r) => ({
        cells: [
          `${r.accountCode} · ${r.accountName}`,
          r.budgeted,
          r.actual,
          favourableVariance(r).toNumber(),
          `${r.percentUsed}%`,
        ],
      })),
      { cells: [`Total ${title.toLowerCase()}`, budgeted, actual, variance, percentOf(actual, budgeted)], total: true },
    ],
  };
}

/** A budget beside what posted, revenue and spending kept apart as on screen. */
export function budgetVsActualDocument(
  budget: Budget,
  rows: VsActualRow[],
  company: DocCompany,
): PrintableReport {
  const revenue = rows.filter((r) => isRevenueType(r.accountType));
  const spending = rows.filter((r) => !isRevenueType(r.accountType));
  const total = (list: VsActualRow[], key: 'budgeted' | 'actual') => list.reduce((s, r) => s + r[key], 0);
  const period = `Fiscal year ${budget.fiscalYear}`;

  return {
    pdf: {
      title: 'Budget vs actual',
      periodLabel: period,
      basis: budget.name,
      company,
      meta: [
        { label: 'Budget', value: budget.name },
        { label: 'Status', value: statusLabel(budget.status) },
        { label: 'Revenue', value: `${formatMoney(total(revenue, 'actual'))} of ${formatMoney(total(revenue, 'budgeted'))}` },
        { label: 'Spending', value: `${formatMoney(total(spending, 'actual'))} of ${formatMoney(total(spending, 'budgeted'))}` },
      ],
      sections: [
        ...(revenue.length ? [budgetSection('Revenue', revenue)] : []),
        ...(spending.length ? [budgetSection('Spending', spending)] : []),
      ],
      notes: [
        {
          title: 'Reading the variance',
          text: 'Positive is good: revenue above target, or spending under budget. Figures in parentheses are unfavourable.',
        },
      ],
    },
    share: {
      kind: 'Budget vs actual',
      period: `${budget.name} · ${period}`,
      companyName: company.name,
    },
  };
}

// ─── Bank reconciliation ───────────────────────────────

const RECON_COLUMNS = [
  { header: 'Date', flex: 1.4 },
  { header: 'Reference', flex: 3 },
  { header: 'From', flex: 1.8 },
  { header: 'Deposit', align: 'right' as const, flex: 1.7 },
  { header: 'Payment', align: 'right' as const, flex: 1.7 },
];

const reconRows = (entries: ReconEntry[], empty: string): ReportRow[] =>
  entries.length === 0
    ? [{ cells: ['', empty, '', null, null] }]
    : entries.map((e) => ({
        // The memo rides with the reference — a table row's `sub` sits under
        // the first column, which here is the date.
        cells: [
          dateOrBlank(e.date),
          [e.reference || '—', e.memo].filter(Boolean).join(' · '),
          sourceTypeLabel(e.sourceType),
          e.amount >= 0 ? e.amount : null,
          e.amount < 0 ? -e.amount : null,
        ],
      }));

/** The reconciliation report for the file: the statement, what cleared, what is outstanding. */
export function reconciliationDocument(
  r: ReconciliationDetail,
  accountLabel: string,
  company: DocCompany,
): PrintableReport {
  const statementDate = dateOrBlank(r.statementDate);
  return {
    pdf: {
      title: 'Bank reconciliation',
      periodLabel: `Statement dated ${statementDate}`,
      basis: accountLabel,
      company,
      meta: [
        { label: 'Account', value: accountLabel },
        { label: 'Statement date', value: statementDate },
        ...(r.reconciledAt ? [{ label: 'Reconciled on', value: dateOrBlank(r.reconciledAt) }] : []),
        { label: 'Beginning balance', value: formatMoney(r.beginningBalance) },
        { label: 'Statement ending balance', value: formatMoney(r.statementEndingBalance) },
        { label: 'Cleared balance', value: formatMoney(r.clearedBalance) },
        { label: 'Difference', value: formatMoney(r.difference) },
      ],
      sections: [
        {
          title: `Cleared (${r.entries.length})`,
          columns: RECON_COLUMNS,
          rows: reconRows(r.entries, 'Nothing was cleared.'),
        },
        {
          title: `Outstanding (${r.outstanding.length})`,
          columns: RECON_COLUMNS,
          rows: [
            ...reconRows(r.outstanding, 'No outstanding items.'),
            { cells: ['', 'Net outstanding', '', r.outstandingTotal, null], total: true },
          ],
        },
      ],
      notes: r.notes ? [{ title: 'Notes', text: r.notes }] : undefined,
      signatures: ['Prepared by', 'Reviewed by'],
    },
    share: {
      kind: 'Bank reconciliation',
      period: `${accountLabel} · ${statementDate}`,
      companyName: company.name,
    },
  };
}

// ─── Payslip ───────────────────────────────────────────

/** The payslip PDF comes from the server; this is what travels with it. */
export const payslipShare = (run: PayrollRun, item: PayrollItem, companyName: string): ShareableDocument => ({
  kind: 'Payslip',
  partyName: item.employeeName || undefined,
  period: run.payPeriod,
  amount: item.net,
  amountLabel: 'Net pay',
  companyName,
});
