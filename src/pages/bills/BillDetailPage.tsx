import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocumentView } from '@/features/documents/DocumentView';
import { ProofLink } from '@/features/bills/ProofLink';
import { useAdminOnly } from '@/hooks/useCapability';
import { isBillEditable, isBillPayable } from '@/models/bill';
import {
  deleteBill,
  getBillById,
  getBillPayments,
  postBill,
} from '@/networks/purchases/billNetwork';
import type { DocumentLine } from '@/serializers/documentLines';
import { formatMoney } from '@/utils/money';

export default function BillDetailPage() {
  const { billId = '' } = useParams<{ billId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canDelete = useAdminOnly('bill.delete');

  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: bill, isLoading, isError, error } = useQuery({
    queryKey: ['bills', billId],
    queryFn: () => getBillById(billId),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['bills', billId, 'payments'],
    queryFn: () => getBillPayments(billId),
    // A draft has never been paid; the route would only answer with an empty
    // list, and asking implies otherwise.
    enabled: Boolean(bill && bill.status !== 'draft'),
  });

  const post = useMutation({
    mutationFn: () => postBill(billId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Bill posted', {
        description: 'Accounts payable now carries this balance.',
      });
    },
    onError: (e: Error) =>
      toast.error('Could not post bill', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: () => deleteBill(billId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Bill deleted');
      navigate('/bills', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete bill', { description: e.message }),
  });

  // A bill line has no quantity or unit price — it is an account and an
  // amount — so those columns are switched off rather than filled with ones.
  const viewLines = useMemo<DocumentLine[]>(
    () =>
      (bill?.lines ?? []).map((l) => ({
        id: l.id,
        itemId: '',
        itemName: '',
        description: l.description,
        quantity: 0,
        unitPrice: 0,
        taxRate: l.taxRate,
        amount: l.amount,
      })),
    [bill],
  );

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading bill…</p>;
  }

  if (isError || !bill) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Bill not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been removed.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/bills">Back to bills</Link>
        </Button>
      </Card>
    );
  }

  const editable = isBillEditable(bill.status);
  const payable = isBillPayable(bill);
  // The server refuses a delete once anything has been paid; leading with a
  // button that cannot work is worse than not offering it.
  const deletable = canDelete && bill.amountPaid === 0 && bill.status !== 'paid';

  return (
    <div className="flex flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/bills">
          <ArrowLeft className="size-4" />
          Bills
        </Link>
      </Button>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0">
          <div className="flex items-center gap-sm">
            <h1 className="text-h2 text-text-primary">
              {bill.billNumber || 'Bill'}
            </h1>
            <StatusBadge status={bill.status} />
          </div>
          <p className="text-body-sm text-text-secondary">
            <Link to={`/vendors/${bill.vendorId}`} className="hover:underline">
              {bill.vendorName || 'Unknown vendor'}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-xs">
          {editable && (
            <Button asChild variant="secondary">
              <Link to={`/bills/${bill.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          )}
          {/* Draft → open. This is what writes the AP journal entry, and it is
              also what makes the bill payable at all. */}
          {bill.status === 'draft' && (
            <Button onClick={() => setConfirmPost(true)} disabled={post.isPending}>
              <CheckCircle2 className="size-4" />
              {post.isPending ? 'Posting…' : 'Post to books'}
            </Button>
          )}
          {payable && (
            <Button asChild>
              <Link to={`/bills/pay?vendorId=${bill.vendorId}&billId=${bill.id}`}>
                <Banknote className="size-4" />
                Pay bill
              </Link>
            </Button>
          )}
          {deletable && (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {bill.status === 'draft' && (
        <div className="rounded-md border border-border bg-surface-2 p-md">
          <p className="text-body-sm text-text-secondary">
            This bill is a draft. Nothing has been posted to accounts payable and
            it cannot be paid until you post it.
          </p>
        </div>
      )}

      <DocumentView
        title="Bill"
        counterpartyLabel="From"
        counterpartyName={bill.vendorName}
        meta={[
          ['Bill #', bill.billNumber || '—'],
          ['Bill date', bill.issueDate.slice(0, 10) || '—'],
          ['Due date', bill.dueDate.slice(0, 10) || '—'],
          ...(bill.purchaseOrderId
            ? ([['From PO', bill.purchaseOrderId.slice(0, 8)]] as [string, string][])
            : []),
        ]}
        lines={viewLines}
        showQuantity={false}
        lineExtraHeader="Account"
        lineExtra={(_line, i) => (
          <span className="text-caption text-text-secondary">
            {bill.lines[i]?.accountName || '—'}
          </span>
        )}
        subtotal={bill.subtotal}
        // A bill carries no discount — the DTO has no field for one.
        discountType="none"
        discountValue={0}
        discountAmount={0}
        taxAmount={bill.taxAmount}
        total={bill.total}
        extraTotals={[
          { label: 'Paid', value: bill.amountPaid, tone: 'success' },
          {
            label: 'Balance owing',
            value: bill.balance,
            tone: bill.balance > 0 ? 'danger' : 'success',
            strong: true,
            dividerBefore: true,
          },
        ]}
        notes={bill.notes}
      />

      {/* ── Payment history ─────────────────────────────────────────── */}
      {bill.status !== 'draft' && (
        <Card className="p-lg">
          <SectionHeader title="Payments" />
          {payments.length === 0 ? (
            <p className="mt-md text-body-sm text-text-tertiary">
              Nothing paid against this bill yet.
            </p>
          ) : (
            <div className="mt-md divide-y divide-border-light">
              {payments.map((p) => (
                <div key={p.id} className="flex flex-col gap-xs py-md first:pt-0">
                  <div className="flex flex-wrap items-center gap-md">
                    <div className="min-w-0 flex-1">
                      <p className="text-label-lg text-text-primary">{p.reference}</p>
                      <p className="text-caption text-text-secondary">
                        {p.date.slice(0, 10)}
                        {p.method && ` · ${p.method}`}
                        {p.bankAccountName && ` · from ${p.bankAccountName}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-label-lg text-text-primary tabular">
                        {formatMoney(p.appliedAmount)}
                      </p>
                      {/* A payment can settle several bills at once; showing
                          only this bill's share without saying so would make
                          the numbers look wrong against the bank. */}
                      {p.allocations.length > 1 && (
                        <p className="text-caption text-text-tertiary tabular">
                          of {formatMoney(p.totalAmount)} across{' '}
                          {p.allocations.length} bills
                        </p>
                      )}
                    </div>
                  </div>
                  <ProofLink
                    proofId={p.proofId}
                    fileName={p.proofFileName}
                    mimeType={p.proofMimeType}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmPost}
        onOpenChange={setConfirmPost}
        title="Post this bill?"
        description={`${formatMoney(bill.total)} will be posted to accounts payable against ${
          bill.vendorName || 'this vendor'
        }. Once posted the bill can no longer be edited.`}
        confirmLabel="Post to books"
        busy={post.isPending}
        onConfirm={() => post.mutate()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this bill?"
        description="This cannot be undone. A bill with any payment against it will be refused by the server."
        confirmLabel="Delete bill"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
