import { CheckCircle2, ChevronDown, ChevronRight, Info, PackageSearch } from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import type { DocCompany } from '@/features/documents/documentModel';
import { ExportMenu } from '@/features/daySummary/ExportMenu';
import { ItemMonthPanel } from '@/features/reports/ItemSalesEntries';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { cn } from '@/lib/cn';
import {
  GROUPING_LABELS,
  groupItemSheet,
  ITEM_SORT_LABELS,
  ITEM_SORTS,
  itemSheetCsvRows,
  itemSheetPdfSection,
  qtyCell,
  sheetChange,
  sheetPeriodLabel,
  uncategorizedShare,
  type ItemGrouping,
  type ItemSort,
  type SheetTotals,
} from '@/models/dayItemSheet';
import { csvHeaderBlock, downloadCsv, toCsv } from '@/models/reportCsv';
import type { PeriodPreset, ReportRange } from '@/models/reportPeriod';
import type { DayItemSheet, DayItemSheetRow } from '@/serializers/daySummarySerializer';
import { dayMoney } from '@/models/daySummary';
import { formatAmount } from '@/utils/money';

/** A table amount (no currency) with a true minus sign, like the rest of the page. */
const amountCell = (n: number): string => formatAmount(n).replace(/^-/, '−');

/** How long typing pauses before the search is put in the address. */
const SEARCH_DELAY_MS = 300;

export type SheetPeriodMode = 'day' | 'range';

/** A range is days or a few weeks; the year-long presets belong elsewhere. */
const RANGE_PRESETS: PeriodPreset[] = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

export interface ItemSalesProps {
  sheet: DayItemSheet | undefined;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
  mode: SheetPeriodMode;
  onMode: (mode: SheetPeriodMode) => void;
  range: ReportRange;
  onRange: (range: ReportRange) => void;
  groupBy: ItemGrouping;
  onGroupBy: (g: ItemGrouping) => void;
  sort: ItemSort;
  onSort: (s: ItemSort) => void;
  q: string;
  onSearch: (q: string) => void;
  company: DocCompany;
  /** "Entered by …" / "My entries", for the export's header. */
  scopeLabel?: string;
  /** The owner's everyone view: an item opens the documents behind it. */
  canDrill: boolean;
  /** "vs the day before" / "vs same day last week". */
  compareLabel: string;
}

const figureClass = 'px-xs text-right tabular whitespace-nowrap align-top';

/** More lines than this and the sheet opens with its groups folded. */
const FOLD_AFTER = 30;

/**
 * Item-wise sales: every item sold in the period, grouped by category (or
 * agency), with units sold, given free and returned, net units and net sales —
 * and, for the owner, gross profit and margin. Subtotals per group, a grand
 * total, and a line showing the total ties to the period's invoices.
 */
