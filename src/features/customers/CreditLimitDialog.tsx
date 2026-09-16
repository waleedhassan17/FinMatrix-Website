import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { useAdminOnly } from '@/hooks/useCapability';
import type { CreditAssessment } from '@/models/credit';
import { formatMoney } from '@/utils/money';

/**
 * A sale refused because it takes the customer past their credit limit.
 *
 * The way forward the business asked for: take an advance of at least the
 * excess (Rs 7,250 on a Rs 107,250 order against a Rs 100,000 limit), or — for
 * the owner only — let it through with a reason, which the server audits.
 */
export function CreditLimitDialog({
  assessment,
  onOpenChange,
  busy,
  onOverride,
}: {
  assessment: CreditAssessment | null;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  /** Retry the refused action with the owner's reason. */
  onOverride: (reason: string) => void;
}) {
  const navigate = useNavigate();
  const canOverride = useAdminOnly('credit.override');
  const a = assessment;

  const recordAdvance = () => {
    if (!a) return;
    onOpenChange(false);
    navigate(
      `/payments/new?customerId=${a.customerId}&amount=${a.requiredAdvance.toFixed(2)}`,
    );
  };

  return (
    <ConfirmDialog
      open={!!a}
      onOpenChange={onOpenChange}
      title="Over the credit limit"
      description={
        a ? (
          <>
            {a.customerName || 'This customer'} would owe <strong>{formatMoney(a.exposure)}</strong> against
            a credit limit of <strong>{formatMoney(a.limit)}</strong>. Take an advance of at least{' '}
            <strong>{formatMoney(a.requiredAdvance)}</strong> first
            {canOverride ? ', or let it through with a reason.' : ', or ask the owner to approve it.'}
          </>
        ) : undefined
      }
      confirmLabel={canOverride ? 'Override and continue' : `Record advance of ${a ? formatMoney(a.requiredAdvance) : ''}`}
      busy={busy}
      reason={
        canOverride
          ? { label: 'Why may this go past the limit? *', placeholder: 'e.g. cheque received, clearing Friday', minLength: 5 }
          : undefined
      }
      onConfirm={(reason) => (canOverride ? onOverride(reason ?? '') : recordAdvance())}
    >
      {a && (
        <div className="flex flex-col gap-sm">
          <KeyValueList
            items={[
              { label: 'Unpaid invoices', value: formatMoney(a.openInvoices) },
              ...(a.inTransit > 0 ? [{ label: 'Out for delivery on credit', value: formatMoney(a.inTransit) }] : []),
              ...(a.shippedNotInvoiced > 0 ? [{ label: 'Shipped, not yet invoiced', value: formatMoney(a.shippedNotInvoiced) }] : []),
              ...(a.advances > 0 ? [{ label: 'Less advances paid', value: `− ${formatMoney(a.advances)}` }] : []),
              ...(a.credits > 0 ? [{ label: 'Less open credit memos', value: `− ${formatMoney(a.credits)}` }] : []),
              { label: 'This sale', value: formatMoney(a.thisAmount) },
              { label: 'Would owe', value: formatMoney(a.exposure) },
              { label: 'Credit limit', value: formatMoney(a.limit) },
              { label: 'Over by', value: formatMoney(a.excess) },
            ]}
          />
          {canOverride && (
            <button
              type="button"
              onClick={recordAdvance}
              className="self-start text-label-md text-primary hover:underline"
            >
              Record an advance of {formatMoney(a.requiredAdvance)} instead
            </button>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
