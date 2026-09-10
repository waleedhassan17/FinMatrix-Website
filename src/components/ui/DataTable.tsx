import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  /** Shown when there is no data and nothing is loading. */
  empty?: ReactNode;
  /** Rendered above the header row — a filter strip, a summary bar. */
  toolbar?: ReactNode;
  className?: string;
}

/**
 * The table. Column headers take the `overline` role and cells `body-sm`,
 * per the ROLE MAP in theme/tokens.ts.
 *
 * Money columns should set `meta: { align: 'right' }` and render through
 * formatMoney with the `tabular` utility — a column of figures that does not
 * line up is the fastest way to make an accounting UI feel untrustworthy.
 */
export function DataTable<T>({
  columns,
  data,
  onRowClick,
  isLoading,
  empty,
  toolbar,
  className,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const colCount = columns.length;

  return (
    <div className={cn('overflow-hidden rounded-lg bg-surface shadow-card', className)}>
      {toolbar}

      {/* The table scrolls inside its own container rather than pushing the
          page sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const align =
                  (header.column.columnDef.meta as { align?: string } | undefined)
                    ?.align ?? 'left';
                return (
                  <th
                    key={header.id}
                    className={cn(
                      'whitespace-nowrap px-md py-sm text-overline text-text-secondary',
                      align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading && data.length === 0 ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-border-light">
                  {Array.from({ length: colCount }).map((_, c) => (
                    <td key={c} className="px-md py-sm">
                      <div className="h-4 animate-pulse rounded-sm bg-neutral-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-md py-xxl text-center">
                  {empty ?? (
                    <span className="text-body-sm text-text-tertiary">
                      Nothing to show.
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b border-border-light last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-surface-hover',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const align =
                      (cell.column.columnDef.meta as { align?: string } | undefined)
                        ?.align ?? 'left';
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-md py-sm text-body-sm text-text-primary',
                          align === 'right' && 'text-right tabular',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Prev/next pager for endpoints that return real pagination metadata. */
export function TablePager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-border-light px-md py-sm">
      <span className="text-caption text-text-secondary">
        Page {page} of {totalPages}
        {total !== undefined && ` · ${total} total`}
      </span>
      <div className="flex gap-xs">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-sm border border-border px-sm py-xxs text-label-md text-text-primary disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded-sm border border-border px-sm py-xxs text-label-md text-text-primary disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default DataTable;
