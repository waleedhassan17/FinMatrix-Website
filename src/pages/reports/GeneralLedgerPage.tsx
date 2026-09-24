import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownUp, ChevronRight, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { TablePager } from '@/components/ui/DataTable';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  defaultReportRange,
  formatShortDate,
  matchPreset,
  presetRange,
  rangeLabel,
} from '@/models/reportPeriod';
import {
  getGeneralLedger,
  getLedgerAccounts,
} from '@/networks/reports/generalLedgerNetwork';
import { formatAmount, formatMoney } from '@/utils/money';

const PAGE_SIZE = 100;

type LedgerOrder = 'newest' | 'oldest';
const ORDER_KEY = 'finmatrix.gl.order';

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

export default function GeneralLedgerPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState(defaultReportRange);
  const [accountCode, setAccountCode] = useState('');
  // Newest first by default: the question people bring to a ledger is usually
  // "did my posting land", and oldest-first paging put today's entries on the
  // last page — QA's "entries are not updating". Balances stay the server's
  // chronological running balance either way.
  const [order, setOrderState] = useState<LedgerOrder>(readOrder);
  const setOrder = (next: LedgerOrder) => {
    setOrderState(next);
    saveOrder(next);
  };

  /**
   * The page number, scoped to the filter that produced it.
   *
   * Changing the period or the account means the current page number no longer
   * refers to anything, so it has to go back to 1. Storing WHICH filter the page
   * belongs to and comparing during render does that without an effect — an
   * effect here would set state during commit and cause a second render pass on
   * every filter change, and would leave one frame showing page 5 of a result
   * that now has two pages.
   */
  const filterKey = `${range.startDate}|${range.endDate}|${accountCode}|${order}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ key: filterKey, page: next });

  // Always fresh on arrival: a ledger served from cache after a posting is
  // exactly the stale view this page exists not to show.
  const accounts = useQuery({
    queryKey: ['reports', 'ledger-accounts', range],
    queryFn: () => getLedgerAccounts(range),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const ledger = useQuery({
    queryKey: ['reports', 'ledger', range, accountCode],
    queryFn: () => getGeneralLedger(range, accountCode || undefined),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: 'always',
  });

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
    ledger.refetch();
    accounts.refetch();
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

  // Memoised off `ledger.data` rather than with a `?? []` fallback: that fallback
  // is a fresh array every render, so the paging memo below would never hold.
  const entries = useMemo(() => {
    const rows = ledger.data?.entries ?? [];
    return order === 'newest' ? [...rows].reverse() : rows;
  }, [ledger.data, order]);
  const opening = accountCode ? ledger.data?.openingBalances.find((b) => b.accountCode === accountCode) : undefined;
  const closing = accountCode ? ledger.data?.closingBalances.find((b) => b.accountCode === accountCode) : undefined;
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));

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
    if (!ledger.data) return;
    const out: CsvRow[] = [
      ['General Ledger'],
      [rangeLabel(range.startDate, range.endDate)],
      [accountCode ? `Account ${accountCode}` : 'All accounts'],
      [],
      ['Date', 'Reference', 'Account', 'Account name', 'Memo', 'Debit', 'Credit', 'Balance'],
    ];
    // The whole period, not just the page on screen — a paged export would be a
    // surprise, and the point of the file is to have the lot.
    // Exported oldest first whatever the screen shows: a ledger file reads top
    // to bottom with its running balance.
    for (const e of ledger.data.entries) {
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
    out.push([
      'Total',
      '',
      '',
      '',
      '',
      csvAmount(ledger.data.totals.debit),
      csvAmount(ledger.data.totals.credit),
      '',
    ]);
    downloadCsv(csvFilename('general-ledger', range), toCsv(out));
  };

  return (
    <ReportShell
      title="General Ledger"
      subtitle="Every posting, in order, with a running balance."
      meta={[
        rangeLabel(range.startDate, range.endDate),
        accountCode ? `Account ${accountCode}` : 'All accounts',
      ]}
      controls={
        <div className="flex flex-col gap-md">
          <PeriodPicker value={range} onChange={setRange} />
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
          <Button variant="secondary" size="sm" onClick={refresh} disabled={ledger.isFetching}>
            <RefreshCw className={ledger.isFetching ? 'size-4 animate-spin' : 'size-4'} />
            Refresh
          </Button>
        </div>
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: rangeLabel(range.startDate, range.endDate),
        basis: accountCode ? `Account ${accountCode}` : 'All accounts',
        cacheKey: [range.startDate, range.endDate, accountCode, ledger.dataUpdatedAt].join('|'),
        // The whole period, not the page on screen — the same rule as the CSV.
        build: () => [
          {
            columns: [
              { header: 'Date', flex: 1.4 },
              { header: 'Reference', flex: 1.5 },
              { header: 'Account', flex: 3 },
              { header: 'Debit', align: 'right', flex: 1.6 },
              { header: 'Credit', align: 'right', flex: 1.6 },
              { header: 'Balance', align: 'right', flex: 1.7 },
            ],
            rows: [
              ...(ledger.data?.entries ?? []).map((e) => ({
                cells: [
                  formatShortDate(e.date),
                  e.reference || '—',
                  `${e.accountCode} · ${e.accountName}`,
                  e.debit || null,
                  e.credit || null,
                  e.balance,
                ],
              })),
              {
                cells: ['Period total', '', '', ledger.data?.totals.debit ?? 0, ledger.data?.totals.credit ?? 0, ''],
                grand: true,
              },
            ],
          },
        ],
      }}
      isLoading={ledger.isLoading}
      isRefetching={ledger.isFetching}
      error={ledger.error as Error | null}
      onRetry={() => ledger.refetch()}
      hasData={entries.length > 0}
      empty={
        <>
          <p className="text-label-lg text-text-primary">Nothing posted</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            No entries for this period
            {accountCode ? ' on the selected account' : ''}. Try a wider range.
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <FigureStrip columns={3} className="print:hidden">
          <Figure label="Total debits" value={ledger.data?.totals.debit ?? 0} caption="In the period" />
          <Figure label="Total credits" value={ledger.data?.totals.credit ?? 0} caption="In the period" />
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
                    Account
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
                {accountCode && page === 1 && (order === 'oldest' ? opening : closing) && (
                  <BalanceRow
                    label={order === 'oldest' ? 'Opening balance' : 'Closing balance'}
                    balance={(order === 'oldest' ? opening : closing)!.balance}
                  />
                )}
                {pageRows.map((e, index) => (
                  <tr
                    key={`${e.sourceId}-${e.accountCode}-${index}`}
                    onClick={() =>
                      e.sourceId && navigate(`/journal-entries/${e.sourceId}`)
                    }
                    // Every row reads from journal_entry_lines, so `sourceId` is
                    // always a real entry — the drill-through the app never wired
                    // despite carrying the id on each line.
                    className="cursor-pointer border-b border-border-light transition-colors hover:bg-surface-2"
                  >
                    <td className="px-md py-sm text-body-sm whitespace-nowrap text-text-primary">
                      {formatShortDate(e.date)}
                    </td>
                    <td className="px-md py-sm text-label-md whitespace-nowrap text-text-primary">
                      {e.reference || '—'}
                    </td>
                    <td className="px-md py-sm">
                      <span className="block text-body-sm text-text-primary">
                        {e.accountCode} · {e.accountName}
                      </span>
                      {e.memo && (
                        <span className="block text-caption text-text-tertiary">
                          {e.memo}
                        </span>
                      )}
                      {e.voided && (
                        <span className="mt-xxs inline-block rounded-sm bg-neutral-100 px-xs text-caption text-text-secondary">
                          Voided — reversed by a later entry
                        </span>
                      )}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {e.debit ? formatAmount(e.debit) : '—'}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {e.credit ? formatAmount(e.credit) : '—'}
                    </td>
                    <td className="px-md py-sm text-right tabular text-label-md whitespace-nowrap text-text-primary">
                      {formatAmount(e.balance)}
                    </td>
                    <td className="px-xs py-sm print:hidden">
                      <ChevronRight className="size-4 text-text-tertiary" />
                    </td>
                  </tr>
                ))}
                {accountCode && page === totalPages && (order === 'oldest' ? closing : opening) && (
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
                    {formatAmount(ledger.data?.totals.debit ?? 0)}
                  </td>
                  <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                    {formatAmount(ledger.data?.totals.credit ?? 0)}
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

        <p className="text-caption text-text-tertiary">
          {order === 'newest' ? 'Newest first.' : 'Oldest first.'} The balance column is the
          running balance per account, carried forward from before the period. Drafts are
          excluded; a journal that was posted and then voided stays, beside the entry that
          reverses it. Select a row to open its journal entry.
        </p>
      </div>
    </ReportShell>
  );
}

/** An opening or closing balance line for the selected account. */
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
