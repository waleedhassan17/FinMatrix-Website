// ═══════════════════════════════════════════════════════
// FinMatrix Web — Shared document line mapping
// ═══════════════════════════════════════════════════════
// Invoice, estimate and sales-order lines are the same shape on the wire and
// take the same payload. One mapper and one payload builder, so a change to
// the contract is a change in one place.

import type { FormLineItem } from '@/models/document';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

export const asRaw = (v: unknown): Raw =>
  v && typeof v === 'object' ? (v as Raw) : {};

export const str = (v: unknown, fallback = ''): string =>
  v === null || v === undefined ? fallback : String(v);

/** A line as it comes back from any of the three document endpoints. */
export interface DocumentLine {
  id: string;
  itemId: string;
  itemName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  /** qty × unitPrice, tax excluded. The wire calls it `lineTotal`. */
  amount: number;
}

export const mapDocumentLine = (raw: unknown): DocumentLine => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    // The app's two names for the same column.
    itemId: str(r.itemId ?? r.inventoryItemId),
    itemName: str(r.itemName ?? r.description),
    description: str(r.description),
    quantity: toNumber(r.quantity as never),
    unitPrice: toNumber(r.unitPrice as never),
    taxRate: toNumber(r.taxRate as never),
    amount: toNumber((r.amount ?? r.lineTotal) as never),
  };
};

export interface DocumentLineWritePayload {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  itemId?: string;
  /** 'item' sells stock; 'service' is a declared service or charge. */
  lineKind?: 'item' | 'service';
}

/**
 * Form lines → the payload every document DTO expects.
 *
 * Two things the DTOs insist on:
 *   • quantity, unitPrice and taxRate are `@IsNumberString` — STRINGS.
 *   • `itemId` is `@IsOptional() @IsUUID()`; an empty string is not a valid
 *     UUID, so the key is omitted entirely rather than sent blank.
 *
 * The client-only `id` is never sent — the server assigns line ids and derives
 * `lineOrder` from the array index.
 */
export const linesToPayload = (
  lines: FormLineItem[],
): DocumentLineWritePayload[] =>
  lines.map((line) => ({
    description: line.description.trim(),
    quantity: String(parseFloat(line.quantity) || 0),
    unitPrice: String(parseFloat(line.unitPrice) || 0),
    taxRate: String(parseFloat(line.taxRate) || 0),
    ...(line.itemId ? { itemId: line.itemId, lineKind: 'item' as const } : {}),
    // A line with no item is a service only when the user said so; left
    // unmarked, the server refuses it where the company tracks inventory.
    ...(!line.itemId && line.lineKind === 'service' ? { lineKind: 'service' as const } : {}),
  }));

let importedSeq = 0;

/** API lines → form lines, for an edit form. */
export const linesToForm = (lines: DocumentLine[]): FormLineItem[] =>
  lines.map((l) => ({
    id: l.id || `imported_${++importedSeq}`,
    itemId: l.itemId,
    // A saved line without an item was a service (or free text, before the
    // rule): editing it keeps it that way.
    lineKind: l.itemId ? ('item' as const) : ('service' as const),
    description: l.description,
    quantity: String(l.quantity),
    unitPrice: String(l.unitPrice),
    taxRate: String(l.taxRate),
  }));
