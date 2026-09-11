import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CompletionCard } from '@/features/delivery/CompletionCard';
import { useRiders } from '@/features/delivery/useRiders';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature, useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { riderLabel, type CompletionStatus } from '@/models/delivery';
import { getCompletions } from '@/networks/delivery/completionsNetwork';
import { getDeliveries } from '@/networks/delivery/deliveryNetwork';

type Tab = CompletionStatus | 'all';

const TABS: Array<[Tab, string]> = [
  ['pending', 'Awaiting sign-off'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
];

/**
 * Riders' completions — the app's Inventory Approval screen.
 *
 * Both roles work this queue, with one difference that is the whole point:
 * approving recognises the sale and is the owner's alone. Staff see "Waiting
 * for Admin Approval" where the Approve button would be, and can still reject
 * a failed delivery so its stock is not stranded in transit.
 *
 * `?focus=<id>` scrolls to one completion — the approvals inbox links here
 * from a staff undo request.
 */
export default function CompletionsPage() {
  const enabled = useFeature('delivery');
  const isOwner = useIsOwner();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [tab, setTab] = useState<Tab>(focus ? 'all' : 'pending');
  const { byId } = useRiders(enabled);

  const query = useQuery({
    queryKey: ['deliveries', 'completions', tab],
    queryFn: () => getCompletions(tab),
    enabled,
    refetchInterval: 30_000,
  });
  // Same cache entry the monitor uses. Names each card by its delivery when
  // the completion carries no reference of its own.
  const deliveries = useQuery({
    queryKey: ['deliveries', 'list', 'all'],
    queryFn: () => getDeliveries(),
    enabled,
  });
  const referenceById = useMemo(
    () => new Map((deliveries.data?.rows ?? []).map((d) => [d.id, d.referenceNo])),
    [deliveries.data],
  );

  const rows = query.data ?? [];
  const focusPresent = !!focus && rows.some((c) => c.id === focus);

  // DOM only — no state is set, so nothing re-renders.
  useEffect(() => {
    if (focusPresent) {
      document.getElementById(`completion-${focus}`)?.scrollIntoView({ block: 'center' });
    }
  }, [focusPresent, focus]);

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
        <h1 className="text-h2 text-text-primary">Delivery completions</h1>
        <p className="text-body-sm text-text-secondary">
          {isOwner
            ? 'What riders delivered and brought back. Approving one recognises the sale; rejecting puts the stock back on the shelf with no sale.'
            : 'What riders delivered and brought back. You can reject a failed delivery — the stock comes back and no sale is recorded. Approving recognises the sale, so it is the owner’s: those show Waiting for Admin Approval.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-xs">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'rounded-full px-md py-xs text-label-md transition-colors',
              tab === value
                ? 'bg-primary text-text-inverse'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary',
            )}
          >
            {label}
            {value === tab && !query.isLoading && (
              <span className="ml-xxs tabular opacity-70">{rows.length}</span>
            )}
          </button>
        ))}
      </div>

      {query.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      )}

      {query.isLoading ? (
        <div className="flex flex-col gap-md">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-xxl text-center">
          <ClipboardCheck className="mx-auto size-8 text-text-tertiary" />
          <p className="mt-sm text-body-md text-text-secondary">
            {tab === 'pending' ? 'Nothing waiting for sign-off.' : 'No completions here.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-md">
          {rows.map((c) => (
            <CompletionCard
              key={c.id}
              completion={c}
              riderName={riderLabel(byId.get(c.personnelId))}
              reference={referenceById.get(c.deliveryId)}
              highlight={c.id === focus}
            />
          ))}
        </div>
      )}
    </div>
  );
}
