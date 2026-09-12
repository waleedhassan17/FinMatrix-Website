import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { MapPin, Plus, Truck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, TablePager } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatTile } from '@/components/ui/StatTile';
import { DeliveryStatusBadge, OnlineDot, PriorityBadge } from '@/features/delivery/DeliveryBadges';
import { useRiders } from '@/features/delivery/useRiders';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useCapability, useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  ACTIVE_STATUSES,
  deliveryValue,
  isRiderOnline,
  mapsLink,
  riderLabel,
  type Delivery,
} from '@/models/delivery';
import { formatReportDate } from '@/models/reportPeriod';
import { getDeliveries, getDeliveryMonitor } from '@/networks/delivery/deliveryNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 25;

type Tab = 'active' | 'unassigned' | 'delivered' | 'closed' | 'all';

const TABS: Array<[Tab, string]> = [
  ['active', 'On the road'],
  ['unassigned', 'Unassigned'],
  ['delivered', 'Delivered'],
  ['closed', 'Failed & cancelled'],
  ['all', 'All'],
];

const inTab = (d: Delivery, tab: Tab): boolean => {
  switch (tab) {
    case 'active':
      return ACTIVE_STATUSES.includes(d.status);
    case 'unassigned':
      return d.status === 'unassigned';
    case 'delivered':
      return d.status === 'delivered';
    case 'closed':
      return d.status === 'failed' || d.status === 'returned' || d.status === 'cancelled';
    default:
      return true;
  }
};

type Row = Delivery & { riderName: string; online: boolean; value: number; map: string | null };

const columnHelper = createColumnHelper<Row>();

/**
 * Where every delivery is. Both roles.
 *
 * The app's monitor is a list rather than a map, and so is this one: the
 * summary comes from `/deliveries/map-data` and each row links out to Google
 * Maps for the destination. Refreshes every 30 seconds.
 */
