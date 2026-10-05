// ═══════════════════════════════════════════════════════
// FinMatrix Web — History serializer
// ═══════════════════════════════════════════════════════
// `GET /customers/:id/history` and `GET /vendors/:id/history` differ only in
// their words — lastInvoice/lastBill, sales/purchases, receipts/payments — so
// both read into one PartyHistory.

import type {
  HistoryAction,
  HistoryChange,
  HistoryDocument,
  PartyHistory,
  PartyType,
} from '@/models/partyHistory';
import { asRaw, str } from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

const ACTIONS = new Set<HistoryAction>(['created', 'updated', 'deactivated', 'reactivated', 'deleted']);

const document = (value: unknown): HistoryDocument | null => {
  if (!value || typeof value !== 'object') return null;
  const d = asRaw(value);
  return { id: str(d.id), number: str(d.number), date: str(d.date), amount: toNumber(d.amount as never) };
};

const shown = (value: unknown): string | boolean | null =>
  value === null || value === undefined ? null : typeof value === 'boolean' ? value : String(value);

export const partyHistorySerializer = (payload: unknown, type: PartyType): PartyHistory => {
  const r = asRaw(payload);
  const party = asRaw(r.party);
  const fy = asRaw(r.fiscalYear);
  const totals = asRaw(r.totals);
  const customer = type === 'customer';
  const pays = r.averageDaysToPay ? asRaw(r.averageDaysToPay) : null;

  const changes: HistoryChange[] | null = Array.isArray(r.changes)
    ? r.changes.map((item) => {
        const c = asRaw(item);
        const user = c.user ? asRaw(c.user) : null;
        const action = str(c.action) as HistoryAction;
        return {
          id: str(c.id),
          at: str(c.at),
          action: ACTIONS.has(action) ? action : 'updated',
          user: user ? str(user.name) || null : null,
          fields: (Array.isArray(c.fields) ? c.fields : []).map((f) => {
            const x = asRaw(f);
            return { field: str(x.field), from: shown(x.from), to: shown(x.to) };
          }),
        };
      })
    : null;

  return {
    partyType: type,
    party: { id: str(party.id), code: str(party.code), name: str(party.name) },
    since: str(r.since) || null,
    lastDocument: document(customer ? r.lastInvoice : r.lastBill),
    lastPayment: document(r.lastPayment),
    averageDaysToPay: pays ? { days: toNumber(pays.days as never), count: toNumber(pays.count as never) } : null,
    fiscalYear: {
      year: toNumber(fy.year as never),
      startDate: str(fy.startDate),
      endDate: str(fy.endDate),
    },
    openingBalance: toNumber(r.openingBalance as never),
    months: (Array.isArray(r.months) ? r.months : []).map((item) => {
      const m = asRaw(item);
      return {
        month: str(m.month),
        charged: toNumber((customer ? m.sales : m.purchases) as never),
        settled: toNumber((customer ? m.receipts : m.payments) as never),
        balance: toNumber(m.balance as never),
      };
    }),
    totals: {
      charged: toNumber((customer ? totals.sales : totals.purchases) as never),
      settled: toNumber((customer ? totals.receipts : totals.payments) as never),
    },
    closingBalance: toNumber(r.closingBalance as never),
    changes,
  };
};
