import { useQuery } from '@tanstack/react-query';

import {
  FALLBACK_PUBLIC_CONFIG,
  getPublicConfig,
  type PublicConfig,
} from '@/networks/launch/launchNetwork';

/**
 * The server's launch switches (sign-up mode, trial length, demo booking,
 * support contacts). Cached for a minute, like the server's own header; while
 * loading or offline the safe defaults apply, so no screen waits on it.
 */
export function usePublicConfig(): PublicConfig & { loaded: boolean } {
  const q = useQuery({
    queryKey: ['public', 'config'],
    queryFn: getPublicConfig,
    staleTime: 60_000,
    retry: 1,
  });
  return { ...(q.data ?? FALLBACK_PUBLIC_CONFIG), loaded: q.isSuccess };
}
