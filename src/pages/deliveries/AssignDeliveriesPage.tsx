import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, Sparkles, Truck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OnlineDot, PriorityBadge } from '@/features/delivery/DeliveryBadges';
import { invalidateDeliveries } from '@/features/delivery/invalidateDeliveries';
import { useRiders } from '@/features/delivery/useRiders';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useCapability, useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  canTakeWork,
  deliveryValue,
  isRiderOnline,
  riderAvailability,
  riderLabel,
  type Delivery,
  type Rider,
} from '@/models/delivery';
import { formatReportDate } from '@/models/reportPeriod';
import {
  assignDeliveries,
  autoAssignDelivery,
  getDeliveries,
} from '@/networks/delivery/deliveryNetwork';
import { formatMoney } from '@/utils/money';
import { CreditLimitDialog } from '@/features/customers/CreditLimitDialog';
import { creditLimitError, type CreditAssessment } from '@/models/credit';

const AVAILABILITY_LABEL: Record<ReturnType<typeof riderAvailability>, string> = {
  available: 'Available',
  busy: 'Busy',
  on_leave: 'On leave',
  inactive: 'Inactive',
  plan_locked: 'Paused — plan limit',
};

const columnHelper = createColumnHelper<Delivery & { value: number }>();

/**
 * Put unassigned deliveries on a rider — the app's Assign Deliveries and
 * Assign Work screens in one. Direct for staff (`delivery.assign`).
 *
 * Assigning is not bookkeeping-neutral: it DISPATCHES. Each delivery raises a
 * sales order and moves its stock into Goods in Transit, in one transaction
 * for the whole batch — if one item is short, nothing is assigned. The
 * confirmation says so before anyone clicks.
 */
