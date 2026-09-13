import { CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { DetailLayout, RailSection } from '@/components/layout/DetailLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { AmountSummary } from '@/features/documents/AmountSummary';
import { docDate } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { billPaymentAdviceDocument } from '@/features/documents/receiptBuilders';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/money';

interface ReceiptLine {
  billId: string;
  billNumber: string;
  applied: number;
  remaining: number;
}

export interface PaymentReceiptState {
  vendorName: string;
  paymentDate: string;
  total: number;
  accountName: string;
  balanceAfter: number | null;
  reference: string;
  lines: ReceiptLine[];
}

/**
 * What the payment did, shown after it has been recorded.
 *
 * The app closes Pay Bills with a full success screen rather than a toast, and
 * that is the right call: this is the one screen in the product where money
 * leaves the bank, and a toast that vanishes in four seconds is not a record of
 * it. It is reached by `navigate(..., { replace: true })` so the browser's Back
 * button cannot return to a form that would post the payment a second time.
 *
 * The figures come through router state rather than being refetched — they are
 * what was just submitted and accepted, and a refetch could only disagree. The
 * payment advice below is what the vendor is sent: which of their bills this
 * settled, printed or shared from here.
 */
export default function PaymentReceiptPage() {
  const location = useLocation();
  const state = location.state as PaymentReceiptState | null;
  const company = useDocumentCompany();

  const doc = useMemo(() => (state ? billPaymentAdviceDocument(state, company) : null), [state, company]);

  // Reached directly, or after a refresh — there is nothing to show.
  if (!state || !doc) return <Navigate to="/bills" replace />;

  const settled = state.lines.filter((l) => l.remaining === 0);
  const partial = state.lines.filter((l) => l.remaining > 0);

  return (
    <DetailLayout
      header={
        <Card className="flex flex-col gap-md p-lg lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-md">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success-lighter text-success">
              <CheckCircle2 className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-h3 text-text-primary">Payment recorded</h1>
              <p className="text-body-sm text-text-secondary">
                {formatMoney(state.total)} paid to {state.vendorName || 'the vendor'} on{' '}
                {docDate(state.paymentDate) || state.paymentDate}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            <DocumentActions
              document={doc.share}
              getPdf={() => documentPdfBlob(doc)}
              cacheKey={[state.reference, state.total, state.paymentDate, company.name, company.logo].join('|')}
            />
            <Button asChild variant="secondary" size="sm">
              <Link to="/bills/pay">Pay more bills</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/bills">Back to bills</Link>
            </Button>
          </div>
        </Card>
      }
      aside={
        <>
          <AmountSummary
            label="Paid"
            amount={state.total}
            tone="success"
            note={`${settled.length} settled in full${partial.length > 0 ? `, ${partial.length} part-paid` : ''}`}
          />

          <RailSection title="Paid from">
            <KeyValueList
              items={[
                { label: 'Account', value: state.accountName || '—' },
                {
                  label: 'Balance after payment',
                  value: (
                    <span className={cn(state.balanceAfter !== null && state.balanceAfter < 0 && 'text-danger')}>
                      {formatMoney(state.balanceAfter ?? 0)}
                    </span>
                  ),
                  hidden: state.balanceAfter === null,
                },
                { label: 'Reference', value: state.reference, hidden: !state.reference },
              ]}
            />
          </RailSection>

          <RailSection title={`Bills paid (${state.lines.length})`}>
            <ul className="-mx-sm flex flex-col">
              {state.lines.map((l) => (
                <li key={l.billId}>
                  <Link
                    to={`/bills/${l.billId}`}
                    className="flex items-center justify-between gap-sm rounded-md px-sm py-xs hover:bg-surface-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-label-md text-text-primary">{l.billNumber}</span>
                      {/* The distinction the user needs: which of these are done
                          with, and which they still owe on. */}
                      <span className={cn('block text-caption', l.remaining > 0 ? 'text-warning' : 'text-success')}>
                        {l.remaining > 0 ? `${formatMoney(l.remaining)} still owing` : 'Settled in full'}
                      </span>
                    </span>
                    <span className="shrink-0 text-label-md text-text-primary tabular">{formatMoney(l.applied)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </RailSection>
        </>
      }
    >
      <DocumentPaper doc={doc} />
    </DetailLayout>
  );
}
