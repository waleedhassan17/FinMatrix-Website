import type { JournalEntryDocument } from '@/features/documents/receiptBuilders';
import {
  PdfFile,
  PdfNotes,
  PdfPartyAndMeta,
  PdfSheet,
  PdfSignatures,
  PdfTable,
} from '@/features/pdf/components';
import { formatMoney } from '@/utils/money';

const statusLabel = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A journal entry on paper: dated lines in balanced debit and credit columns. */
export function JournalEntryPdf({ doc, generatedAt }: { doc: JournalEntryDocument; generatedAt: string }) {
  const rows = [
    ...doc.lines.map((l) => ({
      cells: [
        l.account,
        l.description || '',
        l.debit > 0 ? formatMoney(l.debit) : '',
        l.credit > 0 ? formatMoney(l.credit) : '',
      ],
    })),
    {
      cells: ['Totals', '', formatMoney(doc.totalDebits), formatMoney(doc.totalCredits)],
      total: true,
    },
  ];

  return (
    <PdfFile title={`Journal entry ${doc.reference}`.trim()} author={doc.company.name}>
      <PdfSheet
        company={doc.company}
        kind="Journal entry"
        number={doc.reference}
        stamp={doc.stamp}
        generatedAt={generatedAt}
      >
        <PdfPartyAndMeta
          party={null}
          meta={[
            { label: 'Date', value: doc.date || '—' },
            { label: 'Status', value: statusLabel(doc.status) },
          ]}
        />
        <PdfTable
          columns={[
            { header: 'Account', flex: 3 },
            { header: 'Description', flex: 3 },
            { header: 'Debit', flex: 1.7, align: 'right' },
            { header: 'Credit', flex: 1.7, align: 'right' },
          ]}
          rows={rows}
        />
        <PdfNotes
          notes={[
            { title: 'Memo', text: doc.memo },
            { title: 'Void reason', text: doc.voidReason },
          ]}
        />
        <PdfSignatures labels={['Prepared by', 'Approved by']} />
      </PdfSheet>
    </PdfFile>
  );
}

export default JournalEntryPdf;
