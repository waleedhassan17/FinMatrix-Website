import { createColumnHelper } from '@tanstack/react-table';
import { Bike, Plus, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OnlineDot } from '@/features/delivery/DeliveryBadges';
import { useRiders } from '@/features/delivery/useRiders';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useCapability, useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isRiderOnline, riderAvailability, riderLabel, type Rider } from '@/models/delivery';

type Filter = 'all' | ReturnType<typeof riderAvailability>;

const FILTERS: Array<[Filter, string]> = [
  ['all', 'All'],
  ['available', 'Available'],
  ['busy', 'Busy'],
  ['on_leave', 'On leave'],
  ['inactive', 'Inactive'],
  ['plan_locked', 'Paused'],
];

const AVAILABILITY_LABEL: Record<Exclude<Filter, 'all'>, string> = {
  available: 'Available',
  busy: 'Busy',
  on_leave: 'On leave',
  inactive: 'Inactive',
  plan_locked: 'Paused — plan limit',
};

const columnHelper = createColumnHelper<Rider>();

/** Delivery personnel. Onboarding a rider is direct for staff (`personnel.manage`). */
export default function RidersListPage() {
  const enabled = useFeature('delivery');
  const navigate = useNavigate();
  const canManage = useCapability('personnel.manage').allowed;
  const [filter, setFilter] = useState<Filter>('all');
  const { riders, isLoading, error } = useRiders(enabled);

  const rows = useMemo(
    () => (filter === 'all' ? riders : riders.filter((r) => riderAvailability(r) === filter)),
    [riders, filter],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Rider',
        cell: (c) => (
          <div className="flex items-center gap-xs">
            <OnlineDot online={isRiderOnline(c.row.original)} />
            <div className="min-w-0">
              <p className="text-label-md text-text-primary">{riderLabel(c.row.original)}</p>
              <p className="text-caption text-text-tertiary">{c.row.original.username}</p>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('phone', { header: 'Phone', cell: (c) => c.getValue() || '—' }),
      columnHelper.accessor('vehicleType', {
        header: 'Vehicle',
        cell: (c) =>
          [c.getValue(), c.row.original.vehicleNumber].filter(Boolean).join(' · ') || '—',
      }),
      columnHelper.accessor('zones', {
        header: 'Zones',
        cell: (c) => (c.getValue().length ? c.getValue().join(', ') : '—'),
      }),
      columnHelper.accessor('currentLoad', {
        header: 'Load',
        meta: { align: 'right' },
        cell: (c) => (
          <span className="tabular">
            {c.getValue()}
            {c.row.original.maxLoad ? ` / ${c.row.original.maxLoad}` : ''}
          </span>
        ),
      }),
      columnHelper.accessor('totalDeliveries', {
        header: 'Deliveries',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{c.getValue()}</span>,
      }),
      columnHelper.display({
        id: 'availability',
        header: 'Status',
        cell: (c) => {
          const a = riderAvailability(c.row.original);
          return <StatusBadge status={a} label={AVAILABILITY_LABEL[a]} />;
        },
      }),
    ],
    [],
  ) as never;

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Truck}
        title="Riders"
        body="Delivery operations are not included in your company’s plan."
      />
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Riders</h1>
          <p className="text-body-sm text-text-secondary">
            The people who carry your deliveries. They sign in to the rider app with the
            username and password issued here.
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link to="/delivery-personnel/new">
              <Plus className="size-4" />
              Add rider
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-xs">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              'rounded-full px-md py-xs text-label-md transition-colors',
              filter === value
                ? 'bg-primary text-text-inverse'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary',
            )}
          >
            {label}
            <span className="ml-xxs tabular opacity-70">
              {value === 'all'
                ? riders.length
                : riders.filter((r) => riderAvailability(r) === value).length}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{error.message}</p>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(r) => navigate(`/delivery-personnel/${r.userId}`)}
        empty={
          <div className="py-xl text-center">
            <Bike className="mx-auto size-8 text-text-tertiary" />
            <p className="mt-sm text-body-md text-text-secondary">
              {filter === 'all' ? 'No riders yet.' : 'No riders here.'}
            </p>
          </div>
        }
      />
    </div>
  );
}
