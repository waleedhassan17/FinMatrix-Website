import { describe, expect, it } from 'vitest';

import { csvAmount, csvFilename, toCsv } from '@/models/reportCsv';

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(
      toCsv([
        ['Account', 'Debit', 'Credit'],
        ['1000', '500.00', '0.00'],
      ]),
    ).toBe('Account,Debit,Credit\r\n1000,500.00,0.00');
  });

  it('quotes a value containing a comma', () => {
    // Unquoted, `Freight, inbound` becomes two columns and every figure on the
    // row shifts one to the right.
    expect(toCsv([['Freight, inbound', '100.00']])).toBe(
      '"Freight, inbound",100.00',
    );
  });

  it('quotes and doubles an embedded double quote', () => {
    expect(toCsv([['Sales 12" pipe', '100.00']])).toBe('"Sales 12"" pipe",100.00');
  });

  it('quotes a value containing a newline', () => {
    expect(toCsv([['Line one\nline two']])).toBe('"Line one\nline two"');
  });

  it('quotes a value with leading or trailing space', () => {
    // Some spreadsheets trim otherwise, silently changing an account code.
    expect(toCsv([['0100 ']])).toBe('"0100 "');
  });

  it('leaves an ordinary value unquoted', () => {
    expect(toCsv([['Cash', '1000']])).toBe('Cash,1000');
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv([['Cash', null, undefined, '5']])).toBe('Cash,,,5');
  });

  it('accepts numbers as cells', () => {
    expect(toCsv([['Cash', 1000.5]])).toBe('Cash,1000.5');
  });

  it('allows a ragged heading row of one cell', () => {
    // A statement's section headings are single-cell rows.
    expect(
      toCsv([['ASSETS'], ['1000', 'Cash', '500.00']]),
    ).toBe('ASSETS\r\n1000,Cash,500.00');
  });

  it('is an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('csvAmount', () => {
  it('writes a plain number with two decimals', () => {
    expect(csvAmount(1234.5)).toBe('1234.50');
  });

  it('never includes a currency symbol or thousands separator', () => {
    // The formatted display value contains the delimiter, and arrives in the
    // spreadsheet as text that cannot be summed.
    const cell = csvAmount(1234567.89);
    expect(cell).toBe('1234567.89');
    expect(cell).not.toContain(',');
    expect(cell).not.toContain('Rs');
  });

  it('keeps a negative as a minus, not parentheses', () => {
    expect(csvAmount(-500)).toBe('-500.00');
  });

  it('writes zero', () => {
    expect(csvAmount(0)).toBe('0.00');
  });

  it('is an empty cell for a missing or non-finite amount', () => {
    expect(csvAmount(null)).toBe('');
    expect(csvAmount(undefined)).toBe('');
    expect(csvAmount(Number.NaN)).toBe('');
    expect(csvAmount(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('csvFilename', () => {
  it('stamps a range', () => {
    expect(
      csvFilename('profit-loss', {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      }),
    ).toBe('profit-loss-2026-01-01-to-2026-03-31');
  });

  it('stamps an as-of date', () => {
    expect(csvFilename('balance-sheet', { asOfDate: '2026-03-31' })).toBe(
      'balance-sheet-as-of-2026-03-31',
    );
  });

  it('falls back to the bare report name with no period', () => {
    expect(csvFilename('ar-aging', {})).toBe('ar-aging');
  });
});
