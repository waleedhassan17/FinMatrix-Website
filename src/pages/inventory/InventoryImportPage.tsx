import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Package,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, TablePager } from '@/components/ui/DataTable';
import { DateField, Tabs, TabsList, TabsTrigger } from '@/components/ui/Field';
import { StatTile } from '@/components/ui/StatTile';
import { invalidateInventory } from '@/features/inventory/invalidateInventory';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useCapability, useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isoToday } from '@/models/document';
import {
  IMPORT_ACCEPT,
  appliedSummary,
  commitLabel,
  importFileError,
  importTabs,
  openingStockDateError,
  rowsForTab,
  rowsToApply,
  type ImportAction,
  type ImportRow,
  type ImportTab,
} from '@/models/inventoryImport';
import { formatReportDate } from '@/models/reportPeriod';
import { ApiError } from '@/networks/network/apiHelpers';
import { commitImport, downloadItemsTemplate, previewImport } from '@/networks/inventory/inventoryNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 25;
/** A row lists at most this many field changes; the rest are counted. */
const MAX_CHANGES_SHOWN = 6;

const ACTION_META: Record<ImportAction, { label: string; className: string }> = {
  create: { label: 'New', className: 'bg-success-lighter text-success' },
  update: { label: 'Update', className: 'bg-primary-tint text-primary' },
  unchanged: { label: 'Unchanged', className: 'bg-neutral-100 text-text-secondary' },
  error: { label: 'Problem', className: 'bg-danger-lighter text-danger' },
};

const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });
const columnHelper = createColumnHelper<ImportRow>();

/**
 * Import items from Excel or CSV.
 *
 * 1. Download the template — or an export of every item, to edit and send back.
 * 2. Choose the file. The server previews it row by row: what would be created,
 *    updated, left alone, or refused and why. Nothing is saved.
 * 3. Import. Every valid row is applied in one go; rows with problems are
 *    skipped and stay listed so they can be fixed and the file sent again —
 *    sending the same file twice changes nothing the second time.
 *
 * Opening quantities are the owner's: they post Dr Inventory / Cr Opening
 * Balance Equity on the date chosen here, and the owner confirms the exact
 * value the preview showed before anything is recorded.
 */
