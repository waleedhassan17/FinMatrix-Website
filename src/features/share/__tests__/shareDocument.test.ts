import { describe, expect, it } from 'vitest';

import {
  canShareFiles,
  mailtoUrl,
  normalizeWhatsappPhone,
  pdfFilename,
  sanitizeFilename,
  shareSubject,
  shareText,
  whatsappUrl,
  type ShareableDocument,
} from '@/features/share/shareDocument';
import { formatMoney } from '@/utils/money';

const invoice: ShareableDocument = {
  kind: 'Invoice',
  number: 'INV-2026-0047',
  partyName: 'Faisal Traders',
  partyEmail: 'faisal@example.com',
  partyPhone: '0300-1234567',
  amount: 12000,
  amountLabel: 'Amount due',
  dueDate: 'Oct 10, 2026',
  companyName: 'Warehouse Co',
};

describe('filenames', () => {
  it('names a document by number and party', () => {
    expect(pdfFilename(invoice)).toBe('INV-2026-0047 - Faisal Traders.pdf');
  });

  it('names a report by kind and period', () => {
    expect(pdfFilename({ kind: 'Profit & Loss', period: 'Jan 1, 2026 – Sep 13, 2026' })).toBe(
      'Profit & Loss - Jan 1, 2026 – Sep 13, 2026.pdf',
    );
  });

  it('strips characters no file system accepts', () => {
    expect(sanitizeFilename('A/B: "C" <D>|E?')).toBe('A-B- -C- -D-E-');
    expect(pdfFilename({ kind: '' })).toBe('document.pdf');
  });
});

describe('message', () => {
  it('addresses the party and states the figures', () => {
    const text = shareText(invoice);
    expect(text).toContain('Dear Faisal Traders,');
    expect(text).toContain('Please find an invoice INV-2026-0047 attached.');
    expect(text).toContain(`Amount due: ${formatMoney(12000)}`);
    expect(text).toContain('Due date: Oct 10, 2026');
    expect(text.trim().endsWith('Warehouse Co')).toBe(true);
    expect(shareSubject(invoice)).toBe('Invoice INV-2026-0047 from Warehouse Co');
  });

  it('reads naturally for a report with no party', () => {
    const text = shareText({ kind: 'Balance Sheet', period: 'as of Sep 13, 2026' });
    expect(text.startsWith('Hello,')).toBe(true);
    expect(text).toContain('Please find the Balance Sheet for as of Sep 13, 2026 attached.');
  });

  it('uses "a" before a consonant', () => {
    expect(shareText({ kind: 'Purchase order', number: 'PO-1' })).toContain('a purchase order PO-1');
  });
});

describe('WhatsApp', () => {
  it('normalises Pakistani numbers to country code form', () => {
    expect(normalizeWhatsappPhone('0300-1234567')).toBe('923001234567');
    expect(normalizeWhatsappPhone('+92 300 1234567')).toBe('923001234567');
    expect(normalizeWhatsappPhone('3001234567')).toBe('923001234567');
    expect(normalizeWhatsappPhone('0092 300 1234567')).toBe('923001234567');
  });

  it('drops numbers too short to be real', () => {
    expect(normalizeWhatsappPhone('12345')).toBeNull();
    expect(normalizeWhatsappPhone('')).toBeNull();
    expect(normalizeWhatsappPhone(undefined)).toBeNull();
  });

  it('builds a chat link with the message encoded', () => {
    expect(whatsappUrl('0300-1234567', 'Hi & bye')).toBe('https://wa.me/923001234567?text=Hi%20%26%20bye');
    expect(whatsappUrl(null, 'Hi')).toBe('https://wa.me/?text=Hi');
  });
});

describe('email', () => {
  it('builds a draft to the party with subject and body encoded', () => {
    expect(mailtoUrl('faisal@example.com', 'Invoice #1', 'Line 1\nLine 2')).toBe(
      'mailto:faisal@example.com?subject=Invoice%20%231&body=Line%201%0ALine%202',
    );
  });

  it('leaves the recipient empty when the address is missing or malformed', () => {
    expect(mailtoUrl('', 'S', 'B')).toBe('mailto:?subject=S&body=B');
    expect(mailtoUrl('not an email', 'S', 'B')).toBe('mailto:?subject=S&body=B');
    expect(mailtoUrl('a@b.c?bcc=x@y.z', 'S', 'B')).toBe('mailto:?subject=S&body=B');
  });
});

describe('canShareFiles', () => {
  it('is false without the Web Share API', () => {
    expect(canShareFiles({} as Navigator)).toBe(false);
    expect(canShareFiles(undefined)).toBe(false);
  });

  it('asks the browser whether a PDF file can be shared', () => {
    const yes = { share: () => Promise.resolve(), canShare: () => true } as unknown as Navigator;
    const no = { share: () => Promise.resolve(), canShare: () => false } as unknown as Navigator;
    expect(canShareFiles(yes)).toBe(true);
    expect(canShareFiles(no)).toBe(false);
  });
});
