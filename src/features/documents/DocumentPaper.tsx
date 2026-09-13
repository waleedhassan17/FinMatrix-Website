import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import type { DocLine, DocumentModel } from '@/features/documents/documentModel';
import { embeddableLogoForScreen } from '@/features/documents/logo';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/money';
import { initialsOf } from '@/utils/initials';

/**
 * A business document as a sheet of paper: letterhead, who it is for, its
 * reference fields, the lines, the totals and the notes.
 *
 * It draws the same DocumentModel the PDF does, so the page and the file a
 * customer receives agree line for line.
 */
export function DocumentPaper({
  doc,
  lineExtra,
  lineExtraHeader,
  children,
}: {
  doc: DocumentModel;
  /** An extra column per line, on screen only — a sales order's fulfilment. */
  lineExtra?: (line: DocLine, index: number) => ReactNode;
  lineExtraHeader?: string;
  /** Anything that belongs on the sheet below the totals. */
  children?: ReactNode;
}) {
  const logo = embeddableLogoForScreen(doc.company.logo);
  const stampTone =
    doc.stamp?.tone === 'success'
      ? 'border-success text-success'
      : doc.stamp?.tone === 'danger'
        ? 'border-danger text-danger'
        : 'border-text-tertiary text-text-tertiary';

  return (
    <Card className="relative overflow-hidden p-0">
      <div className="h-1 bg-primary" aria-hidden="true" />

      {doc.stamp && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-lg border-4 px-lg py-xxs text-display-md uppercase opacity-10 select-none',
            stampTone,
          )}
        >
          {doc.stamp.label}
        </div>
      )}

      <div className="px-lg py-lg sm:px-xxl sm:py-xxl">
        {/* ── Letterhead ── */}
        <div className="flex flex-col gap-lg sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-sm">
            {logo ? (
              <img src={logo} alt="" className="size-12 shrink-0 rounded-md object-contain" />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary text-label-lg text-text-inverse"
              >
                {initialsOf(doc.company.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="break-words text-h4 text-text-primary">{doc.company.name}</p>
              {[...doc.company.addressLines, ...doc.company.contactLines].map((line) => (
                <p key={line} className="break-words text-caption text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="sm:text-right">
            <p className="text-h2 tracking-wide text-primary uppercase">{doc.kind}</p>
            {doc.number && <p className="text-label-lg text-text-primary tabular">{doc.number}</p>}
          </div>
        </div>

        <div className="my-lg border-t border-border" />

        {/* ── Party and reference fields ── */}
        <div className="grid gap-lg sm:grid-cols-[minmax(0,1fr)_auto]">
          {doc.party ? (
            <div className="min-w-0">
              <p className="text-overline text-text-tertiary">{doc.party.label}</p>
              <p className="mt-xxs break-words text-h4 text-text-primary">{doc.party.name}</p>
              {doc.party.lines.map((line) => (
                <p key={line} className="break-words text-body-sm text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div />
          )}

          {doc.meta.length > 0 && (
            <dl className="grid grid-cols-[auto_auto] gap-x-lg gap-y-xxs self-start rounded-md border border-border-light px-md py-sm">
              {doc.meta.map((m) => (
                <div key={m.label} className="contents">
                  <dt className="text-body-sm text-text-secondary">{m.label}</dt>
                  <dd className="text-right text-label-md text-text-primary tabular">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* ── Lines ── */}
        <div className="mt-xl overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse">
            <thead>
              <tr className="bg-primary-50">
                <th className="rounded-l-md px-sm py-xs text-left text-overline text-primary">Description</th>
                {lineExtra && (
                  <th className="px-sm py-xs text-left text-overline text-primary">{lineExtraHeader ?? ''}</th>
                )}
                {doc.showQuantity && (
                  <>
                    <th className="px-sm py-xs text-right text-overline text-primary">{doc.quantityHeader}</th>
                    <th className="px-sm py-xs text-right text-overline text-primary">{doc.priceHeader}</th>
                  </>
                )}
                {doc.showTax !== false && (
                  <th className="px-sm py-xs text-right text-overline text-primary">Tax</th>
                )}
                <th className="rounded-r-md px-sm py-xs text-right text-overline text-primary">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={i} className="border-b border-border-light">
                  <td className="px-sm py-sm align-top">
                    <p className="text-body-sm text-text-primary">{line.description || '—'}</p>
                    {line.secondary && line.secondary !== line.description && (
                      <p className="text-caption text-text-tertiary">{line.secondary}</p>
                    )}
                  </td>
                  {lineExtra && <td className="px-sm py-sm align-top">{lineExtra(line, i)}</td>}
                  {doc.showQuantity && (
                    <>
                      <td className="px-sm py-sm text-right align-top text-body-sm text-text-primary tabular">
                        {line.quantity ?? ''}
                      </td>
                      <td className="px-sm py-sm text-right align-top text-body-sm text-text-primary tabular">
                        {line.unitPrice === null ? '' : formatMoney(line.unitPrice)}
                      </td>
                    </>
                  )}
                  {doc.showTax !== false && (
                    <td className="px-sm py-sm text-right align-top text-body-sm text-text-secondary tabular">
                      {line.taxRate}%
                    </td>
                  )}
                  <td className="px-sm py-sm text-right align-top text-label-md text-text-primary tabular">
                    {formatMoney(line.amount)}
                  </td>
                </tr>
              ))}
              {doc.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-sm py-lg text-center text-body-sm text-text-tertiary">
                    No lines.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Totals ── */}
        {doc.totals.length > 0 && (
          <div className="mt-lg flex justify-end">
            {/* An explicit width: `max-w-xs` resolves to the 8px spacing token here. */}
            <dl className="w-full sm:max-w-[21rem]">
              {doc.totals.map((t) => (
                <div key={t.label}>
                  {t.dividerBefore && <div className="my-xs border-t border-border" />}
                  <div
                    className={cn(
                      'flex items-center justify-between gap-md',
                      t.grand ? 'mt-xxs rounded-md bg-primary-50 px-sm py-xs' : 'py-xxs',
                    )}
                  >
                    <dt
                      className={
                        t.grand || t.strong ? 'text-label-lg text-text-primary' : 'text-body-sm text-text-secondary'
                      }
                    >
                      {t.label}
                    </dt>
                    <dd
                      className={cn(
                        'tabular',
                        t.grand ? 'text-h4' : t.strong ? 'text-label-lg' : 'text-body-sm',
                        t.tone === 'success'
                          ? 'text-success'
                          : t.tone === 'danger'
                            ? 'text-danger'
                            : 'text-text-primary',
                      )}
                    >
                      {(t.prefix ?? '') + formatMoney(t.value)}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* ── Notes ── */}
        {doc.notes.some((n) => n.text.trim()) && (
          <div className="mt-xl grid gap-md border-t border-border-light pt-md sm:grid-cols-2">
            {doc.notes
              .filter((n) => n.text.trim())
              .map((n) => (
                <div key={n.title}>
                  <p className="text-overline text-text-tertiary">{n.title}</p>
                  <p className="mt-xxs whitespace-pre-line text-body-sm text-text-secondary">{n.text}</p>
                </div>
              ))}
          </div>
        )}

        {children}
      </div>
    </Card>
  );
}

export default DocumentPaper;
