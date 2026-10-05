import { useQuery } from '@tanstack/react-query';
import { Banknote, CircleCheck } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { SidePanel } from '@/components/ui/SidePanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { reportPdfBlob } from '@/features/documents/documentPdf';
import { customerSummaryDocument, vendorSummaryDocument } from '@/features/documents/statementBuilders';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { cn } from '@/lib/cn';
import type { Customer } from '@/models/customer';
import {
  CREDIT_KIND_LABELS,
  SUMMARY_COPY,
  countLabel,
  hasAnythingOpen,
  headlineFigure,
  latenessLabel,
} from '@/models/partySummary';
import { formatShortDate } from '@/models/reportPeriod';
import type { Vendor } from '@/models/vendor';
import { ApiError } from '@/networks/network/apiHelpers';
import { getApPartySummary, getArPartySummary } from '@/networks/reports/agingNetwork';
import type { PartySummary, PartySummaryCredit } from '@/serializers/reportSerializers';
import { compactMoney, formatMoney } from '@/utils/money';

export type SummaryPartyRecord =
  | { type: 'customer'; record: Customer }
  | { type: 'vendor'; record: Vendor };

export interface PartySummaryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: SummaryPartyRecord;
}

const DOCUMENT_PATH = { invoice: '/invoices', bill: '/bills' } as const;

/**
 * Where paying the summary goes: the payment page with this party chosen,
 * every open document ticked and credits switched on (`from=summary`), so a
 * typed amount is spread oldest first — two invoices in full, the third in
 * part — and every figure can still be changed before it is saved.
 */
const PAY_FROM_SUMMARY = {
  customer: { label: 'Receive payment', to: (id: string) => `/payments/new?customerId=${id}&from=summary` },
  vendor: { label: 'Pay bills', to: (id: string) => `/bills/pay?vendorId=${id}&from=summary` },
} as const;

/**
 * A bucket's amount in the narrow strip: whole rupees, compact only past a
 * million. "Rs 1,000" beside "Rs 300" reads at a glance; "Rs 1.0K" does not.
 * The exact figure is in the cell's title and on every row below.
 */
const stripAmount = (amount: number): string =>
  amount >= 1_000_000 ? compactMoney(amount) : `Rs ${Math.max(1, Math.round(amount)).toLocaleString('en-US')}`;

const CREDIT_PATH: Record<PartySummaryCredit['kind'], string> = {
  payment: '/payments',
  credit_memo: '/credit-memos',
  vendor_credit: '/vendor-credits',
};

/**
 * Everything still open with one customer or vendor, ready to send.
 *
 * Opened from the party's page, over it, so the page underneath stays put. The
 * panel shows exactly what the PDF and the message say — one builder makes all
 * three — and fetches afresh every time it opens: a summary about to go to a
 * customer is never built from a copy that predates their last payment.
 */
