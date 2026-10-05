import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownUp, ChevronRight, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { TablePager } from '@/components/ui/DataTable';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { cn } from '@/lib/cn';
import { partyLabel } from '@/models/partyCode';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  defaultReportRange,
  formatShortDate,
  matchPreset,
  presetRange,
  rangeLabel,
  type ReportRange,
} from '@/models/reportPeriod';
import {
  getGeneralLedger,
  getLedgerAccounts,
  getLedgerParties,
  getPartyLedger,
} from '@/networks/reports/generalLedgerNetwork';
import type { LedgerPartyType, PartyLedgerEntry } from '@/serializers/reportSerializers';
import { formatAmount, formatMoney } from '@/utils/money';

const PAGE_SIZE = 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type LedgerOrder = 'newest' | 'oldest';
const ORDER_KEY = 'finmatrix.gl.order';

/**
 * Who the ledger is read by. One ledger, three selections — an account, a
 * customer or a vendor — the way Peachtree lets you pull up any account's or
 * any customer's ledger and read it the same way.
 */
type LedgerView = 'accounts' | 'customers' | 'vendors';
const VIEWS: [LedgerView, string][] = [
  ['accounts', 'Accounts'],
  ['customers', 'Customers'],
  ['vendors', 'Vendors'],
];
const PARTY_OF: Record<LedgerView, LedgerPartyType | null> = {
  accounts: null,
  customers: 'customer',
  vendors: 'vendor',
};

/** Where a party line's document opens. A bill payment has no page of its own. */
const DOCUMENT_PATHS: Record<string, string> = {
  invoice: '/invoices',
  payment: '/payments',
  credit_memo: '/credit-memos',
  delivery: '/deliveries',
  bill: '/bills',
  vendor_credit: '/vendor-credits',
};

/** The reader's last choice of order. Browser storage can be unavailable. */
const readOrder = (): LedgerOrder => {
  try {
    return window.localStorage.getItem(ORDER_KEY) === 'oldest' ? 'oldest' : 'newest';
  } catch {
    return 'newest';
  }
};
const saveOrder = (order: LedgerOrder) => {
  try {
    window.localStorage.setItem(ORDER_KEY, order);
  } catch {
    /* a private window or blocked storage: the choice just is not remembered */
  }
};

/** One ledger row as the table, the CSV and the PDF read it, whoever it belongs to. */
interface Row {
  key: string;
  date: string;
  reference: string;
  /** The account (`1100 · Accounts Receivable`), or the transaction (`Invoice INV-2026-0012`). */
  title: string;
  caption: string;
  debit: number;
  credit: number;
  balance: number;
  voided: boolean;
  to: string | null;
  party?: PartyLedgerEntry;
}

