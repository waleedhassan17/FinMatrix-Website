// ═══════════════════════════════════════════════════════
// FinMatrix Web — CSV export
// ═══════════════════════════════════════════════════════
// Built here rather than asked for from the server.
//
// `/reports/*?format=csv` exists, but its encoder does
// `Object.keys(rows[0])` and `String(value)` over a SINGLE statement object — so
// a Balance Sheet's `assets` array exports as `[object Object],[object Object]`.
// That is unusable for all seven statements, and the only shape it handles is a
// flat array of scalars, which no financial report returns.
//
// Each report page supplies its rows in STATEMENT ORDER, headings and subtotals
// included, so the downloaded file reads the way the screen does instead of being
// a dump of API fields.

/** A row of cells. Ragged rows are fine — a heading row may be one cell. */
export type CsvRow = readonly (string | number | null | undefined)[];

/**
 * Quote a single field per RFC 4180.
 *
 * Quoting only when needed keeps the file readable, but the three characters that
 * force it are not optional: an unquoted comma splits one figure into two
 * columns, an unquoted newline splits one row into two, and an unescaped quote
 * swallows the rest of the line. An account named `Freight, inbound` is reason
 * enough on its own.
 *
 * A leading or trailing space is also quoted, because some spreadsheets trim
 * otherwise and an account code like `0100 ` would silently change.
 */
const quoteField = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const needsQuoting =
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text !== text.trim();

  if (!needsQuoting) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Rows to a CSV document.
 *
 * CRLF line endings, which is what RFC 4180 specifies and what Excel expects;
 * every spreadsheet reads them, and Excel on Windows is the likeliest
 * destination for an accounting export.
 */
export const toCsv = (rows: readonly CsvRow[]): string =>
  rows.map((row) => row.map(quoteField).join(',')).join('\r\n');

/**
 * A number as a CSV cell: plain digits, two decimals, no currency and no
 * thousands separators.
 *
 * The formatted display value would be actively wrong here — `Rs 1,234.57`
 * contains the separator that delimits columns, and even quoted it arrives in the
 * spreadsheet as text, so the column cannot be summed. The point of exporting is
 * that somebody adds it up.
 */
export const csvAmount = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return value.toFixed(2);
};

/**
 * Hand the browser a CSV to save.
 *
 * Blob → object URL → synthetic click → revoke. The revoke is not optional: the
 * URL pins the whole blob in memory for the life of the document, and the same
 * discipline is documented on `authedBlobUrl` in the API helpers. It is deferred
 * a tick because Safari aborts a download whose URL is revoked in the same task.
 *
 * A BOM is prepended so Excel reads the file as UTF-8. Without it, Excel on
 * Windows falls back to the system code page and mangles every non-ASCII
 * character — including the en-dashes in our own period labels.
 */
export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([`﻿${csv}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  // Kept out of the layout: appending is required for Firefox, which ignores a
  // click on a detached anchor.
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * A filename stamped with the period, e.g. `profit-loss-2026-01-01-to-2026-03-31`.
 *
 * Dated because these files accumulate in a downloads folder, and two exports of
 * the same report for different periods are otherwise `profit-loss (3).csv`.
 */
export const csvFilename = (
  report: string,
  period: { startDate?: string; endDate?: string; asOfDate?: string },
): string => {
  if (period.asOfDate) return `${report}-as-of-${period.asOfDate}`;
  if (period.startDate && period.endDate) {
    return `${report}-${period.startDate}-to-${period.endDate}`;
  }
  return report;
};