export function ItemSales(props: ItemSalesProps) {
  const { sheet, loading, fetching, error, onRetry, groupBy, sort, q } = props;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<DayItemSheetRow | null>(null);
  // Typing is local; the search reaches the address (and the exports) once it pauses.
  const [draft, setDraft] = useState(q);
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== draft.trim()) setDraft(q);
  }
  const { onSearch } = props;
  useEffect(() => {
    const next = draft.trim();
    if (next === q) return undefined;
    const t = setTimeout(() => onSearch(next), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [draft, q, onSearch]);

  // The list filters as the reader types; only the address waits.
  const view = sheet ? groupItemSheet(sheet, { groupBy, sort, q: draft.trim() }) : null;
  const period = sheet ? sheetPeriodLabel(sheet.from, sheet.to) : '';
  const cols = {
    free: sheet?.hasFree ?? false,
    cost: sheet?.showCost ?? false,
    compare: sheet?.compare != null,
  };
  // Item, Sold, Returned, Net units, Net sales, then Free and Gross profit when shown.
  const columnCount = 5 + Number(cols.free) + Number(cols.cost);
  // A long sheet opens as a summary of its groups; a short one, item by item.
  const foldByDefault = (sheet?.rows.length ?? 0) > FOLD_AFTER;
  const isFolded = (key: string) => collapsed[key] ?? foldByDefault;
  const toggle = (key: string) => setCollapsed((p) => ({ ...p, [key]: !(p[key] ?? foldByDefault) }));
  const allCollapsed = view ? view.groups.every((g) => isFolded(g.key)) : false;
  const toggleAll = () => setCollapsed(view ? Object.fromEntries(view.groups.map((g) => [g.key, !allCollapsed])) : {});

  const exportView = { groupBy, sort, q: draft.trim() };
  const filename = sheet ? `item-sales-${sheet.from}${sheet.to !== sheet.from ? `-to-${sheet.to}` : ''}` : 'item-sales';

  return (
    <Card className="overflow-hidden" aria-labelledby="item-sales-title">
      <div className="flex flex-col gap-sm border-b border-border-light px-lg py-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="item-sales-title" className="text-label-lg text-text-primary">
            Item-wise sales
          </h2>
          <p className="text-caption text-text-tertiary">
            {period || (error ? 'Not loaded' : 'Loading…')}
            {sheet && sheet.rows.length > 0 && ` · ${sheet.rows.length} ${sheet.rows.length === 1 ? 'line' : 'lines'}`}
            {sheet?.compare && ` · ${props.compareLabel}`}
          </p>
        </div>
        <ExportMenu
          title="Item-wise sales"
          label="Export sheet"
          periodName={sheet && sheet.from !== sheet.to ? 'Period' : 'Day'}
          periodLabel={period}
          basis={props.scopeLabel}
          company={props.company}
          disabled={!sheet || fetching}
          filename={filename}
          sections={async () => (sheet ? [itemSheetPdfSection(sheet, exportView)] : [])}
          onCsv={async () => {
            if (!sheet) return undefined;
            const rows = [
              ...csvHeaderBlock({
                company: props.company.name,
                report: 'Item-wise sales (net)',
                period,
                basis: props.scopeLabel ?? 'Everyone',
              }),
              ...itemSheetCsvRows(sheet, exportView),
            ];
            return downloadCsv(filename, toCsv(rows));
          }}
        />
      </div>

      {/* ── How the sheet is read ─────────────────────────────────── */}
      <div className="flex flex-col gap-sm border-b border-border-light px-lg py-sm print:hidden">
        <div className="flex flex-wrap items-center gap-sm">
          <SegmentedControl<SheetPeriodMode>
            label="Period"
            size="sm"
            value={props.mode}
            onChange={props.onMode}
            options={[
              { value: 'day', label: 'This day' },
              { value: 'range', label: 'Date range' },
            ]}
          />
          <SegmentedControl<ItemGrouping>
            label="Group by"
            size="sm"
            value={groupBy}
            onChange={props.onGroupBy}
            options={(['category', 'agency', 'none'] as const).map((g) => ({
              value: g,
              label: GROUPING_LABELS[g],
              ariaLabel: `Group by ${GROUPING_LABELS[g].toLowerCase()}`,
            }))}
          />
          <Select<ItemSort>
            compact
            containerClassName="min-w-[9rem]"
            value={sort}
            onChange={props.onSort}
            options={ITEM_SORTS.map((s) => ({
              value: s,
              label: `Sort: ${ITEM_SORT_LABELS[s]}`,
            }))}
          />
          <SearchInput
            size="sm"
            value={draft}
            onValueChange={setDraft}
            placeholder="Search items"
            aria-label="Find an item or code"
            containerClassName="min-w-[10rem] flex-1"
          />
        </div>
        {props.mode === 'range' && (
          <PeriodPicker value={props.range} onChange={props.onRange} presets={RANGE_PRESETS} />
        )}
      </div>

      {loading && (
        <div role="status" aria-label="Loading item-wise sales" className="flex flex-col gap-sm p-lg">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      )}

      {!loading && error && (
        <div className="p-lg">
          <p className="text-label-md text-text-primary">Item-wise sales could not be loaded</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            Check the connection and try again. The rest of the day is unaffected.
          </p>
          <Button variant="secondary" size="sm" className="mt-sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && sheet && view && (
        <div
          className={cn('transition-opacity duration-200 motion-reduce:transition-none', fetching && 'opacity-60')}
          aria-busy={fetching}
        >
          <SheetFigures totals={view.totals} sheet={sheet} />

          {sheet.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-xs px-lg py-xl text-center">
              <PackageSearch className="size-8 text-text-tertiary" aria-hidden="true" />
              <p className="text-label-md text-text-primary">No items sold in {period}</p>
              <p className="max-w-prose text-body-sm text-text-secondary">
                Invoices, delivered orders and returns dated in the period show here, item by item.
              </p>
            </div>
          ) : view.groups.length === 0 ? (
            <p className="px-lg py-lg text-center text-body-sm text-text-tertiary">No item matches “{q}”.</p>
          ) : (
            <>
              <div className="flex justify-end px-lg pt-sm">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-label-md text-primary hover:underline print:hidden"
                >
                  {allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
                </button>
              </div>

              {/* Desktop: the sheet as a table. It flows with the page; the item
                  column stays put if a narrow window has to scroll sideways. */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse bg-surface" aria-label={`Item-wise sales, ${period}`}>
                  <thead>
                    <tr className="border-b border-border-light">
                      <Th className="sticky left-0 z-[2] text-left">Item</Th>
                      <Th>Sold</Th>
                      {cols.free && <Th title="Units given at price 0">Free</Th>}
                      <Th>Returned</Th>
                      <Th title="Sold + free − returned">Net units</Th>
                      <Th title="Before tax, after invoice discounts, less returns">Net sales</Th>
                      {cols.cost && <Th title="Net sales less the cost of the goods, with the margin">Gross profit</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {view.groups.map((g) => {
                      const folded = isFolded(g.key);
                      const count = `${g.rows.length} ${
                        g.services ? (g.rows.length === 1 ? 'line' : 'lines') : g.rows.length === 1 ? 'item' : 'items'
                      }`;
                      const heading = (
                        <button
                          type="button"
                          aria-expanded={!folded}
                          onClick={() => toggle(g.key)}
                          className="flex min-w-0 items-center gap-xs text-left text-label-lg text-text-primary hover:text-primary"
                        >
                          {folded ? (
                            <ChevronRight className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                          )}
                          <span className="truncate">{g.label}</span>
                          <span className="shrink-0 text-caption text-text-tertiary">{count}</span>
                        </button>
                      );
                      if (folded) {
                        // Folded: the group is one line, its totals in the columns.
                        return <TotalsRow key={g.key} label={heading} totals={g.totals} cols={cols} tone="group" />;
                      }
                      return (
                        <Fragment key={g.key}>
                          <tr className="bg-surface-2">
                            <td colSpan={columnCount} className="sticky left-0 bg-inherit px-md py-xs">
                              {heading}
                            </td>
                          </tr>
                          {g.rows.map((r) => (
                            <SheetRow
                              key={r.itemId ?? `svc:${r.name}`}
                              row={r}
                              cols={cols}
                              onOpen={props.canDrill && r.itemId ? () => setDrill(r) : undefined}
                            />
                          ))}
                          <TotalsRow label={`Total ${g.label}`} totals={g.totals} cols={cols} />
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <TotalsRow
                      label={view.filtered ? 'Total (items shown)' : 'Grand total'}
                      totals={view.totals}
                      cols={cols}
                      tone="grand"
                    />
                  </tfoot>
                </table>
              </div>

              {/* Phone: the same groups as cards. */}
              <ul className="divide-y divide-border-light sm:hidden" aria-label={`Item-wise sales, ${period}`}>
                {view.groups.map((g) => {
                  const isCollapsed = isFolded(g.key);
                  return (
                    <li key={g.key}>
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggle(g.key)}
                        className="flex w-full items-center justify-between gap-sm bg-surface-2 px-lg py-xs text-left"
                      >
                        <span className="flex min-w-0 items-center gap-xs text-label-md text-text-primary">
                          {isCollapsed ? (
                            <ChevronRight className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                          )}
                          <span className="truncate">{g.label}</span>
                        </span>
                        <span className="text-label-md tabular text-text-primary">{dayMoney(g.totals.value)}</span>
                      </button>
                      {!isCollapsed && (
                        <ul className="divide-y divide-border-light">
                          {g.rows.map((r) => (
                            <PhoneRow
                              key={r.itemId ?? `svc:${r.name}`}
                              row={r}
                              cols={cols}
                              onOpen={props.canDrill && r.itemId ? () => setDrill(r) : undefined}
                            />
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
                <li className="flex items-baseline justify-between gap-sm border-t-2 border-border-strong bg-surface-2 px-lg py-sm">
                  <span className="text-label-lg text-text-primary">
                    {view.filtered ? 'Total (items shown)' : 'Grand total'}
                    <span className="block text-caption text-text-tertiary">{qtyCell(view.totals.net)} net units</span>
                  </span>
                  <span className="text-h5 tabular text-text-primary">{dayMoney(view.totals.value)}</span>
                </li>
              </ul>
            </>
          )}

          <SheetNotes sheet={sheet} groupBy={groupBy} />
        </div>
      )}

      {drill?.itemId && sheet && (
        <ItemMonthPanel
          itemId={drill.itemId}
          itemName={drill.name}
          period={sheet.from}
          periodLabel={period}
          range={{ startDate: sheet.from, endDate: sheet.to }}
          onClose={() => setDrill(null)}
        />
      )}
    </Card>
  );
}

function Th({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <th
      scope="col"
      title={title}
      className={cn(
        'bg-surface px-xs py-xs text-right text-overline text-text-secondary whitespace-nowrap first:pl-md last:pr-md',
        className,
      )}
    >
      {children}
    </th>
  );
}

interface Cols {
  free: boolean;
  cost: boolean;
  compare: boolean;
}

/** "+12%" in green, "−8%" in red, "New", or a dash. */
function Change({ current, previous }: { current: number; previous: number | null }) {
  const c = sheetChange(current, previous);
  if (!c) return <span className="text-text-tertiary">–</span>;
  return <span className={c.up ? 'text-success' : 'text-danger'}>{c.text}</span>;
}

const marginText = (m: number | null) => (m === null ? '–' : `${m.toFixed(1)}%`);

/** Net sales over its change against the comparison period. */
function NetSalesCell({
  value,
  previous,
  cols,
  strong,
}: {
  value: number;
  previous: number | null;
  cols: Cols;
  strong?: string;
}) {
  return (
    <>
      <span className={cn('block', strong, value < 0 && 'text-danger')}>{amountCell(value)}</span>
      {cols.compare && (
        <span className="block text-caption">
          <Change current={value} previous={previous} />
        </span>
      )}
    </>
  );
}

/** Gross profit over its margin. */
function ProfitCell({
  profit,
  margin,
  costMissing,
}: {
  profit: number | null;
  margin: number | null;
  costMissing?: boolean;
}) {
  // Nothing to show (a service or charge, or staff): one quiet dash, not two.
  if (profit === null) return <span className="block text-text-tertiary">–</span>;
  return (
    <>
      <span className={cn('block', (profit ?? 0) < 0 && 'text-danger')}>
        {profit === null ? '–' : amountCell(profit)}
        {costMissing && (
          <span title="Some of its cost was never recorded, so profit is overstated" className="ml-xxs text-warning">
            *
          </span>
        )}
      </span>
      <span className={cn('block text-caption', (margin ?? 0) < 0 ? 'text-danger' : 'text-text-tertiary')}>
        {marginText(margin)}
      </span>
    </>
  );
}

function SheetRow({ row: r, cols, onOpen }: { row: DayItemSheetRow; cols: Cols; onOpen?: () => void }) {
  const meta = [r.code, r.unit && r.unit !== 'unit' ? r.unit : null].filter(Boolean).join(' · ');
  const label = (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-body-sm text-text-primary">{r.name}</span>
      {meta && <span className="truncate text-caption tabular text-text-tertiary">{meta}</span>}
    </span>
  );
  return (
    <tr
      className={cn(
        'border-b border-border-light bg-surface text-body-sm',
        onOpen && 'cursor-pointer hover:bg-surface-hover',
      )}
      onClick={onOpen}
    >
      <td className="sticky left-0 z-[1] max-w-[16rem] bg-inherit py-xs pl-md pr-xs align-top">
        {onOpen ? (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`${r.name}: the documents behind its figures`}
            className="flex w-full min-w-0 text-left outline-none focus-visible:underline"
          >
            {label}
          </button>
        ) : r.itemId ? (
          <Link to={`/inventory/${encodeURIComponent(r.itemId)}`} className="flex min-w-0 hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </td>
      <td className={cn(figureClass, 'py-xs text-text-primary')}>{qtyCell(r.sold)}</td>
      {cols.free && <td className={cn(figureClass, 'py-xs text-text-primary')}>{qtyCell(r.free)}</td>}
      <td className={cn(figureClass, 'py-xs', r.returned > 0 ? 'text-danger' : 'text-text-primary')}>
        {qtyCell(r.returned)}
      </td>
      <td className={cn(figureClass, 'py-xs text-label-md text-text-primary')}>{qtyCell(r.net)}</td>
      <td className={cn(figureClass, 'py-xs text-text-primary', !cols.cost && 'pr-md')}>
        <NetSalesCell value={r.value} previous={r.compareValue} cols={cols} strong="text-label-md" />
      </td>
      {cols.cost && (
        <td className={cn(figureClass, 'py-xs pr-md text-text-primary')}>
          <ProfitCell profit={r.profit} margin={r.margin} costMissing={r.costMissing} />
        </td>
      )}
    </tr>
  );
}

/**
 * A group's subtotal, a folded group (its heading with its totals), or the
 * grand total — the same figures in the same columns.
 */
function TotalsRow({
  label,
  totals: t,
  cols,
  tone = 'subtotal',
}: {
  label: ReactNode;
  totals: SheetTotals;
  cols: Cols;
  tone?: 'subtotal' | 'group' | 'grand';
}) {
  const grand = tone === 'grand';
  const text = grand ? 'text-h5' : 'text-label-lg';
  const cell = cn(figureClass, grand ? 'py-sm' : 'py-xs', text, 'text-text-primary');
  return (
    <tr
      className={cn(
        grand && 'border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2',
        tone === 'subtotal' && 'border-b border-border bg-surface',
        tone === 'group' && 'border-b border-border-light bg-surface-2',
      )}
    >
      <td
        className={cn(
          'sticky left-0 z-[1] bg-inherit pl-md pr-xs align-top text-text-primary',
          grand ? 'py-sm' : 'py-xs',
          text,
        )}
      >
        {label}
      </td>
      <td className={cell}>{qtyCell(t.sold)}</td>
      {cols.free && <td className={cell}>{qtyCell(t.free)}</td>}
      <td className={cell}>{qtyCell(t.returned)}</td>
      <td className={cell}>{qtyCell(t.net)}</td>
      <td className={cn(cell, !cols.cost && 'pr-md')}>
        <NetSalesCell value={t.value} previous={t.compareValue} cols={cols} />
      </td>
      {cols.cost && (
        <td className={cn(cell, 'pr-md')}>
          <ProfitCell profit={t.profit} margin={t.margin} />
        </td>
      )}
    </tr>
  );
}

function PhoneRow({ row: r, cols, onOpen }: { row: DayItemSheetRow; cols: Cols; onOpen?: () => void }) {
  const moves = [
    `Sold ${qtyCell(r.sold)}`,
    r.free > 0 ? `Free ${qtyCell(r.free)}` : null,
    r.returned > 0 ? `Returned ${qtyCell(r.returned)}` : null,
  ].filter(Boolean);
  // A service has no cost of goods: its "profit" is the sale itself, so it is not repeated.
  const showProfit = cols.cost && r.kind === 'item' && r.profit !== null;
  const body = (
    <div className="flex items-start justify-between gap-sm">
      <div className="min-w-0">
        <p className="truncate text-body-sm text-text-primary">{r.name}</p>
        {r.code && <p className="truncate text-caption tabular text-text-tertiary">{r.code}</p>}
        <p className={cn('text-caption', r.returned > 0 ? 'text-text-secondary' : 'text-text-tertiary')}>
          {moves.join(' · ')}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-label-md tabular', r.value < 0 ? 'text-danger' : 'text-text-primary')}>
          {dayMoney(r.value)}
        </p>
        <p className="text-caption tabular text-text-secondary">
          {qtyCell(r.net)} net
          {cols.compare && (
            <>
              {' · '}
              <Change current={r.value} previous={r.compareValue} />
            </>
          )}
        </p>
        {showProfit && (
          <p className={cn('text-caption tabular', (r.profit ?? 0) < 0 ? 'text-danger' : 'text-text-tertiary')}>
            GP {amountCell(r.profit ?? 0)} · {marginText(r.margin)}
          </p>
        )}
      </div>
    </div>
  );
  return (
    <li className="px-lg py-xs">
      {onOpen ? (
        <button type="button" className="w-full text-left" onClick={onOpen} aria-haspopup="dialog">
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}

/**
 * The headline of the sheet, always four figures so the row is never ragged:
 * net units, net sales, returns, and gross profit for the owner (staff, who
 * see no cost, get the number of lines instead).
 */
function SheetFigures({ totals: t, sheet }: { totals: SheetTotals; sheet: DayItemSheet }) {
  const tiles: Array<{ label: string; value: string; note?: ReactNode; tone?: string }> = [
    {
      label: 'Net units',
      value: qtyCell(t.net),
      note: sheet.hasFree ? `incl. ${qtyCell(t.free)} free` : undefined,
    },
    {
      label: 'Net sales',
      value: dayMoney(t.value),
      note: sheet.compare ? <Change current={t.value} previous={t.compareValue} /> : undefined,
    },
    {
      label: 'Returns',
      value: dayMoney(-t.returnsValue),
      note: t.returned > 0 ? `${qtyCell(t.returned)} units back` : 'None',
      tone: t.returnsValue > 0 ? 'text-danger' : undefined,
    },
    sheet.showCost && t.profit !== null
      ? {
          label: 'Gross profit on items',
          value: dayMoney(t.profit),
          note: t.margin === null ? undefined : `${t.margin.toFixed(1)}% margin`,
          tone: t.profit < 0 ? 'text-danger' : undefined,
        }
      : { label: 'Lines sold', value: String(t.lines) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px border-b border-border-light bg-border-light sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="min-w-0 bg-surface px-lg py-sm">
          <dt className="text-caption text-text-tertiary">{tile.label}</dt>
          <dd className={cn('truncate text-label-lg tabular text-text-primary', tile.tone)}>{tile.value}</dd>
          {tile.note && <dd className="text-caption text-text-secondary">{tile.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** How the figures are worked out, and that they tie to the documents. */
function SheetNotes({ sheet, groupBy }: { sheet: DayItemSheet; groupBy: ItemGrouping }) {
  const tie = sheet.reconciliation;
  const manyUngrouped = groupBy === 'category' && uncategorizedShare(sheet) >= 0.3;
  return (
    <div className="flex flex-col gap-xs border-t border-border-light bg-surface-2 px-lg py-sm text-caption text-text-secondary">
      {sheet.rows.length > 0 && (
        <p className="flex items-start gap-xs">
          {tie.matches ? (
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <Info className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
          )}
          <span>
            Net sales {dayMoney(tie.netSales)} = invoices before tax, after discounts{' '}
            {dayMoney(tie.salesBeforeTax)}
            {' − '}returns {dayMoney(tie.returns)}.{' '}
            {tie.matches
              ? 'The sheet adds up to exactly that.'
              : `The sheet shows ${dayMoney(sheet.totals.value)}; some lines could not be matched to an item.`}
          </span>
        </p>
      )}
      <p>
        Net units = sold + free − returned. Free units were given at price 0. Net sales are before tax, after each
        invoice’s discount, less returns. Delivered orders count what the customer received.
        {sheet.showCost &&
          ' Gross profit on items is for stock items: net sales less the cost of the goods (services and charges carry none); * marks a line with cost missing. It can differ from Gross profit (books) under Profit for the day, which is the ledger’s figure for everything posted.'}
      </p>
      {manyUngrouped && (
        <p>
          Most of these items have no category.{' '}
          <Link to="/inventory" className="text-text-link hover:underline">
            Give items a category
          </Link>{' '}
          (for example “Beverages” or “Dairy”) to group the sheet by product line.
        </p>
      )}
    </div>
  );
}

export default ItemSales;
