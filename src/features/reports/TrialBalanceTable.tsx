import { AlertTriangle, ChevronDown, ChevronRight, Flag, Info } from 'lucide-react';
import { Fragment, useState } from 'react';

import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { InfoPopover } from '@/features/reports/InfoPopover';
import { useStatementDensity } from '@/features/reports/statementPrefs';
import { tbCell, tbTotal, type TbColumn, type TbView } from '@/features/reports/trialBalanceRows';
import { explainFlag, warningFlags } from '@/models/trialBalanceFlags';
import type { TrialBalanceReport, TrialBalanceRow } from '@/serializers/reportSerializers';
import { formatAmount } from '@/utils/money';

export interface TrialBalanceTableProps {
  report: TrialBalanceReport;
  view: TbView;
  columns: TbColumn[];
  onActivate: (row: TrialBalanceRow) => void;
  activeKey?: string | null;
}

/** An em-dash rather than 0.00 — an account sits in one column, and a zero in the other is noise. */
const figure = (v: number | null) => (v ? formatAmount(v) : '—');

/**
 * The trial balance: accounts grouped by type, Debit and Credit (or Opening,
 * Period and Closing pairs in the working view), a flags column that explains
 * itself, and the server's totals in the footer. Shares the statement table's
 * conventions — density, the pinned header and label column, rows that open
 * the investigate panel with Enter or a click.
 */
