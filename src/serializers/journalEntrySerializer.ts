// ═══════════════════════════════════════════════════════
// FinMatrix Web — Journal Entry Serializer
// ═══════════════════════════════════════════════════════

import type {
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  JournalFormData,
} from '@/models/journalEntry';
import { usableJournalLines } from '@/models/journalEntry';
import { asRaw, str } from '@/serializers/documentLines';
import { toDecimal, toNumber } from '@/utils/money';

const mapJournalLine = (raw: unknown): JournalEntryLine => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    accountId: str(r.accountId),
    // `getById` enriches each line with the account's number and name; the
    // entity itself carries neither, so a detail view depends on this.
    accountNumber: str(r.accountNumber ?? asRaw(r.account).accountNumber),
    accountName: str(r.accountName ?? asRaw(r.account).name),
    description: str(r.description),
    debit: toNumber(r.debit as never),
    credit: toNumber(r.credit as never),
    lineOrder: toNumber(r.lineOrder as never),
  };
};

export const mapJournalEntry = (raw: unknown): JournalEntry => {
  const r = asRaw(raw);
  const rawLines = Array.isArray(r.lines) ? r.lines : [];

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    reference: str(r.reference),
    date: str(r.date),
    memo: str(r.memo),
    status: (str(r.status) || 'draft') as JournalEntryStatus,
    // Sorted by lineOrder because a debit/credit pair read out of order is
    // actively confusing. The server sorts on detail but the list omits lines
    // entirely, so this cannot rely on the order it arrives in.
    lines: rawLines
      .map(mapJournalLine)
      .sort((a, b) => a.lineOrder - b.lineOrder),
    totalDebits: toNumber(r.totalDebits as never),
    totalCredits: toNumber(r.totalCredits as never),
    createdBy: str(r.createdBy),
    postedBy: str(r.postedBy),
    postedAt: str(r.postedAt),
    voidReason: str(r.voidReason),
    reversalOfId: r.reversalOfId ? str(r.reversalOfId) : null,
    sourceType: str(r.sourceType),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /journal-entries` → `{entries}`, unpaginated, **without lines**.
 *
 * The list query loads no relations, so every row has an empty `lines` array and
 * the only totals available are `totalDebits`/`totalCredits` on the entry
 * itself. A list column that tried to read the lines would silently render
 * nothing.
 */
export const journalEntryListSerializer = (payload: unknown): JournalEntry[] => {
  if (Array.isArray(payload)) return payload.map(mapJournalEntry);
  const d = asRaw(payload);
  const rows = Array.isArray(d.entries)
    ? d.entries
    : Array.isArray(d.data)
      ? d.data
      : [];
  return rows.map(mapJournalEntry);
};

/** `GET /journal-entries/:id` → the entry with enriched lines. */
export const journalEntrySingleSerializer = (
  payload: unknown,
): JournalEntry | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.journalEntry ?? d.entry ?? (d.id ? d : null);
  return raw ? mapJournalEntry(raw) : null;
};

// ═══════════════════════════════════════════════════════
// Form → API
// ═══════════════════════════════════════════════════════

export interface JournalLineWritePayload {
  accountId: string;
  description?: string;
  /** Required, as a string. `"0"` on the side that is not used. */
  debit: string;
  credit: string;
  lineOrder: number;
}

export interface JournalEntryWritePayload {
  date: string;
  memo?: string;
  status: 'draft' | 'posted';
  lines: JournalLineWritePayload[];
  isOpeningBalance?: boolean;
}

/**
 * Form → create payload.
 *
 * `debit` and `credit` are BOTH `@IsNumberString()` and both required — never
 * one signed amount, and never an omitted side. The unused side is the string
 * `"0"`: omitting it fails validation, and sending `0` as a number fails
 * `@IsNumberString` too.
 *
 * `lineOrder` is assigned here, sequentially from 0 over the lines actually
 * sent, so a dropped blank row in the middle of the editor cannot leave a gap.
 * `isOpeningBalance` is sent only when true — it switches the entry's
 * `sourceType` to `opening_balance`, which the dashboard's setup checklist
 * looks for.
 */
export const journalFormToPayload = (
  form: JournalFormData,
  options: { status: 'draft' | 'posted'; isOpeningBalance?: boolean },
): JournalEntryWritePayload => {
  const payload: JournalEntryWritePayload = {
    date: form.date,
    status: options.status,
    lines: usableJournalLines(form.lines).map((line, index) => {
      const linePayload: JournalLineWritePayload = {
        accountId: line.accountId,
        debit: toDecimal(line.debit).toDecimalPlaces(2).toFixed(2),
        credit: toDecimal(line.credit).toDecimalPlaces(2).toFixed(2),
        lineOrder: index,
      };
      const description = line.description.trim();
      if (description) linePayload.description = description;
      return linePayload;
    }),
  };

  const memo = form.memo.trim();
  if (memo) payload.memo = memo;
  if (options.isOpeningBalance) payload.isOpeningBalance = true;

  return payload;
};
