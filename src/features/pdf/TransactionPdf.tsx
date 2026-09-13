import type { DocumentModel } from '@/features/documents/documentModel';
import {
  PdfFile,
  PdfNotes,
  PdfPartyAndMeta,
  PdfSheet,
  PdfSignatures,
  PdfTable,
  PdfTotals,
  type PdfColumn,
} from '@/features/pdf/components';
import { formatMoney } from '@/utils/money';

const quantity = (n: number | null): string =>
  n === null ? '' : n.toLocaleString('en-US', { maximumFractionDigits: 3 });

/** Invoices, estimates, orders, bills and credits — any priced document. */
export function TransactionPdf({ doc, generatedAt }: { doc: DocumentModel; generatedAt: string }) {
  const columns: PdfColumn[] = [
    { header: 'Description', flex: doc.showQuantity ? 4.2 : 6 },
    ...(doc.showQuantity
      ? [
          { header: doc.quantityHeader, flex: 1, align: 'right' as const },
          { header: doc.priceHeader, flex: 1.7, align: 'right' as const },
        ]
      : []),
    ...(doc.showTax !== false ? [{ header: 'Tax', flex: 0.9, align: 'right' as const }] : []),
    { header: 'Amount', flex: 1.9, align: 'right' },
  ];

  const rows = doc.lines.map((line) => ({
    cells: [
      line.description || '—',
      ...(doc.showQuantity
        ? [quantity(line.quantity), line.unitPrice === null ? '' : formatMoney(line.unitPrice)]
        : []),
      ...(doc.showTax !== false ? [`${line.taxRate}%`] : []),
      formatMoney(line.amount),
    ],
    sub: line.secondary && line.secondary !== line.description ? line.secondary : undefined,
  }));

  return (
    <PdfFile title={`${doc.kind} ${doc.number}`.trim()} author={doc.company.name}>
      <PdfSheet
        company={doc.company}
        kind={doc.kind}
        number={doc.number}
        stamp={doc.stamp}
        generatedAt={generatedAt}
      >
        <PdfPartyAndMeta party={doc.party} meta={doc.meta} />
        <PdfTable columns={columns} rows={rows} />
        <PdfTotals totals={doc.totals} />
        <PdfNotes notes={doc.notes} />
        <PdfSignatures labels={doc.signatures} />
      </PdfSheet>
    </PdfFile>
  );
}

export default TransactionPdf;