export default function InventoryImportPage() {
  const enabled = useFeature('inventory');
  const canManage = useCapability('inventory.manageItems').allowed;
  const queryClient = useQueryClient();

  const inputRef = useRef<HTMLInputElement>(null);
  // One key per commit attempt of one file — see commitImport.
  const idempotencyKey = useRef('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState<'template' | 'export' | null>(null);
  const [tab, setTab] = useState<ImportTab>('all');
  const [page, setPage] = useState(1);
  const [openingDate, setOpeningDate] = useState(isoToday());
  const [confirming, setConfirming] = useState(false);

  const preview = useMutation({ mutationFn: (f: File) => previewImport(f) });

  const commit = useMutation({
    mutationFn: (args: { file: File; date?: string; confirmValue?: string }) => {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      return commitImport(
        args.file,
        { openingStockDate: args.date, confirmOpeningStockValue: args.confirmValue },
        idempotencyKey.current,
      );
    },
    onSuccess: (result) => {
      idempotencyKey.current = '';
      setConfirming(false);
      setTab('all');
      setPage(1);
      invalidateInventory(queryClient);
      toast.success('Import complete', {
        description: result.applied ? appliedSummary(result.applied) : undefined,
      });
    },
    onError: (e: Error) => {
      setConfirming(false);
      // A server answer frees the key for a fresh attempt; a dropped
      // connection keeps it, so trying again replays rather than repeats.
      if (e instanceof ApiError && e.code) idempotencyKey.current = '';
      if (e instanceof ApiError && e.code === 'IMPORT_PREVIEW_STALE' && file) {
        toast.info('Your items changed since the preview', {
          description: 'The preview has been refreshed — check it and import again.',
        });
        preview.mutate(file);
        return;
      }
      toast.error('Import failed', { description: e.message });
    },
  });

  const choose = (f: File) => {
    const problem = importFileError(f);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError('');
    setFile(f);
    setTab('all');
    setPage(1);
    idempotencyKey.current = '';
    commit.reset();
    preview.mutate(f);
  };

  const startOver = () => {
    setFile(null);
    setFileError('');
    idempotencyKey.current = '';
    commit.reset();
    preview.reset();
  };

  const download = async (prefill: boolean) => {
    setDownloading(prefill ? 'export' : 'template');
    try {
      const filename = await downloadItemsTemplate(prefill);
      toast.success(prefill ? 'Items exported' : 'Template downloaded', { description: filename });
    } catch (e) {
      toast.error('Download failed', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setDownloading(null);
    }
  };

  const result = commit.data;
  const draft = preview.data;
  const shown = result ?? draft;
  const opening = draft?.summary.openingStock;
  const needsDate = !!draft && draft.openingStockAllowed && !!opening && opening.items > 0;
  const dateError = needsDate ? openingStockDateError(openingDate, isoToday(), draft.booksLockedUntil) : null;
  const toApply = draft ? rowsToApply(draft.summary) : 0;

  const rows = useMemo(() => (shown ? rowsForTab(shown.rows, tab) : []), [shown, tab]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const columns = useMemo(
    () =>
      [
        columnHelper.accessor('rowNumber', {
          header: 'Row',
          cell: (c) => <span className="tabular text-text-tertiary">{c.getValue()}</span>,
        }),
        columnHelper.accessor('sku', {
          header: 'Item',
          cell: (c) => (
            <div className="min-w-0">
              <p className="text-label-md text-text-primary">{c.row.original.name || '—'}</p>
              <p className="text-caption text-text-tertiary">{c.getValue() || 'No SKU'}</p>
            </div>
          ),
        }),
        columnHelper.accessor('action', {
          header: 'Result',
          cell: (c) => {
            const meta = ACTION_META[c.getValue()];
            return (
              <span className={cn('inline-flex rounded-full px-sm py-[2px] text-label-sm', meta.className)}>
                {meta.label}
              </span>
            );
          },
        }),
        columnHelper.display({
          id: 'details',
          header: 'Details',
          meta: { className: 'min-w-[16rem]' },
          cell: (c) => <RowDetails row={c.row.original} />,
        }),
      ] as ColumnDef<ImportRow, unknown>[],
    [],
  );

  if (!enabled) {
    return (
      <FeatureUnavailable icon={Package} title="Inventory" body="Inventory is not included in your company’s plan." />
    );
  }
  if (!canManage) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">You can’t import items</p>
        <p className="mt-xxs text-body-sm text-text-secondary">Ask the owner to give you access to manage items.</p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/inventory">Back to inventory</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/inventory', label: 'Inventory' }}
        title="Import items"
        description="Add or update many items at once from an Excel or CSV file. You see every change before anything is saved."
      />

      {!result && (
        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <Card className="p-lg">
            <SectionHeader title="1 · Get the template" />
            <p className="mt-xs text-body-sm text-text-secondary">
              One item per row. A SKU you already have updates that item; a new SKU adds one. Blank cells leave
              existing values as they are. To change prices in bulk, export your items, edit them in Excel and import
              the file back.
            </p>
            <div className="mt-md flex flex-wrap gap-xs">
              <Button variant="secondary" disabled={downloading !== null} onClick={() => void download(false)}>
                {downloading === 'template' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download template
              </Button>
              <Button variant="secondary" disabled={downloading !== null} onClick={() => void download(true)}>
                {downloading === 'export' ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Export my items
              </Button>
            </div>
          </Card>

          <Card className="p-lg">
            <SectionHeader title="2 · Choose your file" />
            <input
              ref={inputRef}
              type="file"
              accept={IMPORT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) choose(f);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) choose(f);
              }}
              disabled={preview.isPending}
              className={cn(
                'mt-md flex w-full flex-col items-center gap-sm rounded-md border-2 border-dashed border-border p-xl',
                'text-center transition-colors hover:border-primary hover:bg-primary-tint',
                'disabled:pointer-events-none disabled:opacity-60',
                dragging && 'border-primary bg-primary-tint',
              )}
            >
              {preview.isPending ? (
                <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <Upload className="size-6 text-text-secondary" aria-hidden="true" />
              )}
              <span className="text-label-md text-text-primary">
                {preview.isPending ? `Checking ${file?.name ?? 'your file'}…` : file ? file.name : 'Choose or drop a file'}
              </span>
              <span className="text-caption text-text-secondary">
                .xlsx or .csv, up to 1,000 items. Nothing is saved until you import.
              </span>
            </button>
            {fileError && <p className="mt-xs text-caption text-danger">{fileError}</p>}
            {preview.isError && (
              <div className="mt-md flex items-start gap-sm rounded-md border border-danger-light bg-danger-lighter p-md">
                <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" aria-hidden="true" />
                <p className="text-body-sm text-text-primary">{preview.error.message}</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {result?.applied && (
        <Card className="flex flex-col gap-sm p-lg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-sm">
            <CheckCircle2 className="mt-[2px] size-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="text-label-lg text-text-primary">Import complete — {appliedSummary(result.applied)}.</p>
              {result.applied.openingStockItems > 0 && (
                <p className="mt-xxs text-body-sm text-text-secondary">
                  Opening stock for {result.applied.openingStockItems} item
                  {result.applied.openingStockItems === 1 ? '' : 's'} ({formatMoney(result.applied.openingStockValue)})
                  recorded on {formatReportDate(result.applied.openingStockDate ?? isoToday())}
                  {result.applied.journalReference ? ` as ${result.applied.journalReference}` : ''}.
                </p>
              )}
              {result.summary.error > 0 && (
                <p className="mt-xxs text-body-sm text-text-secondary">
                  {result.summary.error} row{result.summary.error === 1 ? ' was' : 's were'} skipped — fix{' '}
                  {result.summary.error === 1 ? 'it' : 'them'} in the file and import it again.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-xs">
            <Button variant="secondary" onClick={startOver}>
              Import another file
            </Button>
            <Button asChild>
              <Link to="/inventory">Go to inventory</Link>
            </Button>
          </div>
        </Card>
      )}

      {shown && (
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="New items" value={qty(shown.summary.create)} tone="success" />
          <StatTile label="Updates" value={qty(shown.summary.update)} />
          <StatTile label="Unchanged" value={qty(shown.summary.unchanged)} />
          <StatTile
            label="Problems"
            value={qty(shown.summary.error)}
            tone={shown.summary.error > 0 ? 'danger' : 'default'}
            hint={shown.summary.error > 0 ? 'Skipped on import' : undefined}
          />
        </div>
      )}

      {needsDate && !result && opening && (
        <Card className="p-lg">
          <SectionHeader title="Opening stock" />
          <div className="mt-md grid gap-md md:grid-cols-[1fr_16rem] md:items-end">
            <div>
              <p className="text-body-sm text-text-primary">
                {opening.items} item{opening.items === 1 ? '' : 's'} · {qty(opening.quantity)} units ·{' '}
                <span className="text-label-md">{formatMoney(opening.value)}</span>
              </p>
              <p className="mt-xxs text-caption text-text-tertiary">
                Recorded as one journal entry: Dr Inventory (1200), Cr Opening Balance Equity (3900). Items that
                already have stock are left alone.
              </p>
            </div>
            <DateField
              label="Record on"
              value={openingDate}
              onChange={setOpeningDate}
              max={isoToday()}
              error={dateError ?? undefined}
            />
          </div>
        </Card>
      )}

      {shown && shown.ignoredColumns.length > 0 && !result && (
        <p className="text-caption text-text-tertiary">Not imported: {shown.ignoredColumns.join(', ')}</p>
      )}

      {shown && (
        <div>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as ImportTab);
              setPage(1);
            }}
          >
            <TabsList>
              {importTabs(shown.summary).map((t) => (
                <TabsTrigger key={t.key} value={t.key} count={t.count}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mt-md">
            <DataTable
              columns={columns}
              data={pageRows}
              empty={<p className="py-xl text-center text-body-sm text-text-secondary">No rows here.</p>}
            />
            <TablePager page={current} totalPages={totalPages} total={rows.length} onPage={setPage} />
          </div>
        </div>
      )}

      {draft && !result && (
        <div className="sticky bottom-0 -mx-lg flex flex-col gap-sm border-t border-border-light bg-surface px-lg py-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm text-text-secondary">
            {toApply > 0
              ? `${toApply} item${toApply === 1 ? '' : 's'} will be saved${draft.summary.error ? `; ${draft.summary.error} with problems will be skipped` : ''}.`
              : 'Nothing in this file needs saving.'}
          </p>
          <div className="flex gap-xs">
            <Button variant="secondary" onClick={startOver} disabled={commit.isPending}>
              Cancel
            </Button>
            <Button
              disabled={toApply === 0 || !!dateError || commit.isPending || preview.isPending}
              onClick={() => setConfirming(true)}
            >
              {commit.isPending && <Loader2 className="size-4 animate-spin" />}
              {toApply > 0 ? commitLabel(draft.summary) : 'Nothing to import'}
            </Button>
          </div>
        </div>
      )}

      {draft && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`${commitLabel(draft.summary)}?`}
          description={
            <span className="flex flex-col gap-xs">
              <span>
                {toApply} item{toApply === 1 ? '' : 's'} will be saved.
                {draft.summary.error > 0 &&
                  ` ${draft.summary.error} row${draft.summary.error === 1 ? '' : 's'} with problems will be skipped.`}
              </span>
              {needsDate && opening && (
                <span>
                  Opening stock for {opening.items} item{opening.items === 1 ? '' : 's'} worth{' '}
                  <strong>{formatMoney(opening.value)}</strong> will be recorded on {formatReportDate(openingDate)} (Dr
                  Inventory, Cr Opening Balance Equity).
                </span>
              )}
            </span>
          }
          confirmLabel="Import"
          busy={commit.isPending}
          onConfirm={() =>
            file &&
            commit.mutate({
              file,
              date: needsDate ? openingDate : undefined,
              confirmValue: opening && opening.items > 0 ? opening.confirmValue : undefined,
            })
          }
        />
      )}
    </div>
  );
}

/** What a row will do, or why it can't: changes, opening stock, problems, notes. */
function RowDetails({ row }: { row: ImportRow }) {
  const changes = row.action === 'update' ? row.changes : [];
  return (
    <div className="flex flex-col gap-[2px] text-caption">
      {changes.slice(0, MAX_CHANGES_SHOWN).map((c) => (
        <p key={c.field} className="text-text-secondary">
          {c.label}: <span className="text-text-tertiary line-through">{c.from ?? '—'}</span> → {c.to ?? '—'}
        </p>
      ))}
      {changes.length > MAX_CHANGES_SHOWN && (
        <p className="text-text-tertiary">+{changes.length - MAX_CHANGES_SHOWN} more changes</p>
      )}
      {row.openingStock && (
        <p className="text-primary">
          Opening stock: {qty(row.openingStock.quantity)} × {formatMoney(row.openingStock.unitCost)} ={' '}
          {formatMoney(row.openingStock.value)}
        </p>
      )}
      {row.errors.map((m) => (
        <p key={m} className="flex items-start gap-xxs text-danger">
          <AlertCircle className="mt-[1px] size-[14px] shrink-0" aria-hidden="true" />
          {m}
        </p>
      ))}
      {row.warnings.map((m) => (
        <p key={m} className="flex items-start gap-xxs text-warning">
          <AlertTriangle className="mt-[1px] size-[14px] shrink-0" aria-hidden="true" />
          {m}
        </p>
      ))}
      {row.action === 'create' && changes.length === 0 && !row.openingStock && row.errors.length === 0 && (
        <p className="text-text-tertiary">A new item.</p>
      )}
      {row.action === 'unchanged' && row.warnings.length === 0 && (
        <p className="text-text-tertiary">Already up to date.</p>
      )}
    </div>
  );
}