export default function GeneralLedgerPage() {
  const navigate = useNavigate();

  /**
   * The view — period, selection and page — lives in the URL, so Back from a
   * journal entry or document opened off a ledger row lands on the same slice
   * of the ledger rather than on year-to-date, all accounts, page 1. Written
   * with `replace`, so adjusting a filter does not stack history entries for
   * Back to wade through. A customer's page links straight in with
   * `?view=customers&customer=<id>`.
   */
  const [params, setParams] = useSearchParams();
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const range: ReportRange = useMemo(
    () =>
      fromParam && toParam && ISO.test(fromParam) && ISO.test(toParam) && fromParam <= toParam
        ? { startDate: fromParam, endDate: toParam }
        : defaultReportRange(),
    [fromParam, toParam],
  );
  const viewParam = params.get('view');
  const view: LedgerView = viewParam === 'customers' || viewParam === 'vendors' ? viewParam : 'accounts';
  const partyType = PARTY_OF[view];
  const partyParam = view === 'customers' ? 'customer' : 'vendor';
  const accountCode = view === 'accounts' ? (params.get('account') ?? '') : '';
  const partyId = partyType ? (params.get(partyParam) ?? '') : '';
  const requestedPage = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const noun = view === 'vendors' ? 'vendor' : 'customer';

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  // A new period or selection means the page number no longer refers to
  // anything, so both start again at page 1.
  const setRange = (next: ReportRange) =>
    update({ from: next.startDate, to: next.endDate, page: null });
  const setView = (next: LedgerView) => update({ view: next === 'accounts' ? null : next, page: null });
  const setAccountCode = (code: string) => update({ account: code || null, page: null });
  const setPartyId = (id: string) => update({ [partyParam]: id || null, page: null });
  const setPage = (next: number) => update({ page: next > 1 ? String(next) : null });

  // Newest first by default: the question people bring to a ledger is usually
  // "did my posting land", and oldest-first paging put today's entries on the
  // last page — QA's "entries are not updating". Balances stay the server's
  // chronological running balance either way.
  const [order, setOrderState] = useState<LedgerOrder>(readOrder);
  const setOrder = (next: LedgerOrder) => {
    setOrderState(next);
    saveOrder(next);
    update({ page: null });
  };

  // Always fresh on arrival: a ledger served from cache after a posting is
  // exactly the stale view this page exists not to show.
  const fresh = { placeholderData: keepPreviousData, staleTime: 0, refetchOnMount: 'always' as const };
  const accounts = useQuery({
    queryKey: ['reports', 'ledger-accounts', range],
    queryFn: () => getLedgerAccounts(range),
    enabled: view === 'accounts',
    ...fresh,
  });
  const ledger = useQuery({
    queryKey: ['reports', 'ledger', range, accountCode],
    queryFn: () => getGeneralLedger(range, accountCode || undefined),
    enabled: view === 'accounts',
    ...fresh,
  });
  const parties = useQuery({
    queryKey: ['reports', 'ledger-parties', partyType, range],
    queryFn: () => getLedgerParties(range, partyType as LedgerPartyType),
    enabled: partyType !== null,
    ...fresh,
  });
  const partyLedger = useQuery({
    queryKey: ['reports', 'ledger', partyType, range, partyId],
    queryFn: () => getPartyLedger(range, partyType as LedgerPartyType, partyId || undefined),
    enabled: partyType !== null,
    ...fresh,
  });
  const active = partyType ? partyLedger : ledger;

  /**
   * Re-read the books. A preset period chosen before midnight ("Year to date"
   * ending yesterday) moves on to today first.
   */
  const refresh = () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const preset = matchPreset(range, yesterday);
    if (preset !== 'custom' && matchPreset(range) === 'custom') {
      setRange(presetRange(preset));
      return;
    }
    if (partyType) {
      partyLedger.refetch();
      parties.refetch();
    } else {
      ledger.refetch();
      accounts.refetch();
    }
  };

  /**
   * A searchable picker over the accounts that actually moved.
   *
   * `/ledger/accounts` already carries each account's balance and entry count, so
   * this needs no second call. The app renders one chip per account plus a full
   * list beneath — on a real chart of accounts that is several hundred chips above
   * the table before a single ledger row is visible.
   */
  const accountOptions = useMemo(
    () => [
      { value: '', label: 'All accounts' },
      ...(accounts.data?.accounts ?? []).map((a) => ({
        value: a.accountCode,
        label: `${a.accountCode} · ${a.accountName} — ${formatMoney(a.balance)} (${a.entries})`,
      })),
    ],
    [accounts.data],
  );

  /**
   * Every customer (or vendor), found by ID or name — the picker filters on the
   * label, which starts with the ID. Parties with nothing in the period are
   * listed too, at their balance, so anyone can be looked up.
   */
  const partyOptions = useMemo(() => {
    const options = [
      { value: '', label: view === 'vendors' ? 'All vendors' : 'All customers' },
      ...(parties.data?.parties ?? []).map((p) => ({
        value: p.partyId,
        label: `${partyLabel(p.partyCode, p.partyName)} — ${formatMoney(p.closing)} (${p.entries})`,
      })),
    ];
    // Linked straight to someone the list has not loaded yet: name them anyway.
    const named = partyLedger.data?.party;
    if (partyId && named?.id === partyId && !options.some((o) => o.value === partyId)) {
      options.push({ value: partyId, label: partyLabel(named.code, named.name) });
    }
    return options;
  }, [parties.data, partyLedger.data, partyId, view]);

  const selectedParty = partyLedger.data?.party.id === partyId ? partyLedger.data.party : null;
  const selectionLabel = partyType
    ? partyId
      ? `${view === 'vendors' ? 'Vendor' : 'Customer'} ${selectedParty ? partyLabel(selectedParty.code, selectedParty.name) : ''}`.trim()
      : view === 'vendors'
        ? 'All vendors'
        : 'All customers'
    : accountCode
      ? `Account ${accountCode}`
      : 'All accounts';

  /** The rows, oldest first, whoever the ledger is read by. */
  const chronological: Row[] = useMemo(() => {
    if (partyType) {
      return (partyLedger.data?.entries ?? []).map((e, i) => {
        const docPath = e.documentType && e.documentId ? DOCUMENT_PATHS[e.documentType] : undefined;
        return {
          key: `${e.sourceId}-${e.accountCode}-${i}`,
          date: e.date,
          reference: e.reference,
          title: [e.label, e.documentNumber].filter(Boolean).join(' '),
          caption: [
            `${e.accountCode} · ${e.accountName}`,
            partyId ? '' : partyLabel(e.partyCode, e.partyName),
          ]
            .filter(Boolean)
            .join(' · '),
          debit: e.debit,
          credit: e.credit,
          balance: e.balance,
          voided: e.voided,
          to: docPath ? `${docPath}/${e.documentId}` : e.sourceId ? `/journal-entries/${e.sourceId}` : null,
          party: e,
        };
      });
    }
    return (ledger.data?.entries ?? []).map((e, i) => ({
      key: `${e.sourceId}-${e.accountCode}-${i}`,
      date: e.date,
      reference: e.reference,
      title: `${e.accountCode} · ${e.accountName}`,
      caption: e.memo,
      debit: e.debit,
      credit: e.credit,
      balance: e.balance,
      voided: e.voided,
      // Every row reads from journal_entry_lines, so `sourceId` is always a
      // real entry — the drill-through the app never wired despite carrying
      // the id on each line.
      to: e.sourceId ? `/journal-entries/${e.sourceId}` : null,
    }));
  }, [partyType, partyLedger.data, ledger.data, partyId]);

  // Memoised off the data rather than with a `?? []` fallback: that fallback
  // is a fresh array every render, so the paging memo below would never hold.
  const entries = useMemo(
    () => (order === 'newest' ? [...chronological].reverse() : chronological),
    [chronological, order],
  );

  // The opening and closing lines, for one account or one party.
  const balanceOf = (list: { key: string; balance: number }[] | undefined, key: string) =>
    key ? list?.find((b) => b.key === key) : undefined;
  const openingList = partyType
    ? partyLedger.data?.openingBalances.map((b) => ({ key: b.partyId, balance: b.balance }))
    : ledger.data?.openingBalances.map((b) => ({ key: b.accountCode, balance: b.balance }));
  const closingList = partyType
    ? partyLedger.data?.closingBalances.map((b) => ({ key: b.partyId, balance: b.balance }))
    : ledger.data?.closingBalances.map((b) => ({ key: b.accountCode, balance: b.balance }));
  const selectedKey = partyType ? partyId : accountCode;
  const opening = balanceOf(openingList, selectedKey);
  const closing = balanceOf(closingList, selectedKey);
  const totals = (partyType ? partyLedger.data?.totals : ledger.data?.totals) ?? { debit: 0, credit: 0 };

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  // Clamped rather than trusted: a URL from before a posting, or typed by hand,
  // can name a page the ledger no longer has.
  const page = Math.min(requestedPage, totalPages);

  /**
   * Paged in memory, in the order the reader chose.
   *
   * The app caps at the LAST 1000 rows and tells the user some are hidden. That
   * cap replaced an earlier bug where it took the FIRST 300 of an oldest-first
   * list and silently hid the newest week of activity. Neither is necessary: the
   * response is complete, so paging shows everything, and the order is preserved
   * because the running balance on each row depends on it.
   */
  const pageRows = useMemo(
    () => entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [entries, page],
  );

  const exportCsv = () => {
    if (!active.data) return;
    const head: CsvRow[] = [['General Ledger'], [rangeLabel(range.startDate, range.endDate)], [selectionLabel], []];
    // The whole period, not just the page on screen — a paged export would be a
    // surprise, and the point of the file is to have the lot. Exported oldest
    // first whatever the screen shows: a ledger file reads top to bottom with
    // its running balance.
    if (partyType) {
      const idHeader = view === 'vendors' ? 'Vendor ID' : 'Customer ID';
      const out: CsvRow[] = [
        ...head,
        ['Date', 'Journal', 'Type', 'Document', idHeader, 'Name', 'Account', 'Debit', 'Credit', 'Balance'],
      ];
      if (partyId && opening) out.push(['', '', 'Opening balance', '', '', '', '', '', '', csvAmount(opening.balance)]);
      for (const r of chronological) {
        const e = r.party as PartyLedgerEntry;
        out.push([
          e.date,
          e.reference,
          e.label,
          e.documentNumber,
          e.partyCode,
          e.partyName,
          `${e.accountCode} ${e.accountName}`,
          csvAmount(e.debit),
          csvAmount(e.credit),
          csvAmount(e.balance),
        ]);
      }
      out.push(['Total', '', '', '', '', '', '', csvAmount(totals.debit), csvAmount(totals.credit), '']);
      return downloadCsv(csvFilename(`${noun}-ledger`, range), toCsv(out));
    }
    const out: CsvRow[] = [
      ...head,
      ['Date', 'Reference', 'Account', 'Account name', 'Memo', 'Debit', 'Credit', 'Balance'],
    ];
    for (const e of ledger.data?.entries ?? []) {
      out.push([
        e.date,
        e.reference,
        e.accountCode,
        e.accountName,
        e.memo,
        csvAmount(e.debit),
        csvAmount(e.credit),
        csvAmount(e.balance),
      ]);
    }
    out.push(['Total', '', '', '', '', csvAmount(totals.debit), csvAmount(totals.credit), '']);
    return downloadCsv(csvFilename('general-ledger', range), toCsv(out));
  };

  const control = partyType && !partyId ? partyLedger.data?.control : null;
  const controlAccounts = control?.accounts.map((a) => `${a.code} ${a.name}`).join(' and ') ?? '';

  return (
    <ReportShell
      title="General Ledger"
      subtitle="Every posting, in order, with a running balance — by account, customer or vendor."
      meta={[rangeLabel(range.startDate, range.endDate), selectionLabel]}
      controls={
        <div className="flex flex-col gap-md">
          <PeriodPicker value={range} onChange={setRange} />
          <div className="flex flex-col gap-xs">
            <div className="flex flex-wrap gap-xxs" role="group" aria-label="Read the ledger by">
              {VIEWS.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={v === view}
                  className={cn(
                    'rounded-full px-sm py-xxs text-label-md transition-colors',
                    v === view
                      ? 'bg-primary text-text-inverse'
                      : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {partyType ? (
              <Combobox
                label={view === 'vendors' ? 'Vendor' : 'Customer'}
                value={partyId}
                onChange={setPartyId}
                options={partyOptions}
                placeholder={view === 'vendors' ? 'All vendors' : 'All customers'}
                searchPlaceholder="Search by ID or name…"
                emptyText={`No ${noun} matches.`}
                containerClassName="max-w-[32rem]"
              />
            ) : (
              <Combobox
                label="Account"
                value={accountCode}
                onChange={setAccountCode}
                options={accountOptions}
                placeholder="All accounts"
                searchPlaceholder="Search by number or name…"
                emptyText="No accounts moved in this period."
                containerClassName="max-w-[32rem]"
              />
            )}
          </div>
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center gap-xs print:hidden">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOrder(order === 'newest' ? 'oldest' : 'newest')}
            aria-label="Change order"
          >
            <ArrowDownUp className="size-4" />
            {order === 'newest' ? 'Newest first' : 'Oldest first'}
          </Button>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={active.isFetching}>
            <RefreshCw className={active.isFetching ? 'size-4 animate-spin' : 'size-4'} />
            Refresh
          </Button>
        </div>
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: rangeLabel(range.startDate, range.endDate),
        basis: selectionLabel,
        cacheKey: [range.startDate, range.endDate, view, accountCode, partyId, active.dataUpdatedAt].join('|'),
        // The whole period, not the page on screen — the same rule as the CSV.
        build: () => [
          {
            columns: [
              { header: 'Date', flex: 1.4 },
              { header: partyType ? 'Journal' : 'Reference', flex: 1.5 },
              { header: partyType ? 'Transaction' : 'Account', flex: 3 },
              { header: 'Debit', align: 'right', flex: 1.6 },
              { header: 'Credit', align: 'right', flex: 1.6 },
              { header: 'Balance', align: 'right', flex: 1.7 },
            ],
            rows: [
              ...(opening && (partyId || accountCode)
                ? [{ cells: [formatShortDate(range.startDate), '', 'Opening balance', null, null, opening.balance], bold: true }]
                : []),
              ...chronological.map((r) => ({
                cells: [
                  formatShortDate(r.date),
                  r.reference || '—',
                  partyType ? [r.title, partyId ? '' : r.party ? partyLabel(r.party.partyCode, r.party.partyName) : ''].filter(Boolean).join(' — ') : r.title,
                  r.debit || null,
                  r.credit || null,
                  r.balance,
                ],
              })),
              {
                cells: ['Period total', '', '', totals.debit, totals.credit, ''],
                grand: true,
              },
            ],
          },
        ],
      }}
      isLoading={active.isLoading}
      isRefetching={active.isFetching}
      error={active.error as Error | null}
      onRetry={() => active.refetch()}
      hasData={entries.length > 0 || Boolean(partyId && opening && opening.balance !== 0)}
      empty={
        <>
          <p className="text-label-lg text-text-primary">Nothing posted</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            No entries for this period
            {accountCode ? ' on the selected account' : partyId ? ` for this ${noun}` : ''}. Try a wider range.
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <FigureStrip columns={3} className="print:hidden">
          <Figure label="Total debits" value={totals.debit} caption="In the period" />
          <Figure label="Total credits" value={totals.credit} caption="In the period" />
          {/* A count, not an amount — a number value would print as `Rs 120`. */}
          <Figure
            label="Ledger lines"
            value={entries.length.toLocaleString('en-US')}
            caption={`Showing ${pageRows.length} on this page, ${order === 'newest' ? 'newest' : 'oldest'} first`}
          />
        </FigureStrip>

        <Card className="p-lg">
          <ReportTitleBlock
            report="General Ledger"
            periodLabel={rangeLabel(range.startDate, range.endDate)}
          />

          <div className="mt-md overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-md py-sm text-left text-overline text-text-secondary">
                    Date
                  </th>
                  <th className="px-md py-sm text-left text-overline text-text-secondary">
                    Reference
                  </th>
                  <th className="px-md py-sm text-left text-overline text-text-secondary">
                    {partyType ? 'Transaction' : 'Account'}
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Debit
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Credit
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Balance
                  </th>
                  <th className="w-8 px-xs py-sm print:hidden" />
                </tr>
              </thead>
              <tbody>
                {selectedKey && page === 1 && (order === 'oldest' ? opening : closing) && (
                  <BalanceRow
                    label={order === 'oldest' ? 'Opening balance' : 'Closing balance'}
                    balance={(order === 'oldest' ? opening : closing)!.balance}
                  />
                )}
                {pageRows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => r.to && navigate(r.to)}
                    className={cn(
                      'border-b border-border-light transition-colors hover:bg-surface-2',
                      r.to && 'cursor-pointer',
                    )}
                  >
                    <td className="px-md py-sm text-body-sm whitespace-nowrap text-text-primary">
                      {formatShortDate(r.date)}
                    </td>
                    <td className="px-md py-sm text-label-md whitespace-nowrap text-text-primary">
                      {r.reference || '—'}
                    </td>
                    <td className="px-md py-sm">
                      <span className="block text-body-sm text-text-primary">{r.title}</span>
                      {r.caption && (
                        <span className="block text-caption text-text-tertiary">{r.caption}</span>
                      )}
                      {r.voided && (
                        <span className="mt-xxs inline-block rounded-sm bg-neutral-100 px-xs text-caption text-text-secondary">
                          Voided — reversed by a later entry
                        </span>
                      )}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {r.debit ? formatAmount(r.debit) : '—'}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {r.credit ? formatAmount(r.credit) : '—'}
                    </td>
                    <td className="px-md py-sm text-right tabular text-label-md whitespace-nowrap text-text-primary">
                      {formatAmount(r.balance)}
                    </td>
                    <td className="px-xs py-sm print:hidden">
                      {r.to && <ChevronRight className="size-4 text-text-tertiary" />}
                    </td>
                  </tr>
                ))}
                {selectedKey && page === totalPages && (order === 'oldest' ? closing : opening) && (
                  <BalanceRow
                    label={order === 'oldest' ? 'Closing balance' : 'Opening balance'}
                    balance={(order === 'oldest' ? closing : opening)!.balance}
                  />
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2">
                  <td
                    className="px-md py-sm text-h5 text-text-primary"
                    colSpan={3}
                  >
                    Period total
                  </td>
                  <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                    {formatAmount(totals.debit)}
                  </td>
                  <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                    {formatAmount(totals.credit)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <TablePager
            page={page}
            totalPages={totalPages}
            total={entries.length}
            onPage={setPage}
          />
        </Card>

        {/* Every customer (or vendor) together should be the control account.
            Said once, and only when it is not, with the way to look. */}
        {control && (
          <p className="text-caption text-text-tertiary">
            {Math.abs(control.unlinked) < 0.005 ? (
              <>
                Every {noun}&rsquo;s balance adds up to {controlAccounts} at {formatShortDate(range.endDate)}:{' '}
                {formatAmount(control.balance)}.
              </>
            ) : (
              <>
                {formatAmount(control.unlinked)} on {controlAccounts} belongs to no {noun} — posted straight to the
                account by a journal entry.{' '}
                <Link
                  to={`/reports/general-ledger?account=${control.accounts[0]?.code ?? ''}&from=${range.startDate}&to=${range.endDate}`}
                  className="text-primary hover:underline"
                >
                  See account {control.accounts[0]?.code}
                </Link>
                .
              </>
            )}
          </p>
        )}

        <p className="text-caption text-text-tertiary">
          {order === 'newest' ? 'Newest first.' : 'Oldest first.'}{' '}
          {partyType === 'customer'
            ? 'The balance column is the customer’s running balance — what they owe, carried forward from before the period; below zero is credit in their favour. A receipt partly held as an advance shows on both Accounts Receivable and Customer Advances. Select a row to open its document.'
            : partyType === 'vendor'
              ? 'The balance column is the vendor’s running balance, debit-positive like every account here: below zero is what you owe them. Select a row to open its document.'
              : 'The balance column is the running balance per account, carried forward from before the period. Drafts are excluded; a journal that was posted and then voided stays, beside the entry that reverses it. Select a row to open its journal entry.'}
        </p>
      </div>
    </ReportShell>
  );
}

/** An opening or closing balance line for the selected account or party. */
function BalanceRow({ label, balance }: { label: string; balance: number }) {
  return (
    <tr className="border-b border-border-light bg-surface-2">
      <td className="px-md py-sm text-label-md text-text-secondary" colSpan={5}>
        {label}
      </td>
      <td className="px-md py-sm text-right tabular text-label-md whitespace-nowrap text-text-primary">
        {formatAmount(balance)}
      </td>
      <td className="print:hidden" />
    </tr>
  );
}
