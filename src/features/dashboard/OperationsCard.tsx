import { ChevronRight, Package } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import type { DeliveryCounts } from '@/serializers/dashboardSerializer';
import { colors } from '@/theme/tokens';

/**
 * The warehouse side of the day: where deliveries stand, and how many items
 * are on the books.
 *
 * The status colours here are facts — delivered, moving, waiting, failed — which
 * is the one place on the dashboard a hue carries meaning. Waiting folds pending
 * and assigned together because both are orders that have not left, the same
 * grouping the app's delivery card uses.
 */
function DeliverySummary({ d }: { d: DeliveryCounts }) {
  const waiting = d.pending + d.assigned;
  const pct = d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0;
  const segments = [
    { key: 'delivered', label: 'Delivered', value: d.delivered, color: colors.success },
    { key: 'transit', label: 'In transit', value: d.inTransit, color: colors.secondary },
    { key: 'waiting', label: 'Waiting', value: waiting, color: colors.warning },
    { key: 'failed', label: 'Failed', value: d.failed, color: colors.danger },
  ];
  const shown = segments.filter((s) => s.key !== 'failed' || s.value > 0);
  const barTotal = segments.reduce((t, s) => t + s.value, 0);

  return (
    <div className="px-lg py-md">
      <div className="flex items-baseline justify-between gap-sm">
        <p className="text-label-md text-text-secondary">Deliveries</p>
        <PanelLink to="/deliveries">Monitor</PanelLink>
      </div>
      <p className="mt-xxs flex items-baseline gap-xs">
        <span className="text-h3 tabular text-text-primary">{pct}%</span>
        <span className="text-caption text-text-tertiary">
          completed of {d.total.toLocaleString('en-US')}
        </span>
      </p>

      <div className="mt-sm flex h-2 gap-px overflow-hidden rounded-full bg-neutral-100">
        {barTotal > 0 &&
          segments.map((s) =>
            s.value > 0 ? (
              <span
                key={s.key}
                className="h-full"
                style={{ width: `${(s.value / barTotal) * 100}%`, backgroundColor: s.color }}
              />
            ) : null,
          )}
      </div>

      <dl className="mt-sm grid grid-cols-2 gap-x-md gap-y-xxs">
        {shown.map((s) => (
          <div key={s.key} className="flex items-center gap-xs">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <dt className="flex-1 text-caption text-text-secondary">{s.label}</dt>
            <dd className="text-label-md tabular text-text-primary">
              {s.value.toLocaleString('en-US')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function OperationsCard({
  deliveries,
  inventoryItems,
  showDeliveries,
  showInventory,
  loading,
}: {
  deliveries: DeliveryCounts | undefined;
  inventoryItems: number;
  showDeliveries: boolean;
  showInventory: boolean;
  loading: boolean;
}) {
  if (!showDeliveries && !showInventory) return null;

  return (
    <Card className="flex flex-col overflow-hidden">
      <PanelHeader title="Operations" />
      {loading ? (
        <div className="flex flex-col gap-sm px-lg py-md">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <div className="divide-y divide-border-light">
          {showDeliveries && deliveries && <DeliverySummary d={deliveries} />}
          {showInventory && (
            <Link
              to="/inventory"
              className="flex items-center gap-sm px-lg py-sm transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              <Package aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
              <span className="flex-1 text-body-sm text-text-secondary">
                Inventory items
              </span>
              <span className="text-label-md tabular text-text-primary">
                {inventoryItems.toLocaleString('en-US')}
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

export default OperationsCard;
