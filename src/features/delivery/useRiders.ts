import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Rider } from '@/models/delivery';
import { getRiders } from '@/networks/delivery/personnelNetwork';

/**
 * Every rider, keyed by user id — a delivery's `personnelId` IS the rider's
 * user id. Shared so the monitor, assign screen and detail pages resolve the
 * same names from one cached request.
 */
export function useRiders(enabled = true) {
  const query = useQuery({
    queryKey: ['delivery-personnel', 'list'],
    queryFn: () => getRiders(),
    enabled,
  });
  const riders = useMemo(() => query.data ?? [], [query.data]);
  const byId = useMemo(() => new Map<string, Rider>(riders.map((r) => [r.userId, r])), [riders]);
  return { riders, byId, isLoading: query.isLoading, error: query.error };
}
