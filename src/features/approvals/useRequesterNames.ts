import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useIsOwner } from '@/hooks/useCapability';
import { getCompanyMembers } from '@/networks/companies/membersNetwork';
import { selectCompanyId } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

/**
 * Turn an approval's `requestedBy` user id into a name.
 *
 * The request row carries only the id. Members are owner-only to list, which is
 * fine: staff never need anyone's name but their own. Falls back to a neutral
 * phrase rather than printing a raw UUID (the app does print it).
 */
export function useRequesterNames(): (userId: string) => string {
  const isOwner = useIsOwner();
  const companyId = useAppSelector(selectCompanyId);

  const { data } = useQuery({
    queryKey: ['company', 'members', companyId],
    queryFn: () => getCompanyMembers(companyId as string),
    enabled: isOwner && !!companyId,
    staleTime: 5 * 60_000,
  });

  const byId = useMemo(
    () =>
      new Map(
        (data ?? []).map((m) => [m.userId, m.displayName || m.email || 'A staff member']),
      ),
    [data],
  );

  return useCallback((userId: string) => byId.get(userId) ?? 'A staff member', [byId]);
}

export default useRequesterNames;
