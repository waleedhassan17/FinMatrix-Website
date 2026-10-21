import type { DocumentModel } from '@/features/documents/documentModel';
import type { JournalEntryDocument } from '@/features/documents/receiptBuilders';
import { renderPdfBlob } from '@/features/pdf/renderPdf';
import type { ReportPdfData } from '@/features/reports/reportPdfTable';

/** "Sep 13, 2026, 4:05 PM" — when this copy was produced. */
export const generatedStamp = (now: Date = new Date()): string =>
  now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * A priced document or receipt as a PDF. The template and the renderer load on
 * first use.
 *
 * `linePhotos` puts each line's item photo beside it — for the documents a
 * customer receives (estimate, invoice, sales order), and only where the
 * company has inventory. The photos are fetched now and embedded.
 */
export const documentPdfBlob = (
  doc: DocumentModel,
  opts: { linePhotos?: boolean } = {},
): Promise<Blob> =>
  renderPdfBlob(async () => {
    const [{ TransactionPdf }, withPhotos] = await Promise.all([
      import('@/features/pdf/TransactionPdf'),
      opts.linePhotos
        ? import('@/features/documents/lineImages').then((m) => m.attachLinePhotos(doc))
        : Promise.resolve(doc),
    ]);
    return <TransactionPdf doc={withPhotos} generatedAt={generatedStamp()} />;
  });

/** A journal entry as a PDF. */
export const journalEntryPdfBlob = (doc: JournalEntryDocument): Promise<Blob> =>
  renderPdfBlob(async () => {
    const { JournalEntryPdf } = await import('@/features/pdf/JournalEntryPdf');
    return <JournalEntryPdf doc={doc} generatedAt={generatedStamp()} />;
  });

/** A report or statement as a PDF. */
export const reportPdfBlob = (data: ReportPdfData): Promise<Blob> =>
  renderPdfBlob(async () => {
    const { ReportPdf } = await import('@/features/pdf/ReportPdf');
    return <ReportPdf data={data} generatedAt={generatedStamp()} />;
  });
