// ═══════════════════════════════════════════════════════
// FinMatrix Web — The document model
// ═══════════════════════════════════════════════════════
// One description of a business document — letterhead, party, reference fields,
// lines, totals, notes — that both the on-screen sheet (DocumentPaper) and the
// PDF (TransactionPdf) draw. What a user sees on the page is what the customer
// receives, because there is only one mapping from the record to the document.

import type { ShareableDocument } from '@/features/share/shareDocument';
import { formatShortDate } from '@/models/reportPeriod';
import type { CompanyProfile } from '@/models/settings';

export interface DocCompany {
  name: string;
  logo: string | null;
  addressLines: string[];
  contactLines: string[];
}

export interface DocParty {
  /** "Bill to", "Vendor", "Customer"… */
  label: string;
  name: string;
  lines: string[];
  email?: string;
  phone?: string;
}

export interface DocLine {
  description: string;
  /** A second, smaller line: the item or account behind the line. */
  secondary?: string;
  quantity: number | null;
  unitPrice: number | null;
  taxRate: number;
  amount: number;
}

export interface DocTotal {
  label: string;
  value: number;
  /** Bold. */
  strong?: boolean;
  /** The figure the reader acts on — a balance due, a total — set on a tinted band. */
  grand?: boolean;
  tone?: 'success' | 'danger';
  dividerBefore?: boolean;
  /** Printed before the figure, e.g. "− " on a discount. */
  prefix?: string;
}

export interface DocStamp {
  label: string;
  tone: 'neutral' | 'success' | 'danger';
}

export interface DocumentModel {
  kind: string;
  number: string;
  company: DocCompany;
  party: DocParty | null;
  meta: { label: string; value: string }[];
  /** Bills and vendor credits carry an amount per line and nothing else. */
  showQuantity: boolean;
  /** Receipts carry no tax; everything else shows the column. */
  showTax?: boolean;
  quantityHeader: string;
  priceHeader: string;
  lines: DocLine[];
  totals: DocTotal[];
  notes: { title: string; text: string }[];
  signatures: string[];
  stamp: DocStamp | null;
  share: ShareableDocument;
}

// ─── Formatting ─────────────────────────────────────────

/** "2026-09-10" or a timestamp → "Sep 10, 2026"; blank stays blank. */
export const docDate = (iso: string | null | undefined): string =>
  iso ? formatShortDate(iso.slice(0, 10)) : '';

interface AddressLike {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  zipCode?: string;
  country?: string;
}

/** An address as printed: street on one line, city/state/postcode on the next, then country. */
export const addressLines = (a: AddressLike | null | undefined): string[] => {
  if (!a) return [];
  const cityLine = [a.city, a.state, a.postalCode ?? a.zipCode].filter((p) => p && p.trim()).join(', ');
  return [a.street, cityLine, a.country].filter((p): p is string => !!p && p.trim().length > 0);
};

const joinDots = (...parts: Array<string | undefined | null>): string =>
  parts.filter((p): p is string => !!p && p.trim().length > 0).join(' · ');

/**
 * The letterhead. Falls back to the session's company name while the profile is
 * loading, or for a member who cannot read it, so a document is never unbranded.
 */
export const companyForDocument = (
  profile: CompanyProfile | null | undefined,
  fallbackName: string | null | undefined,
): DocCompany => ({
  name: profile?.name || fallbackName || 'Your company',
  logo: profile?.logo || null,
  addressLines: addressLines(profile?.address),
  contactLines: [
    joinDots(profile?.phone, profile?.email),
    joinDots(profile?.website, profile?.taxId ? `NTN ${profile.taxId}` : ''),
  ].filter((l) => l.length > 0),
});

export interface PartySource {
  name: string;
  company?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: AddressLike | null;
  taxId?: string;
}

export const partyForDocument = (
  label: string,
  fallbackName: string,
  source: PartySource | null | undefined,
): DocParty => ({
  label,
  name: source?.name || fallbackName || '—',
  lines: [
    source?.company && source.company !== source.name ? source.company : '',
    source?.contactPerson ? `Attn: ${source.contactPerson}` : '',
    ...addressLines(source?.address),
    joinDots(source?.phone, source?.email),
    source?.taxId ? `NTN ${source.taxId}` : '',
  ].filter((l): l is string => !!l && l.length > 0),
  email: source?.email || undefined,
  phone: source?.phone || undefined,
});

/**
 * "Overdue by 3 days" / "Due today" / "Due in 5 days", counted in whole calendar
 * days from `today`, so a document due this afternoon is not already overdue.
 */
export const dueLabel = (
  dueDate: string | null | undefined,
  today: Date = new Date(),
): { label: string; tone: 'danger' | 'warning' | 'neutral' } | null => {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due - now) / 86_400_000);
  const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  if (days < 0) return { label: `Overdue by ${plural(-days)}`, tone: 'danger' };
  if (days === 0) return { label: 'Due today', tone: 'warning' };
  if (days <= 7) return { label: `Due in ${plural(days)}`, tone: 'warning' };
  return { label: `Due in ${plural(days)}`, tone: 'neutral' };
};

/** Draft, void and paid documents carry a stamp so a printed copy cannot be mistaken. */
export const stampFor = (status: string): DocStamp | null => {
  switch (status) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'void':
    case 'voided':
      return { label: 'Void', tone: 'danger' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' };
    case 'paid':
      return { label: 'Paid', tone: 'success' };
    default:
      return null;
  }
};