export function PartySummaryPanel({ open, onOpenChange, party }: PartySummaryPanelProps) {
  const company = useDocumentCompany();
  const { type, record } = party;
  const copy = SUMMARY_COPY[type];

  const query = useQuery({
    queryKey: ['reports', 'party-summary', type, record.id],
    queryFn: () => (type === 'customer' ? getArPartySummary(record.id) : getApPartySummary(record.id)),
    enabled: open,
    staleTime: 0,
    // A missing route (an older server) or a missing party will not come back
    // on a second try.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const summary = query.data;

  const doc = useMemo(() => {
    if (!summary) return null;
    return party.type === 'customer'
      ? customerSummaryDocument(summary, company, party.record)
      : vendorSummaryDocument(summary, company, party.record);
  }, [summary, company, party]);

  const sendable = summary ? hasAnythingOpen(summary) : false;
  const pay = PAY_FROM_SUMMARY[type];
  const payable = Boolean(summary && summary.documents.length > 0);

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={
        summary ? `${summary.party.name} · as of ${formatShortDate(summary.asOfDate)}` : record.name
      }
      footer={
        doc && summary ? (
          <div className="flex flex-wrap items-center justify-between gap-sm">
            {payable ? (
              <Button asChild size="sm">
                <Link to={pay.to(record.id)}>
                  <Banknote className="size-4" />
                  {pay.label}
                </Link>
              </Button>
            ) : (
              <span className="text-caption text-text-tertiary">
                {sendable ? 'Print, save or send it' : 'Nothing to send'}
              </span>
            )}
            <DocumentActions
              document={doc.share}
              getPdf={() => reportPdfBlob(doc.pdf)}
              cacheKey={`${type}:${record.id}:${query.dataUpdatedAt}`}
              disabled={!sendable}
            />
          </div>
        ) : undefined
      }
    >
      {query.isLoading && <PanelSkeleton />}

      {query.error && (
        <div className="p-lg">
          <p className="text-body-sm text-text-secondary">{errorText(query.error, type)}</p>
          {!(query.error instanceof ApiError && query.error.status === 404) && (
            <Button variant="secondary" size="sm" className="mt-sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {summary && !sendable && (
        <div className="flex flex-col items-center px-lg py-xxl text-center">
          <CircleCheck className="size-8 text-text-tertiary" aria-hidden="true" />
          <p className="mt-sm text-label-lg text-text-primary">Nothing outstanding</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            {summary.party.name} {copy.nothingOpen}.
          </p>
        </div>
      )}

      {summary && sendable && <SummaryBody summary={summary} />}
    </SidePanel>
  );
}

function SummaryBody({ summary: s }: { summary: PartySummary }) {
  const copy = SUMMARY_COPY[s.partyType];
  const head = headlineFigure(s);
  const hasCredits = s.credits.items.length > 0;

  return (
    <>
      {/* ── The figure to ask for ─────────────────────────────── */}
      <div className="px-lg pb-md pt-lg">
        <p className="text-caption text-text-secondary">{head.label}</p>
        <p className="mt-xxs text-h3 text-text-primary tabular">{formatMoney(head.value)}</p>
        <p className="mt-xxs text-caption tabular">
          {s.totals.overdue > 0 ? (
            <span className="text-danger">{formatMoney(s.totals.overdue)} overdue</span>
          ) : (
            <span className="text-text-secondary">Nothing overdue</span>
          )}
          <span className="text-text-tertiary">
            {' · '}
            {s.totals.overdue > 0
              ? `${s.totals.overdueCount} of ${countLabel(s.totals.count, s.partyType)}`
              : `${countLabel(s.totals.count, s.partyType)} open`}
          </span>
        </p>
        {s.lastPayment && (
          <p className="mt-xxs text-caption text-text-tertiary tabular">
            {copy.lastPaymentLabel} {formatMoney(s.lastPayment.amount)} ·{' '}
            {formatShortDate(s.lastPayment.date)}
          </p>
        )}
      </div>

      {/* ── Aging strip ───────────────────────────────────────── */}
      {s.documents.length > 0 && (
        <div
          className="mx-lg mb-md grid rounded-md border border-border-light"
          style={{ gridTemplateColumns: `repeat(${s.buckets.length}, minmax(0, 1fr))` }}
          aria-label="Aging, in days overdue"
        >
          {s.buckets.map((b, i) => (
            <div
              key={b.key}
              className={cn('px-xs py-xs text-center', i > 0 && 'border-l border-border-light')}
              title={`${b.label}: ${formatMoney(b.amount)}${b.count ? ` · ${countLabel(b.count, s.partyType)}` : ''}`}
            >
              <p className="truncate text-caption text-text-tertiary">{b.label}</p>
              <p
                className={cn(
                  'truncate text-label-sm tabular',
                  b.amount === 0 ? 'text-text-tertiary' : 'text-text-primary',
                )}
              >
                {b.amount === 0 ? '—' : stripAmount(b.amount)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── The documents ─────────────────────────────────────── */}
      {s.documents.length > 0 && (
        <section aria-label={copy.documentsTitle}>
          <h3 className="border-b border-border-light px-lg pb-xs pt-sm text-overline text-text-tertiary">
            {copy.documentsTitle} · {s.documents.length}
          </h3>
          <ul className="divide-y divide-border-light">
            {s.documents.map((d) => (
              <li key={d.documentId}>
                <Link
                  to={`${DOCUMENT_PATH[d.documentType]}/${d.documentId}`}
                  className="group flex items-start gap-md px-lg py-sm transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label-md text-primary group-hover:underline">
                      {d.documentNumber || copy.noun}
                    </p>
                    <p className="truncate text-caption text-text-secondary">
                      Due {formatShortDate(d.dueDate)} ·{' '}
                      <span className={cn(d.daysOverdue > 0 && 'text-danger')}>
                        {latenessLabel(d.daysOverdue)}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-label-md text-text-primary tabular">{formatMoney(d.balance)}</p>
                    {d.amountPaid > 0 && (
                      <p className="text-caption text-text-tertiary tabular">of {formatMoney(d.total)}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Credits, and what they leave ──────────────────────── */}
      {hasCredits && (
        <section aria-label="Unapplied credits">
          <h3 className="border-b border-border-light px-lg pb-xs pt-md text-overline text-text-tertiary">
            Unapplied credits · {s.credits.items.length}
          </h3>
          <ul className="divide-y divide-border-light">
            {s.credits.items.map((c) => (
              <li key={`${c.kind}-${c.id}`}>
                <Link
                  to={`${CREDIT_PATH[c.kind]}/${c.id}`}
                  className="group flex items-start gap-md px-lg py-sm transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label-md text-primary group-hover:underline">
                      {c.reference || CREDIT_KIND_LABELS[c.kind]}
                    </p>
                    <p className="truncate text-caption text-text-secondary">
                      {CREDIT_KIND_LABELS[c.kind]} · {formatShortDate(c.date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-label-md text-text-primary tabular">− {formatMoney(c.available)}</p>
                    {c.available < c.amount && (
                      <p className="text-caption text-text-tertiary tabular">of {formatMoney(c.amount)}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-xxs border-t border-border-light px-lg py-md">
            <TotalRow label="Total outstanding" value={formatMoney(s.totals.outstanding)} />
            <TotalRow label="Less credits" value={`− ${formatMoney(s.credits.total)}`} />
            <TotalRow label={head.label} value={formatMoney(head.value)} strong />
          </dl>
        </section>
      )}
    </>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-md', strong && 'mt-xxs border-t border-border-light pt-xs')}>
      <dt className={cn('text-body-sm', strong ? 'text-label-md text-text-primary' : 'text-text-secondary')}>
        {label}
      </dt>
      <dd className={cn('tabular', strong ? 'text-label-lg text-text-primary' : 'text-body-sm text-text-primary')}>
        {value}
      </dd>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-sm p-lg" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-sm h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

const errorText = (error: unknown, type: 'customer' | 'vendor'): string => {
  if (error instanceof ApiError && error.status === 404) {
    return error.code === 'CUSTOMER_NOT_FOUND' || error.code === 'VENDOR_NOT_FOUND'
      ? `This ${type} could not be found. It may have been removed.`
      : 'This summary is not available from the server yet. Please try again after the next update.';
  }
  return `The summary could not be loaded${error instanceof Error && error.message ? `: ${error.message}` : '.'}`;
};

export default PartySummaryPanel;
