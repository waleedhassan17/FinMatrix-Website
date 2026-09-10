// ═══════════════════════════════════════════════════════
// FinMatrix Web — Journal Entry Network
// ═══════════════════════════════════════════════════════
// The whole controller is `@RequiresFeature('journalEntries')`, so a company on
// a tier without it gets 403 on every call here — not a permission problem.
//
// Create, post and void are each maker-checker for staff. Note that staff CAN
// call `/post` and `/void`: the server files an approval request rather than
// refusing, which is why the buttons show with `cap.submitLabel(…)` instead of
// being hidden. The mobile app's journal detail screen has no capability check
// at all and shows staff an enabled "Post to Ledger" that silently files a
// request instead.

import type { JournalEntry, JournalEntryStatus } from '@/models/journalEntry';
import {
  api,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import {
  journalEntryListSerializer,
  journalEntrySingleSerializer,
  mapJournalEntry,
  type JournalEntryWritePayload,
} from '@/serializers/journalEntrySerializer';

export interface JournalEntryQueryParams {
  status?: JournalEntryStatus;
  startDate?: string;
  endDate?: string;
  /** Matches `reference` and `memo`. */
  search?: string;
}

export type JournalWriteResult =
  | { pending: false; entry: JournalEntry }
  | { pending: true; approval: PendingApproval };

const narrow = (payload: unknown): JournalWriteResult =>
  isPendingApproval(payload)
    ? { pending: true, approval: payload }
    : { pending: false, entry: mapJournalEntry(payload) };

/**
 * The General Journal. Unpaginated, newest first, and **without lines** — the
 * list query loads no relations, so each row's totals must come from
 * `totalDebits`/`totalCredits` rather than from summing lines that are not there.
 */
export const getJournalEntries = async (
  params: JournalEntryQueryParams = {},
): Promise<JournalEntry[]> => {
  try {
    const response = await api.get('/journal-entries', { params });
    return journalEntryListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getJournalEntryById = async (
  id: string,
): Promise<JournalEntry | null> => {
  try {
    const response = await api.get(`/journal-entries/${id}`);
    return journalEntrySingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Create an entry, as a draft or posted straight away.
 *
 * A draft may be unbalanced; a posted entry may not — the server checks the
 * balance only when `status === 'posted'`. The line shape is checked either way.
 *
 * Idempotency-keyed because a posted entry writes the ledger: a retry replays
 * the stored response rather than posting the same figures twice.
 */
export const createJournalEntry = async (
  data: JournalEntryWritePayload,
  idempotencyKey?: string,
): Promise<JournalWriteResult> => {
  try {
    const response = await api.post('/journal-entries', data, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Post a draft to the ledger. Drafts only — a posted or void entry answers
 * CANNOT_EDIT_NON_DRAFT. Can also fail with UNBALANCED_ENTRY, ACCOUNT_INACTIVE,
 * or PERIOD_LOCKED when the entry is dated inside a closed period.
 */
export const postJournalEntry = async (id: string): Promise<JournalWriteResult> => {
  try {
    const response = await api.post(`/journal-entries/${id}/post`, {});
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Void an entry. The reason is REQUIRED.
 *
 * A draft is simply marked void. A POSTED entry is reversed: the server books a
 * second entry with every line's debit and credit swapped, so the ledger keeps
 * both and stays auditable. Refused once the entry's GL rows belong to a
 * finalised bank reconciliation.
 */
export const voidJournalEntry = async (
  id: string,
  reason: string,
): Promise<JournalWriteResult> => {
  try {
    const response = await api.post(`/journal-entries/${id}/void`, { reason });
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
