import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  /** Leave the row out — for values the record does not have. */
  hidden?: boolean;
  emphasis?: boolean;
}

/** Label/value rows for a rail or a summary: a real `<dl>`, only rows with values. */
export function KeyValueList({ items, className }: { items: KeyValueItem[]; className?: string }) {
  const rows = items.filter((i) => !i.hidden);
  return (
    <dl className={cn('flex flex-col divide-y divide-border-light', className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-start justify-between gap-md py-xs first:pt-0 last:pb-0">
          <dt className="shrink-0 text-body-sm text-text-secondary">{row.label}</dt>
          <dd
            className={cn(
              'min-w-0 break-words text-right text-body-sm text-text-primary',
              row.emphasis && 'text-label-lg',
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default KeyValueList;