export default function AssignDeliveriesPage() {
  const enabled = useFeature('delivery');
  const canAssign = useCapability('delivery.assign').allowed;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [riderId, setRiderId] = useState('');
  const [confirming, setConfirming] = useState(false);

  const list = useQuery({
    queryKey: ['deliveries', 'list', 'unassigned'],
    queryFn: () => getDeliveries({ status: 'unassigned' }),
    enabled,
    refetchInterval: 30_000,
  });
  const { riders, byId, isLoading: ridersLoading } = useRiders(enabled);

  const rows = useMemo(
    () => (list.data?.rows ?? []).map((d) => ({ ...d, value: deliveryValue(d.lines).toNumber() })),
    [list.data],
  );
  // A delivery assigned elsewhere drops out of the list; it must drop out of
  // the selection with it.
  const chosen = rows.filter((d) => selected.has(d.id));
  const chosenValue = chosen.reduce((s, d) => s + d.value, 0);

  // Riders who can take work first, least loaded first — the order
  // auto-assign itself uses.
  const rankedRiders = useMemo(
    () =>
      [...riders]
        // Only riders the server will hand work to: it refuses anyone who is
        // deactivated, on leave, or paused by the plan's rider limit.
        .filter((r) => r.status === 'active')
        .sort(
          (a, b) =>
            Number(canTakeWork(b)) - Number(canTakeWork(a)) || a.currentLoad - b.currentLoad,
        ),
    [riders],
  );
  const rider = byId.get(riderId);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChosen = rows.length > 0 && chosen.length === rows.length;

  const [creditIssue, setCreditIssue] = useState<CreditAssessment | null>(null);

  const assign = useMutation({
    mutationFn: (overrideReason?: string) => assignDeliveries(chosen.map((d) => d.id), riderId, overrideReason),
    onSuccess: (assigned) => {
      invalidateDeliveries(queryClient);
      setSelected(new Set());
      setConfirming(false);
      toast.success(
        `${assigned.length} ${assigned.length === 1 ? 'delivery' : 'deliveries'} assigned`,
        { description: `Dispatched to ${riderLabel(rider)}. The stock is now in Goods in Transit.` },
      );
    },
    onError: (e: Error) => {
      // Dispatch ships on credit: past the customer's limit it needs an advance or the owner.
      const credit = creditLimitError(e);
      if (credit) {
        setCreditIssue(credit);
        return;
      }
      toast.error('Nothing was assigned', { description: e.message });
    },
  });

  const auto = useMutation({
    mutationFn: (id: string) => autoAssignDelivery(id),
    onSuccess: (d) => {
      invalidateDeliveries(queryClient);
      toast.success('Auto-assigned', {
        description: `${d.referenceNo} → ${riderLabel(d.personnelId ? byId.get(d.personnelId) : null)}`,
      });
    },
    onError: (e: Error) => toast.error('Could not auto-assign', { description: e.message }),
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'pick',
        header: () => (
          <input
            type="checkbox"
            aria-label="Select all"
            className="size-4 accent-primary"
            checked={allChosen}
            onChange={() =>
              setSelected(allChosen ? new Set() : new Set(rows.map((d) => d.id)))
            }
          />
        ),
        cell: (c) => (
          <input
            type="checkbox"
            aria-label={`Select ${c.row.original.referenceNo}`}
            className="size-4 accent-primary"
            checked={selected.has(c.row.original.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggle(c.row.original.id)}
          />
        ),
      }),
      columnHelper.accessor('referenceNo', {
        header: 'Delivery',
        cell: (c) => (
          <Link
            to={`/deliveries/${c.row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-label-md text-primary hover:underline"
          >
            {c.getValue() || '—'}
          </Link>
        ),
      }),
      columnHelper.accessor('customerName', { header: 'Customer', cell: (c) => c.getValue() || '—' }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        cell: (c) => <PriorityBadge priority={c.getValue()} />,
      }),
      columnHelper.accessor('preferredDate', {
        header: 'For',
        cell: (c) => (c.getValue() ? formatReportDate(c.getValue()) : '—'),
      }),
      columnHelper.accessor('value', {
        header: 'Value',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{formatMoney(c.getValue())}</span>,
      }),
      columnHelper.display({
        id: 'auto',
        header: '',
        meta: { align: 'right' },
        cell: (c) => (
          <Button
            variant="text"
            size="sm"
            disabled={auto.isPending}
            onClick={(e) => {
              e.stopPropagation();
              auto.mutate(c.row.original.id);
            }}
          >
            <Sparkles className="size-4" />
            Auto-assign
          </Button>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selected, allChosen, auto.isPending],
  ) as never;

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Truck}
        title="Deliveries"
        body="Delivery operations are not included in your company’s plan."
      />
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/deliveries">
          <ArrowLeft className="size-4" />
          Delivery monitor
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">Assign deliveries</h1>
        <p className="text-body-sm text-text-secondary">
          Pick deliveries, pick a rider. Assigning dispatches them: a sales order is raised
          and the stock moves to Goods in Transit.
        </p>
      </div>

      <div className="grid gap-lg lg:grid-cols-3">
        {/* ── Unassigned ──────────────────────────────────────────── */}
        <section className="flex flex-col gap-sm lg:col-span-2">
          {list.error && <p className="text-body-sm text-danger">{list.error.message}</p>}
          <DataTable
            columns={columns}
            data={rows}
            isLoading={list.isLoading}
            onRowClick={(d) => toggle(d.id)}
            empty={
              <div className="py-xl text-center">
                <UserPlus className="mx-auto size-8 text-text-tertiary" />
                <p className="mt-sm text-body-md text-text-secondary">
                  Nothing waiting — every delivery has a rider.
                </p>
              </div>
            }
          />
        </section>

        {/* ── Rider ───────────────────────────────────────────────── */}
        <Card className="flex flex-col gap-md self-start p-lg">
          <SectionHeader title="Rider" />
          {ridersLoading ? (
            <div className="h-24 animate-pulse rounded-md bg-neutral-100" />
          ) : rankedRiders.length === 0 ? (
            <p className="text-body-sm text-text-secondary">
              No riders yet.{' '}
              <Link to="/delivery-personnel/new" className="text-primary hover:underline">
                Add one
              </Link>
              .
            </p>
          ) : (
            <ul className="flex max-h-[28rem] flex-col gap-xs overflow-y-auto">
              {rankedRiders.map((r) => (
                <RiderOption
                  key={r.userId}
                  rider={r}
                  selected={r.userId === riderId}
                  onSelect={() => setRiderId(r.userId)}
                />
              ))}
            </ul>
          )}

          <div className="border-t border-border-light pt-md">
            <p className="text-body-sm text-text-secondary">
              {chosen.length === 0
                ? 'Select deliveries on the left.'
                : `${chosen.length} selected · ${formatMoney(chosenValue)}`}
            </p>
            <Button
              className="mt-sm w-full"
              disabled={!canAssign || chosen.length === 0 || !riderId}
              onClick={() => setConfirming(true)}
            >
              <UserPlus className="size-4" />
              {rider ? `Assign to ${riderLabel(rider)}` : 'Choose a rider'}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Assign ${chosen.length} ${chosen.length === 1 ? 'delivery' : 'deliveries'} to ${riderLabel(rider)}?`}
        description="Each one is dispatched now: a sales order is raised and its stock moves from Inventory to Goods in Transit. It is one transaction — if any item is short, nothing is assigned."
        confirmLabel="Assign and dispatch"
        busy={assign.isPending}
        onConfirm={() => assign.mutate(undefined)}
      />
      <CreditLimitDialog
        assessment={creditIssue}
        onOpenChange={(open) => !open && setCreditIssue(null)}
        busy={assign.isPending}
        onOverride={(reason) => {
          setCreditIssue(null);
          assign.mutate(reason);
        }}
      />
    </div>
  );
}

function RiderOption({
  rider,
  selected,
  onSelect,
}: {
  rider: Rider;
  selected: boolean;
  onSelect: () => void;
}) {
  const availability = riderAvailability(rider);
  const assignable = rider.status === 'active';
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={!assignable}
        aria-pressed={selected}
        className={cn(
          'flex w-full flex-col gap-xxs rounded-md border px-md py-sm text-left transition-colors',
          selected
            ? 'border-primary bg-primary/5'
            : 'border-border-light hover:border-border',
          !assignable && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex items-center justify-between gap-sm">
          <span className="flex min-w-0 items-center gap-xs">
            <OnlineDot online={isRiderOnline(rider)} />
            <span className="truncate text-label-md text-text-primary">{riderLabel(rider)}</span>
          </span>
          <StatusBadge status={availability} label={AVAILABILITY_LABEL[availability]} />
        </span>
        <span className="text-caption text-text-tertiary">
          Load {rider.currentLoad}
          {rider.maxLoad ? ` / ${rider.maxLoad}` : ''}
          {rider.zones.length > 0 && ` · ${rider.zones.join(', ')}`}
          {rider.vehicleType && ` · ${rider.vehicleType}`}
        </span>
      </button>
    </li>
  );
}