export function TrialBalanceTable({ report, view, columns, onActivate, activeKey }: TrialBalanceTableProps) {
  const [density] = useStatementDensity();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const pad = density === 'compact' ? 'py-xxs' : 'py-sm';
  const working = columns.some((c) => c.group);
  const groups = working ? [...new Set(columns.map((c) => c.group as string))] : [];

  const th = 'sticky z-[2] bg-surface px-md text-right text-overline text-text-secondary whitespace-nowrap';
  return (
    <div className="max-lg:overflow-x-auto">
      <table className="w-full border-collapse bg-surface">
        <caption className="sr-only">Trial balance</caption>
        <thead>
          {working && (
            <tr>
              <th className="sticky left-0 top-0 z-[3] h-xxl bg-surface" colSpan={2}>
                <span className="sr-only">Account</span>
              </th>
              {groups.map((g) => (
                <th key={g} scope="colgroup" colSpan={2} className={cn(th, 'top-0 h-xxl align-bottom text-center')}>
                  {g}
                </th>
              ))}
            </tr>
          )}
          <tr className="border-b border-border">
            <th
              scope="col"
              className={cn('sticky left-0 z-[3] bg-surface px-md py-sm text-left text-overline text-text-secondary', working ? 'top-xxl' : 'top-0')}
            >
              Account
            </th>
            <th scope="col" className={cn(th, 'w-10 px-xs py-sm text-center', working ? 'top-xxl' : 'top-0')}>
              <Flag className="mx-auto size-3.5" aria-hidden="true" />
              <span className="sr-only">Flags</span>
            </th>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={cn(th, 'py-sm', working ? 'top-xxl' : 'top-0')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((vr) => {
            if (vr.type === 'group') {
              const isCollapsed = !!collapsed[vr.groupKey];
              return (
                <tr key={vr.key} className="bg-surface">
                  <td colSpan={columns.length + 2} className={cn('sticky left-0 bg-inherit px-md', pad, 'pt-md')}>
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((p) => ({ ...p, [vr.groupKey]: !p[vr.groupKey] }))}
                      className="flex items-center gap-xs text-label-lg text-text-primary hover:text-primary"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5 text-text-tertiary" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-3.5 text-text-tertiary" aria-hidden="true" />
                      )}
                      {vr.label}
                    </button>
                  </td>
                </tr>
              );
            }
            if (vr.type === 'subgroup') {
              if (collapsed[vr.groupKey]) return null;
              return (
                <tr key={vr.key} className="bg-surface">
                  <td colSpan={columns.length + 2} className={cn('sticky left-0 bg-inherit px-md pl-xl text-label-md text-text-secondary', pad)}>
                    {vr.label}
                  </td>
                </tr>
              );
            }
            if (vr.type === 'subtotal') {
              if (collapsed[vr.groupKey]) return null;
              return (
                <tr key={vr.key} className="border-t border-border-light bg-surface">
                  <td className={cn('sticky left-0 bg-inherit px-md text-label-lg text-text-primary', pad)} colSpan={2}>
                    {vr.label}
                  </td>
                  {columns.map((c, i) => (
                    <td key={i} className={cn('px-md text-right tabular text-label-lg whitespace-nowrap', pad)}>
                      {figure(tbCell(vr.group, c))}
                    </td>
                  ))}
                </tr>
              );
            }
            if (collapsed[vr.groupKey]) return null;
            const r = vr.row;
            const activatable = !r.synthetic && !!r.accountCode;
            return (
              <Fragment key={vr.key}>
                <tr
                  onClick={activatable ? () => onActivate(r) : undefined}
                  className={cn(
                    'border-b border-border-light bg-surface',
                    activatable && 'group cursor-pointer hover:bg-surface-hover',
                    activeKey && activeKey === r.accountCode && 'bg-primary-tint hover:bg-primary-tint',
                  )}
                >
                  <td className={cn('sticky left-0 z-[1] bg-inherit px-md pl-xl text-body-sm text-text-primary', pad)}>
                    {activatable ? (
                      <button
                        type="button"
                        data-row-key={r.accountCode}
                        aria-haspopup="dialog"
                        aria-label={`${r.accountCode} ${r.accountName}, debit ${figure(r.debit)}, credit ${figure(r.credit)}`}
                        className="flex w-full min-w-0 items-center gap-xs text-left outline-none focus-visible:underline"
                      >
                        <span className="tabular text-text-tertiary">{r.accountCode}</span>
                        <span className="min-w-0 truncate">{r.accountName}</span>
                        <ChevronRight
                          className="ml-auto size-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <span className="flex items-center gap-xs">
                        <span>{r.accountName}</span>
                        {r.synthetic && (
                          <InfoPopover label={`About ${r.accountName}`}>
                            <p className="text-body-sm text-text-secondary">
                              Computed, not posted: the net income of every earlier fiscal year. The
                              closing trial balance shows revenue and expenses for this fiscal year only,
                              so the years before are carried here as one line — the same split the
                              balance sheet makes.
                            </p>
                          </InfoPopover>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="w-10 px-xs text-center">
                    <FlagCell row={r} />
                  </td>
                  {columns.map((c, i) => (
                    <td key={i} className={cn('px-md text-right tabular text-body-sm whitespace-nowrap text-text-primary', pad)}>
                      {figure(tbCell(r, c))}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
          {view.rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="px-md py-lg text-center text-body-sm text-text-tertiary">
                No accounts match.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2">
            <td className="sticky left-0 bg-inherit px-md py-sm text-h5 text-text-primary" colSpan={2}>
              {view.filtered ? 'Total (all accounts)' : 'Total'}
            </td>
            {columns.map((c, i) => (
              <td key={i} className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                {formatAmount(tbTotal(report, c))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** A flag icon that opens its explanation. Inside a clickable row, so the click stops here. */
function FlagCell({ row }: { row: TrialBalanceRow }) {
  if (row.flags.length === 0) return null;
  const warn = warningFlags(row.flags).length > 0;
  const Icon = warn ? AlertTriangle : Info;
  const explanations = row.flags.map((f) => explainFlag(f, row));
  return (
    <Popover
      align="end"
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={explanations.map((e) => e.detail).join(' ')}
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-sm hover:bg-surface-2',
            warn ? 'text-warning' : 'text-text-tertiary',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      }
    >
      <ul className="flex flex-col gap-sm">
        {explanations.map((e) => (
          <li key={e.title}>
            <p className="text-label-md text-text-primary">{e.title}</p>
            <p className="text-body-sm text-text-secondary">{e.detail}</p>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

export default TrialBalanceTable;
