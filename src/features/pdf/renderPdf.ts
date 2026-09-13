// ═══════════════════════════════════════════════════════
// FinMatrix Web — Rendering a PDF in the browser
// ═══════════════════════════════════════════════════════
// @react-pdf/renderer is several hundred kilobytes. Nothing imports it
// statically outside src/features/pdf, and pages reach the templates only
// through import(), so the library arrives on the first Print / PDF / Share
// click rather than with the app.

import type { ReactElement } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PdfElement = ReactElement<any>;

/** Render a document element to a PDF Blob. */
export async function renderPdfBlob(build: () => PdfElement | Promise<PdfElement>): Promise<Blob> {
  const [{ pdf }, fonts] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/features/pdf/fonts'),
  ]);
  fonts.registerPdfFonts();
  const element = await build();
  return pdf(element).toBlob();
}

/** Save a Blob under a filename, the way a download link would. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Print a PDF Blob through the browser's own PDF viewer, in a hidden frame, so
 * what prints is the document and not the page around it. Browsers that will
 * not print a PDF from a frame get it in a new tab, where Print is one click.
 */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.dataset.fmPrint = 'true';
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';

  const cleanup = () => {
    frame.remove();
    URL.revokeObjectURL(url);
  };

  frame.onload = () => {
    // The PDF viewer inside the frame needs a moment after load before print()
    // does anything.
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, '_blank', 'noopener');
      }
      // Long enough for the print dialog to have read the document.
      setTimeout(cleanup, 120_000);
    }, 300);
  };

  frame.src = url;
  document.body.appendChild(frame);
}
