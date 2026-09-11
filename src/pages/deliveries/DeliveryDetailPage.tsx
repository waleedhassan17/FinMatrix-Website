import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, History, MapPin, Sparkles, Trash2, Truck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { CompletionCard } from '@/features/delivery/CompletionCard';
import { DeliveryStatusBadge, OnlineDot, PriorityBadge } from '@/features/delivery/DeliveryBadges';
import { invalidateDeliveries } from '@/features/delivery/invalidateDeliveries';
import { useRiders } from '@/features/delivery/useRiders';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useAdminOnly, useCapability, useFeature } from '@/hooks/useCapability';
import {
  OPERATOR_ACTION_COPY,
  deliveryValue,
  formatWhen,
  isDispatched,
  isRiderOnline,
  mapsLink,
  operatorActions,
  riderLabel,
  type OperatorAction,
} from '@/models/delivery';
import { formatReportDate } from '@/models/reportPeriod';
import { getCompletions } from '@/networks/delivery/completionsNetwork';
import {
  assignDeliveries,
  autoAssignDelivery,
  deleteDelivery,
  getDelivery,
  getDeliveryHistory,
  getDeliveryIssues,
  updateDeliveryStatus,
} from '@/networks/delivery/deliveryNetwork';
import { statusLabel } from '@/theme/status';
import { formatMoney, toDecimal } from '@/utils/money';

/**
 * One delivery, end to end: where it is going, who has it, what is on it,
 * what it has posted, and the rider's completion when there is one.
 *
 * The office can end a delivery without a sale (cancel, failed, returned —
 * each restocks) but never mark it delivered: the sale is recognised only by
 * approving the rider's completion, below.
 */
