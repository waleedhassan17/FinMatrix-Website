import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { migrationErrorMessage } from '@/config/migrationErrors';
import type { ApiError } from '@/networks/network/apiHelpers';
import { getMigration } from '@/networks/settings/migrationNetwork';

export const migrationKey = (id: string) => ['migrations', id] as const;

export function useMigrationBatch(id: string) {
  return useQuery({ queryKey: migrationKey(id), queryFn: () => getMigration(id), enabled: !!id });
}

/** A batch action: refreshes everything about the batch, and says what went wrong in plain words. */
export function useMigrationAction<TArgs, TResult>(id: string, fn: (args: TArgs) => Promise<TResult>, opts: { success?: string; onSuccess?: (r: TResult) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: migrationKey(id) });
      void queryClient.invalidateQueries({ queryKey: ['migrations'], exact: true });
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e: ApiError) => toast.error(migrationErrorMessage(e.code, e.message)),
  });
}
