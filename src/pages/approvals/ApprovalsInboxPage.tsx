import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Inbox } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useRequesterNames } from '@/features/approvals/useRequesterNames';
import { cn } from '@/lib/cn';
import {
  APPROVAL_FILTERS,
  APPROVAL_TYPE_LABELS,
  APPROVAL_TYPES,
  approvalAmount,
  statusDisplay,
  type ApprovalFilter,
  type ApprovalRequest,
  type ApprovalType,
} from '@/models/approval';
import { formatReportDate } from '@/models/reportPeriod';
import { fetchApprovals } from '@/networks/approvals/approvalsNetwork';
import { formatMoney } from '@/utils/money';

type Row = ApprovalRequest & { requester: string; amount: number | null };

const columnHelper = createColumnHelper<Row>();

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...APPROVAL_TYPES.map((t) => ({ value: t, label: APPROVAL_TYPE_LABELS[t] })),
];

/**
 * The owner's approvals inbox.
 *
 * Owner only: `/approvals` is absent from the staff nav, so RequireRouteAccess
 * redirects staff, and the decide route is `@Roles('admin')` besides. Refetches
 * every 30 seconds so a request filed while the page is open appears without a
 * reload.
 */
export default function ApprovalsInboxPage() {
  const navigate = useNavigate();
  const nameOf = useRequesterNames();
  const [status, setStatus] = useState<ApprovalFilter>('pending');
  const [type, setType] = useState<ApprovalType | 'all'>('all');

  const query = useQuery({
    queryKey: ['approvals', 'inbox', { status, type }],
    queryFn: () => fetchApprovals({ status, type: type === 'all' ? undefined : type }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const rows = useMemo<Row[]>(
    () =>
      (query.data ?? []).map((r) => ({
        ...r,
        requester: nameOf(r.requestedBy),
        amount: approvalAmount(r),
      })),
    [query.data, nameOf],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('createdAt', {
        header: 'Submitted',
        cell: (c) => (
          <span className="whitespace-nowrap">
            {c.getValue() ? formatReportDate(c.getValue().slice(0, 10)) : '—'}
          </span>
        ),
      }),
      columnHelper.accessor('type', {
        header: 'Type',
        cell: (c) => APPROVAL_TYPE_LABELS[c.getValue()] ?? c.getValue(),
      }),
      columnHelper.accessor('summary', {
        header: 'Request',
        cell: (c) => <span className="line-clamp-2 max-w-[28rem]">{c.getValue()}</span>,
      }),
      columnHelper.accessor('requester', { header: 'Requested by' }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        meta: { align: 'right' },
        cell: (c) => (c.getValue() === null ? '—' : formatMoney(c.getValue() as number)),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => {
          const d = statusDisplay(c.getValue());
          return <StatusBadge status={d.badge} label={d.label} />;
        },
      }),
    ],
    [],
  ) as never;

  const pendingCount = status === 'pending' ? rows.length : null;

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-h2 text-text-primary">Approvals</h1>
        <p className="text-body-sm text-text-secondary">
          What your staff have asked to do. Nothing here has posted yet — approving is
          what posts it.
          {pendingCount !== null && pendingCount > 0 &&
            ` ${pendingCount} waiting for you.`}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="flex flex-wrap gap-xxs">
          {APPROVAL_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={cn(
                'rounded-full px-sm py-xxs text-label-md transition-colors',
                value === status
                  ? 'bg-primary text-text-inverse'
                  : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
              )}
            >
              {value === 'pending' ? 'Awaiting you' : label}
            </button>
          ))}
        </div>
        <Select
          label="Type"
          value={type}
          onChange={(v) => setType(v as ApprovalType | 'all')}
          options={TYPE_OPTIONS}
          containerClassName="w-56"
          compact
        />
      </div>

      {query.error && <p className="text-body-sm text-danger">{query.error.message}</p>}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        onRowClick={(r) => navigate(`/approvals/${r.id}`)}
        empty={
          <div className="p-xl text-center">
            <Inbox className="mx-auto size-8 text-text-tertiary" />
            <p className="mt-sm text-body-md text-text-secondary">
              {status === 'pending' ? 'Nothing is waiting for you.' : 'No requests here.'}
            </p>
          </div>
        }
      />
    </div>
  );
}
