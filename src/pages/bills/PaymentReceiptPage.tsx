import { CheckCircle2 } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
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
 * what was just submitted and accepted, and a refetch could only disagree.
 */
export default function PaymentReceiptPage() {
  const location = useLocation();
  const state = location.state as PaymentReceiptState | null;

  // Reached directly, or after a refresh — there is nothing to show.
  if (!state) return <Navigate to="/bills" replace />;

  const settled = state.lines.filter((l) => l.remaining === 0);
  const partial = state.lines.filter((l) => l.remaining > 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-lg">
      <Card className="p-xl text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h1 className="mt-md text-h2 text-text-primary">Payment recorded</h1>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {formatMoney(state.total)} paid to {state.vendorName || 'the vendor'} on{' '}
          {state.paymentDate}
        </p>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Paid from" />
        <div className="mt-md">
          <Row label="Account" value={state.accountName || '—'} />
          {state.balanceAfter !== null && (
            <Row
              label="Balance after payment"
              value={formatMoney(state.balanceAfter)}
              tone={state.balanceAfter < 0 ? 'danger' : undefined}
            />
          )}
          {state.reference && <Row label="Reference" value={state.reference} />}
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title={`Bills paid (${state.lines.length})`} />
        <div className="mt-md divide-y divide-border-light">
          {state.lines.map((l) => (
            <Link
              key={l.billId}
              to={`/bills/${l.billId}`}
              className="flex items-center gap-md py-sm first:pt-0 last:pb-0 hover:bg-surface-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="text-label-lg text-text-primary">{l.billNumber}</p>
                {/* The distinction the user needs: which of these are done
                    with, and which they still owe on. */}
                <p
                  className={cn(
                    'text-caption',
                    l.remaining > 0 ? 'text-warning' : 'text-success',
                  )}
                >
                  {l.remaining > 0
                    ? `${formatMoney(l.remaining)} still owing`
                    : 'Settled in full'}
                </p>
              </div>
              <span className="shrink-0 text-label-lg text-text-primary tabular">
                {formatMoney(l.applied)}
              </span>
            </Link>
          ))}
        </div>

        {(settled.length > 0 || partial.length > 0) && (
          <p className="mt-md border-t border-border-light pt-md text-caption text-text-secondary">
            {settled.length} settled in full
            {partial.length > 0 && `, ${partial.length} part-paid`}.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to="/bills/pay">Pay more bills</Link>
        </Button>
        <Button asChild>
          <Link to="/bills">Back to bills</Link>
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  return (
    <div className="flex justify-between gap-md border-b border-border-light py-xs last:border-0">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span
        className={cn(
          'text-right text-body-sm tabular',
          tone === 'danger' ? 'text-danger' : 'text-text-primary',
        )}
      >
        {value}
      </span>
    </div>
  );
}
