import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { TablePager } from '@/components/ui/DataTable';
import { CountTile, KpiTile } from '@/features/reports/KpiTile';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  defaultReportRange,
  formatShortDate,
  rangeLabel,
} from '@/models/reportPeriod';
import {
  getGeneralLedger,
  getLedgerAccounts,
} from '@/networks/reports/generalLedgerNetwork';
import { colors } from '@/theme/tokens';
import { formatAmount, formatMoney } from '@/utils/money';

const PAGE_SIZE = 100;

export default function GeneralLedgerPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState(defaultReportRange);
  const [accountCode, setAccountCode] = useState('');

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
  const filterKey = `${range.startDate}|${range.endDate}|${accountCode}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ key: filterKey, page: next });

  const accounts = useQuery({
    queryKey: ['reports', 'ledger-accounts', range],
    queryFn: () => getLedgerAccounts(range),
    placeholderData: keepPreviousData,
  });

  const ledger = useQuery({
    queryKey: ['reports', 'ledger', range, accountCode],
    queryFn: () => getGeneralLedger(range, accountCode || undefined),
    placeholderData: keepPreviousData,
  });

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
  const entries = useMemo(() => ledger.data?.entries ?? [], [ledger.data]);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));

  /**
   * Paged in memory, oldest first.
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
    for (const e of entries) {
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
              ...entries.map((e) => ({
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
        <div className="grid gap-md sm:grid-cols-3 print:hidden">
          <KpiTile
            label="Total debits"
            value={ledger.data?.totals.debit ?? 0}
            accent={colors.info}
          />
          <KpiTile
            label="Total credits"
            value={ledger.data?.totals.credit ?? 0}
            accent={colors.primary}
          />
          {/* A count, not an amount — KpiTile would render it as `Rs 120`. */}
          <CountTile
            label="Entries"
            value={entries.length}
            hint={`Showing ${pageRows.length} on this page`}
          />
        </div>

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
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-text-primary">
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
          Oldest first. The balance column is the running balance per account, as
          recorded at each posting. Only posted entries appear — drafts and voided
          entries are excluded. Select a row to open its journal entry.
        </p>
      </div>
    </ReportShell>
  );
}
