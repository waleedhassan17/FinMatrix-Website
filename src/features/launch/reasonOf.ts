import { ApiError } from '@/networks/network/apiHelpers';

/** The reason a refusal carries, wherever the server put it. */
export function reasonOf(e: unknown): string | undefined {
  if (!(e instanceof ApiError)) return undefined;
  const d = e.details as { reason?: string } | undefined;
  return d?.reason ?? e.code;
}
