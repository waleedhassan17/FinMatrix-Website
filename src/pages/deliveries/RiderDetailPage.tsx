import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, Eye, KeyRound, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { Switch } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CopyField, CredentialsDialog } from '@/features/delivery/CredentialsDialog';
import { DeliveryStatusBadge, OnlineDot } from '@/features/delivery/DeliveryBadges';
import { invalidateDeliveries } from '@/features/delivery/invalidateDeliveries';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useCapability, useFeature } from '@/hooks/useCapability';
import {
  RIDER_STATUS_OPTIONS,
  deliveryValue,
  formatWhen,
  isRiderOnline,
  parseZones,
  riderAvailability,
  riderLabel,
  type Delivery,
  type RiderStatus,
} from '@/models/delivery';
import { getDeliveries } from '@/networks/delivery/deliveryNetwork';
import {
  getRider,
  resetRiderPassword,
  revealRiderCredential,
  toggleRiderAvailability,
  updateRider,
  type RiderCredentials,
} from '@/networks/delivery/personnelNetwork';
import { formatMoney } from '@/utils/money';

interface Draft {
  vehicleType: string;
  vehicleNumber: string;
  zones: string;
  maxLoad: string;
  status: RiderStatus;
}

const AVAILABILITY_LABEL = {
  available: 'Available',
  busy: 'Busy',
  on_leave: 'On leave',
  inactive: 'Inactive',
} as const;

const columnHelper = createColumnHelper<Delivery & { value: number }>();

/**
 * One rider: their record, their sign-in, and their deliveries.
 *
 * Showing the stored password writes an audit row on the server every time, so
 * it is fetched only on an explicit click, never with the page.
 */
