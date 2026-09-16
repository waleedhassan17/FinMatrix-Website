/**
 * Tax is typed on every line — invoices, estimates, sales orders, credit memos,
 * purchase orders, bills, vendor credits and deliveries — because the rate is
 * whatever applies: 0, 10, 12.5, 17. There is no fixed list to pick from.
 *
 * 0 to 100 with up to four decimals, the same rule as the server's @IsTaxRate
 * and the app's models/taxRate.ts. Blank is not an error; it saves as 0.
 */
export const TAX_RATE_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;

export const taxPercentError = (value: string): string | undefined => {
  const text = value.trim();
  if (text === '') return undefined;
  if (!TAX_RATE_PATTERN.test(text)) return 'Enter a percentage like 17 or 12.5';
  const rate = Number(text);
  return rate >= 0 && rate <= 100 ? undefined : 'Tax must be between 0% and 100%';
};

/**
 * The first line whose tax is not a valid percentage, as a form-level message —
 * "Line 2: Tax must be between 0% and 100%." — or null when every line is fine.
 */
export const lineTaxError = (lines: ReadonlyArray<{ taxRate?: string }>): string | null => {
  for (let i = 0; i < lines.length; i++) {
    const error = taxPercentError(lines[i].taxRate ?? '');
    if (error) return `Line ${i + 1}: ${error}.`;
  }
  return null;
};
