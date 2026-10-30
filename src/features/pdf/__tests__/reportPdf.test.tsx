import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/pdf/fonts', () => ({
  PDF_FONT_FAMILY: 'Helvetica',
  registerPdfFonts: () => undefined,
}));

import { renderToBuffer } from '@react-pdf/renderer';

import { companyForDocument } from '@/features/documents/documentModel';
import { ReportPdf } from '@/features/pdf/ReportPdf';
import { statementSection } from '@/features/reports/reportPdfTable';
import { statementColumns } from '@/features/reports/statementColumns';
import { customerSummaryDocument } from '@/features/documents/statementBuilders';
import { summaryFixture } from '@/test/partySummaryFixture';

describe('ReportPdf', () => {
  it('renders a statement and a table report to a real PDF', async () => {
    const buffer = await renderToBuffer(
      <ReportPdf
        generatedAt="Sep 13, 2026"
        data={{
          title: 'Profit & Loss',
          periodLabel: 'Jan 1, 2026 – Sep 13, 2026',
          basis: 'Accrual basis',
          company: companyForDocument(null, 'Warehouse Co'),
          sections: [
            statementSection([
              { label: 'Income', bold: true },
              { label: '4000  Sales', amount: 1200, depth: 1 },
              { label: 'Net Income', amount: -50, isGrand: true },
            ]),
            {
              title: 'Detail',
              columns: [{ header: 'Account', flex: 4 }, { header: 'Debit', align: 'right', flex: 2 }],
              rows: [{ cells: ['1000 · Cash', 99.5] }, { cells: ['Total', 99.5], grand: true }],
            },
          ],
        }}
      />,
    );
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders a party, notes and sign-off lines — a delivery note', async () => {
    const buffer = await renderToBuffer(
      <ReportPdf
        generatedAt="Sep 13, 2026"
        data={{
          title: 'Delivery note',
          periodLabel: 'DLV-0007',
          company: companyForDocument(null, 'Warehouse Co'),
          party: { label: 'Deliver to', name: 'Madina Wholesale', lines: ['12 Mall Road', 'Lahore'] },
          meta: [{ label: 'Reference', value: 'DLV-0007' }],
          sections: [
            {
              columns: [{ header: 'Item', flex: 4 }, { header: 'Ordered', align: 'right', flex: 1 }],
              rows: [{ cells: ['Rice 5kg', '10'] }],
            },
          ],
          notes: [{ title: 'Delivery instructions', text: 'Call before arriving' }],
          signatures: ['Dispatched by', 'Received by (name and signature)'],
        }}
      />,
    );
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders an outstanding-invoices summary with its totals block', async () => {
    const withCredits = summaryFixture({
      credits: {
        total: 400,
        items: [{ kind: 'payment', id: 'p1', reference: 'RCT-9', date: '2026-09-01', amount: 400, available: 400 }],
      },
      netDue: 900,
    });
    const { pdf } = customerSummaryDocument(withCredits, companyForDocument(null, 'Warehouse Co'), null);
    const buffer = await renderToBuffer(<ReportPdf generatedAt="Sep 28, 2026" data={pdf} />);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('runs a long statement across pages with its comparison columns and header block', async () => {
    const rows = Array.from({ length: 140 }, (_, i) => ({
      key: `a${i}`,
      label: `${1000 + i}  Account ${i}`,
      amount: 1000 + i,
      prior: 900 + i,
      depth: 1,
    }));
    const buffer = await renderToBuffer(
      <ReportPdf
        generatedAt="Oct 26, 2026, 4:05 PM"
        data={{
          title: 'Balance Sheet',
          periodLabel: 'As of Sep 30, 2026',
          basis: 'Accrual basis',
          company: companyForDocument(null, 'Warehouse Co'),
          meta: [
            { label: 'Period', value: 'As of Sep 30, 2026' },
            { label: 'Comparison', value: 'Aug 31, 2026' },
            { label: 'Generated', value: 'Oct 26, 2026, 4:05 PM' },
          ],
          sections: [
            statementSection(rows, {
              title: 'Assets',
              columns: statementColumns({ comparing: true, currentLabel: 'Sep 30, 2026', priorLabel: 'Aug 31, 2026' }),
            }),
          ],
        }}
      />,
    );
    // pdfkit writes one page object per page, uncompressed.
    const pages = buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(2);
  });
});
