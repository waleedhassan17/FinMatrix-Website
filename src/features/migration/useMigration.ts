import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { migrationErrorMessage } from '@/config/migrationErrors';
import type { MigrationBatch } from '@/models/migration';
import type { ApiError } from '@/networks/network/apiHelpers';
import { getMigration } from '@/networks/settings/migrationNetwork';

export const migrationKey = (id: string) => ['migrations', id] as const;

export function useMigrationBatch(id: string) {
  return useQuery({ queryKey: migrationKey(id), queryFn: () => getMigration(id), enabled: !!id });
}

/** The batch inside an action's answer: the batch itself, or `{ batch }`. */
export function batchOf(r: unknown): MigrationBatch | null {
  const b = r && typeof r === 'object' && 'batch' in r ? (r as { batch: unknown }).batch : r;
  return b && typeof b === 'object' && 'id' in b && 'status' in b ? (b as MigrationBatch) : null;
}

/** A batch action: refreshes everything about the batch, and says what went wrong in plain words. */
export function useMigrationAction<TArgs, TResult>(id: string, fn: (args: TArgs) => Promise<TResult>, opts: { success?: string; onSuccess?: (r: TResult) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      // The action answers with the batch as it now stands: show it at once,
      // so a step that opens on it (Import, after sign-off) is reachable on
      // the very next render rather than after the refetch.
      const next = batchOf(r);
      if (next) queryClient.setQueryData(migrationKey(id), next);
      void queryClient.invalidateQueries({ queryKey: migrationKey(id) });
      void queryClient.invalidateQueries({ queryKey: ['migrations'], exact: true });
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e: ApiError) => toast.error(migrationErrorMessage(e.code, e.message)),
  });
}