export default function DeliveryMonitorPage() {
  const enabled = useFeature('delivery');
  const navigate = useNavigate();
  const canCreate = useCapability('delivery.create').allowed;
  const canAssign = useCapability('delivery.assign').allowed;
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const monitor = useQuery({
    queryKey: ['deliveries', 'monitor'],
    queryFn: getDeliveryMonitor,
    enabled,
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ['deliveries', 'list', 'all'],
    queryFn: () => getDeliveries(),
    enabled,
    refetchInterval: 30_000,
  });
  const { riders, byId } = useRiders(enabled);

  const onlineByDelivery = useMemo(
    () => new Map((monitor.data?.markers ?? []).map((m) => [m.deliveryId, !!m.rider?.isOnline])),
    [monitor.data],
  );

  const all = useMemo<Row[]>(
    () =>
      (list.data?.rows ?? []).map((d) => {
        const rider = d.personnelId ? byId.get(d.personnelId) : undefined;
        return {
          ...d,
          riderName: d.personnelId ? riderLabel(rider) : '—',
          online: onlineByDelivery.get(d.id) ?? (rider ? isRiderOnline(rider) : false),
          value: deliveryValue(d.lines).toNumber(),
          map: mapsLink({ lat: d.destLat, lng: d.destLng }, d.address),
        };
      }),
    [list.data, byId, onlineByDelivery],
  );

  const counts = useMemo(() => {
    const c = {} as Record<Tab, number>;
    for (const [t] of TABS) c[t] = all.filter((d) => inTab(d, t)).length;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((d) => inTab(d, tab))
      .filter(
        (d) =>
          !q ||
          d.referenceNo.toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q) ||
          d.riderName.toLowerCase().includes(q),
      );
  }, [all, tab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const columns = useMemo(
    () => [
      columnHelper.accessor('referenceNo', {
        header: 'Delivery',
        cell: (c) => (
          <div>
            <p className="text-label-md text-text-primary">{c.getValue() || '—'}</p>
            <p className="text-caption text-text-tertiary">
              {c.row.original.preferredDate
                ? `For ${formatReportDate(c.row.original.preferredDate)}`
                : `Created ${formatReportDate(c.row.original.createdAt.slice(0, 10))}`}
            </p>
          </div>
        ),
      }),
      columnHelper.accessor('customerName', {
        header: 'Customer',
        cell: (c) => c.getValue() || '—',
      }),
      columnHelper.accessor('riderName', {
        header: 'Rider',
        cell: (c) =>
          c.row.original.personnelId ? (
            <span className="flex items-center gap-xs">
              <OnlineDot online={c.row.original.online} />
              {c.getValue()}
            </span>
          ) : (
            <span className="text-text-tertiary">Unassigned</span>
          ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => <DeliveryStatusBadge status={c.getValue()} />,
      }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        cell: (c) => <PriorityBadge priority={c.getValue()} />,
      }),
      columnHelper.accessor('value', {
        header: 'Value',
        meta: { align: 'right' },
        cell: (c) => (
          <div>
            <p className="tabular text-label-md text-text-primary">{formatMoney(c.getValue())}</p>
            <p className="text-caption text-text-tertiary">
              {c.row.original.lines.length} {c.row.original.lines.length === 1 ? 'item' : 'items'}
            </p>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'map',
        header: '',
        meta: { align: 'right' },
        cell: (c) =>
          c.row.original.map ? (
            <a
              href={c.row.original.map}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-xxs text-label-sm text-primary hover:underline"
              title={c.row.original.address || 'Open the destination in Google Maps'}
            >
              <MapPin className="size-4" />
              Map
            </a>
          ) : null,
      }),
    ],
    [],
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

  const summary = monitor.data?.summary;
  const online = riders.filter((r) => isRiderOnline(r)).length;
  const loading = monitor.isLoading;
  const error = monitor.error ?? list.error;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Delivery monitor</h1>
          <p className="text-body-sm text-text-secondary">
            Every delivery and where it stands. Refreshes every 30 seconds.
          </p>
        </div>
        <div className="flex flex-wrap gap-xs">
          {canAssign && (
            <Button asChild variant="secondary">
              <Link to="/deliveries/assign">
                <UserPlus className="size-4" />
                Assign
                {counts.unassigned > 0 && (
                  <span className="rounded-full bg-warning px-xs text-label-sm text-text-inverse tabular">
                    {counts.unassigned}
                  </span>
                )}
              </Link>
            </Button>
          )}
          {canCreate && (
            <Button asChild>
              <Link to="/deliveries/new">
                <Plus className="size-4" />
                New delivery
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-md sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Unassigned"
          value={String(summary?.unassigned ?? 0)}
          tone={(summary?.unassigned ?? 0) > 0 ? 'warning' : 'default'}
          hint="Waiting for a rider"
          loading={loading}
        />
        <StatTile
          label="Assigned"
          value={String(summary?.pending ?? 0)}
          hint="Not yet picked up"
          loading={loading}
        />
        <StatTile
          label="In transit"
          value={String(summary?.inTransit ?? 0)}
          hint="Picked up or arrived"
          loading={loading}
        />
        <StatTile
          label="Delivered"
          value={String(summary?.delivered ?? 0)}
          tone="success"
          loading={loading}
        />
        <StatTile
          label="Failed"
          value={String(summary?.failed ?? 0)}
          tone={(summary?.failed ?? 0) > 0 ? 'danger' : 'default'}
          loading={loading}
        />
        <StatTile
          label="Riders online"
          value={`${online} of ${riders.length}`}
          hint="Location in the last 2 minutes"
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="flex flex-wrap gap-xs">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTab(value);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-md py-xs text-label-md transition-colors',
                tab === value
                  ? 'bg-primary text-text-inverse'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary',
              )}
            >
              {label}
              <span className="ml-xxs tabular opacity-70">{counts[value] ?? 0}</span>
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Reference, customer or rider…"
          aria-label="Search deliveries"
          containerClassName="w-72 max-w-full"
        />
      </div>

      {error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{error.message}</p>
        </Card>
      )}

      <div>
        <DataTable
          columns={columns}
          data={pageRows}
          isLoading={list.isLoading}
          onRowClick={(d) => navigate(`/deliveries/${d.id}`)}
          empty={
            <div className="py-xl text-center">
              <Truck className="mx-auto size-8 text-text-tertiary" />
              <p className="mt-sm text-body-md text-text-secondary">
                {search ? 'No deliveries match.' : 'No deliveries here.'}
              </p>
            </div>
          }
        />
        <TablePager page={current} totalPages={totalPages} total={rows.length} onPage={setPage} />
        {list.data?.truncated && (
          <p className="mt-sm text-caption text-text-tertiary">
            Showing the most recent {all.length} deliveries.
          </p>
        )}
      </div>
    </div>
  );
}
