// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory import serializer
// ═══════════════════════════════════════════════════════
// The unwrapped preview/commit answer → ImportResult. Decimals arrive as
// strings and become numbers for display — except the opening-stock total,
// which is also kept verbatim: the commit sends it back as the owner's
// confirmation and the server compares it exactly.

import type {
  ImportAction,
  ImportFieldChange,
  ImportResult,
  ImportRow,
} from '@/models/inventoryImport';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const num = (v: unknown): number => toNumber(v as never);
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const ACTIONS: ImportAction[] = ['create', 'update', 'unchanged', 'error'];

const mapRow = (raw: unknown): ImportRow => {
  const r = asRaw(raw);
  const opening = r.openingStock ? asRaw(r.openingStock) : null;
  return {
    rowNumber: num(r.rowNumber),
    sku: String(r.sku ?? ''),
    name: String(r.name ?? ''),
    action: ACTIONS.includes(r.action as ImportAction) ? (r.action as ImportAction) : 'error',
    itemId: strOrNull(r.itemId),
    changes: Array.isArray(r.changes)
      ? r.changes.map((c): ImportFieldChange => {
          const x = asRaw(c);
          return {
            field: String(x.field ?? ''),
            label: String(x.label ?? x.field ?? ''),
            from: strOrNull(x.from),
            to: strOrNull(x.to),
          };
        })
      : [],
    openingStock: opening
      ? { quantity: num(opening.quantity), unitCost: num(opening.unitCost), value: num(opening.value) }
      : null,
    errors: strings(r.errors),
    warnings: strings(r.warnings),
  };
};

export const mapImportResult = (raw: unknown): ImportResult => {
  const d = asRaw(raw);
  const s = asRaw(d.summary);
  const opening = asRaw(s.openingStock);
  const columns = asRaw(d.columns);
  const applied = d.applied ? asRaw(d.applied) : null;
  return {
    fileName: String(d.fileName ?? ''),
    recognizedColumns: strings(columns.recognized),
    ignoredColumns: strings(columns.ignored),
    openingStockAllowed: d.openingStockAllowed === true,
    booksLockedUntil: strOrNull(d.booksLockedUntil),
    summary: {
      totalRows: num(s.totalRows),
      create: num(s.create),
      update: num(s.update),
      unchanged: num(s.unchanged),
      error: num(s.error),
      withWarnings: num(s.withWarnings),
      openingStock: {
        items: num(opening.items),
        quantity: num(opening.quantity),
        value: num(opening.value),
        confirmValue: typeof opening.value === 'string' ? opening.value : String(num(opening.value)),
      },
    },
    rows: Array.isArray(d.rows) ? d.rows.map(mapRow) : [],
    applied: applied
      ? {
          created: num(applied.created),
          updated: num(applied.updated),
          openingStockItems: num(applied.openingStockItems),
          openingStockValue: num(applied.openingStockValue),
          openingStockDate: strOrNull(applied.openingStockDate),
          journalReference: strOrNull(applied.journalReference),
        }
      : null,
  };
};