export default function DeliveryDetailPage() {
  const { deliveryId = '' } = useParams<{ deliveryId: string }>();
  const enabled = useFeature('delivery');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canAssign = useCapability('delivery.assign').allowed;
  const canDelete = useAdminOnly('delivery.delete');

  const [action, setAction] = useState<OperatorAction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [riderId, setRiderId] = useState('');

  const query = useQuery({
    queryKey: ['deliveries', deliveryId],
    queryFn: () => getDelivery(deliveryId),
    enabled,
  });
  const history = useQuery({
    queryKey: ['deliveries', deliveryId, 'history'],
    queryFn: () => getDeliveryHistory(deliveryId),
    enabled,
  });
  const issues = useQuery({
    queryKey: ['deliveries', deliveryId, 'issues'],
    queryFn: () => getDeliveryIssues(deliveryId),
    enabled,
  });
  const completions = useQuery({
    queryKey: ['deliveries', 'completions', 'all'],
    queryFn: () => getCompletions('all'),
    enabled,
  });
  const { riders, byId } = useRiders(enabled);

  const completion = useMemo(
    () =>
      (completions.data ?? [])
        .filter((c) => c.deliveryId === deliveryId)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0],
    [completions.data, deliveryId],
  );

  const riderOptions = useMemo(
    () =>
      riders
        .filter((r) => r.status === 'active')
        .map((r) => ({
          value: r.userId,
          label: `${riderLabel(r)}${r.isAvailable ? '' : ' (busy)'} · load ${r.currentLoad}`,
        })),
    [riders],
  );

  const done = () => invalidateDeliveries(queryClient);

  const setStatus = useMutation({
    mutationFn: ({ status, notes }: { status: OperatorAction; notes: string }) =>
      updateDeliveryStatus(deliveryId, status, notes),
    onSuccess: (_d, vars) => {
      done();
      setAction(null);
      toast.success(`Delivery ${vars.status}`, {
        description: 'Any dispatched stock is back on the shelf. No sale was recorded.',
      });
    },
    onError: (e: Error) => toast.error('Could not update the delivery', { description: e.message }),
  });

  const assign = useMutation({
    mutationFn: () => assignDeliveries([deliveryId], riderId),
    onSuccess: () => {
      done();
      setRiderId('');
      toast.success('Assigned and dispatched', {
        description: 'A sales order was raised and the stock moved to Goods in Transit.',
      });
    },
    onError: (e: Error) => toast.error('Could not assign', { description: e.message }),
  });

  const auto = useMutation({
    mutationFn: () => autoAssignDelivery(deliveryId),
    onSuccess: (d) => {
      done();
      toast.success('Auto-assigned', {
        description: `Given to ${riderLabel(d.personnelId ? byId.get(d.personnelId) : null)}.`,
      });
    },
    onError: (e: Error) => toast.error('Could not auto-assign', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: () => deleteDelivery(deliveryId),
    onSuccess: () => {
      done();
      toast.success('Delivery deleted');
      navigate('/deliveries', { replace: true });
    },
    onError: (e: Error) => toast.error('Could not delete', { description: e.message }),
  });

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Truck}
        title="Deliveries"
        body="Delivery operations are not included in your company’s plan."
      />
    );
  }

  if (query.isLoading) return <p className="text-body-sm text-text-secondary">Loading delivery…</p>;

  const d = query.data;
  if (!d) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Delivery not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {query.error?.message ?? 'It may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/deliveries">Back to the monitor</Link>
        </Button>
      </Card>
    );
  }

  const rider = d.personnelId ? byId.get(d.personnelId) : undefined;
  const actions = operatorActions(d.status);
  const map = mapsLink({ lat: d.destLat, lng: d.destLng }, d.address);
  const total = deliveryValue(d.lines);
  const dispatched = isDispatched(d);

  return (
    <div className="flex flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/deliveries">
          <ArrowLeft className="size-4" />
          Delivery monitor
        </Link>
      </Button>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-sm">
              <h1 className="text-h2 text-text-primary">{d.referenceNo || 'Delivery'}</h1>
              <DeliveryStatusBadge status={d.status} />
              <PriorityBadge priority={d.priority} />
            </div>
            <p className="text-body-sm text-text-secondary">
              {d.customerId ? (
                <Link to={`/customers/${d.customerId}`} className="text-primary hover:underline">
                  {d.customerName || 'Customer'}
                </Link>
              ) : (
                d.customerName || '—'
              )}
              {' · '}Created {formatWhen(d.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-xs">
            {actions.map((a) => (
              <Button key={a} variant="secondary" onClick={() => setAction(a)}>
                {OPERATOR_ACTION_COPY[a].label}
              </Button>
            ))}
            {canDelete && d.status === 'unassigned' && !dispatched && (
              <Button variant="text" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
        {d.cancelReason && d.status === 'cancelled' && (
          <p className="mt-md rounded-md bg-surface-2 p-sm text-body-sm text-text-secondary">
            Cancelled: {d.cancelReason}
          </p>
        )}
      </Card>

      <div className="grid gap-lg lg:grid-cols-3">
        <div className="flex flex-col gap-lg lg:col-span-2">
          {/* ── Completion ─────────────────────────────────────────── */}
          {completion && (
            <section className="flex flex-col gap-sm">
              <h2 className="text-h4 text-text-primary">Rider’s completion</h2>
              <CompletionCard
                completion={completion}
                riderName={riderLabel(rider)}
                reference={d.referenceNo}
                showDeliveryLink={false}
              />
            </section>
          )}

          {/* ── Lines ─────────────────────────────────────────────── */}
          <Card className="p-lg">
            <SectionHeader title="Items" />
            <div className="mt-md overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="py-xs text-left text-overline text-text-secondary">Item</th>
                    <th className="py-xs text-right text-overline text-text-secondary">Ordered</th>
                    <th className="py-xs text-right text-overline text-text-secondary">Delivered</th>
                    <th className="py-xs text-right text-overline text-text-secondary">Returned</th>
                    <th className="py-xs text-right text-overline text-text-secondary">Price</th>
                    <th className="py-xs text-right text-overline text-text-secondary">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => {
                    const base = toDecimal(l.orderedQty).times(l.unitPrice);
                    const amount = base.plus(base.times(l.taxRate).dividedBy(100));
                    return (
                      <tr key={l.id || l.itemId} className="border-b border-border-light last:border-0">
                        <td className="py-sm text-body-sm text-text-primary">
                          <Link to={`/inventory/${l.itemId}`} className="hover:underline">
                            {l.itemName || 'Item'}
                          </Link>
                        </td>
                        <td className="py-sm text-right text-body-sm tabular">{l.orderedQty}</td>
                        <td className="py-sm text-right text-body-sm tabular">{l.deliveredQty}</td>
                        <td className="py-sm text-right text-body-sm tabular">{l.returnedQty}</td>
                        <td className="py-sm text-right text-body-sm tabular">
                          {formatMoney(l.unitPrice)}
                          {l.taxRate > 0 && (
                            <span className="block text-caption text-text-tertiary">
                              + {l.taxRate}% tax
                            </span>
                          )}
                        </td>
                        <td className="py-sm text-right text-body-sm tabular text-text-primary">
                          {formatMoney(amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-sm flex justify-end gap-md border-t border-border pt-sm">
              <span className="text-label-md text-text-secondary">Total</span>
              <span className="text-h4 tabular text-text-primary">{formatMoney(total)}</span>
            </div>
          </Card>

          {/* ── History ──────────────────────────────────────────── */}
          <Card className="p-lg">
            <div className="flex items-center gap-xs">
              <History className="size-4 text-text-secondary" />
              <h2 className="text-h4 text-text-primary">Status history</h2>
            </div>
            {history.isLoading ? (
              <div className="mt-md h-16 animate-pulse rounded-md bg-neutral-100" />
            ) : (history.data ?? []).length === 0 ? (
              <p className="mt-md text-body-sm text-text-tertiary">No status changes yet.</p>
            ) : (
              <ol className="mt-md flex flex-col gap-sm">
                {(history.data ?? []).map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-sm">
                    <DeliveryStatusBadge status={h.status} />
                    <span className="text-body-sm text-text-secondary">{formatWhen(h.timestamp)}</span>
                    {h.notes && <span className="text-body-sm text-text-primary">— {h.notes}</span>}
                  </li>
                ))}
              </ol>
            )}
            {(issues.data ?? []).length > 0 && (
              <div className="mt-lg border-t border-border-light pt-md">
                <p className="text-overline text-text-secondary">Issues reported by the rider</p>
                <ul className="mt-sm flex flex-col gap-xs">
                  {(issues.data ?? []).map((i) => (
                    <li key={i.id} className="text-body-sm text-text-primary">
                      <span className="text-label-md">{statusLabel(i.issueType)}</span>
                      {i.notes && ` — ${i.notes}`}
                      <span className="text-caption text-text-tertiary"> · {formatWhen(i.reportedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-lg">
          {/* ── Rider / assignment ───────────────────────────────── */}
          <Card className="p-lg">
            <SectionHeader title="Rider" />
            {rider ? (
              <div className="mt-md">
                <Link
                  to={`/delivery-personnel/${rider.userId}`}
                  className="flex items-center gap-xs text-label-lg text-primary hover:underline"
                >
                  <OnlineDot online={isRiderOnline(rider)} />
                  {riderLabel(rider)}
                </Link>
                <p className="mt-xxs text-body-sm text-text-secondary">
                  {[rider.phone, rider.vehicleType, rider.vehicleNumber].filter(Boolean).join(' · ') ||
                    'No contact details'}
                </p>
                {d.assignedAt && (
                  <p className="mt-xxs text-caption text-text-tertiary">
                    Assigned {formatWhen(d.assignedAt)}
                  </p>
                )}
              </div>
            ) : d.personnelId ? (
              <p className="mt-md text-body-sm text-text-secondary">Assigned to a rider no longer listed.</p>
            ) : canAssign && d.status === 'unassigned' ? (
              <div className="mt-md flex flex-col gap-sm">
                <p className="text-body-sm text-text-secondary">
                  Not assigned. Assigning dispatches it: a sales order is raised and the stock
                  moves to Goods in Transit.
                </p>
                <Select
                  label="Rider"
                  value={riderId}
                  onChange={setRiderId}
                  options={riderOptions}
                  placeholder={riderOptions.length ? 'Choose a rider' : 'No active riders'}
                  disabled={riderOptions.length === 0}
                />
                <div className="flex flex-wrap gap-xs">
                  <Button
                    disabled={!riderId || assign.isPending}
                    onClick={() => assign.mutate()}
                  >
                    <UserPlus className="size-4" />
                    {assign.isPending ? 'Assigning…' : 'Assign'}
                  </Button>
                  <Button variant="secondary" disabled={auto.isPending} onClick={() => auto.mutate()}>
                    <Sparkles className="size-4" />
                    Auto-assign
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-md text-body-sm text-text-secondary">Not assigned.</p>
            )}
          </Card>

          {/* ── Destination ──────────────────────────────────────── */}
          <Card className="p-lg">
            <SectionHeader title="Destination" />
            <p className="mt-md whitespace-pre-line text-body-sm text-text-primary">
              {d.address || 'No address on file for this customer.'}
            </p>
            {d.zone && <p className="mt-xxs text-caption text-text-tertiary">Zone {d.zone}</p>}
            {(d.preferredDate || d.preferredTimeSlot) && (
              <p className="mt-xs text-body-sm text-text-secondary">
                Wanted {d.preferredDate ? formatReportDate(d.preferredDate) : ''}
                {d.preferredTimeSlot ? ` · ${d.preferredTimeSlot}` : ''}
              </p>
            )}
            {map && (
              <a
                href={map}
                target="_blank"
                rel="noreferrer"
                className="mt-sm inline-flex items-center gap-xxs text-label-md text-primary hover:underline"
              >
                <MapPin className="size-4" />
                Open in Google Maps
              </a>
            )}
            {d.notes && (
              <p className="mt-md border-t border-border-light pt-sm text-body-sm text-text-secondary">
                {d.notes}
              </p>
            )}
          </Card>

          {/* ── Books ────────────────────────────────────────────── */}
          <Card className="p-lg">
            <SectionHeader title="In the books" />
            <p className="mt-md text-body-sm text-text-secondary">
              {d.ledgerStatus === 'in_transit'
                ? 'Dispatched — the stock is in Goods in Transit. The sale posts when the rider’s completion is approved.'
                : d.ledgerStatus === 'committed'
                  ? 'Sale recognised: revenue and cost of goods sold are posted.'
                  : d.ledgerStatus === 'returned'
                    ? 'The stock came back to the shelf. No sale was recorded.'
                    : 'Nothing has posted yet. Assigning a rider dispatches the stock.'}
            </p>
            <div className="mt-sm flex flex-col gap-xxs">
              {d.salesOrderId && (
                <Link to={`/sales-orders/${d.salesOrderId}`} className="text-label-md text-primary hover:underline">
                  Sales order
                </Link>
              )}
              {d.invoiceId && (
                <Link to={`/invoices/${d.invoiceId}`} className="text-label-md text-primary hover:underline">
                  Invoice
                </Link>
              )}
            </div>
          </Card>
        </div>
      </div>

      {action && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          title={OPERATOR_ACTION_COPY[action].title}
          description={
            dispatched
              ? 'The dispatched stock comes back on the shelf (Dr Inventory / Cr Goods in Transit) and no sale is recorded. This cannot be reopened — a new delivery would be needed.'
              : 'Nothing was dispatched, so nothing posts. This cannot be reopened.'
          }
          confirmLabel={OPERATOR_ACTION_COPY[action].confirm}
          destructive
          busy={setStatus.isPending}
          reason={{ label: 'Reason', minLength: 3, placeholder: 'What happened' }}
          onConfirm={(notes) => notes && setStatus.mutate({ status: action, notes })}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this delivery?"
        description="It was never dispatched, so nothing has posted and deleting leaves the books as they were. This cannot be undone."
        confirmLabel="Delete delivery"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