export default function RiderDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const enabled = useFeature('delivery');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useCapability('personnel.manage').allowed;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [revealed, setRevealed] = useState<{ username: string; password: string | null } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [issued, setIssued] = useState<RiderCredentials | null | undefined>(undefined);

  const query = useQuery({
    queryKey: ['delivery-personnel', userId],
    queryFn: () => getRider(userId),
    enabled,
  });
  const deliveries = useQuery({
    queryKey: ['deliveries', 'list', { personnelId: userId }],
    queryFn: () => getDeliveries({ personnelId: userId }),
    enabled,
  });

  const rider = query.data;
  const form: Draft = draft ?? {
    vehicleType: rider?.vehicleType ?? '',
    vehicleNumber: rider?.vehicleNumber ?? '',
    zones: rider?.zones.join(', ') ?? '',
    maxLoad: rider?.maxLoad ? String(rider.maxLoad) : '',
    status: rider?.status ?? 'active',
  };
  const patch = (p: Partial<Draft>) => setDraft({ ...form, ...p });

  const save = useMutation({
    mutationFn: () =>
      updateRider(userId, {
        vehicleType: form.vehicleType.trim(),
        vehicleNumber: form.vehicleNumber.trim(),
        zones: parseZones(form.zones),
        ...(form.maxLoad.trim() ? { maxLoad: form.maxLoad.trim() } : {}),
        status: form.status,
      }),
    onSuccess: () => {
      invalidateDeliveries(queryClient);
      setDraft(null);
      toast.success('Rider updated');
    },
    onError: (e: Error) => toast.error('Could not update the rider', { description: e.message }),
  });

  const toggle = useMutation({
    mutationFn: () => toggleRiderAvailability(userId),
    onSuccess: () => invalidateDeliveries(queryClient),
    onError: (e: Error) => toast.error('Could not change availability', { description: e.message }),
  });

  const reveal = useMutation({
    mutationFn: () => revealRiderCredential(userId),
    onSuccess: setRevealed,
    onError: (e: Error) => toast.error('Could not show the credentials', { description: e.message }),
  });

  const reset = useMutation({
    mutationFn: () => resetRiderPassword(userId),
    onSuccess: (creds) => {
      setConfirmReset(false);
      setRevealed(null);
      setIssued(creds);
    },
    onError: (e: Error) => toast.error('Could not reset the password', { description: e.message }),
  });

  const rows = useMemo(
    () =>
      (deliveries.data?.rows ?? []).map((d) => ({ ...d, value: deliveryValue(d.lines).toNumber() })),
    [deliveries.data],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('referenceNo', {
        header: 'Delivery',
        cell: (c) => <span className="text-label-md text-text-primary">{c.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('customerName', { header: 'Customer', cell: (c) => c.getValue() || '—' }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => <DeliveryStatusBadge status={c.getValue()} />,
      }),
      columnHelper.accessor('assignedAt', {
        header: 'Assigned',
        cell: (c) => formatWhen(c.getValue()),
      }),
      columnHelper.accessor('value', {
        header: 'Value',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{formatMoney(c.getValue())}</span>,
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

  if (query.isLoading) return <p className="text-body-sm text-text-secondary">Loading rider…</p>;

  if (!rider) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Rider not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {query.error?.message ?? 'They may have been removed.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/delivery-personnel">Back to riders</Link>
        </Button>
      </Card>
    );
  }

  const availability = riderAvailability(rider);

  return (
    <div className="flex flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/delivery-personnel">
          <ArrowLeft className="size-4" />
          Riders
        </Link>
      </Button>

      <Card className="p-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-sm">
              <h1 className="text-h2 text-text-primary">{riderLabel(rider)}</h1>
              <StatusBadge status={availability} label={AVAILABILITY_LABEL[availability]} />
            </div>
            <p className="flex items-center gap-xs text-body-sm text-text-secondary">
              <OnlineDot online={isRiderOnline(rider)} />
              {rider.username}
              {rider.phone && ` · ${rider.phone}`}
              {rider.locationUpdatedAt && ` · last seen ${formatWhen(rider.locationUpdatedAt)}`}
            </p>
          </div>
          {canManage && rider.status === 'active' && (
            <Switch
              checked={rider.isAvailable}
              onCheckedChange={() => toggle.mutate()}
              disabled={toggle.isPending}
              label="Available for new work"
            />
          )}
        </div>
      </Card>

      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Deliveries" value={String(rider.totalDeliveries)} hint="Completed, all time" />
        <StatTile label="On time" value={`${rider.onTimeRate}%`} />
        <StatTile label="Rating" value={`${rider.rating} / 5`} />
        <StatTile
          label="Current load"
          value={`${rider.currentLoad}${rider.maxLoad ? ` / ${rider.maxLoad}` : ''}`}
          hint="Deliveries they are carrying"
        />
      </div>

      <div className="grid gap-lg lg:grid-cols-3">
        {/* ── Record ──────────────────────────────────────────────── */}
        <Card className="flex flex-col gap-md p-lg lg:col-span-2">
          <SectionHeader title="Vehicle and zones" />
          <div className="grid gap-md sm:grid-cols-2">
            <Input
              label="Vehicle"
              value={form.vehicleType}
              onChange={(e) => patch({ vehicleType: e.target.value })}
              disabled={!canManage}
              maxLength={64}
            />
            <Input
              label="Vehicle number"
              value={form.vehicleNumber}
              onChange={(e) => patch({ vehicleNumber: e.target.value })}
              disabled={!canManage}
              maxLength={64}
            />
            <Input
              label="Zones"
              value={form.zones}
              onChange={(e) => patch({ zones: e.target.value })}
              disabled={!canManage}
              hint="Comma-separated."
            />
            <Input
              label="Max load"
              value={form.maxLoad}
              onChange={(e) => patch({ maxLoad: e.target.value })}
              disabled={!canManage}
              inputMode="decimal"
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => patch({ status: v as RiderStatus })}
              options={RIDER_STATUS_OPTIONS}
              disabled={!canManage}
              hint="On leave or inactive riders are never auto-assigned."
            />
          </div>
          {canManage && (
            <div className="flex justify-end gap-sm">
              {draft && (
                <Button variant="secondary" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              )}
              <Button disabled={!draft || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          )}
        </Card>

        {/* ── Sign-in ─────────────────────────────────────────────── */}
        <Card className="flex flex-col gap-md self-start p-lg">
          <SectionHeader title="Sign-in" />
          {revealed ? (
            <div className="flex flex-col gap-sm">
              <CopyField label="Username" value={revealed.username || rider.username} />
              {revealed.password ? (
                <CopyField label="Password" value={revealed.password} />
              ) : (
                <p className="text-body-sm text-text-secondary">
                  No stored password to show — reset it to issue a new one.
                </p>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-text-secondary">
              Username <span className="font-mono text-text-primary">{rider.username}</span>.
              Showing the password is recorded in the audit log.
            </p>
          )}
          {canManage && (
            <div className="flex flex-wrap gap-xs">
              {!revealed && (
                <Button variant="secondary" size="sm" disabled={reveal.isPending} onClick={() => reveal.mutate()}>
                  <Eye className="size-4" />
                  Show credentials
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                <KeyRound className="size-4" />
                Reset password
              </Button>
            </div>
          )}
        </Card>
      </div>

      <section className="flex flex-col gap-sm">
        <h2 className="text-h4 text-text-primary">Deliveries</h2>
        <DataTable
          columns={columns}
          data={rows}
          isLoading={deliveries.isLoading}
          onRowClick={(d) => navigate(`/deliveries/${d.id}`)}
          empty={
            <p className="p-lg text-center text-body-sm text-text-tertiary">
              No deliveries assigned to this rider yet.
            </p>
          }
        />
      </section>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset this rider’s password?"
        description="A new password is issued and shown once. The old one stops working immediately — the rider is signed out until you pass the new one on."
        confirmLabel="Reset password"
        destructive
        busy={reset.isPending}
        onConfirm={() => reset.mutate()}
      />

      <CredentialsDialog
        open={issued !== undefined}
        title="New password issued"
        credentials={issued ?? null}
        onClose={() => setIssued(undefined)}
      />
    </div>
  );
}
